'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { generateRoomId } from '@/lib/client-utils';

interface Participant {
  identity: string;
  name: string;
  sid: string;
  role: string;
  bio?: string;
  imageUrl?: string;
  isHandRaised?: boolean;
  isSpeaking: boolean;
  joinedAt: number;
  canPublish: boolean;
}

interface Knock {
  id: string;
  name?: string;
  imageUrl?: string;
  bio?: string;
  role?: string;
  at?: number;
  status?: string;
}

interface RoomInfo {
  name: string;
  sid: string;
  numParticipants: number;
  creationTime: number;
  metadata?: string;
  participants: Participant[];
}

interface RoomMeta {
  title: string;
  visibility: 'public' | 'private';
  locked: boolean;
  knock: Knock[];
}

/* ---------- helpers ---------- */

const FONT = "'Plus Jakarta Sans', 'Segoe UI', Roboto, Arial, sans-serif";

const AVATAR_GRADIENTS = [
  'linear-gradient(145deg,#f0ab3f,#de7a24)',
  'linear-gradient(145deg,#7aa0ff,#5a83ee)',
  'linear-gradient(145deg,#16a34a,#3f9e70)',
  'linear-gradient(145deg,#c77dff,#9d4edd)',
  'linear-gradient(145deg,#ec6d86,#c94660)',
  'linear-gradient(145deg,#4fc3e0,#2f97b8)',
];
function avatarGradient(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
function roleDisplay(role: string): string {
  if (role === 'host') return 'Host';
  if (role === 'moderator') return 'Speaker';
  return 'Listener';
}
function roleColor(role: string): string {
  if (role === 'host') return '#3f6fe0';
  if (role === 'moderator') return '#16a34a';
  return '#6a7192';
}
function parseMeta(metadata?: string): RoomMeta {
  let title = '', visibility: 'public' | 'private' = 'public', locked = false, knock: Knock[] = [];
  try {
    const m = JSON.parse(metadata || '{}');
    title = m.title || '';
    visibility = m.visibility === 'private' ? 'private' : 'public';
    locked = m.locked === true;
    if (Array.isArray(m.knock)) knock = m.knock;
  } catch {}
  return { title, visibility, locked, knock };
}
function fmtDur(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
}
function agoLabel(now: number, t?: number): string {
  if (!t || !now) return 'now';
  const m = Math.floor((now - t) / 60000);
  return m < 1 ? 'now' : m + 'm ago';
}

// Icon path sets (stroke-based)
const P = {
  live: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  ppl: '<path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  mic: '<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
  off: '<path d="M1 1l22 22M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 16.9A7 7 0 0 1 5 11M12 18v3"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0"/>',
  head: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h3ZM3 15a2 2 0 0 0 2 2h1v-5H3Z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  wait: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
};

function Svg({ d, color = 'currentColor', size = 20, sw = 2 }: { d: string; color?: string; size?: number; sw?: number }) {
  // Accept either full inner markup ("<path .../>") or a raw path `d` string.
  const inner = d.trim().startsWith('<') ? d : `<path d="${d}"/>`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

function personStatus(p: Participant): { text: string; color: string; icon: string } {
  if (!p.canPublish) return { text: 'Listening', color: '#6a7192', icon: P.head };
  if (p.isSpeaking) return { text: 'Speaking', color: '#16a34a', icon: P.mic };
  return { text: 'Can speak', color: '#d98a12', icon: P.mic };
}

type Tab = 'live' | 'scheduled' | 'history';
type Filter = 'All' | 'Speakers' | 'Listeners' | 'Hands';

/* ---------- component ---------- */

export default function AdminPage() {
  const [password, setPassword] = useState(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('adminPwd') || '';
    return '';
  });
  const [isAuthed, setIsAuthed] = useState(() => {
    if (typeof window !== 'undefined') return !!sessionStorage.getItem('adminPwd');
    return false;
  });
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [endedRooms, setEndedRooms] = useState<Array<{ name: string; sid: string; title: string; endedAt: number; creationTime: number; host: string; visibility: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(0);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 820);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Server render (and the first client paint before hydration) can't read
  // sessionStorage, so isAuthed starts false there → the login screen would
  // flash before hydration restores the session. Gate on `mounted` so we show a
  // neutral splash until the client knows the real auth state.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [tab, setTab] = useState<Tab>('live');
  const [selCode, setSelCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formPrivacy, setFormPrivacy] = useState<'public' | 'private'>('public');

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin', { headers: { Authorization: `Bearer ${password}` } });
      if (res.status === 401) { setIsAuthed(false); setError('Invalid password'); return; }
      const data = await res.json();
      setRooms(data.rooms || []);
      setEndedRooms(data.endedRooms || []);
      setError('');
    } catch {
      setError('Failed to fetch rooms');
    } finally {
      setLoading(false);
    }
  }, [password]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin', { headers: { Authorization: `Bearer ${password}` } });
    if (res.ok) {
      setIsAuthed(true);
      sessionStorage.setItem('adminPwd', password);
      setError('');
      const data = await res.json();
      setRooms(data.rooms || []);
      setEndedRooms(data.endedRooms || []);
    } else {
      setError('Wrong password');
    }
  };

  const post = useCallback(async (body: any, msg?: string) => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      flash(msg || data.message || 'Done');
      fetchRooms();
    } catch {
      flash('Action failed');
    }
  }, [password, flash, fetchRooms]);

  useEffect(() => {
    if (!isAuthed) return;
    fetchRooms();
    const id = setInterval(fetchRooms, 5000);
    return () => clearInterval(id);
  }, [isAuthed, fetchRooms]);

  // live clock for durations
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const createMeeting = async () => {
    const roomId = generateRoomId();
    const origin = window.location.origin;
    const listenerLink = `${origin}/rooms/${roomId}`;
    let hostLink = `${origin}/rooms/${roomId}?role=host`;
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ action: 'create_room', roomName: roomId, meetingTitle: formTitle.trim(), visibility: formPrivacy }),
      });
      const data = await res.json();
      if (data?.hostToken) hostLink = `${origin}/rooms/${roomId}?role=host&hk=${encodeURIComponent(data.hostToken)}`;
    } catch {}
    try { navigator.clipboard.writeText(hostLink); } catch {}
    setModalOpen(false);
    setSelCode(roomId);
    setTab('live');
    flash(`${formTitle.trim() || 'Meeting'} created · host link copied`);
    setFormTitle('');
    setFormPrivacy('public');
    fetchRooms();
    // Show both links so the admin can share the right one with the right people.
    setTimeout(() => {
      window.alert(
        `Meeting created!\n\n` +
        `HOST link (to run the meeting — keep private):\n${hostLink}\n\n` +
        `LISTENER link (share with attendees):\n${listenerLink}`,
      );
    }, 60);
  };

  const logout = () => {
    setIsAuthed(false);
    setPassword('');
    sessionStorage.removeItem('adminPwd');
  };

  /* ---------- pre-hydration splash (avoids login flash on reload) ---------- */
  if (!mounted) {
    return <div style={{ minHeight: '100vh', background: '#e6e9f0' }} />;
  }

  /* ---------- login screen ---------- */
  if (!isAuthed) {
    return (
      <div style={S.loginPage}>
        <div style={S.glow} />
        <div style={isMobile ? { ...S.loginCard, padding: 24, gap: 16, borderRadius: 24 } : S.loginCard}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={S.loginLogoRing}>
              <img src="/icons/logo_icon.png" alt="MyTalk" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>My<span style={{ color: '#3f6fe0' }}>Talk</span></div>
              <div style={S.adminBadge}>Admin</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Console sign in</div>
            <div style={{ fontSize: 14, color: '#6a7192', lineHeight: 1.5 }}>
              Monitor and moderate your live meetings in real time.
            </div>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#6a7192' }}>Admin password</label>
            <div style={S.inputWrap}>
              <Svg d={P.lock} color="#7d849f" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={S.inputBare}
                autoFocus
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="adm-btn" style={S.eyeBtn} aria-label="Toggle password">
                <Svg d={showPassword ? 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2' : 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'} color="#6a7192" size={18} />
              </button>
            </div>
            {error && (
              <div style={S.errorBox}><Svg d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 8v4M12 16h.01" color="#e04848" size={16} />{error}</div>
            )}
            <button type="submit" className="adm-btn" style={{ ...S.btnPrimary, height: 50, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Svg d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" color="#fff" size={18} sw={2.2} />
              Sign in to console
            </button>
          </form>

          {/* Capability strip */}
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { icon: P.live, label: 'Live monitor', color: '#3f6fe0' },
              { icon: P.mic, label: 'Moderation', color: '#16a34a' },
              { icon: P.lock, label: 'Secure access', color: '#a58cff' },
            ].map((f) => (
              <div key={f.label} style={S.loginFeature}>
                <div style={{ ...S.loginFeatureIcon, color: f.color }}><Svg d={f.icon} color={f.color} size={16} /></div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#6a7192', whiteSpace: 'nowrap' }}>{f.label}</span>
              </div>
            ))}
          </div>

          <div style={S.loginFooter}><Svg d={P.lock} color="#7d849f" size={13} />Protected area · Authorized access only</div>
        </div>
      </div>
    );
  }

  /* ---------- derived ---------- */
  const allParticipants = rooms.flatMap((r) => r.participants);
  const totalWaiting = rooms.reduce((n, r) => n + parseMeta(r.metadata).knock.filter((k) => k.status === 'pending').length, 0);
  const stats: { label: string; value: number; color: string; icon: string }[] = [
    { label: 'Live meetings', value: rooms.length, color: '#3f6fe0', icon: P.live },
    { label: 'People online', value: allParticipants.length, color: '#16a34a', icon: P.ppl },
    { label: 'Speaking now', value: allParticipants.filter((p) => p.canPublish).length, color: '#a58cff', icon: P.mic },
    { label: 'Hands raised', value: allParticipants.filter((p) => p.isHandRaised).length, color: '#d98a12', icon: P.hand },
    { label: 'Waiting to join', value: totalWaiting, color: '#a58cff', icon: P.wait },
  ];

  const sel = rooms.find((r) => r.name === selCode) || rooms[0];
  const selMeta = sel ? parseMeta(sel.metadata) : null;

  const navItems: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: 'live', label: 'Live', icon: P.live, count: rooms.length },
    { key: 'history', label: 'History', icon: P.hist, count: endedRooms.length },
  ];
  const titles: Record<Tab, [string, string]> = {
    live: ['Live meetings', 'Monitor and moderate meetings in real time'],
    scheduled: ['Scheduled', 'Upcoming meetings'],
    history: ['History', 'Recently ended meetings'],
  };

  return (
    <div style={isMobile ? { ...S.shell, display: 'flex', flexDirection: 'column' } : S.shell}>
      {/* Sidebar */}
      <aside style={isMobile ? { ...S.sidebar, position: 'static', height: 'auto', flexDirection: 'column', gap: 16, padding: 'max(16px, calc(env(safe-area-inset-top) + 8px)) 16px 8px' } : S.sidebar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px' }}>
          <div style={S.logoBox}><img src="/icons/logo_icon.png" alt="MyTalk" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em' }}>My<span style={{ color: '#3f6fe0' }}>Talk</span></div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7d849f' }}>Admin console</div>
          </div>
          {isMobile && (
            <button onClick={logout} className="adm-btn" aria-label="Logout" style={{ ...S.iconBtn, marginLeft: 'auto', flexShrink: 0 }}>
              <Svg d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" color="#e04848" size={16} sw={2.2} />
            </button>
          )}
        </div>
        <nav style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 10 }}>
          {navItems.map((n) => {
            const active = tab === n.key;
            return (
              <button
                key={n.key}
                className="adm-btn"
                onClick={() => setTab(n.key)}
                style={{
                  border: 'none', cursor: 'pointer', fontFamily: FONT, height: isMobile ? 44 : 52, padding: isMobile ? '0 14px' : '0 16px', borderRadius: isMobile ? 13 : 16, flexShrink: 0,
                  background: '#e6e9f0', boxShadow: active ? 'inset 4px 4px 9px #c3c8d4, inset -4px -4px 9px #ffffff' : 'none',
                  display: 'flex', alignItems: 'center', gap: isMobile ? 9 : 14, color: active ? '#3f6fe0' : '#7d849f', fontSize: isMobile ? 14 : 15, fontWeight: 600, textAlign: 'left',
                }}
              >
                <Svg d={n.icon} color={active ? '#3f6fe0' : '#7d849f'} size={20} />
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{n.label}</span>
                <span style={S.navCount}>{n.count}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ ...S.sidebarUser, display: isMobile ? 'none' : 'flex' }}>
          <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', background: 'linear-gradient(145deg,#f0ab3f,#de7a24)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>HA</div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Administrator</div>
            <div style={{ fontSize: 12, color: '#7d849f' }}>MyTalk Admin</div>
          </div>
          <button onClick={logout} className="adm-btn" aria-label="Logout" style={{ border: 'none', cursor: 'pointer', width: 32, height: 32, flexShrink: 0, borderRadius: 12, background: '#e6e9f0', boxShadow: '3px 3px 7px #c3c8d4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Svg d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" color="#e04848" size={16} sw={2.2} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={isMobile ? { ...S.main, padding: '18px 16px 40px' } : S.main}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 700, letterSpacing: '-.02em' }}>{titles[tab][0]}</div>
            <div style={{ fontSize: 14, color: '#6a7192' }}>{titles[tab][1]}</div>
          </div>
          <button className="adm-btn" onClick={() => { setFormTitle(''); setFormPrivacy('public'); setModalOpen(true); }} style={S.btnPrimaryHeader}>
            <Svg d="M12 5v14M5 12h14" color="#fff" size={18} sw={2.4} />New Meeting
          </button>
        </header>

        {/* LIVE TAB */}
        {tab === 'live' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fit,minmax(150px,1fr))' : 'repeat(auto-fit,minmax(190px,1fr))', gap: isMobile ? 12 : 20 }}>
              {stats.map((st) => (
                <div key={st.label} style={isMobile ? { ...S.statCard, padding: '14px 16px', gap: 12 } : S.statCard}>
                  <div style={{ ...S.statIcon, color: st.color, ...(isMobile ? { width: 42, height: 42 } : {}) }}><Svg d={st.icon} color={st.color} size={isMobile ? 18 : 22} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.1 }}>{st.value}</div>
                    <div style={{ fontSize: isMobile ? 12 : 13, color: '#7d849f', whiteSpace: 'nowrap' }}>{st.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Live now list */}
              <div style={{ flex: '0 1 330px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={S.sectionLabel}>Live now</div>
                {rooms.map((room) => {
                  const rm = parseMeta(room.metadata);
                  const hands = room.participants.filter((p) => p.isHandRaised).length;
                  const waiting = rm.knock.filter((k) => k.status === 'pending').length;
                  const active = sel?.name === room.name;
                  return (
                    <button
                      key={room.sid}
                      className="adm-btn"
                      onClick={() => { setSelCode(room.name); setQuery(''); setFilter('All'); }}
                      style={{
                        border: 'none', cursor: 'pointer', fontFamily: FONT, textAlign: 'left', padding: 18, borderRadius: 22,
                        background: '#e6e9f0', boxShadow: active ? 'inset 5px 5px 11px #c3c8d4, inset -5px -5px 11px #ffffff' : '6px 6px 14px #c3c8d4',
                        display: 'flex', flexDirection: 'column', gap: 14, color: '#1f2440',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rm.title || room.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 12, color: '#7d849f' }}>{room.name}</div>
                            <span style={{ ...S.privBadge, color: rm.visibility === 'private' ? '#a58cff' : '#16a34a' }}>
                              <Svg d={rm.visibility === 'private' ? P.lock : P.globe} color="currentColor" size={11} sw={2.5} />
                              {rm.visibility === 'private' ? 'Private' : 'Public'}
                            </span>
                          </div>
                        </div>
                        <div style={S.durPill}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                          {now ? fmtDur(now - room.creationTime * 1000) : '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {room.participants.slice(0, 4).map((p, i) => (
                            p.imageUrl ? (
                              <img key={p.sid} src={p.imageUrl} alt="" referrerPolicy="no-referrer" style={{ ...S.faceAvatar, marginRight: -8, zIndex: 4 - i }} />
                            ) : (
                              <div key={p.sid} style={{ ...S.faceAvatar, marginRight: -8, zIndex: 4 - i, background: avatarGradient(p.identity || p.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{initials(p.name || p.identity)}</div>
                            )
                          ))}
                          <div style={{ marginLeft: 16, fontSize: 12, color: '#6a7192', whiteSpace: 'nowrap' }}>{room.participants.length} in call</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {rm.locked && <div style={S.miniBadgeInset}><Svg d={P.lock} color="#d98a12" size={13} sw={2.4} /></div>}
                          {waiting > 0 && <div style={{ ...S.miniBadgeSolid, background: '#a58cff' }}><Svg d={P.wait} color="#e6e9f0" size={12} sw={2.6} />{waiting}</div>}
                          {hands > 0 && <div style={{ ...S.miniBadgeSolid, background: '#d98a12' }}><Svg d={P.hand} color="#e6e9f0" size={12} sw={2.6} />{hands}</div>}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {rooms.length === 0 && (
                  <div style={S.emptyInset}>No live meetings. Start one with New Meeting.</div>
                )}
              </div>

              {/* Selected meeting detail */}
              {sel && selMeta && (
                <SelectedMeeting sel={sel} meta={selMeta} now={now} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} post={post} flash={flash} password={password} fetchRooms={fetchRooms} isMobile={isMobile} />
              )}
            </div>
          </>
        )}

        {/* SCHEDULED TAB */}
        {tab === 'scheduled' && (
          <div style={S.emptyBig}>
            <Svg d={P.cal} color="#3f6fe0" size={40} sw={1.6} />
            <div style={{ fontSize: 18, fontWeight: 700 }}>No scheduled meetings</div>
            <div style={{ fontSize: 14, color: '#6a7192', maxWidth: 380 }}>Scheduling isn&apos;t available yet. Use New Meeting to start one instantly.</div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          endedRooms.length === 0 ? (
            <div style={S.emptyBig}>
              <Svg d={P.hist} color="#3f6fe0" size={40} sw={1.6} />
              <div style={{ fontSize: 18, fontWeight: 700 }}>No ended meetings yet</div>
              <div style={{ fontSize: 14, color: '#6a7192', maxWidth: 380 }}>When a meeting is ended it will appear here. Live meetings are under the Live tab.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {endedRooms.map((r) => (
                <div key={r.sid || r.name} style={{ ...S.reqCard, justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <div style={{ ...S.miniBadgeInset, width: 42, height: 42, borderRadius: 14, flexShrink: 0 }}>
                      <Svg d={P.hist} color="#9aa0b8" size={18} />
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || r.name}</div>
                        <span style={{ ...S.rolePill, color: '#e04848' }}>Ended</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#7d849f' }}>
                        {r.name}
                        {r.host ? ` · Hosted by ${r.host}` : ''}
                        {r.endedAt ? ` · Ended ${now ? fmtDur(now - r.endedAt) : ''} ago` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={isMobile ? { ...S.toast, right: 16, left: 16, bottom: 16, justifyContent: 'center' } : S.toast}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />{toast}</div>
      )}

      {/* New meeting modal */}
      {modalOpen && (
        <div style={S.modalOverlay}>
          <div style={S.modalBackdrop} onClick={() => setModalOpen(false)} />
          <div style={S.modalCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em' }}>New meeting</div>
                <div style={{ fontSize: 14, color: '#7d849f' }}>Choose who can get in</div>
              </div>
              <button className="adm-btn" onClick={() => setModalOpen(false)} aria-label="Close" style={S.modalClose}>
                <Svg d="M6 6l12 12M18 6 6 18" color="#4f5675" size={16} sw={2.4} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={S.formLabel}>Meeting name</div>
              <div style={S.formInputWrap}>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createMeeting(); }}
                  placeholder="e.g. Committee review"
                  style={S.inputBare}
                  autoFocus
                  maxLength={100}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={S.formLabel}>Access</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
                {([
                  { key: 'public', title: 'Public', c: '#16a34a', icon: P.globe, desc: 'Anyone with the link joins instantly. No approval needed.' },
                  { key: 'private', title: 'Private', c: '#a58cff', icon: P.lock, desc: 'Listeners and moderators request to join. The host or an admin must admit them.' },
                ] as const).map((opt) => {
                  const active = formPrivacy === opt.key;
                  return (
                    <button key={opt.key} className="adm-btn" onClick={() => setFormPrivacy(opt.key)} style={{
                      border: 'none', cursor: 'pointer', fontFamily: FONT, textAlign: 'left', padding: 18, borderRadius: 20, background: '#e6e9f0',
                      boxShadow: active ? 'inset 5px 5px 11px #c3c8d4, inset -5px -5px 11px #ffffff' : '5px 5px 12px #c3c8d4',
                      display: 'flex', flexDirection: 'column', gap: 12, color: '#1f2440',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ width: 42, height: 42, borderRadius: 14, boxShadow: 'inset 3px 3px 7px #c3c8d4, inset -3px -3px 7px #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Svg d={opt.icon} color={opt.c} size={20} />
                        </div>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', boxShadow: 'inset 2px 2px 5px #c3c8d4, inset -2px -2px 5px #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: active ? opt.c : 'transparent' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{opt.title}</div>
                        <div style={{ fontSize: 13, lineHeight: 1.45, color: '#6a7192' }}>{opt.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
              <button className="adm-btn" onClick={() => setModalOpen(false)} style={{ ...S.btnGhost, height: 52, borderRadius: 18 }}>Cancel</button>
              <button className="adm-btn" onClick={createMeeting} style={{ ...S.btnPrimary, height: 52, padding: '0 28px', borderRadius: 18, fontWeight: 700 }}>
                {formPrivacy === 'private' ? 'Create private meeting' : 'Create public meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- selected meeting ---------- */

function SelectedMeeting({ sel, meta, now, query, setQuery, filter, setFilter, post, flash, password, fetchRooms, isMobile }: {
  sel: RoomInfo;
  meta: RoomMeta;
  now: number;
  query: string;
  setQuery: (v: string) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  post: (body: any, msg?: string) => void;
  flash: (m: string) => void;
  password: string;
  fetchRooms: () => void;
  isMobile: boolean;
}) {
  const roomName = sel.name;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const startEditTitle = () => { setTitleInput(meta.title || ''); setEditingTitle(true); };
  const saveTitle = () => { post({ action: 'set_title', roomName, title: titleInput.trim() }, 'Title updated'); setEditingTitle(false); };
  const pending = meta.knock.filter((k) => k.status === 'pending');
  const handRaisers = sel.participants.filter((p) => p.isHandRaised);

  const filters: Filter[] = ['All', 'Speakers', 'Listeners', 'Hands'];
  const q = query.toLowerCase();
  const rows = sel.participants.filter((p) => {
    if (filter === 'Speakers' && !p.canPublish) return false;
    if (filter === 'Listeners' && p.canPublish) return false;
    if (filter === 'Hands' && !p.isHandRaised) return false;
    return (p.name || p.identity).toLowerCase().includes(q);
  });

  const admitAll = async () => {
    await Promise.all(pending.map((k) =>
      fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ action: 'approve_knock', roomName, knockId: k.id }),
      }).catch(() => {}),
    ));
    flash(`${pending.length} admitted`);
    fetchRooms();
  };

  const selActions = [
    meta.visibility === 'private'
      ? { label: 'Make public', color: '#16a34a', icon: P.globe, onClick: () => post({ action: 'set_visibility', roomName, visibility: 'public' }) }
      : { label: 'Make private', color: '#a58cff', icon: P.lock, onClick: () => post({ action: 'set_visibility', roomName, visibility: 'private' }) },
    meta.locked
      ? { label: 'Unlock', color: '#d98a12', icon: P.unlock, onClick: () => post({ action: 'lock_room', roomName, locked: false }) }
      : { label: 'Lock', color: '#d98a12', icon: P.lock, onClick: () => post({ action: 'lock_room', roomName, locked: true }) },
    { label: 'Mute all', color: '#1f2440', icon: P.off, onClick: () => post({ action: 'mute_all', roomName }, 'Everyone muted') },
    { label: 'Unmute all', color: '#1f2440', icon: P.mic, onClick: () => post({ action: 'unmute_all', roomName }, 'Speakers unmuted') },
    { label: 'Copy link', color: '#3f6fe0', icon: P.link, onClick: () => { try { navigator.clipboard.writeText(`${window.location.origin}/rooms/${roomName}`); } catch {} flash('Link copied'); } },
  ];

  return (
    <section style={isMobile ? { ...S.detailCard, padding: 16, borderRadius: 22 } : S.detailCard}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {editingTitle ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  maxLength={100}
                  placeholder={roomName}
                  autoFocus
                  style={S.titleInput}
                />
                <button className="adm-btn" onClick={saveTitle} style={{ ...S.rowBtn, color: '#16a34a' }}>Save</button>
                <button className="adm-btn" onClick={() => setEditingTitle(false)} style={{ ...S.rowBtn, color: '#7d849f' }}>Cancel</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em' }}>{meta.title || roomName}</div>
                <button className="adm-btn" aria-label="Edit title" title="Edit title" onClick={startEditTitle} style={S.iconBtn}>
                  <Svg d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" color="#4f5675" size={15} sw={2} />
                </button>
              </>
            )}
            <span style={{ ...S.privBadge, color: meta.visibility === 'private' ? '#a58cff' : '#16a34a' }}>
              <Svg d={meta.visibility === 'private' ? P.lock : P.globe} color="currentColor" size={11} sw={2.5} />
              {meta.visibility === 'private' ? 'Private' : 'Public'}
            </span>
            {meta.locked && <span style={{ ...S.lockedBadge }}>Locked</span>}
          </div>
          <div style={{ fontSize: 13, color: '#7d849f', whiteSpace: 'nowrap' }}>
            {roomName} · {sel.participants.length} participants · Live {now ? fmtDur(now - sel.creationTime * 1000) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {selActions.map((a) => (
            <button key={a.label} className="adm-btn" onClick={a.onClick} style={{ ...S.actionPill, color: a.color }}>
              <Svg d={a.icon} color={a.color} size={16} />{a.label}
            </button>
          ))}
          <button
            className="adm-btn"
            onClick={() => { if (confirm(`End meeting "${meta.title || roomName}"?`)) post({ action: 'end_room', roomName }, 'Meeting ended'); }}
            style={S.endPill}
          >
            End Meeting
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* people */}
        <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={S.searchBox}>
              <Svg d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5" color="#7d849f" size={16} sw={2.2} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" style={S.inputBare} />
            </div>
            <div style={S.filterBar}>
              {filters.map((f) => {
                const active = filter === f;
                return (
                  <button key={f} className="adm-btn" onClick={() => setFilter(f)} style={{
                    border: 'none', cursor: 'pointer', fontFamily: FONT, height: 38, padding: '0 12px', borderRadius: 11, background: '#e6e9f0',
                    boxShadow: active ? '3px 3px 7px #c3c8d4' : 'none', color: active ? '#3f6fe0' : '#7d849f', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                  }}>
                    {f === 'Hands' ? `Hands (${handRaisers.length})` : f}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={S.peopleList}>
            {rows.map((p) => {
              const st = personStatus(p);
              const isHost = p.role === 'host';
              const isListener = !p.canPublish;
              return (
                <div key={p.sid} style={isMobile ? { ...S.personRow, gridTemplateColumns: '1fr', gap: 12 } : S.personRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" style={{ ...S.personAvatar, boxShadow: p.isSpeaking ? '0 0 0 2px #e6e9f0, 0 0 0 4px #16a34a' : '3px 3px 7px #c3c8d4' }} />
                      ) : (
                        <div style={{ ...S.personAvatar, background: avatarGradient(p.identity || p.name), boxShadow: p.isSpeaking ? '0 0 0 2px #e6e9f0, 0 0 0 4px #16a34a' : '3px 3px 7px #c3c8d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{initials(p.name || p.identity)}</div>
                      )}
                      {p.isHandRaised && (
                        <div style={S.handBadge}><Svg d={P.hand} color="#e6e9f0" size={10} sw={3} /></div>
                      )}
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.identity}</div>
                        <span style={{ ...S.rolePill, color: roleColor(p.role) }}>{roleDisplay(p.role)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: st.color, whiteSpace: 'nowrap', minWidth: 0 }}>
                        <Svg d={st.icon} color={st.color} size={13} />
                        {st.text}
                        {p.bio ? <span style={{ color: '#7d849f', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {p.bio}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                    {!isHost && (
                      isListener ? (
                        <button className="adm-btn" onClick={() => post({ action: 'grant_speak', roomName, identity: p.identity }, `${p.name || p.identity} can speak`)} style={{ ...S.rowBtn, color: '#16a34a' }}>Make speaker</button>
                      ) : (
                        <button className="adm-btn" onClick={() => post({ action: 'revoke_speak', roomName, identity: p.identity }, `${p.name || p.identity} moved to listeners`)} style={{ ...S.rowBtn, color: '#d98a12' }}>Make listener</button>
                      )
                    )}
                    {!isHost && (
                      <button className="adm-btn" onClick={() => { if (confirm(`Make ${p.name || p.identity} a host?`)) post({ action: 'make_host', roomName, identity: p.identity }, `${p.name || p.identity} is now host`); }} style={{ ...S.rowBtn, color: '#3f6fe0' }}>Make host</button>
                    )}
                    {isHost && (
                      <button className="adm-btn" onClick={() => { if (confirm(`Demote ${p.name || p.identity} from host?`)) post({ action: 'demote_host', roomName, identity: p.identity }, `${p.name || p.identity} demoted to listener`); }} style={{ ...S.rowBtn, color: '#d98a12' }}>Demote host</button>
                    )}
                    <button className="adm-btn" aria-label="Remove" onClick={() => { if (confirm(`Remove ${p.name || p.identity} from the meeting?`)) post({ action: 'remove_participant', roomName, identity: p.identity }, `${p.name || p.identity} removed`); }} style={S.iconBtn}>
                      <Svg d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM17 11h6" color="#e04848" size={14} sw={2.4} />
                    </button>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#7d849f' }}>
                {sel.participants.length ? 'No one matches this filter.' : 'No participants yet.'}
              </div>
            )}
          </div>
        </div>

        {/* right column: requests */}
        <div style={{ flex: '1 1 280px', maxWidth: 360, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {meta.visibility === 'private' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', gap: 10 }}>
                <div style={S.sectionLabel}>Join requests</div>
                {pending.length > 0 && (
                  <button onClick={admitAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, padding: 0, fontSize: 12, fontWeight: 700, color: '#a58cff', whiteSpace: 'nowrap' }}>
                    Admit all ({pending.length})
                  </button>
                )}
              </div>
              {pending.map((k) => (
                <div key={k.id} style={S.reqCard}>
                  {k.imageUrl ? (
                    <img src={k.imageUrl} alt="" referrerPolicy="no-referrer" style={S.reqAvatar} />
                  ) : (
                    <div style={{ ...S.reqAvatar, background: avatarGradient(k.name || k.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>{initials(k.name || '?')}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.name || 'Guest'}</div>
                    <div style={{ fontSize: 12, color: '#7d849f', whiteSpace: 'nowrap' }}>Wants to join · {agoLabel(now, k.at)}</div>
                  </div>
                  <button className="adm-btn" onClick={() => post({ action: 'approve_knock', roomName, knockId: k.id }, `${k.name || 'Guest'} admitted`)} style={{ ...S.reqTextBtn, color: '#16a34a' }}>Admit</button>
                  <button className="adm-btn" aria-label="Decline" onClick={() => post({ action: 'reject_knock', roomName, knockId: k.id }, `${k.name || 'Guest'} declined`)} style={S.reqIconBtn}>
                    <Svg d="M6 6l12 12M18 6 6 18" color="#e04848" size={13} sw={2.8} />
                  </button>
                </div>
              ))}
              {pending.length === 0 && <div style={S.emptyInsetSm}>No one is waiting to join</div>}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
              <div style={S.sectionLabel}>Speak requests</div>
              {handRaisers.length > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#d98a12' }}>{handRaisers.length} waiting</div>}
            </div>
            {handRaisers.map((p) => (
              <div key={p.sid} style={S.reqCard}>
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" style={S.reqAvatar} />
                ) : (
                  <div style={{ ...S.reqAvatar, background: avatarGradient(p.identity || p.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>{initials(p.name || p.identity)}</div>
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.identity}</div>
                  <div style={{ fontSize: 12, color: '#7d849f' }}>Wants to speak</div>
                </div>
                <button className="adm-btn" aria-label="Approve" onClick={() => post({ action: 'grant_speak', roomName, identity: p.identity }, `${p.name || p.identity} can now speak`)} style={S.reqIconBtn}>
                  <Svg d="M5 12l5 5L20 7" color="#16a34a" size={15} sw={2.8} />
                </button>
                <button className="adm-btn" aria-label="Deny" onClick={() => post({ action: 'lower_hand', roomName, identity: p.identity }, `${p.name || p.identity}'s request dismissed`)} style={S.reqIconBtn}>
                  <Svg d="M6 6l12 12M18 6 6 18" color="#e04848" size={13} sw={2.8} />
                </button>
              </div>
            ))}
            {handRaisers.length === 0 && <div style={S.emptyInsetSm}>No pending requests</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- styles ---------- */

const S: Record<string, any> = {
  // login
  loginPage: { position: 'relative', height: '100vh', overflowY: 'auto', overflowX: 'hidden', background: 'radial-gradient(1200px 600px at 50% -10%, #e6e9f0 0%, #e6e9f0 55%)', color: '#1f2440', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' },
  glow: { position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(111,151,255,0.18), transparent 60%)', filter: 'blur(20px)', pointerEvents: 'none' },
  loginCard: { position: 'relative', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18, padding: 36, borderRadius: 28, background: '#e6e9f0', boxShadow: '14px 14px 30px #cdd2de, -8px -8px 20px #eef1f7', boxSizing: 'border-box' },
  loginBrandIcon: { width: 44, height: 44, borderRadius: 14, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loginLogoRing: { width: 72, height: 72, borderRadius: 24, background: '#e6e9f0', boxShadow: '7px 7px 16px #cdd2de, -5px -5px 12px #eef1f7', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  loginFeature: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px', borderRadius: 16, boxShadow: 'inset 3px 3px 7px #cdd2de, inset -3px -3px 7px #eef1f7' },
  loginFeatureIcon: { width: 34, height: 34, borderRadius: 11, background: '#e6e9f0', boxShadow: '3px 3px 7px #cdd2de, -2px -2px 6px #eef1f7', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  inputWrap: { display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 10px 0 16px', borderRadius: 14, background: '#e6e9f0', boxShadow: 'inset 4px 4px 9px #c3c8d4, inset -4px -4px 9px #ffffff' },
  inputBare: { flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#1f2440', fontSize: 15, fontFamily: FONT },
  eyeBtn: { flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#e6e9f0', boxShadow: '3px 3px 7px #c3c8d4', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  errorBox: { display: 'flex', alignItems: 'center', gap: 8, color: '#e04848', fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 12, boxShadow: 'inset 2px 2px 5px #c3c8d4, inset -2px -2px 5px #ffffff' },
  loginFooter: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: '#7d849f', marginTop: 2 },

  // shell
  shell: { height: '100vh', overflowY: 'auto', background: '#e6e9f0', color: '#1f2440', fontFamily: FONT, display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)' },
  sidebar: { position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 36 },
  logoBox: { width: 46, height: 46, borderRadius: 15, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navCount: { minWidth: 24, height: 22, padding: '0 7px', boxSizing: 'border-box', borderRadius: 8, boxShadow: 'inset 2px 2px 4px #c3c8d4, inset -2px -2px 4px #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6a7192' },
  sidebarUser: { marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 18, boxShadow: 'inset 4px 4px 9px #c3c8d4, inset -4px -4px 9px #ffffff' },
  adminBadge: { height: 26, padding: '0 10px', borderRadius: 8, boxShadow: 'inset 2px 2px 5px #c3c8d4, inset -2px -2px 5px #ffffff', display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6a7192' },

  main: { minWidth: 0, padding: '28px 40px 48px 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 28 },
  btnPrimaryHeader: { border: 'none', cursor: 'pointer', fontFamily: FONT, height: 50, padding: '0 22px', borderRadius: 17, background: 'linear-gradient(145deg,#7aa0ff,#5a83ee)', boxShadow: '5px 5px 12px #c3c8d4', color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' },
  btnPrimary: { border: 'none', cursor: 'pointer', fontFamily: FONT, height: 48, padding: '0 22px', borderRadius: 14, background: 'linear-gradient(145deg,#7aa0ff,#5a83ee)', boxShadow: '5px 5px 12px #c3c8d4', color: '#fff', fontSize: 14, fontWeight: 600 },
  btnGhost: { border: 'none', cursor: 'pointer', fontFamily: FONT, height: 48, padding: '0 24px', borderRadius: 16, background: '#e6e9f0', boxShadow: '5px 5px 10px #c3c8d4', color: '#1f2440', fontSize: 14, fontWeight: 600 },

  statCard: { padding: '20px 22px', borderRadius: 24, background: '#e6e9f0', boxShadow: '7px 7px 16px #c3c8d4', display: 'flex', alignItems: 'center', gap: 16 },
  statIcon: { width: 50, height: 50, flexShrink: 0, borderRadius: 16, boxShadow: 'inset 4px 4px 9px #c3c8d4, inset -4px -4px 9px #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  sectionLabel: { fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7d849f', paddingLeft: 4 },
  privBadge: { height: 22, padding: '0 8px', borderRadius: 7, boxShadow: 'inset 2px 2px 4px #c3c8d4, inset -2px -2px 4px #ffffff', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },
  lockedBadge: { height: 24, padding: '0 9px', borderRadius: 8, boxShadow: 'inset 2px 2px 5px #c3c8d4, inset -2px -2px 5px #ffffff', display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: '#d98a12' },
  durPill: { display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 9px', borderRadius: 9, boxShadow: 'inset 2px 2px 5px #c3c8d4, inset -2px -2px 5px #ffffff', fontSize: 12, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  faceAvatar: { width: 30, height: 30, borderRadius: '50%', border: '2px solid #e6e9f0', objectFit: 'cover' },
  miniBadgeInset: { width: 26, height: 26, borderRadius: 9, boxShadow: 'inset 2px 2px 5px #c3c8d4, inset -2px -2px 5px #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  miniBadgeSolid: { height: 26, padding: '0 8px', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#e6e9f0' },
  emptyInset: { padding: '32px 20px', borderRadius: 22, boxShadow: 'inset 4px 4px 10px #c3c8d4, inset -4px -4px 10px #ffffff', textAlign: 'center', fontSize: 14, color: '#7d849f' },
  emptyInsetSm: { padding: 18, borderRadius: 18, boxShadow: 'inset 4px 4px 9px #c3c8d4, inset -4px -4px 9px #ffffff', textAlign: 'center', fontSize: 13, color: '#7d849f' },
  emptyBig: { padding: '64px 24px', borderRadius: 30, boxShadow: 'inset 6px 6px 14px #c3c8d4, inset -6px -6px 14px #ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' },

  detailCard: { flex: '1 1 640px', minWidth: 0, borderRadius: 30, background: '#e6e9f0', boxShadow: '10px 10px 24px #c3c8d4', padding: 26, display: 'flex', flexDirection: 'column', gap: 22 },
  actionPill: { border: 'none', cursor: 'pointer', fontFamily: FONT, height: 42, padding: '0 14px', borderRadius: 14, background: '#e6e9f0', boxShadow: '4px 4px 9px #c3c8d4', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  endPill: { border: 'none', cursor: 'pointer', fontFamily: FONT, height: 42, padding: '0 16px', borderRadius: 14, background: 'linear-gradient(145deg,#f06a6a,#d94848)', boxShadow: '4px 4px 10px #c3c8d4', color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  searchBox: { flex: '1 1 200px', height: 46, borderRadius: 15, boxShadow: 'inset 4px 4px 9px #c3c8d4, inset -4px -4px 9px #ffffff', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' },
  filterBar: { display: 'flex', gap: 4, padding: 4, borderRadius: 15, boxShadow: 'inset 4px 4px 9px #c3c8d4, inset -4px -4px 9px #ffffff' },
  peopleList: { borderRadius: 22, boxShadow: 'inset 5px 5px 12px #c3c8d4, inset -5px -5px 12px #ffffff', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 },
  personRow: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '12px 14px', borderRadius: 16, background: '#e6e9f0', boxShadow: '4px 4px 9px #c3c8d4' },
  personAvatar: { width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' },
  handBadge: { position: 'absolute', right: -4, top: -4, width: 20, height: 20, borderRadius: '50%', background: '#d98a12', border: '2px solid #e6e9f0', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rolePill: { height: 22, padding: '0 8px', flexShrink: 0, borderRadius: 7, boxShadow: 'inset 2px 2px 4px #c3c8d4, inset -2px -2px 4px #ffffff', display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700 },
  rowBtn: { border: 'none', cursor: 'pointer', fontFamily: FONT, height: 34, padding: '0 12px', borderRadius: 11, background: '#e6e9f0', boxShadow: '3px 3px 7px #c3c8d4', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  iconBtn: { border: 'none', cursor: 'pointer', width: 34, height: 34, borderRadius: 11, background: '#e6e9f0', boxShadow: '3px 3px 7px #c3c8d4', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  titleInput: { fontFamily: FONT, fontSize: 20, fontWeight: 700, color: '#1f2440', background: '#e6e9f0', border: 'none', borderRadius: 12, padding: '8px 14px', minWidth: 220, boxShadow: 'inset 3px 3px 7px #c3c8d4, inset -3px -3px 7px #ffffff', outline: 'none' },
  reqCard: { padding: 14, borderRadius: 18, background: '#e6e9f0', boxShadow: '5px 5px 11px #c3c8d4', display: 'flex', alignItems: 'center', gap: 12 },
  reqAvatar: { width: 38, height: 38, flexShrink: 0, borderRadius: '50%', objectFit: 'cover' },
  reqTextBtn: { border: 'none', cursor: 'pointer', fontFamily: FONT, height: 34, padding: '0 12px', borderRadius: 11, background: '#e6e9f0', boxShadow: '3px 3px 7px #c3c8d4', fontSize: 12, fontWeight: 700 },
  reqIconBtn: { border: 'none', cursor: 'pointer', width: 34, height: 34, flexShrink: 0, borderRadius: 11, background: '#e6e9f0', boxShadow: '3px 3px 7px #c3c8d4', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  toast: { position: 'fixed', zIndex: 50, right: 40, bottom: 40, padding: '16px 20px', borderRadius: 16, background: '#eef0f5', boxShadow: '8px 8px 18px #b4bac8', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 },
  modalOverlay: { position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBackdrop: { position: 'absolute', inset: 0, background: 'rgba(12,14,26,.6)', backdropFilter: 'blur(4px)' },
  modalCard: { position: 'relative', width: '100%', maxWidth: 560, background: '#e6e9f0', borderRadius: 32, padding: 32, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 24, boxShadow: '14px 14px 30px #b4bac8' },
  modalClose: { border: 'none', cursor: 'pointer', width: 44, height: 44, flexShrink: 0, borderRadius: '50%', background: '#e6e9f0', boxShadow: '5px 5px 10px #c3c8d4', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  formLabel: { fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7d849f', paddingLeft: 4 },
  formInputWrap: { height: 56, borderRadius: 18, boxShadow: 'inset 5px 5px 10px #c3c8d4, inset -5px -5px 10px #ffffff', display: 'flex', alignItems: 'center', padding: '0 18px' },
};
