import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { generateHostToken } from '@/lib/adminAuth';
import { validateRoomName } from '@/lib/validation';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const API_KEY = process.env.LIVEKIT_API_KEY!;
const API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL = process.env.LIVEKIT_URL!;

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

/**
 * Mints a host token for a BRAND-NEW room (used by the home "New meeting"
 * button). Refuses if the room already exists — so a listener cannot mint a
 * host credential for a meeting that someone else already created.
 */
export async function POST(request: NextRequest) {
  try {
    if (rateLimit('host-token', clientIp(request), 30)) {
      return new NextResponse('Too many requests', { status: 429 });
    }
    const { roomName } = await request.json();
    if (!validateRoomName(roomName)) {
      return new NextResponse('Invalid roomName', { status: 400 });
    }

    const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY, API_SECRET);
    const rooms = await svc.listRooms([roomName]);
    if (rooms.some((r) => r.name === roomName)) {
      // Already exists (including ended tombstones) — don't hand out host rights.
      return new NextResponse('Room already exists', { status: 409 });
    }

    const hostToken = generateHostToken(roomName);
    return NextResponse.json({ hostToken });
  } catch {
    return new NextResponse('Server error', { status: 500 });
  }
}
