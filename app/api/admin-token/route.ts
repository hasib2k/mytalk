import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { generateAdminToken, verifyParticipant } from '@/lib/adminAuth';
import { validateRoomName } from '@/lib/validation';

const API_KEY = process.env.LIVEKIT_API_KEY!;
const API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL = process.env.LIVEKIT_URL!;

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

/**
 * GET /api/admin-token?roomName=xxx&identity=xxx
 * Returns an adminToken if the participant is a host in the room.
 * Used when a user is promoted to host mid-meeting.
 */
export async function GET(request: NextRequest) {
  const roomName = request.nextUrl.searchParams.get('roomName');
  const identity = request.nextUrl.searchParams.get('identity');

  if (!validateRoomName(roomName) || !identity) {
    return new NextResponse('Invalid parameters', { status: 400 });
  }

  // The caller must prove they actually ARE this participant (signed cookie set
  // at join), otherwise anyone who can read a host's identity could mint an
  // admin token for the room.
  if (!verifyParticipant(request.cookies.get('pauth')?.value, identity)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY, API_SECRET);
    const participants = await svc.listParticipants(roomName!);
    const participant = participants.find((p) => p.identity === identity);

    if (!participant) {
      return new NextResponse('Participant not found', { status: 404 });
    }

    // Verify participant is actually a host
    let role = 'listener';
    try {
      const meta = JSON.parse(participant.metadata || '{}');
      role = meta.role || 'listener';
    } catch {}

    if (role !== 'host') {
      return new NextResponse('Not a host', { status: 403 });
    }

    const adminToken = generateAdminToken(roomName!);
    return NextResponse.json({ adminToken });
  } catch {
    return new NextResponse('Server error', { status: 500 });
  }
}
