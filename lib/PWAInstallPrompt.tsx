'use client';

import React from 'react';

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Shows an install prompt as soon as the app opens.
 *
 * Browsers don't allow auto-firing the native install dialog on load (it needs
 * a user gesture), so we capture `beforeinstallprompt`, show our OWN banner
 * immediately, and trigger the native prompt when the user taps "Install".
 * On iOS (no beforeinstallprompt) we show an "Add to Home Screen" hint instead.
 */
export function PWAInstallPrompt() {
  const deferredRef = React.useRef<BIPEvent | null>(null);
  const [show, setShow] = React.useState(false);
  const [iosHint, setIosHint] = React.useState(false);

  React.useEffect(() => {
    // Already running as an installed app → nothing to do.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (standalone) return;

    let dismissed = false;
    try { dismissed = localStorage.getItem('pwa_install_dismissed') === '1'; } catch {}
    if (dismissed) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BIPEvent;
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    const onInstalled = () => {
      setShow(false);
      deferredRef.current = null;
      try { localStorage.setItem('pwa_install_dismissed', '1'); } catch {}
    };
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari doesn't fire beforeinstallprompt — show a manual hint instead.
    const ua = navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if (isIOS && isSafari) {
      const t = setTimeout(() => { setIosHint(true); setShow(true); }, 800);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBIP);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    const dp = deferredRef.current;
    if (!dp) return;
    try {
      dp.prompt();
      await dp.userChoice;
    } catch {}
    deferredRef.current = null;
    setShow(false);
  };

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem('pwa_install_dismissed', '1'); } catch {}
  };

  if (!show) return null;

  return (
    <div className="pwa-install-banner" role="dialog" aria-label="Install MyTalk">
      <div className="pwa-install-logo">
        <img src="/icons/logo_icon.png" alt="MyTalk" />
      </div>
      <div className="pwa-install-text">
        <div className="pwa-install-title">Install MyTalk</div>
        <div className="pwa-install-sub">
          {iosHint
            ? 'Tap the Share icon, then “Add to Home Screen”.'
            : 'Add it to your home screen for quick access & background audio.'}
        </div>
      </div>
      <div className="pwa-install-actions">
        {!iosHint && (
          <button className="pwa-install-btn" onClick={install}>Install</button>
        )}
        <button className="pwa-install-dismiss" onClick={dismiss} aria-label="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
