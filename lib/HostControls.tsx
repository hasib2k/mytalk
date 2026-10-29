'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParticipants, useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

interface ParticipantInfo {
  identity: string;
  name: string;
  role: string;
  canPublish: boolean;
}

export function HostControls() {
  const room = useRoomContext();
  const participants = useParticipants();
  const [isOpen, setIsOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  // Check if current user is host
  const localParticipant = room.localParticipant;
  let localRole = 'listener';
  try {
    const meta = JSON.parse(localParticipant.metadata || '{}');
    localRole = meta.role || 'listener';
  } catch {}

  if (localRole !== 'host') return null;

  const participantList: ParticipantInfo[] = participants
    .filter((p) => p.identity !== localParticipant.identity)
    .map((p) => {
      let role = 'listener';
      try {
        const meta = JSON.parse(p.metadata || '{}');
        role = meta.role || 'listener';
      } catch {}
      return {
        identity: p.identity,
        name: p.name || p.identity,
        role,
        canPublish: p.permissions?.canPublish ?? false,
      };
    });

  const doAction = async (action: string, identity: string) => {
    setLoading(identity);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          action,
          roomName: room.name,
          identity,
        }),
      });
      const data = await res.json();
      setActionMsg(data.message || 'Done');
      setTimeout(() => setActionMsg(''), 2000);
    } catch {
      setActionMsg('Action failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      {/* Floating host button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={floatingBtnStyle}
        title="Host Controls"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
        </svg>
        <span style={{ fontSize: '0.75rem' }}>{participantList.length}</span>
      </button>

      {/* Panel */}
      {isOpen && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
              Participants ({participantList.length + 1})
            </h3>
            <button onClick={() => setIsOpen(false)} style={closeBtnStyle}>
              ✕
            </button>
          </div>

          {actionMsg && (
            <div style={actionMsgStyle}>{actionMsg}</div>
          )}

          {/* Host (you) */}
          <div style={participantRowStyle}>
            <div style={{ flex: 1 }}>
              <span style={{ color: '#fff', fontSize: '0.875rem' }}>
                {localParticipant.name || localParticipant.identity}
              </span>
              <span style={hostBadgeStyle}>Host (You)</span>
            </div>
          </div>

          {/* Other participants */}
          {participantList.length === 0 && (
            <p style={{ color: 'rgba(0, 0, 0, 0.3)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
              No other participants yet
            </p>
          )}

          {participantList.map((p) => (
            <div key={p.identity} style={participantRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: getRoleColor(p.role) }}>
                  {p.role === 'moderator' ? '🎙 Moderator' : '🔇 Listener'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {!p.canPublish ? (
                  <button
                    onClick={() => doAction('grant_speak', p.identity)}
                    disabled={loading === p.identity}
                    style={grantBtnStyle}
                    title="Allow to speak"
                  >
                    🎙
                  </button>
                ) : (
                  <button
                    onClick={() => doAction('revoke_speak', p.identity)}
                    disabled={loading === p.identity}
                    style={muteBtnStyle}
                    title="Mute & revoke speak"
                  >
                    🔇
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Remove ${p.name}?`)) {
                      doAction('remove_participant', p.identity);
                    }
                  }}
                  disabled={loading === p.identity}
                  style={removeBtnStyle}
                  title="Remove from meeting"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function getAdminToken(): string {
  // Try to get from sessionStorage (set when host logs in via admin)
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('adminToken') || '';
  }
  return '';
}

function getRoleColor(role: string): string {
  if (role === 'host') return '#3f6fe0';
  if (role === 'moderator') return '#d98a12';
  return 'rgba(0, 0, 0, 0.4)';
}

const floatingBtnStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '1.5rem',
  right: '1.5rem',
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  background: '#3f6fe0',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '5rem',
  right: '1.5rem',
  width: '320px',
  maxHeight: '60vh',
  background: '#e6e9f0',
  border: '1px solid rgba(0, 0, 0, 0.1)',
  borderRadius: '0.75rem',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  zIndex: 1000,
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(0, 0, 0, 0.5)',
  cursor: 'pointer',
  fontSize: '1rem',
  padding: '0.25rem',
};

const actionMsgStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.8rem',
  color: '#16a34a',
  background: 'rgba(91,200,141,0.08)',
  borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
};

const participantRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0.625rem 1rem',
  borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
  gap: '0.5rem',
};

const hostBadgeStyle: React.CSSProperties = {
  marginLeft: '0.5rem',
  fontSize: '0.7rem',
  color: '#3f6fe0',
  fontWeight: 600,
};

const grantBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: 'rgba(91,200,141,0.15)',
  border: '1px solid rgba(91,200,141,0.2)',
  borderRadius: '0.25rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const muteBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: 'rgba(232,168,93,0.15)',
  border: '1px solid rgba(232,168,93,0.2)',
  borderRadius: '0.25rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const removeBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: 'rgba(220,50,50,0.15)',
  border: '1px solid rgba(220,50,50,0.2)',
  borderRadius: '0.25rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
  color: '#e04848',
};
