import { RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace('wss://', 'https://').replace('ws://', 'http://');
}

export const runtime = 'nodejs';

/**
 * Public list of ongoing PUBLIC meetings for the home "Live now" section.
 * Ended tombstones and private (knock-to-join) rooms are excluded.
 */
export async function GET() {
  try {
    if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
      return NextResponse.json({ meetings: [] });
    }
    const svc = new RoomServiceClient(getHttpUrl(LIVEKIT_URL), API_KEY, API_SECRET);
    const rooms = await svc.listRooms();

    const meetings = rooms
      .map((r) => {
        let meta: any = {};
        try { meta = JSON.parse(r.metadata || '{}'); } catch {}
        return {
          roomName: r.name,
          title: typeof meta.title === 'string' ? meta.title : '',
          ended: !!meta.ended,
          visibility: meta.visibility === 'private' ? 'private' : 'public',
          participantCount: r.numParticipants ?? 0,
        };
      })
      .filter((r) => !r.ended && r.visibility === 'public')
      .sort((a, b) => b.participantCount - a.participantCount)
      .map(({ roomName, title, participantCount }) => ({ roomName, title, participantCount }));

    return NextResponse.json({ meetings });
  } catch {
    return NextResponse.json({ meetings: [] });
  }
}
