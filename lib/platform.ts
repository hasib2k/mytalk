'use client';

import { useEffect, useState } from 'react';

/**
 * True when the web app is running inside the MyTalk native (Capacitor) shell.
 * Capacitor injects its bridge (`window.Capacitor`) into the WebView even when
 * it loads the remote hosted site, so `isNativePlatform()` is reliable here.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

/**
 * SSR/hydration-safe hook: false on the server and the first client render,
 * then the real value after mount — so it never causes a hydration mismatch.
 */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}
