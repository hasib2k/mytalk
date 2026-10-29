import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/AuthProvider';
import { RegisterSW } from '@/lib/RegisterSW';
import { PWAInstallPrompt } from '@/lib/PWAInstallPrompt';

export const metadata: Metadata = {
  title: {
    default: 'MyTalk | Audio Conference for Everyone',
    template: '%s',
  },
  description:
    'MyTalk is a premium audio conferencing platform built for large meetings with up to 2,500 participants.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/app-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MyTalk',
  },
};

export const viewport: Viewport = {
  themeColor: '#e6e9f0',
  // When the on-screen keyboard opens, shrink the layout viewport (instead of
  // overlaying it). This keeps fixed full-screen panels — e.g. the chat panel's
  // header and the pre-join form — above the keyboard instead of being panned
  // out of view.
  interactiveWidget: 'resizes-content',
  // Let the app draw into the iPhone notch / home-indicator areas so we can add
  // our own safe-area padding via env(safe-area-inset-*).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body data-lk-theme="default">
        <AuthProvider>
          <RegisterSW />
          <PWAInstallPrompt />
          <Toaster />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
