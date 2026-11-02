'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/platform';

/**
 * When the native app is opened via an Android App Link (e.g. tapping a
 * https://meet.appletalk.live/rooms/xxxx link), the WebView cold-starts at the
 * configured server URL (the home page). This listens for the deep link and
 * navigates the WebView to the actual path so the meeting opens in the app.
 */
export function DeepLinkHandler() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let cleanup: (() => void) | undefined;
    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const u = new URL(url);
          if (u.host !== 'meet.appletalk.live') return;
          const target = u.pathname + u.search + u.hash;
          const current = window.location.pathname + window.location.search + window.location.hash;
          if (target && target !== current) {
            window.location.href = target;
          }
        } catch {
          // ignore malformed URLs
        }
      });
      cleanup = () => { handle.remove(); };
    })();
    return () => { cleanup?.(); };
  }, []);
  return null;
}
