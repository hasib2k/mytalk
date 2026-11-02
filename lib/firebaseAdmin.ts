import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Lazily initialise the Firebase Admin SDK from a service-account JSON stored in
 * the FIREBASE_SERVICE_ACCOUNT env var. Everything is a safe no-op when the env
 * is missing, so the app builds/runs fine until Firebase is configured.
 */
let cached: App | null = null;

function ensureApp(): App | null {
  if (cached) return cached;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const creds = JSON.parse(raw);
    cached = getApps().length ? getApp() : initializeApp({ credential: cert(creds) });
    return cached;
  } catch (e) {
    console.error('Firebase Admin init failed:', e);
    return null;
  }
}

const MEETINGS_TOPIC = 'meetings';

/**
 * Ring every subscribed device with an incoming-call notification. Sent as a
 * DATA-ONLY message (no `notification` block) so the native
 * MyFirebaseMessagingService handles it in every app state and renders a full
 * CallStyle incoming-call UI (ringtone + Answer/Decline).
 */
export async function sendMeetingPush(opts: { roomName: string; title: string; url: string }): Promise<void> {
  const app = ensureApp();
  if (!app) return;
  try {
    await getMessaging(app).send({
      topic: MEETINGS_TOPIC,
      data: {
        type: 'incoming_call',
        roomName: opts.roomName,
        title: opts.title || '',
        url: opts.url,
      },
      android: { priority: 'high' },
    });
  } catch (e) {
    console.error('sendMeetingPush failed:', e);
  }
}
