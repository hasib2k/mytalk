import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { validateRoomName } from '@/lib/validation';
import { verifyParticipant } from '@/lib/adminAuth';

const API_KEY = process.env.LIVEKIT_API_KEY!;
const API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LIVEKIT_URL = process.env.LIVEKIT_URL!;

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

export async function POST(request: NextRequest) {
  try {
    const { roomName, identity, raised } = await request.json();

    if (!roomName || !identity) {
      return new NextResponse('Missing roomName or identity', { status: 400 });
    }

    if (!validateRoomName(roomName)) {
      return new NextResponse('Invalid roomName', { status: 400 });
    }

    // Only the participant themselves (signed cookie from join) may toggle their
    // own hand — not anyone who knows the identity string.
    if (!verifyParticipant(request.cookies.get('pauth')?.value, identity)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY, API_SECRET);
    const participants = await svc.listParticipants(roomName);
    const participant = participants.find((p) => p.identity === identity);

    if (!participant) {
      return new NextResponse('Participant not found', { status: 404 });
    }

    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(participant.metadata || '{}');
    } catch {}

    meta.isHandRaised = !!raised;
    meta.handRaisedAt = raised ? Date.now() : undefined;

    await svc.updateParticipant(roomName, identity, JSON.stringify(meta));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Raise hand error:', error);
    return new NextResponse('Server error', { status: 500 });
  }
}
