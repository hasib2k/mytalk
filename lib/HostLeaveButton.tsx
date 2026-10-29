'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRoomContext } from '@livekit/components-react';
import { useRouter } from 'next/navigation';

export function HostLeaveButton() {
  const room = useRoomContext();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [controlBar, setControlBar] = useState<Element | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check if current user is host
  let isHost = false;
  try {
    const meta = JSON.parse(room.localParticipant.metadata || '{}');
    isHost = meta.role === 'host';
  } catch {}

  // Add body class for host and find control bar for portal
  useEffect(() => {
    if (isHost) document.body.classList.add('is-host');
    const findBar = () => {
      const bar = document.querySelector('.lk-control-bar');
      if (bar) setControlBar(bar);
    };
    findBar();
    const interval = setInterval(findBar, 500);
    return () => {
      document.body.classList.remove('is-host');
      clearInterval(interval);
    };
  }, [isHost]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const clearRejoinData = () => {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith('rejoin_')) sessionStorage.removeItem(key);
      }
    } catch {}
  };

  const handleLeave = () => {
    setShowMenu(false);
    clearRejoinData();
    sessionStorage.removeItem('adminToken');
    room.disconnect();
    router.push('/');
  };

  const handleEndCall = async () => {
    setShowMenu(false);
    try {
      const adminToken = sessionStorage.getItem('adminToken') || '';
      await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ action: 'end_room', roomName: room.name }),
      });
    } catch {}
    clearRejoinData();
    sessionStorage.removeItem('adminToken');
    room.disconnect();
    router.push('/');
  };

  if (!controlBar) return null;

  // Non-host: simple leave button (no dropdown)
  if (!isHost) {
    const simpleButton = (
      <button
        className="lk-button lk-host-leave-btn"
        onClick={handleLeave}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.01L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.01c-.79-.73-1.68-1.36-2.66-1.85a1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z"></path></svg>
        <span className="lk-btn-label">Leave</span>
      </button>
    );
    return createPortal(simpleButton, controlBar);
  }

  // Host: leave button with dropdown menu
  const button = (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className="lk-button lk-host-leave-btn"
        onClick={() => setShowMenu(!showMenu)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.01L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.01c-.79-.73-1.68-1.36-2.66-1.85a1 1 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z"></path></svg>
        <span className="lk-btn-label">Leave</span>
      </button>

      {showMenu && (
        <div className="lk-host-leave-menu">
          <button className="lk-host-leave-option leave-only" onClick={handleLeave}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 00-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
            </svg>
            <div>
              <div style={{ fontWeight: 600 }}>Leave Meeting</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Others can continue</div>
            </div>
          </button>
          <button className="lk-host-leave-option end-call" onClick={handleEndCall}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
            <div>
              <div style={{ fontWeight: 600 }}>End Call for All</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Ends the meeting for everyone</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(button, controlBar);
}
