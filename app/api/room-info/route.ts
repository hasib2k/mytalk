import { RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

export async function GET(request: NextRequest) {
  try {
    const roomName = request.nextUrl.searchParams.get('roomName');
    if (!roomName || !API_KEY || !API_SECRET || !LIVEKIT_URL) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400 });
    }

    const httpUrl = getHttpUrl(LIVEKIT_URL);
    const svc = new RoomServiceClient(httpUrl, API_KEY, API_SECRET);

    const rooms = await svc.listRooms([roomName]);
    if (!rooms.length) {
      return NextResponse.json({ exists: false });
    }

    const room = rooms[0];
    let meta: any = {};
    try {
      meta = JSON.parse(room.metadata || '{}');
    } catch {}

    if (meta.ended) {
      return NextResponse.json({ exists: false, ended: true });
    }

    // Get participants
    const participants = await svc.listParticipants(roomName);
    const participantList = participants.map((p) => {
      let pMeta: any = {};
      try {
        pMeta = JSON.parse(p.metadata || '{}');
      } catch {}
      return {
        name: p.name || p.identity,
        identity: p.identity,
        role: pMeta.role || 'listener',
        imageUrl: pMeta.imageUrl || '',
        bio: pMeta.bio || '',
      };
    });

    // Find host
    const host = participantList.find((p) => p.role === 'host');

    return NextResponse.json({
      exists: true,
      title: meta.title || '',
      hostName: host?.name || '',
      participantCount: participants.length,
      participants: participantList.slice(0, 10), // limit to 10 for preview
    });
  } catch (e: any) {
    return NextResponse.json({ exists: false });
  }
}
