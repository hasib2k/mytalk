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
  plugins: {
    // Resize the WebView when the keyboard opens so content viewports shrink and
    // every input screen becomes scrollable (browser's interactiveWidget meta has
    // no effect inside the native WebView).
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
