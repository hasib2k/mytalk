import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'live.appletalk.meet',
  appName: 'MyTalk',
  // Server-dependent Next.js app (API routes, NextAuth, LiveKit) — cannot be
  // statically bundled. The native WebView loads the live hosted site instead.
  webDir: 'public',
  server: {
    url: 'https://meet.appletalk.live',
    cleartext: false,
  },
};

export default config;
