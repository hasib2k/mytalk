'use client';

import React, { useState, useCallback } from 'react';
import { LocalUserChoices } from '@livekit/components-react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export function AudioOnlyPreJoin(props: {
  onSubmit: (choices: LocalUserChoices & { imageUrl?: string }) => void;
  role?: string;
  roomName?: string;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [guestName, setGuestName] = useState('');
  const [bio, setBio] = useState('');

  // Pre-fill bio from the saved profile bio (editable per meeting)
  React.useEffect(() => {
    try {
      const savedBio = localStorage.getItem('mytalk_profile_bio');
      if (savedBio) setBio(savedBio);
    } catch {}
  }, []);
  const [mode, setMode] = useState<'choose' | 'google' | 'guest'>('choose');

  const isLoggedIn = status === 'authenticated' && session?.user;
  const userName = session?.user?.name || '';
  const userImage = session?.user?.image || '';
  const userInitials = userName
    ? userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  React.useEffect(() => {
    if (isLoggedIn && mode === 'choose') {
      setMode('google');
    }
  }, [isLoggedIn, mode]);

  const handleGoogleJoin = useCallback(() => {
    if (!userName) return;
    props.onSubmit({
      username: userName,
      videoEnabled: false,
      audioEnabled: true,
      videoDeviceId: '',
      audioDeviceId: '',
      imageUrl: userImage,
      bio: bio.trim(),
    } as any);
  }, [userName, userImage, bio, props.onSubmit]);

  // After returning from the Google OAuth redirect, finish the join
  // automatically (so the user doesn't have to tap "Join Meeting" again) and —
  // crucially — restore the host credential if the round-trip dropped ?hk= from
  // the URL, so a host who signs in with Google still joins as host.
  React.useEffect(() => {
    if (!isLoggedIn || !userName) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem('pending_google_join'); } catch {}
    if (!saved || !saved.includes(`/rooms/${props.roomName}`)) return;

    const savedHasHk = /[?&]hk=/.test(saved);
    const hereHasHk = /[?&]hk=/.test(window.location.search);
    if (savedHasHk && !hereHasHk) {
      // OAuth dropped the ?hk= host key — reload the original URL so the server
      // resolves the host role again. This effect re-runs and auto-joins.
      window.location.replace(saved);
      return;
    }
    try { sessionStorage.removeItem('pending_google_join'); } catch {}
    handleGoogleJoin();
  }, [isLoggedIn, userName, props.roomName, handleGoogleJoin]);

  const handleGuestJoin = useCallback(() => {
    const name = guestName.trim();
    if (!name) return;
    props.onSubmit({
      username: name,
      videoEnabled: false,
      audioEnabled: true,
      videoDeviceId: '',
      audioDeviceId: '',
      bio: bio.trim(),
    } as any);
  }, [guestName, bio, props.onSubmit]);

  const roleLabel = props.role === 'host' ? 'Host' : props.role === 'moderator' ? 'Moderator' : 'Listener';

  // === Google mode (logged in) - New neomorphic lobby design ===
  if (mode === 'google' && isLoggedIn) {
    return (
      <div className="prejoin-lobby">
        {/* Mobile: Top bar (hidden on desktop) */}
        <div className="prejoin-topbar prejoin-mb-only">
          <button className="prejoin-back-btn" onClick={() => router.push('/')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="prejoin-room-badge">
            <div className="prejoin-room-dot" />
            {props.roomName || 'Meeting'}
          </div>
          <div style={{ width: 44 }} />
        </div>

        {/* Center content */}
        <div className="prejoin-center">
          {/* Mobile: big avatar (hidden on desktop) */}
          <div className="prejoin-avatar-ring prejoin-mb-only">
            {userImage ? (
              <img src={userImage} alt="" referrerPolicy="no-referrer" className="prejoin-avatar-img" />
            ) : (
              <div className="prejoin-avatar-placeholder">{userInitials}</div>
            )}
          </div>

          {/* Mobile: centered greeting + badges (hidden on desktop) */}
          <div className="prejoin-greeting prejoin-mb-only">
            <div className="prejoin-greeting-text">Hi, {userName.split(' ')[0]}!</div>
            <div className="prejoin-badges">
              <div className="prejoin-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2.2" strokeLinecap="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h3ZM3 15a2 2 0 0 0 2 2h1v-5H3Z"/></svg>
                Audio-only
              </div>
              <div className="prejoin-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d98a12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 16.9A7 7 0 0 1 5 11M19 11a7 7 0 0 1-.1 1.2M12 18v3"/></svg>
                Joining as {roleLabel}
              </div>
            </div>
          </div>

          {/* Desktop: horizontal avatar + greeting row */}
          <div className="prejoin-dk-greeting-row prejoin-dk-only">
            <div className="prejoin-dk-mini-avatar">
              {userImage ? (
                <img src={userImage} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{userInitials}</span>
              )}
            </div>
            <div>
              <div className="prejoin-dk-hi">Hi, {userName.split(' ')[0]}!</div>
              <div className="prejoin-dk-ready">Ready to join?</div>
            </div>
          </div>

          {/* Bio input */}
          <div className="prejoin-bio-section">
            <div className="prejoin-bio-label">
              Title <span>(optional)</span>
            </div>
            <div className="prejoin-bio-field">
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={60}
                placeholder="e.g. President"
                className="prejoin-bio-input"
              />
              <span className="prejoin-bio-count">{bio.length}/60</span>
            </div>
            <div className="prejoin-bio-hint prejoin-dk-only">Shown under your name in the meeting</div>
          </div>
        </div>

        {/* Bottom: Join button + disclaimer */}
        <div className="prejoin-bottom">
          <button className="prejoin-join-btn" onClick={handleGoogleJoin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            Join Meeting
          </button>
          {props.role !== 'host' && (
            <div className="prejoin-disclaimer">
              You will join as a listener. The host can grant you speaking permission.
            </div>
          )}
        </div>
      </div>
    );
  }

  // === Guest mode ===
  if (mode === 'guest') {
    const guestInitials = guestName.trim()
      ? guestName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
      : '?';

    return (
      <div className="prejoin-lobby">
        <div className="prejoin-topbar">
          <button className="prejoin-back-btn" onClick={() => setMode('choose')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="prejoin-room-badge">
            <div className="prejoin-room-dot" />
            {props.roomName || 'Meeting'}
          </div>
          <div style={{ width: 44 }} />
        </div>

        <div className="prejoin-center">
          <div className="prejoin-avatar-ring">
            <div className="prejoin-avatar-placeholder">{guestInitials}</div>
          </div>

          <div className="prejoin-greeting">
            <div className="prejoin-greeting-text">Join as Guest</div>
            <div className="prejoin-badges">
              <div className="prejoin-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2.2" strokeLinecap="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h3ZM3 15a2 2 0 0 0 2 2h1v-5H3Z"/></svg>
                Audio-only
              </div>
              <div className="prejoin-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d98a12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 16.9A7 7 0 0 1 5 11M19 11a7 7 0 0 1-.1 1.2M12 18v3"/></svg>
                Joining as {roleLabel}
              </div>
            </div>
          </div>

          {/* Name input */}
          <div className="prejoin-bio-section">
            <div className="prejoin-bio-label">Your name</div>
            <div className="prejoin-bio-field">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGuestJoin()}
                maxLength={50}
                placeholder="Enter your name"
                className="prejoin-bio-input"
                autoFocus
              />
            </div>
          </div>

          {/* Bio input */}
          <div className="prejoin-bio-section">
            <div className="prejoin-bio-label">
              Title <span>(optional)</span>
            </div>
            <div className="prejoin-bio-field">
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={60}
                placeholder="e.g. Product designer at Parallax"
                className="prejoin-bio-input"
              />
              <span className="prejoin-bio-count">{bio.length}/60</span>
            </div>
          </div>
        </div>

        <div className="prejoin-bottom">
          <button
            className="prejoin-join-btn"
            onClick={handleGuestJoin}
            disabled={!guestName.trim()}
            style={{ opacity: guestName.trim() ? 1 : 0.5 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            Join Meeting
          </button>
          {props.role !== 'host' && (
            <div className="prejoin-disclaimer">
              You will join as a listener. The host can grant you speaking permission.
            </div>
          )}
        </div>
      </div>
    );
  }

  // === Choose mode: Google or Guest ===
  return (
    <div className="prejoin-lobby">
      <div className="prejoin-topbar">
        <button className="prejoin-back-btn" onClick={() => router.push('/')} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="prejoin-room-badge">
          <div className="prejoin-room-dot" />
          {props.roomName || 'Meeting'}
        </div>
        <div style={{ width: 44 }} />
      </div>

      <div className="prejoin-center">
        <div className="prejoin-avatar-ring">
          <div className="prejoin-avatar-placeholder">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
          </div>
        </div>

        <div className="prejoin-greeting">
          <div className="prejoin-greeting-text">Join Meeting</div>
          <div className="prejoin-badges">
            <div className="prejoin-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2.2" strokeLinecap="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h3ZM3 15a2 2 0 0 0 2 2h1v-5H3Z"/></svg>
              Audio-only
            </div>
            <div className="prejoin-badge">
              Joining as {roleLabel}
            </div>
          </div>
        </div>

        {/* Google sign in */}
        <button
          className="prejoin-auth-btn"
          onClick={() => {
            if (isLoggedIn) {
              setMode('google');
            } else {
              // Remember the full join URL (role + host key) so we can restore
              // the host role and auto-join after Google sends us back.
              try { sessionStorage.setItem('pending_google_join', window.location.href); } catch {}
              signIn('google', { callbackUrl: window.location.href });
            }
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="prejoin-divider">
          <div className="prejoin-divider-line" />
          <span>or</span>
          <div className="prejoin-divider-line" />
        </div>

        {/* Guest */}
        <button className="prejoin-auth-btn guest" onClick={() => setMode('guest')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
          </svg>
          Enter your name &amp; join
        </button>
      </div>

      <div className="prejoin-bottom">
        {props.role !== 'host' && (
          <div className="prejoin-disclaimer">
            You will join as a listener. The host can grant you speaking permission.
          </div>
        )}
      </div>
    </div>
  );
}
