'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRoomContext, useParticipants } from '@livekit/components-react';

export function RaiseHandButton() {
  const room = useRoomContext();
  const participants = useParticipants();
  const [isRaised, setIsRaised] = useState(false);
  const [loading, setLoading] = useState(false);
  const [controlBar, setControlBar] = useState<Element | null>(null);

  // Find control bar to portal into
  useEffect(() => {
    const findBar = () => {
      const bar = document.querySelector('.lk-control-bar');
      if (bar) setControlBar(bar);
    };
    findBar();
    const interval = setInterval(findBar, 500);
    return () => clearInterval(interval);
  }, []);

  // Sync local state from metadata
  useEffect(() => {
    const local = room.localParticipant;
    try {
      const meta = JSON.parse(local.metadata || '{}');
      setIsRaised(!!meta.isHandRaised);
    } catch {}
  }, [room.localParticipant.metadata]);

  const toggleHand = useCallback(async () => {
    if (loading) return;
    const newState = !isRaised;
    setLoading(true);
    setIsRaised(newState); // Optimistic update
    try {
      await fetch('/api/raise-hand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: room.name,
          identity: room.localParticipant.identity,
          raised: newState,
        }),
      });
    } catch {
      setIsRaised(!newState); // Revert on error
    } finally {
      setLoading(false);
    }
  }, [isRaised, loading, room]);

  // Count raised hands (for host notification)
  const raisedCount = participants.filter((p) => {
    try {
      const meta = JSON.parse(p.metadata || '{}');
      return meta.isHandRaised;
    } catch {
      return false;
    }
  }).length;

  const button = (
    <button
      className={`lk-button lk-raise-hand-toggle ${isRaised ? 'hand-raised' : ''}`}
      onClick={toggleHand}
      disabled={loading}
      title={isRaised ? 'Lower hand' : 'Raise hand'}
      aria-pressed={isRaised}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isRaised ? '#fff' : '#4f5675'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0"></path></svg>
      <span className="lk-btn-label">{isRaised ? 'Lower hand' : 'Raise hand'}</span>
      {raisedCount > 0 && !isRaised && (
        <span className="lk-raise-hand-badge">{raisedCount}</span>
      )}
    </button>
  );

  return controlBar ? createPortal(button, controlBar) : button;
}
