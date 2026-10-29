import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { verifyAdminToken, generateHostToken } from '@/lib/adminAuth';
import { validateRoomName } from '@/lib/validation';

const API_KEY = process.env.LIVEKIT_API_KEY!;
const API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL = process.env.LIVEKIT_URL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// Rooms are kept alive (even when empty) for a very long time so that:
//  - a created meeting's title/privacy survives until the host opens the link
//  - an ENDED meeting's "ended" flag persists → the link permanently shows
//    "meeting ended" and nobody can ever rejoin.
const ROOM_EMPTY_TTL = 60 * 60 * 24 * 365 * 10; // ~10 years (seconds)

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

// Basic in-memory rate limiting for the admin endpoint.
// TODO: For production, replace with a Redis-based rate limiter that works
// across multiple server instances and survives restarts.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 90; // max requests per window (dashboard + in-meeting host polling)

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Verify admin access via either:
 * 1. Room-scoped HMAC token (used by in-meeting host controls) - preferred
 * 2. Raw admin password (used by the admin dashboard page) - fallback
 */
function verifyAdmin(request: NextRequest, roomName: string): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');

  // Try HMAC verification first (room-scoped, time-limited)
  if (roomName && verifyAdminToken(token, roomName)) {
    return true;
  }

  // Fallback: raw password check for the admin dashboard
  // The admin dashboard is already behind NextAuth middleware (/admin/:path*)
  return token === ADMIN_PASSWORD;
}

// GET: List active rooms and participants
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  if (isRateLimited(ip)) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  // For GET (listing rooms), accept either HMAC for a specific room or raw password for dashboard
  const roomName = request.nextUrl.searchParams.get('roomName') || '';
  if (!verifyAdmin(request, roomName)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY, API_SECRET);
    // When a roomName is supplied (e.g. an in-meeting host polling with a
    // room-scoped HMAC token) return only that room; the dashboard passes none.
    const allRooms = await svc.listRooms(roomName ? [roomName] : undefined);

    // Filter out ended (tombstone) rooms
    const rooms = allRooms.filter((room) => {
      try {
        const meta = JSON.parse(room.metadata || '{}');
        return meta.ended !== true;
      } catch {
        return true;
      }
    });

    // Ended meetings (tombstones) → History. Only for the dashboard (no roomName).
    const endedRooms = roomName
      ? []
      : allRooms
          .map((room) => {
            let meta: Record<string, unknown> = {};
            try { meta = JSON.parse(room.metadata || '{}'); } catch {}
            if (meta.ended !== true) return null;
            const hosts = Array.isArray(meta.hosts) ? (meta.hosts as string[]) : [];
            return {
              name: room.name,
              sid: room.sid,
              title: (meta.title as string) || '',
              endedAt: Number(meta.endedAt) || 0,
              creationTime: Number(room.creationTime),
              host: hosts[0] || '',
              visibility: meta.visibility === 'private' ? 'private' : 'public',
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => b.endedAt - a.endedAt)
          .slice(0, 50);

    const roomsWithParticipants = await Promise.all(
      rooms.map(async (room) => {
        const participants = await svc.listParticipants(room.name);
        return {
          name: room.name,
          sid: room.sid,
          numParticipants: room.numParticipants,
          creationTime: Number(room.creationTime),
          metadata: room.metadata || '',
          participants: participants.map((p) => {
            let role = 'listener';
            let bio = '';
            let imageUrl = '';
            let isHandRaised = false;
            try {
              const meta = JSON.parse(p.metadata || '{}');
              role = meta.role || 'listener';
              bio = meta.bio || '';
              imageUrl = meta.imageUrl || '';
              isHandRaised = meta.isHandRaised === true;
            } catch {}
            return {
              identity: p.identity,
              name: p.name,
              sid: p.sid,
              role,
              bio,
              imageUrl,
              isHandRaised,
              isSpeaking: (p as any).isSpeaking ?? false,
              joinedAt: Number(p.joinedAt),
              canPublish: p.permission?.canPublish ?? false,
            };
          }),
        };
      }),
    );

    return NextResponse.json({ rooms: roomsWithParticipants, endedRooms });
  } catch (error) {
    console.error('Admin API error:', error);
    return new NextResponse('Server error', { status: 500 });
  }
}

// POST: Admin actions (create room, end room, etc.)
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  if (isRateLimited(ip)) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  try {
    const body = await request.json();
    const { action, roomName, identity } = body;

    // Validate roomName
    if (!validateRoomName(roomName)) {
      return new NextResponse('Invalid roomName', { status: 400 });
    }

    // Verify admin token is valid for this specific room
    if (!verifyAdmin(request, roomName)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY, API_SECRET);

    switch (action) {
      case 'end_room': {
        // Preserve existing room metadata (title, visibility, hosts).
        let existingMeta: Record<string, unknown> = {};
        try {
          const rooms = await svc.listRooms([roomName]);
          const target = rooms.find((r) => r.name === roomName);
          if (target?.metadata) {
            try { existingMeta = JSON.parse(target.metadata); } catch {}
          }
        } catch {}

        // 1. Mark the room ended. The room is kept alive (empty) by its long
        //    emptyTimeout set at creation, so this flag persists and the link
        //    permanently shows "meeting ended" — nobody can rejoin.
        //    (Done via a simple metadata update on the existing room, which is
        //    far more reliable than delete+recreate.)
        try {
          await svc.updateRoomMetadata(
            roomName,
            JSON.stringify({ ...existingMeta, ended: true, endedAt: Date.now(), knock: [] }),
          );
        } catch (err) {
          console.error('Error marking room ended:', err);
        }

        // 2. Also create/ensure an ended tombstone in case the live room gets
        //    auto-removed — makes the ended state survive even for rooms that
        //    were created with a short emptyTimeout.
        try {
          await svc.createRoom({ name: roomName, emptyTimeout: ROOM_EMPTY_TTL });
          await svc.updateRoomMetadata(
            roomName,
            JSON.stringify({ ...existingMeta, ended: true, endedAt: Date.now(), knock: [] }),
          );
        } catch {}

        // 3. Disconnect everyone currently in the room.
        try {
          const parts = await svc.listParticipants(roomName);
          await Promise.all(parts.map((p) => svc.removeParticipant(roomName, p.identity)));
        } catch {}

        return NextResponse.json({ success: true, message: 'Room ended' });
      }

      case 'grant_speak': {
        // Get current metadata first, then update both in one call
        const participants = await svc.listParticipants(roomName);
        const participant = participants.find((p) => p.identity === identity);
        let grantMeta: Record<string, unknown> = {};
        if (participant) {
          try { grantMeta = JSON.parse(participant.metadata || '{}'); } catch {}
        }
        grantMeta.role = 'moderator';
        grantMeta.isHandRaised = false; // approving a speak request lowers the hand
        await svc.updateParticipant(roomName, identity, {
          metadata: JSON.stringify(grantMeta),
          permission: {
            canPublish: true,
            canPublishData: true,
            canSubscribe: true,
          },
        });
        return NextResponse.json({ success: true, message: 'Speak permission granted' });
      }

      case 'revoke_speak': {
        const participantsList = await svc.listParticipants(roomName);
        const part = participantsList.find((p) => p.identity === identity);
        let revokeMeta: Record<string, unknown> = {};
        if (part) {
          try { revokeMeta = JSON.parse(part.metadata || '{}'); } catch {}
        }
        revokeMeta.role = 'listener';
        await svc.updateParticipant(roomName, identity, {
          metadata: JSON.stringify(revokeMeta),
          permission: {
            canPublish: false,
            canPublishData: true,
            canSubscribe: true,
          },
        });
        return NextResponse.json({ success: true, message: 'Speak permission revoked' });
      }

      case 'remove_participant': {
        await svc.removeParticipant(roomName, identity);
        return NextResponse.json({ success: true, message: 'Participant removed' });
      }

      case 'demote_host': {
        // Revoke host: drop to listener (no publish) AND remove from the room's
        // persistent hosts list so they can't auto-rejoin as host.
        const demoteList = await svc.listParticipants(roomName);
        const demoteTarget = demoteList.find((p) => p.identity === identity);
        let demoteMeta: Record<string, unknown> = {};
        if (demoteTarget) {
          try { demoteMeta = JSON.parse(demoteTarget.metadata || '{}'); } catch {}
        }
        demoteMeta.role = 'listener';
        demoteMeta.isHandRaised = false;
        await svc.updateParticipant(roomName, identity, {
          metadata: JSON.stringify(demoteMeta),
          permission: {
            canPublish: false,
            canPublishData: true,
            canSubscribe: true,
          },
        });

        // Remove this user's name from the room metadata hosts list.
        const demoteName = demoteTarget?.name || identity.split('__')[0];
        try {
          const rooms = await svc.listRooms([roomName]);
          if (rooms.length > 0) {
            let roomMeta: Record<string, unknown> = {};
            try { roomMeta = JSON.parse(rooms[0].metadata || '{}'); } catch {}
            const hosts: string[] = Array.isArray(roomMeta.hosts) ? roomMeta.hosts as string[] : [];
            roomMeta.hosts = hosts.filter((h) => h !== demoteName);
            await svc.updateRoomMetadata(roomName, JSON.stringify(roomMeta));
          }
        } catch {}

        return NextResponse.json({ success: true, message: 'Host demoted to listener' });
      }

      case 'make_host': {
        const hostList = await svc.listParticipants(roomName);
        const hostTarget = hostList.find((p) => p.identity === identity);
        let hostMeta: Record<string, unknown> = {};
        if (hostTarget) {
          try { hostMeta = JSON.parse(hostTarget.metadata || '{}'); } catch {}
        }
        hostMeta.role = 'host';
        await svc.updateParticipant(roomName, identity, {
          metadata: JSON.stringify(hostMeta),
          permission: {
            canPublish: true,
            canPublishData: true,
            canSubscribe: true,
          },
        });

        // Save this user's name to room metadata hosts list for auto-rejoin as host
        const participantName = hostTarget?.name || identity.split('__')[0];
        try {
          const rooms = await svc.listRooms([roomName]);
          if (rooms.length > 0) {
            let roomMeta: Record<string, unknown> = {};
            try { roomMeta = JSON.parse(rooms[0].metadata || '{}'); } catch {}
            const hosts: string[] = Array.isArray(roomMeta.hosts) ? roomMeta.hosts as string[] : [];
            if (!hosts.includes(participantName)) {
              hosts.push(participantName);
            }
            roomMeta.hosts = hosts;
            await svc.updateRoomMetadata(roomName, JSON.stringify(roomMeta));
          }
        } catch {}

        return NextResponse.json({ success: true, message: 'Host permission granted' });
      }

      case 'mute_participant': {
        await svc.updateParticipant(roomName, identity, {
          permission: {
            canPublish: false,
            canPublishData: true,
            canSubscribe: true,
          },
        });
        return NextResponse.json({ success: true, message: 'Participant muted' });
      }

      case 'unmute_all': {
        const allParts = await svc.listParticipants(roomName);
        let unmutedCount = 0;
        await Promise.all(
          allParts.map(async (p) => {
            let meta: Record<string, unknown> = {};
            try { meta = JSON.parse(p.metadata || '{}'); } catch {}
            // Skip hosts — they already have publish rights
            if (meta.role === 'host') return;
            meta.role = 'moderator';
            await svc.updateParticipant(roomName, p.identity, {
              metadata: JSON.stringify(meta),
              permission: {
                canPublish: true,
                canPublishData: true,
                canSubscribe: true,
              },
            });
            unmutedCount++;
          }),
        );
        return NextResponse.json({ success: true, message: `Unmuted all (${unmutedCount} participants)` });
      }

      case 'mute_all': {
        const allPartsMute = await svc.listParticipants(roomName);
        let mutedCount = 0;
        await Promise.all(
          allPartsMute.map(async (p) => {
            let meta: Record<string, unknown> = {};
            try { meta = JSON.parse(p.metadata || '{}'); } catch {}
            // Skip hosts — don't mute hosts
            if (meta.role === 'host') return;
            meta.role = 'listener';
            await svc.updateParticipant(roomName, p.identity, {
              metadata: JSON.stringify(meta),
              permission: {
                canPublish: false,
                canPublishData: true,
                canSubscribe: true,
              },
            });
            mutedCount++;
          }),
        );
        return NextResponse.json({ success: true, message: `Muted all (${mutedCount} participants)` });
      }

      case 'create_room': {
        const { meetingTitle, visibility } = body;
        // Keep the created room alive (even before anyone joins) so its title /
        // privacy settings survive until the host opens the link.
        await svc.createRoom({ name: roomName, emptyTimeout: ROOM_EMPTY_TTL });
        // Set metadata separately (createRoom doesn't support metadata field)
        const roomMeta: Record<string, unknown> = {};
        if (meetingTitle) roomMeta.title = meetingTitle;
        if (visibility === 'private') roomMeta.visibility = 'private';
        if (Object.keys(roomMeta).length > 0) {
          await svc.updateRoomMetadata(roomName, JSON.stringify(roomMeta));
        }
        // Signed host credential so the host link can grant host (and nobody
        // else can promote themselves via the URL).
        const hostToken = generateHostToken(roomName);
        return NextResponse.json({ success: true, message: 'Room created', roomName, hostToken });
      }

      case 'lower_hand': {
        const partsLH = await svc.listParticipants(roomName);
        const targetLH = partsLH.find((p) => p.identity === identity);
        let lhMeta: Record<string, unknown> = {};
        if (targetLH) { try { lhMeta = JSON.parse(targetLH.metadata || '{}'); } catch {} }
        lhMeta.isHandRaised = false;
        await svc.updateParticipant(roomName, identity, { metadata: JSON.stringify(lhMeta) });
        return NextResponse.json({ success: true, message: 'Hand lowered' });
      }

      case 'set_visibility': {
        const { visibility } = body;
        const rooms = await svc.listRooms([roomName]);
        const target = rooms.find((r) => r.name === roomName);
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(target?.metadata || '{}'); } catch {}
        let admitted = 0;
        if (visibility === 'public') {
          meta.visibility = 'public';
          // Making public: admit everyone currently waiting to join.
          const knock: any[] = Array.isArray(meta.knock) ? (meta.knock as any[]) : [];
          knock.forEach((k) => {
            if (k.status === 'pending') { k.status = 'approved'; k.decidedAt = Date.now(); admitted++; }
          });
          meta.knock = knock;
        } else {
          meta.visibility = 'private';
        }
        await svc.updateRoomMetadata(roomName, JSON.stringify(meta));
        return NextResponse.json({
          success: true,
          message: visibility === 'public' ? `Now public${admitted ? ` · ${admitted} admitted` : ''}` : 'Now private',
        });
      }

      case 'set_title': {
        const { title } = body;
        const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 100) : '';
        const rooms = await svc.listRooms([roomName]);
        const target = rooms.find((r) => r.name === roomName);
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(target?.metadata || '{}'); } catch {}
        if (cleanTitle) {
          meta.title = cleanTitle;
        } else {
          delete meta.title;
        }
        await svc.updateRoomMetadata(roomName, JSON.stringify(meta));
        return NextResponse.json({ success: true, message: 'Title updated' });
      }

      case 'lock_room': {
        const { locked } = body;
        const rooms = await svc.listRooms([roomName]);
        const target = rooms.find((r) => r.name === roomName);
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(target?.metadata || '{}'); } catch {}
        meta.locked = locked === true;
        await svc.updateRoomMetadata(roomName, JSON.stringify(meta));
        return NextResponse.json({ success: true, message: locked ? 'Meeting locked' : 'Meeting unlocked' });
      }

      case 'approve_knock':
      case 'reject_knock': {
        const { knockId } = body;
        const rooms = await svc.listRooms([roomName]);
        const target = rooms.find((r) => r.name === roomName);
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(target?.metadata || '{}'); } catch {}
        const knock: any[] = Array.isArray(meta.knock) ? (meta.knock as any[]) : [];
        const idx = knock.findIndex((k) => k.id === knockId);
        if (idx >= 0) {
          knock[idx].status = action === 'approve_knock' ? 'approved' : 'rejected';
          knock[idx].decidedAt = Date.now();
          meta.knock = knock;
          await svc.updateRoomMetadata(roomName, JSON.stringify(meta));
        }
        return NextResponse.json({
          success: true,
          message: action === 'approve_knock' ? 'Participant admitted' : 'Request denied',
        });
      }

      default:
        return new NextResponse('Unknown action', { status: 400 });
    }
  } catch (error) {
    console.error('Admin action error:', error);
    return new NextResponse('Server error', { status: 500 });
  }
}
