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

/** Subscribe a device's FCM token to the broadcast topic for new meetings. */
export async function subscribeTokenToMeetings(token: string): Promise<boolean> {
  const app = ensureApp();
  if (!app || !token) return false;
  try {
    await getMessaging(app).subscribeToTopic([token], MEETINGS_TOPIC);
    return true;
  } catch (e) {
    console.error('subscribeToTopic failed:', e);
    return false;
  }
}

/** Fan a "new meeting" notification out to every subscribed device. */
export async function sendMeetingPush(opts: { roomName: string; title: string; url: string }): Promise<void> {
  const app = ensureApp();
  if (!app) return;
  const body = opts.title ? `${opts.title} — tap to join` : 'Tap to join';
  try {
    await getMessaging(app).send({
      topic: MEETINGS_TOPIC,
      notification: { title: 'New meeting starting', body },
      data: { roomName: opts.roomName, url: opts.url },
      android: {
        priority: 'high',
        notification: {
          channelId: 'meetings',
          priority: 'max',
          sound: 'default',
          defaultSound: true,
        },
      },
    });
  } catch (e) {
    console.error('sendMeetingPush failed:', e);
  }
}
