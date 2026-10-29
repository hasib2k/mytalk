'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { RoomContext, useRoomContext, useParticipants, useLocalParticipant } from '@livekit/components-react';

/* ---------- helpers ---------- */

const GRADS = [
  'linear-gradient(145deg,#f0ab3f,#de7a24)',
  'linear-gradient(145deg,#7aa0ff,#5a83ee)',
  'linear-gradient(145deg,#16a34a,#3f9e70)',
  'linear-gradient(145deg,#c77dff,#9d4edd)',
  'linear-gradient(145deg,#ec6d86,#c94660)',
  'linear-gradient(145deg,#4fc3e0,#2f97b8)',
];
function grad(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return GRADS[h % GRADS.length];
}
function initials(name: string) {
  const p = (name || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}

/**
 * Keeps the meeting usable when the user leaves the browser:
 *  - Desktop (Chrome/Edge): a floating, always-on-top Document Picture-in-Picture
 *    window showing participants + mute / leave / return controls.
 *  - Everywhere: a MediaSession entry so the OS shows an "ongoing call"
 *    notification and background audio keeps playing.
 */
export function MeetingPip() {
  const room = useRoomContext();
  const [controlBar, setControlBar] = React.useState<Element | null>(null);
  const [titleRight, setTitleRight] = React.useState<Element | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);
  const [pipOpen, setPipOpen] = React.useState(false);

  const pipWindowRef = React.useRef<Window | null>(null);
  const pipRootRef = React.useRef<Root | null>(null);

  const pipSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  // Track viewport so we can place the button in the title bar on mobile and
  // the control bar on desktop.
  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 960);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Find the portal targets (control bar + title-bar right side).
  React.useEffect(() => {
    const find = () => {
      const bar = document.querySelector('.lk-control-bar');
      if (bar) setControlBar(bar);
      const tr = document.querySelector('.meeting-title-right');
      if (tr) setTitleRight(tr);
    };
    find();
    const id = setInterval(find, 500);
    return () => clearInterval(id);
  }, []);

  // ---- MediaSession: OS-level "ongoing call" controls (mobile + background) ----
  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: 'MyTalk meeting',
        artist: `Room ${room.name}`,
        album: 'Live audio',
      });
      ms.playbackState = 'playing';
    } catch {}

    const toggleMic = () => {
      const lp = room.localParticipant;
      if (lp.permissions?.canPublish) lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled).catch(() => {});
    };
    const leave = () => room.disconnect();
    const set = (action: string, handler: (() => void) | null) => {
      try { ms.setActionHandler(action as MediaSessionAction, handler as any); } catch {}
    };
    set('stop', leave);
    set('pause', toggleMic);
    set('play', toggleMic);
    set('hangup', leave);

    return () => {
      ['stop', 'pause', 'play', 'hangup'].forEach((a) => set(a, null));
    };
  }, [room]);

  const closePip = React.useCallback(() => {
    try { pipRootRef.current?.unmount(); } catch {}
    try { pipWindowRef.current?.close(); } catch {}
    pipRootRef.current = null;
    pipWindowRef.current = null;
    setPipOpen(false);
  }, []);

  const openPip = React.useCallback(async () => {
    try {
      const w: Window = await (window as any).documentPictureInPicture.requestWindow({
        width: 300,
        height: 400,
      });
      w.document.title = 'MyTalk';
      const body = w.document.body;
      body.style.margin = '0';
      body.style.background = '#e6e9f0';
      body.style.fontFamily = "'Plus Jakarta Sans', 'Segoe UI', Roboto, Arial, sans-serif";

      // The PiP window is a SEPARATE document — React's event delegation lives
      // on the main document, so we must render a dedicated React root here (and
      // re-provide the room context) for clicks inside the window to work.
      const root = createRoot(body);
      pipRootRef.current = root;
      pipWindowRef.current = w;
      root.render(
        <RoomContext.Provider value={room}>
          <PipContent onLeave={() => room.disconnect()} onReturn={() => { closePip(); try { window.focus(); } catch {} }} />
        </RoomContext.Provider>,
      );

      w.addEventListener('pagehide', closePip);
      setPipOpen(true);
    } catch (e) {
      console.error('Picture-in-Picture failed:', e);
    }
  }, [room, closePip]);

  // Clean up the PiP window if the meeting component unmounts (user left).
  React.useEffect(() => {
    return () => { closePip(); };
  }, [closePip]);

  // Document Picture-in-Picture only produces a real floating window on DESKTOP
  // browsers. On mobile the API may exist but requestWindow can't float a window
  // for an audio-only call, so the button would do nothing. Hide it there and
  // rely on MediaSession: minimising the browser keeps the audio playing with an
  // OS "ongoing call" notification.
  if (isMobile || !pipSupported || !controlBar) return null;
  const target = controlBar;

  const toggle = pipOpen ? closePip : openPip;
  const pipIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );

  return createPortal(
    <button
      className="lk-button lk-pip-toggle"
      onClick={toggle}
      title={pipOpen ? 'Close pop-out' : 'Pop out meeting'}
    >
      {pipIcon}
      <span className="lk-btn-label">{pipOpen ? 'Close PiP' : 'Pop out'}</span>
    </button>,
    target,
  );
}

/* ---------- content rendered inside the floating PiP window ---------- */

function PipContent({ onLeave, onReturn }: { onLeave: () => void; onReturn: () => void }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  let canPublish = false;
  try { canPublish = localParticipant.permissions?.canPublish ?? false; } catch {}

  const people = participants.map((p) => {
    let imageUrl = '';
    try { imageUrl = JSON.parse(p.metadata || '{}').imageUrl || ''; } catch {}
    return { id: p.identity, name: p.name || p.identity, imageUrl, speaking: p.isSpeaking };
  });

  const toggleMic = () => {
    if (canPublish) localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {});
  };

  const S: Record<string, React.CSSProperties> = {
    wrap: { display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box', padding: 14, gap: 12, color: '#1f2440', background: '#e6e9f0' },
    head: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    logo: { fontSize: 15, fontWeight: 700 },
    dot: { width: 7, height: 7, borderRadius: '50%', background: '#16a34a' },
    room: { fontSize: 11, color: '#7d849f', marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    grid: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(64px,1fr))', gap: 10, alignContent: 'start' },
    person: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 },
    avatar: { width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', objectFit: 'cover', flexShrink: 0 },
    name: { fontSize: 10, color: '#4f5675', maxWidth: 64, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' },
    controls: { display: 'flex', gap: 8, flexShrink: 0 },
    btn: { flex: 1, height: 42, border: 'none', borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  };

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div style={S.dot} />
        <span style={S.logo}>My<span style={{ color: '#3f6fe0' }}>Talk</span></span>
        <span style={S.room}>{room.name} · {people.length}</span>
      </div>

      <div style={S.grid}>
        {people.map((p) => (
          <div key={p.id} style={S.person}>
            {p.imageUrl ? (
              <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" style={{ ...S.avatar, boxShadow: p.speaking ? '0 0 0 2px #e6e9f0, 0 0 0 4px #16a34a' : 'none' }} />
            ) : (
              <div style={{ ...S.avatar, background: grad(p.id), boxShadow: p.speaking ? '0 0 0 2px #e6e9f0, 0 0 0 4px #16a34a' : 'none' }}>{initials(p.name)}</div>
            )}
            <span style={S.name}>{p.name}</span>
          </div>
        ))}
      </div>

      <div style={S.controls}>
        {canPublish && (
          <button
            onClick={toggleMic}
            style={{ ...S.btn, background: isMicrophoneEnabled ? '#eef0f5' : 'linear-gradient(145deg,#f06a6a,#d94848)', color: '#fff' }}
          >
            {isMicrophoneEnabled ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" /><path d="M19 11a7 7 0 0 1-14 0M12 18v3" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6" /><path d="M17 16.9A7 7 0 0 1 5 11M12 18v3" /></svg>
            )}
            {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          </button>
        )}
        <button onClick={onReturn} style={{ ...S.btn, background: '#eef0f5', color: '#1f2440' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v3" /></svg>
          Return
        </button>
        <button onClick={onLeave} style={{ ...S.btn, background: 'linear-gradient(145deg,#f06a6a,#d94848)', color: '#fff', flex: '0 0 46px' }} aria-label="Leave">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.01L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.01c-.79-.73-1.68-1.36-2.66-1.85a1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z" /></svg>
        </button>
      </div>
    </div>
  );
}
