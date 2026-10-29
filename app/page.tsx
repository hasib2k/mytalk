'use client';

import { useRouter } from 'next/navigation';
import React, { Suspense, useState, useEffect } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { getMeetingHistory, saveMeeting, removeMeeting, clearAllMeetings, formatTimeAgo, type MeetingRecord } from '@/lib/meetingHistory';

type TabId = 'meet' | 'history' | 'profile';

function generateRoomCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(4)}-${seg(4)}`;
}

function HomeContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinChecking, setJoinChecking] = useState(false);
  const [history, setHistory] = useState<MeetingRecord[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('meet');
  const [profileBio, setProfileBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  // roomName -> true (live) | false (ended/gone). Undefined = not checked yet.
  const [activeMeetings, setActiveMeetings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHistory(getMeetingHistory());
    try {
      setProfileBio(localStorage.getItem('mytalk_profile_bio') || '');
    } catch {}
  }, []);

  // Check which history meetings are still live, so Rejoin is only offered for
  // meetings that actually exist (not expired / admin-ended ones).
  const historyKey = history.map((m) => m.roomName).join(',');
  useEffect(() => {
    const codes = history.map((m) => m.roomName);
    if (codes.length === 0) { setActiveMeetings({}); return; }
    let cancelled = false;
    Promise.all(
      codes.map(async (code) => {
        try {
          const res = await fetch(`/api/room-info?roomName=${encodeURIComponent(code)}`);
          const data = await res.json();
          return [code, data?.exists === true] as const;
        } catch {
          return [code, false] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setActiveMeetings(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  const persistBio = (text: string) => {
    const trimmed = text.trim();
    setProfileBio(trimmed);
    try {
      localStorage.setItem('mytalk_profile_bio', trimmed);
    } catch {}
  };

  const saveBio = () => {
    persistBio(bioInput);
    setEditingBio(false);
  };

  // Profile stats derived from local meeting history
  const totalMeetings = history.length;
  const hostedCount = history.filter((m) => m.role === 'host').length;
  const joinedCount = totalMeetings - hostedCount;
  const lastActive = history.length ? history[0].timestamp : null;
  const recentMeetings = history.slice(0, 4);

  const handleNewMeeting = async () => {
    const code = generateRoomCode();
    try {
      const res = await fetch('/api/host-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: code }),
      });
      if (res.ok) {
        const { hostToken } = await res.json();
        saveMeeting(code, 'host', hostToken);
        router.push(`/rooms/${code}?role=host&hk=${encodeURIComponent(hostToken)}`);
        return;
      }
    } catch {}
    // Minting failed (very rare for a fresh code) — retry once with a new code
    alert('Could not start the meeting. Please try again.');
  };

  const handleJoinMeeting = async () => {
    const code = roomCode.trim();
    if (!code || joinChecking) return;
    setJoinError('');
    setJoinChecking(true);
    try {
      const res = await fetch(`/api/room-info?roomName=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data?.exists) {
        saveMeeting(code, 'listener');
        router.push(`/rooms/${code}?role=listener`);
        return;
      }
      setJoinError(data?.ended ? 'This meeting has ended.' : 'Invalid code — no active meeting with this code.');
    } catch {
      setJoinError('Could not verify the code. Please try again.');
    } finally {
      setJoinChecking(false);
    }
  };

  const handleRejoin = (roomName: string, role: string, hk?: string) => {
    // Don't let an ended/expired meeting be rejoined.
    if (activeMeetings[roomName] === false) return;
    saveMeeting(roomName, role, hk);
    if (role === 'host' && hk) {
      router.push(`/rooms/${roomName}?role=host&hk=${encodeURIComponent(hk)}`);
    } else {
      router.push(`/rooms/${roomName}`);
    }
  };

  const handleRemove = (roomName: string) => {
    removeMeeting(roomName);
    setHistory(getMeetingHistory());
  };

  const handleClearAll = () => {
    clearAllMeetings();
    setHistory([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && roomCode.trim()) {
      handleJoinMeeting();
    }
  };

  const userInitial = (session?.user?.name || '?').charAt(0).toUpperCase();

  const displayName = session?.user?.name || 'there';

  return (
    <>
      {/* ======================= DESKTOP LAYOUT ======================= */}
      <div className="dk-layout">
        {/* -- Sidebar -- */}
        <aside className="dk-sidebar">
          <div className="dk-sidebar-top">
            {/* Logo */}
            <div className="dk-logo">
              <div className="dk-logo-icon">
                <img src="/icons/logo_icon.png" alt="MyTalk" className="app-logo-img" />
              </div>
              <span className="dk-logo-text">My<span>Talk</span></span>
            </div>

            {/* Nav tabs */}
            <nav className="dk-nav">
              {([
                { id: 'meet' as TabId, label: 'Meet', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg> },
                { id: 'history' as TabId, label: 'History', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg> },
                { id: 'profile' as TabId, label: 'Profile', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg> },
              ]).map(tab => (
                <button
                  key={tab.id}
                  className={`dk-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="dk-sidebar-footer">
            Developed by Hasib Talukder<br />Built with Next.js
          </div>
        </aside>

        {/* -- Main content -- */}
        <div className="dk-main">
          {/* Header */}
          <header className="dk-header">
            <div className="dk-header-greeting">
              {activeTab === 'history' ? 'Your past meetings' : activeTab === 'profile' ? 'Your profile' : `Good to see you, ${displayName}`}
            </div>
            <div className="dk-header-right">
              {session?.user ? (
                <>
                  <button className="dk-profile-pill" onClick={() => setActiveTab('profile')}>
                    {session.user.image && (
                      <img src={session.user.image} alt="" referrerPolicy="no-referrer" className="dk-pill-avatar" />
                    )}
                    <span>{session.user.name}</span>
                  </button>
                  <button className="dk-signout-btn" onClick={() => signOut()} title="Sign out">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                    </svg>
                  </button>
                </>
              ) : (
                <button className="dk-profile-pill" onClick={() => setActiveTab('profile')}>
                  <div className="dk-pill-initial">{userInitial}</div>
                  <span>Guest</span>
                </button>
              )}
            </div>
          </header>

          {/* Tab content area */}
          <div className="dk-content">
            {/* === MEET TAB === */}
            {activeTab === 'meet' && (
              <div className="dk-meet-grid">
                <div className="dk-meet-left">
                  <h1 className="dk-hero-title">
                    Premium audio meetings.<br />
                    Now free for <span>everyone</span>.
                  </h1>
                  <p className="dk-hero-sub">
                    Connect, collaborate, and communicate with crystal-clear audio.
                    Built for large meetings with up to 2,500 participants.
                  </p>

                  <div className="dk-join-field">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7d849f" strokeWidth="2" strokeLinecap="round">
                      <rect x="2" y="6" width="20" height="12" rx="2"/>
                      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Enter a meeting code"
                      value={roomCode}
                      onChange={(e) => { setRoomCode(e.target.value); setJoinError(""); }}
                      onKeyDown={handleKeyDown}
                      className="dk-join-input"
                    />
                    <button className="dk-join-go" onClick={handleJoinMeeting} disabled={!roomCode.trim() || joinChecking}>
                      {joinChecking ? 'Checking…' : 'Join'}
                    </button>
                  </div>
                  {joinError && <div className="join-error">{joinError}</div>}

                  {/* Recent Meetings */}
                  <div className="dk-recent-section">
                    <span className="dk-history-label">Recent Meetings</span>
                    {history.length > 0 ? (
                      <div className="dk-history-list">
                        {history.slice(0, 4).map((m) => {
                          const ended = activeMeetings[m.roomName] === false;
                          return (
                          <div key={m.roomName} className="dk-history-item">
                            <div className="dk-history-icon">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round">
                                <path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                              </svg>
                            </div>
                            <div className="dk-history-info" onClick={ended ? undefined : () => handleRejoin(m.roomName, m.role, m.hk)} style={ended ? { cursor: 'default' } : undefined}>
                              <span className="dk-history-name">{m.roomName}</span>
                              <span className="dk-history-meta">
                                {ended ? 'Ended' : m.role === 'host' ? 'Hosted' : 'Joined'} &middot; {formatTimeAgo(m.timestamp)}
                              </span>
                            </div>
                            {ended
                              ? <span className="rejoin-ended">Ended</span>
                              : <button className="dk-history-rejoin" onClick={() => handleRejoin(m.roomName, m.role, m.hk)}>Rejoin</button>}
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="dk-recent-empty">No recent meetings. Start one or join with a code.</div>
                    )}
                  </div>
                </div>

                {/* Illustration card */}
                <div className="dk-meet-right">
                  <div className="dk-illustration-card">
                    <div className="dk-illustration-grid">
                      <div className="dk-illust-tile blue"><svg viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                      <div className="dk-illust-tile pink"><svg viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                      <div className="dk-illust-tile green"><svg viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                      <div className="dk-illust-tile orange"><svg viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                    </div>
                    <p className="dk-illustration-text">Audio-only meetings for up to 2,500 participants</p>
                  </div>
                </div>
              </div>
            )}

            {/* === HISTORY TAB === */}
            {activeTab === 'history' && (
              <div className="dk-history-tab">
                <div className="dk-history-tab-head">
                  <h2 className="dk-profile-title">History</h2>
                  {history.length > 0 && (
                    <button className="dk-history-clear" onClick={handleClearAll}>Clear all</button>
                  )}
                </div>
                {history.length > 0 ? (
                  <div className="dk-history-grid">
                    {history.map((m) => {
                      const ended = activeMeetings[m.roomName] === false;
                      return (
                      <div key={m.roomName} className="dk-history-card">
                        <div className="dk-history-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>
                          </svg>
                        </div>
                        <div className="dk-history-info" onClick={ended ? undefined : () => handleRejoin(m.roomName, m.role, m.hk)} style={ended ? { cursor: 'default' } : undefined}>
                          <span className="dk-history-name">{m.roomName}</span>
                          <span className="dk-history-meta">
                            {ended ? 'Ended' : m.role === 'host' ? 'Hosted' : 'Joined'} &middot; {formatTimeAgo(m.timestamp)}
                          </span>
                        </div>
                        {ended
                          ? <span className="rejoin-ended">Ended</span>
                          : <button className="dk-history-rejoin" onClick={() => handleRejoin(m.roomName, m.role, m.hk)}>Rejoin</button>}
                        <button className="dk-history-remove" onClick={() => handleRemove(m.roomName)} title="Remove">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                          </svg>
                        </button>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dk-history-empty-card">
                    <div className="dk-history-empty-inner">
                      <div className="dk-history-empty-circle">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>
                        </svg>
                      </div>
                      <span className="dk-history-empty-title">No meeting history</span>
                      <span className="dk-history-empty-sub">Meetings you start or join will show up here</span>
                      <button className="dk-history-start-btn" onClick={handleNewMeeting}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                        Start a meeting
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === PROFILE TAB === */}
            {activeTab === 'profile' && (
              <div className="dk-profile-tab">
                <h2 className="dk-profile-title">Profile</h2>
                <div className="dk-profile-card">
                  <div className="dk-profile-avatar-ring">
                    {session?.user?.image ? (
                      <img src={session.user.image} alt="" referrerPolicy="no-referrer" className="dk-profile-avatar-img" />
                    ) : (
                      <div className="dk-profile-avatar-placeholder">{userInitial}</div>
                    )}
                  </div>
                  <div className="dk-profile-info">
                    <div className="dk-profile-name-row">
                      <span className="dk-profile-name">{session?.user?.name || 'Guest'}</span>
                      <span className="dk-profile-badge">{session?.user ? 'Google' : 'Guest'}</span>
                    </div>
                    <div className="dk-profile-email">{session?.user?.email || 'No account'}</div>

                    {/* Bio */}
                    {!editingBio ? (
                      <div className="dk-profile-bio-row">
                        <span className={`dk-profile-bio ${!profileBio ? 'empty' : ''}`}>
                          {profileBio || 'Add a short bio about yourself'}
                        </span>
                        <button
                          className="dk-profile-bio-edit"
                          onClick={() => { setBioInput(profileBio); setEditingBio(true); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                          </svg>
                          {profileBio ? 'Edit' : 'Add'}
                        </button>
                      </div>
                    ) : (
                      <div className="dk-profile-bio-editbox">
                        <input
                          className="dk-profile-bio-input"
                          value={bioInput}
                          onChange={(e) => setBioInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveBio(); if (e.key === 'Escape') setEditingBio(false); }}
                          placeholder="Short bio (max 80 chars)"
                          maxLength={80}
                          autoFocus
                        />
                        <div className="dk-profile-bio-actions">
                          <button className="dk-bio-save" onClick={saveBio}>Save</button>
                          <button className="dk-bio-cancel" onClick={() => setEditingBio(false)}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {session?.user ? (
                      <button className="dk-profile-signout" onClick={() => signOut()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                        </svg>
                        Sign Out
                      </button>
                    ) : (
                      <button className="dk-profile-google" onClick={() => signIn('google', { callbackUrl: window.location.href })}>
                        <svg width="16" height="16" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Sign in with Google
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="dk-profile-stats">
                  <div className="dk-stat-card">
                    <span className="dk-stat-num">{totalMeetings}</span>
                    <span className="dk-stat-label">Meetings</span>
                  </div>
                  <div className="dk-stat-card">
                    <span className="dk-stat-num">{hostedCount}</span>
                    <span className="dk-stat-label">Hosted</span>
                  </div>
                  <div className="dk-stat-card">
                    <span className="dk-stat-num">{joinedCount}</span>
                    <span className="dk-stat-label">Joined</span>
                  </div>
                </div>

                {/* Account details */}
                <div className="dk-profile-details">
                  <div className="dk-detail-row">
                    <span className="dk-detail-label">Account type</span>
                    <span className="dk-detail-value">{session?.user ? 'Google account' : 'Guest'}</span>
                  </div>
                  <div className="dk-detail-row">
                    <span className="dk-detail-label">Last active</span>
                    <span className="dk-detail-value">{lastActive ? formatTimeAgo(lastActive) : '—'}</span>
                  </div>
                </div>

                {/* Recent meetings */}
                {recentMeetings.length > 0 && (
                  <div className="dk-profile-recent">
                    <div className="dk-recent-head">Recent meetings</div>
                    {recentMeetings.map((m) => {
                      const ended = activeMeetings[m.roomName] === false;
                      return (
                      <div className="dk-recent-item" key={m.roomName}>
                        <div className="dk-recent-info">
                          <span className="dk-recent-name">{m.roomName}</span>
                          <span className="dk-recent-meta">
                            {ended ? 'Ended' : m.role === 'host' ? 'Hosted' : 'Joined'} · {formatTimeAgo(m.timestamp)}
                          </span>
                        </div>
                        {ended
                          ? <span className="rejoin-ended">Ended</span>
                          : <button className="dk-recent-rejoin" onClick={() => handleRejoin(m.roomName, m.role, m.hk)}>Rejoin</button>}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================= MOBILE LAYOUT ======================= */}
      <div className="mb-layout">
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar-logo">
            <div className="topbar-mic-icon">
              <img src="/icons/logo_icon.png" alt="MyTalk" className="app-logo-img" />
            </div>
            <span>My<span style={{ color: '#3f6fe0' }}>Talk</span></span>
          </div>
          <button className="topbar-user-mobile" onClick={() => setActiveTab('profile')} aria-label="Profile">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" referrerPolicy="no-referrer" className="topbar-mobile-avatar" />
            ) : (
              <div className="topbar-mobile-initial">{userInitial}</div>
            )}
          </button>
        </div>

        {/* Main content */}
        <main className="home-main">
          {/* ===== MEET TAB ===== */}
          <div className={`home-container ${activeTab !== 'meet' ? 'mobile-tab-hidden' : ''}`}>
            <div className="home-left">
              <h1>
                Premium audio meetings.
                <br />
                Now free for <span>everyone</span>.
              </h1>
              <p>
                Connect, collaborate, and communicate with crystal-clear audio.
                Built for large meetings with up to 2,500 participants.
              </p>

              {/* Join with code section */}
              <div className="m-join-section">
                <div className="m-join-label">Join with a code</div>
                <div className="m-join-input-row">
                  <div className="m-join-field">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7d849f" strokeWidth="2" strokeLinecap="round">
                      <rect x="2" y="6" width="20" height="12" rx="2"/>
                      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="abc-defg-hij"
                      value={roomCode}
                      onChange={(e) => { setRoomCode(e.target.value); setJoinError(""); }}
                      onKeyDown={handleKeyDown}
                      className="m-join-input"
                    />
                  </div>
                  <button
                    className="m-join-btn"
                    onClick={handleJoinMeeting}
                    disabled={!roomCode.trim() || joinChecking}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6"/>
                    </svg>
                  </button>
                </div>
                {joinError && <div className="join-error">{joinError}</div>}
              </div>

              {/* Recent Meetings */}
              <div className="m-recent-section">
                <div className="m-join-label">Recent Meetings</div>
                {history.length > 0 ? (
                  <div className="meeting-history-list">
                    {history.slice(0, 4).map((m) => {
                      const ended = activeMeetings[m.roomName] === false;
                      return (
                      <div key={m.roomName} className="meeting-history-item">
                        <div className="meeting-history-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round">
                            <path d="M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                          </svg>
                        </div>
                        <div className="meeting-history-info" onClick={ended ? undefined : () => handleRejoin(m.roomName, m.role, m.hk)} style={ended ? { cursor: 'default' } : undefined}>
                          <span className="meeting-history-name">{m.roomName}</span>
                          <span className="meeting-history-meta">
                            {ended ? 'Ended' : m.role === 'host' ? 'Hosted' : 'Joined'} · {formatTimeAgo(m.timestamp)}
                          </span>
                        </div>
                        {ended
                          ? <span className="rejoin-ended">Ended</span>
                          : <button className="meeting-history-rejoin" onClick={() => handleRejoin(m.roomName, m.role, m.hk)}>Rejoin</button>}
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="m-recent-empty">No recent meetings. Start one or join with a code.</div>
                )}
              </div>
            </div>
          </div>

          {/* ===== HISTORY TAB ===== */}
          <div className={`mobile-tab-content ${activeTab !== 'history' ? 'mobile-tab-hidden' : ''}`}>
            <div className="mobile-tab-header">
              <h2>History</h2>
              {history.length > 0 && (
                <button className="meeting-history-clear" onClick={handleClearAll}>Clear all</button>
              )}
            </div>
            {history.length > 0 ? (
              <div className="hist-timeline">
                {history.map((m, i) => {
                  const d = new Date(m.timestamp);
                  const isHost = m.role === 'host';
                  const ended = activeMeetings[m.roomName] === false;
                  const color = ended ? '#9aa0b8' : isHost ? '#16a34a' : '#3f6fe0';
                  const isLast = i === history.length - 1;
                  return (
                    <div key={m.roomName} className="hist-row">
                      <div className="hist-date">
                        <div className="hist-day">{d.getDate()}</div>
                        <div className="hist-mon">{d.toLocaleString('en-US', { month: 'short' })}</div>
                      </div>
                      <div className="hist-track">
                        <div className="hist-dot" style={{ borderColor: color }} />
                        <div className="hist-line" style={{ background: isLast ? 'transparent' : '#d5d9e3', boxShadow: isLast ? 'none' : undefined }} />
                      </div>
                      <div className="hist-card-wrap">
                        <div
                          className={`hist-card${ended ? ' is-ended' : ''}`}
                          onClick={ended ? undefined : () => handleRejoin(m.roomName, m.role, m.hk)}
                          role={ended ? undefined : 'button'}
                        >
                          <button className="hist-remove" onClick={(e) => { e.stopPropagation(); handleRemove(m.roomName); }} aria-label="Remove">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                          </button>
                          <div className="hist-badge" style={{ background: color }}>{ended ? 'Ended' : isHost ? 'Hosted' : 'Joined'}</div>
                          <div className="hist-title">{m.roomName}</div>
                          <div className="hist-foot">
                            <div className="hist-host">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#8a90aa"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0Z" /></svg>
                              {ended ? 'Meeting ended' : isHost ? 'Hosted by you' : 'You joined'}
                            </div>
                            <div className="hist-tag">{formatTimeAgo(m.timestamp)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mobile-empty-state">
                <div className="dk-history-empty-circle">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>
                  </svg>
                </div>
                <span className="mobile-empty-title">No meeting history</span>
                <span className="mobile-empty-sub">Meetings you start or join will show up here</span>
              </div>
            )}
          </div>

          {/* ===== PROFILE TAB ===== */}
          <div className={`mobile-tab-content ${activeTab !== 'profile' ? 'mobile-tab-hidden' : ''}`}>
            <div className="mobile-tab-header"><h2>Profile</h2></div>
            <ProfileTabContent
              session={session}
              userInitial={userInitial}
              bio={profileBio}
              onSaveBio={persistBio}
              totalMeetings={totalMeetings}
              hostedCount={hostedCount}
              joinedCount={joinedCount}
              lastActive={lastActive}
              recentMeetings={recentMeetings}
              onRejoin={handleRejoin}
              activeMeetings={activeMeetings}
            />
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <div className="mobile-nav-wrap">
        <nav className="mobile-bottom-nav">
          <button className={`bottom-nav-item ${activeTab === 'meet' ? 'active' : ''}`} onClick={() => setActiveTab('meet')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
            <span>Meet</span>
          </button>
          <button className={`bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>
            </svg>
            <span>History</span>
          </button>
          <button className={`bottom-nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            {session?.user?.image ? (
              <img src={session.user.image} alt="" referrerPolicy="no-referrer" className="bottom-nav-avatar" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            )}
            <span>Profile</span>
          </button>
        </nav>
        </div>
      </div>
    </>
  );
}

/** Profile tab — logged-in vs guest */
function ProfileTabContent({
  session,
  userInitial,
  bio,
  onSaveBio,
  totalMeetings,
  hostedCount,
  joinedCount,
  lastActive,
  recentMeetings,
  onRejoin,
  activeMeetings,
}: {
  session: any;
  userInitial: string;
  bio: string;
  onSaveBio: (text: string) => void;
  totalMeetings: number;
  hostedCount: number;
  joinedCount: number;
  lastActive: number | null;
  recentMeetings: MeetingRecord[];
  onRejoin: (roomName: string, role: string, hk?: string) => void;
  activeMeetings: Record<string, boolean>;
}) {
  const [guestName, setGuestName] = useState(() => {
    try { return localStorage.getItem('guestName') || ''; } catch { return ''; }
  });
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(guestName);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(bio);

  const isLoggedIn = !!session?.user;

  const saveGuestName = () => {
    const name = nameInput.trim();
    if (name) {
      setGuestName(name);
      try { localStorage.setItem('guestName', name); } catch {}
    }
    setEditingName(false);
  };

  const saveBio = () => {
    onSaveBio(bioInput);
    setEditingBio(false);
  };

  // Shared sections (stats, bio, account details, recent meetings)
  const extras = (
    <div className="mobile-profile-extras">
      {/* Bio */}
      {!editingBio ? (
        <button className="mobile-profile-menu-item" onClick={() => { setBioInput(bio); setEditingBio(true); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
          <span className="mobile-bio-text">{bio || 'Add a short bio'}</span>
        </button>
      ) : (
        <div className="mobile-bio-edit">
          <input
            className="profile-name-input"
            value={bioInput}
            onChange={(e) => setBioInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveBio(); }}
            placeholder="Short bio (max 80 chars)"
            maxLength={80}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="profile-save-btn" onClick={saveBio}>Save</button>
            <button className="profile-cancel-btn" onClick={() => setEditingBio(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mobile-profile-stats">
        <div className="mobile-stat-card">
          <span className="mobile-stat-num">{totalMeetings}</span>
          <span className="mobile-stat-label">Meetings</span>
        </div>
        <div className="mobile-stat-card">
          <span className="mobile-stat-num">{hostedCount}</span>
          <span className="mobile-stat-label">Hosted</span>
        </div>
        <div className="mobile-stat-card">
          <span className="mobile-stat-num">{joinedCount}</span>
          <span className="mobile-stat-label">Joined</span>
        </div>
      </div>

      {/* Account details */}
      <div className="mobile-profile-details">
        <div className="mobile-detail-row">
          <span className="mobile-detail-label">Account type</span>
          <span className="mobile-detail-value">{isLoggedIn ? 'Google account' : (guestName ? 'Guest' : 'No account')}</span>
        </div>
        <div className="mobile-detail-row">
          <span className="mobile-detail-label">Last active</span>
          <span className="mobile-detail-value">{lastActive ? formatTimeAgo(lastActive) : '—'}</span>
        </div>
      </div>

      {/* Recent meetings */}
      {recentMeetings.length > 0 && (
        <div className="mobile-profile-recent">
          <div className="mobile-recent-head">Recent meetings</div>
          {recentMeetings.map((m) => {
            const ended = activeMeetings[m.roomName] === false;
            return (
            <div className="mobile-recent-item" key={m.roomName}>
              <div className="mobile-recent-info">
                <span className="mobile-recent-name">{m.roomName}</span>
                <span className="mobile-recent-meta">{ended ? 'Ended' : m.role === 'host' ? 'Hosted' : 'Joined'} · {formatTimeAgo(m.timestamp)}</span>
              </div>
              {ended
                ? <span className="rejoin-ended">Ended</span>
                : <button className="mobile-recent-rejoin" onClick={() => onRejoin(m.roomName, m.role, m.hk)}>Rejoin</button>}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ===== Logged-in user =====
  if (isLoggedIn) {
    return (
      <>
        <div className="mobile-profile-section">
          <div className="mobile-profile-avatar">
            {session.user.image ? (
              <img src={session.user.image} alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="mobile-profile-avatar-placeholder">{userInitial}</div>
            )}
          </div>
          <div className="mobile-profile-name">{session.user.name || 'User'}</div>
          <div className="mobile-profile-email">{session.user.email || ''}</div>
        </div>
        {extras}
        <div className="mobile-profile-menu">
          <button className="mobile-profile-menu-item" data-danger="" onClick={() => signOut()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e04848" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign Out
          </button>
        </div>
        <div className="mobile-profile-footer">MyTalk v1.0 &middot; Built with Next.js</div>
      </>
    );
  }

  // ===== Not logged in =====
  return (
    <>
      <div className="mobile-profile-section">
        <div className="mobile-profile-avatar">
          <div className="mobile-profile-avatar-placeholder" style={{ background: guestName ? 'linear-gradient(145deg,#f0ab3f,#de7a24)' : undefined }}>
            {guestName ? guestName.charAt(0).toUpperCase() : '?'}
          </div>
        </div>
        {!editingName ? (
          <>
            <div className="mobile-profile-name">{guestName || 'Guest'}</div>
            <div className="mobile-profile-email" style={{ color: '#7d849f' }}>
              {guestName ? 'Guest user' : 'No account'}
            </div>
          </>
        ) : (
          <div className="profile-name-edit">
            <input
              className="profile-name-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveGuestName()}
              placeholder="Enter your name"
              autoFocus
              maxLength={30}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="profile-save-btn" onClick={saveGuestName}>Save</button>
              <button className="profile-cancel-btn" onClick={() => { setEditingName(false); setNameInput(guestName); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="mobile-profile-menu">
        {/* Set / Edit guest name */}
        <button className="mobile-profile-menu-item" onClick={() => { setNameInput(guestName); setEditingName(true); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>
          </svg>
          {guestName ? 'Change Name' : 'Set Guest Name'}
        </button>

        {/* Divider */}
        <div className="profile-menu-divider" />

        {/* Sign in with Google */}
        <button className="mobile-profile-menu-item" onClick={() => signIn('google', { callbackUrl: window.location.href })}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
      </div>

      {extras}
      <div className="mobile-profile-footer">MyTalk v1.0 &middot; Built with Next.js</div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback="Loading">
      <HomeContent />
    </Suspense>
  );
}
