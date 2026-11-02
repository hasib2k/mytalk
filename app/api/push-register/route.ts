import { NextRequest, NextResponse } from 'next/server';
import { subscribeTokenToMeetings } from '@/lib/firebaseAdmin';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * A device registers its FCM token here; we subscribe it to the "meetings"
 * broadcast topic so it receives a notification whenever an admin starts a
 * meeting. No database needed — FCM maintains the topic membership.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!rateLimit('push-register', ip, 30)) {
    return new NextResponse('Too many requests', { status: 429 });
  }
  try {
    const { token } = await request.json();
    if (!token || typeof token !== 'string' || token.length > 4096) {
      return new NextResponse('Invalid token', { status: 400 });
    }
    const ok = await subscribeTokenToMeetings(token);
    return NextResponse.json({ success: ok });
  } catch {
    return new NextResponse('Error', { status: 500 });
  }
}
