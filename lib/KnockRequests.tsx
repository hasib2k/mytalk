'use client';

import React from 'react';
import { useKnock } from './KnockContext';

function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

/**
 * Floating in-meeting host panel for pending join requests.
 * Reads from the shared KnockContext (no own polling). Renders nothing for
 * non-hosts or when empty.
 */
export function KnockRequests() {
  const { isHost, requests, decide } = useKnock();

  if (!isHost || requests.length === 0) return null;

  return (
    <div className="knock-host-panel">
      <div className="knock-host-head">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v6l4 2" />
        </svg>
        <span style={{ flex: 1 }}>Waiting to join ({requests.length})</span>
        {requests.length > 1 && (
          <button className="knock-admit-all" onClick={() => decide(requests.map((r) => r.id), true)}>Admit all</button>
        )}
      </div>
      {requests.map((k) => (
        <div key={k.id} className="knock-host-row">
          <div className="knock-host-person">
            {k.imageUrl ? (
              <img src={k.imageUrl} alt="" referrerPolicy="no-referrer" className="knock-host-avatar" />
            ) : (
              <div className="knock-host-avatar knock-host-avatar-ph">{initials(k.name || '?')}</div>
            )}
            <div className="knock-host-meta">
              <span className="knock-host-name">{k.name || 'Guest'}</span>
              {k.bio ? <span className="knock-host-bio">{k.bio}</span> : null}
            </div>
          </div>
          <div className="knock-host-actions">
            <button className="knock-admit" onClick={() => decide([k.id], true)}>Admit</button>
            <button className="knock-deny" onClick={() => decide([k.id], false)}>Deny</button>
          </div>
        </div>
      ))}
    </div>
  );
}
