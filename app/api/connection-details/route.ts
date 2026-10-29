import { randomString } from '@/lib/client-utils';
import { getLiveKitURL } from '@/lib/getLiveKitURL';
import { ConnectionDetails } from '@/lib/types';
import { AccessToken, AccessTokenOptions, VideoGrant, RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { generateAdminToken, verifyHostToken, signParticipant } from '@/lib/adminAuth';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import {
  validateRoomName,
  validateParticipantName,
  validateImageUrl,
  validateMetadataSize,
} from '@/lib/validation';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

const COOKIE_KEY = 'random-participant-postfix';

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

export async function GET(request: NextRequest) {
  try {
    // Allow generous polling (knock lobby polls every ~2.5s) but block floods
    // that would spam room creation.
    if (rateLimit('conn', clientIp(request), 150)) {
      return new NextResponse('Too many requests', { status: 429 });
    }
    const roomName = request.nextUrl.searchParams.get('roomName');
    const participantName = request.nextUrl.searchParams.get('participantName');
    const metadata = request.nextUrl.searchParams.get('metadata') ?? '';
    const region = request.nextUrl.searchParams.get('region');
    let role = request.nextUrl.searchParams.get('role') ?? 'listener';
    const hostKey = request.nextUrl.searchParams.get('hk') ?? '';
    const imageUrl = request.nextUrl.searchParams.get('imageUrl') ?? '';
    const bio = request.nextUrl.searchParams.get('bio') ?? '';

    if (!LIVEKIT_URL) {
      throw new Error('LIVEKIT_URL is not defined');
    }

    // Input validation
    if (!validateRoomName(roomName)) {
      return new NextResponse(
        'Invalid roomName: must be 1-100 characters, alphanumeric, dash, or underscore only',
        { status: 400 },
      );
    }
    if (!validateParticipantName(participantName)) {
      return new NextResponse(
        'Invalid participantName: must be 1-50 characters, alphanumeric and common name characters only',
        { status: 400 },
      );
    }
    if (!validateImageUrl(imageUrl)) {
      return new NextResponse('Invalid imageUrl: must be a valid https:// URL', { status: 400 });
    }
    if (!validateMetadataSize(metadata)) {
      return new NextResponse('Metadata too large: max 4096 bytes', { status: 400 });
    }

    // Check room metadata: ended status + auto-host assignment + visibility
    let isAutoHost = false;
    let roomVisibility = 'public';
    let roomLocked = false;
    let roomExists = false;
    try {
      const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY!, API_SECRET!);
      const rooms = await svc.listRooms([roomName!]);
      // Find the exact room by name (listRooms may return multiple)
      const targetRoom = rooms.find((r) => r.name === roomName);
      if (targetRoom) {
        roomExists = true;
        try {
          const roomMeta = JSON.parse(targetRoom.metadata || '{}');
          console.log(`[connection-details] Room "${roomName}" metadata:`, roomMeta);
          if (roomMeta.ended === true) {
            return NextResponse.json(
              { error: 'room_ended', message: 'This meeting has expired. Please contact the admin for a new meeting room.' },
              { status: 410 },
            );
          }
          if (roomMeta.visibility === 'private') {
            roomVisibility = 'private';
          }
          if (roomMeta.locked === true) {
            roomLocked = true;
          }
          // Check if this user was previously granted host in this room
          if (Array.isArray(roomMeta.hosts) && roomMeta.hosts.includes(participantName)) {
            isAutoHost = true;
          }
        } catch {}
      }
    } catch (err) {
      console.error('[connection-details] Error checking room:', err);
    }

    const livekitServerUrl = region ? getLiveKitURL(LIVEKIT_URL, region) : LIVEKIT_URL;
    let randomParticipantPostfix = request.cookies.get(COOKIE_KEY)?.value;
    if (livekitServerUrl === undefined) {
      throw new Error('Invalid region');
    }

    if (!randomParticipantPostfix) {
      randomParticipantPostfix = randomString(4);
    }

    // Server-side role validation: prevent host role-hijacking.
    // The host role is ONLY granted with a valid signed host token (hk). A user
    // who edits `?role=listener` to `?role=host` in the URL has no valid token,
    // so they are downgraded to listener. The token can only be minted by the
    // server (home "New meeting" for a fresh room, or the authenticated admin).
    if (role === 'host' && !verifyHostToken(hostKey, roomName!)) {
      role = 'listener';
    }

    // Only allow known roles
    if (!['host', 'moderator', 'listener'].includes(role)) {
      role = 'listener';
    }

    // Auto-assign host role if user was previously granted host in this room
    if (isAutoHost && role === 'listener') {
      role = 'host';
    }

    // ---- Locked room gating ----
    // A locked room admits nobody new except hosts.
    if (roomExists && roomLocked && role !== 'host') {
      return NextResponse.json({ status: 'locked' });
    }

    // ---- Private room gating (knock-to-join) ----
    // Hosts always bypass. Everyone else must be admitted by a host/admin.
    if (roomExists && roomVisibility === 'private' && role !== 'host') {
      const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY!, API_SECRET!);
      const knockId = request.nextUrl.searchParams.get('knockId');
      const rooms = await svc.listRooms([roomName!]);
      const target = rooms.find((r) => r.name === roomName);
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(target?.metadata || '{}'); } catch {}
      let knock: any[] = Array.isArray(meta.knock) ? (meta.knock as any[]) : [];
      // Prune stale entries (> 15 min old)
      const now = Date.now();
      knock = knock.filter((k) => !k.at || now - k.at < 15 * 60 * 1000);

      if (knockId) {
        const req = knock.find((k) => k.id === knockId);
        if (!req) {
          return NextResponse.json({ status: 'expired' });
        }
        if (req.status === 'rejected') {
          return NextResponse.json({ status: 'rejected' });
        }
        if (req.status !== 'approved') {
          return NextResponse.json({ status: 'pending_approval', knockId });
        }
        // Approved → consume the request and fall through to issue a token.
        meta.knock = knock.filter((k) => k.id !== knockId);
        await svc.updateRoomMetadata(roomName!, JSON.stringify(meta));
      } else {
        // First attempt → register a pending request, no token yet.
        const id = randomString(10);
        knock.push({
          id,
          name: participantName,
          imageUrl: imageUrl || '',
          bio: bio || '',
          role,
          status: 'pending',
          at: now,
        });
        meta.knock = knock;
        await svc.updateRoomMetadata(roomName!, JSON.stringify(meta));
        return NextResponse.json({ status: 'pending_approval', knockId: id });
      }
    }

    // Ensure the room exists with a very long emptyTimeout so its state
    // (including a future "ended" flag) survives even when the room is empty.
    // createRoom is idempotent — a no-op if the room already exists.
    try {
      const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY!, API_SECRET!);
      await svc.createRoom({ name: roomName!, emptyTimeout: 60 * 60 * 24 * 365 * 10 });
    } catch {}

    // Build metadata with role, image, and bio
    const participantMetadata = JSON.stringify({
      role,
      imageUrl,
      ...(bio ? { bio } : {}),
      ...(metadata ? JSON.parse(metadata) : {}),
    });

    const identity = `${participantName}__${randomParticipantPostfix}`;
    const participantToken = await createParticipantToken(
      {
        identity,
        name: participantName!,
        metadata: participantMetadata,
      },
      roomName!,
      role,
    );

    // Generate a room-scoped, time-limited HMAC token instead of raw password
    const data: ConnectionDetails = {
      serverUrl: livekitServerUrl,
      roomName: roomName!,
      participantToken: participantToken,
      participantName: participantName!,
      ...(role === 'host' ? { adminToken: generateAdminToken(roomName!) } : {}),
    };
    // Signed proof that this browser owns `identity` — lets per-participant
    // endpoints (raise-hand, admin-token) verify the real caller.
    const pauth = signParticipant(identity);
    const res = new NextResponse(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
    const cookieOpts = `Path=/; HttpOnly; SameSite=Strict; Secure; Expires=${getCookieExpirationTime()}`;
    res.headers.append('Set-Cookie', `${COOKIE_KEY}=${randomParticipantPostfix}; ${cookieOpts}`);
    res.headers.append('Set-Cookie', `pauth=${pauth}; ${cookieOpts}`);
    return res;
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  role: string,
) {
  const at = new AccessToken(API_KEY, API_SECRET, userInfo);
  at.ttl = '5m';

  let grant: VideoGrant;

  if (role === 'host' || role === 'moderator') {
    // Host and moderators can publish audio and data, subscribe to everything
    grant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    };
  } else {
    // Listeners can only subscribe (listen), cannot publish audio
    grant = {
      room: roomName,
      roomJoin: true,
      canPublish: false,
      canPublishData: true, // Allow data for raise hand, chat etc.
      canSubscribe: true,
    };
  }

  at.addGrant(grant);
  return at.toJwt();
}

function getCookieExpirationTime(): string {
  var now = new Date();
  var time = now.getTime();
  var expireTime = time + 60 * 120 * 1000;
  now.setTime(expireTime);
  return now.toUTCString();
}
