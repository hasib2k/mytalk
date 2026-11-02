'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/lib/platform';

/**
 * Registers the native app for FCM push notifications so it gets a "call" when an
 * admin starts a meeting. The device's token is registered server-side (subscribed
 * to the "meetings" topic); tapping the notification deep-links into the room with
 * ?autojoin=1 so the app joins automatically.
 */
export function PushNotifications() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      if (cancelled) return;

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') return;

      // High-importance channel so meeting alerts pop as a heads-up with sound.
      try {
        await PushNotifications.createChannel({
          id: 'meetings',
          name: 'Meeting calls',
          description: 'Alerts when a meeting starts',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
        });
      } catch {}

      await PushNotifications.register();

      const regSub = await PushNotifications.addListener('registration', (token) => {
        fetch('/api/push-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.value }),
        }).catch(() => {});
      });
      cleanups.push(() => { regSub.remove(); });

      // Tapping the notification → open the meeting and auto-join.
      const actionSub = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = (action.notification?.data || {}) as Record<string, string>;
        if (data.roomName) {
          router.push(`/rooms/${data.roomName}?autojoin=1`);
        }
      });
      cleanups.push(() => { actionSub.remove(); });
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [router]);

  return null;
}
