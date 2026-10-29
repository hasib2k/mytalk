'use client';

import React, { useState } from 'react';
import {
  useParticipants,
  useRoomContext,
  useChat,
  TrackToggle,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

export function AudioRoomView(props: { role: string }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [showChat, setShowChat] = useState(false);
  const { chatMessages, send: sendChat } = useChat();
  const [chatInput, setChatInput] = useState('');

  const localParticipant = room.localParticipant;
  let localRole = props.role;

  const canSpeak = localRole === 'host' || localRole === 'moderator' ||
    (localParticipant.permissions?.canPublish ?? false);

  const handleSendChat = () => {
    if (chatInput.trim() && sendChat) {
      sendChat(chatInput.trim());
      setChatInput('');
    }
  };

  // Group participants by role
  const speakers: typeof participants = [];
  const listeners: typeof participants = [];

  participants.forEach((p) => {
    let role = 'listener';
    try {
      const meta = JSON.parse(p.metadata || '{}');
      role = meta.role || 'listener';
    } catch {}
    if (role === 'host' || role === 'moderator' || (p.permissions?.canPublish ?? false)) {
      speakers.push(p);
    } else {
      listeners.push(p);
    }
  });

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.roomTitle}>{room.name}</h2>
          <span style={styles.participantCount}>
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={styles.headerBadge}>
          <span style={{ color: getRoleColor(localRole), fontWeight: 600, fontSize: '0.8rem' }}>
            {localRole === 'host' ? '👑 Host' : localRole === 'moderator' ? '🎙 Moderator' : '🎧 Listener'}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.mainContent}>
        {/* Speakers section */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Speakers ({speakers.length})</h3>
          <div style={styles.participantGrid}>
            {speakers.map((p) => {
              let role = 'moderator';
              try {
                const meta = JSON.parse(p.metadata || '{}');
                role = meta.role || 'moderator';
              } catch {}
              return (
                <div key={p.identity} style={styles.participantCard}>
                  <div style={{
                    ...styles.avatar,
                    background: role === 'host'
                      ? 'linear-gradient(135deg, #3f6fe0, #2f5fd0)'
                      : 'linear-gradient(135deg, #d98a12, #d49545)',
                    boxShadow: p.isSpeaking ? '0 0 0 3px #16a34a' : 'none',
                  }}>
                    <span style={styles.avatarText}>
                      {(p.name || p.identity).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span style={styles.participantName}>{p.name || p.identity}</span>
                  <span style={{ fontSize: '0.65rem', color: getRoleColor(role) }}>
                    {role === 'host' ? '👑 Host' : '🎙 Moderator'}
                  </span>
                  {p.isSpeaking && (
                    <div style={styles.speakingIndicator}>
                      <div style={styles.speakingDot} />
                      <div style={{ ...styles.speakingDot, animationDelay: '0.15s' }} />
                      <div style={{ ...styles.speakingDot, animationDelay: '0.3s' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Listeners section */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Listeners ({listeners.length})</h3>
          <div style={styles.participantGrid}>
            {listeners.map((p) => (
              <div key={p.identity} style={styles.participantCard}>
                <div style={{
                  ...styles.avatar,
                  background: 'linear-gradient(135deg, #555, #444)',
                }}>
                  <span style={styles.avatarText}>
                    {(p.name || p.identity).charAt(0).toUpperCase()}
                  </span>
                </div>
                <span style={styles.participantName}>{p.name || p.identity}</span>
                <span style={{ fontSize: '0.65rem', color: 'rgba(0, 0, 0, 0.3)' }}>
                  🎧 Listening
                </span>
              </div>
            ))}
            {listeners.length === 0 && (
              <p style={{ color: 'rgba(0, 0, 0, 0.3)', fontSize: '0.8rem' }}>No listeners yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat sidebar */}
      {showChat && (
        <div style={styles.chatPanel}>
          <div style={styles.chatHeader}>
            <span style={{ fontWeight: 500, color: '#fff' }}>Chat</span>
            <button onClick={() => setShowChat(false)} style={styles.chatClose}>✕</button>
          </div>
          <div style={styles.chatMessages}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={styles.chatMsg}>
                <span style={styles.chatSender}>
                  {msg.from?.name || msg.from?.identity || 'Unknown'}
                </span>
                <span style={styles.chatText}>{msg.message}</span>
              </div>
            ))}
          </div>
          <div style={styles.chatInputRow}>
            <input
              style={styles.chatInput}
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
            />
            <button onClick={handleSendChat} style={styles.chatSendBtn}>
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Bottom control bar */}
      <div style={styles.controlBar}>
        {canSpeak ? (
          <TrackToggle
            source={Track.Source.Microphone}
            style={styles.controlBtn}
          />
        ) : (
          <div style={styles.mutedIndicator}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(0, 0, 0, 0.4)">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
            </svg>
            <span style={{ color: 'rgba(0, 0, 0, 0.4)', fontSize: '0.8rem' }}>Muted</span>
          </div>
        )}

        <button
          onClick={() => setShowChat(!showChat)}
          style={{
            ...styles.controlBtn,
            background: showChat ? 'rgba(91,141,238,0.2)' : 'rgba(0, 0, 0, 0.1)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
          <span style={{ fontSize: '0.75rem' }}>Chat</span>
        </button>

        <button
          onClick={() => {
            room.disconnect();
          }}
          style={styles.leaveBtn}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
          <span style={{ fontSize: '0.75rem' }}>Leave</span>
        </button>
      </div>
    </div>
  );
}

function getRoleColor(role: string): string {
  if (role === 'host') return '#3f6fe0';
  if (role === 'moderator') return '#d98a12';
  return 'rgba(0, 0, 0, 0.4)';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#e6e9f0',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1.5rem',
    borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
  },
  roomTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 500,
    color: '#fff',
  },
  participantCount: {
    fontSize: '0.8rem',
    color: 'rgba(0, 0, 0, 0.4)',
  },
  headerBadge: {
    padding: '0.375rem 0.75rem',
    background: 'rgba(0, 0, 0, 0.05)',
    borderRadius: '2rem',
    border: '1px solid rgba(0, 0, 0, 0.08)',
  },
  mainContent: {
    flex: 1,
    overflow: 'auto',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  section: {},
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'rgba(0, 0, 0, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '0 0 0.75rem',
  },
  participantGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  participantCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.75rem',
    background: 'rgba(0, 0, 0, 0.03)',
    borderRadius: '0.75rem',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    width: '100px',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'box-shadow 0.2s',
  },
  avatarText: {
    color: '#fff',
    fontSize: '1.125rem',
    fontWeight: 600,
  },
  participantName: {
    color: '#fff',
    fontSize: '0.75rem',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '80px',
  },
  speakingIndicator: {
    display: 'flex',
    gap: '2px',
    alignItems: 'flex-end',
    height: '12px',
  },
  speakingDot: {
    width: '3px',
    height: '8px',
    borderRadius: '1.5px',
    background: '#16a34a',
    animation: 'pulse 0.6s ease-in-out infinite alternate',
  },
  controlBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '1rem',
    borderTop: '1px solid rgba(0, 0, 0, 0.08)',
    background: '#c3c8d4',
  },
  controlBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.625rem 1rem',
    background: 'rgba(0, 0, 0, 0.1)',
    border: 'none',
    borderRadius: '0.75rem',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.8rem',
    minWidth: '64px',
  },
  mutedIndicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.625rem 1rem',
    background: 'rgba(0, 0, 0, 0.05)',
    borderRadius: '0.75rem',
    minWidth: '64px',
  },
  leaveBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.625rem 1rem',
    background: '#dc3232',
    border: 'none',
    borderRadius: '0.75rem',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.8rem',
    minWidth: '64px',
  },
  chatPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '320px',
    background: '#e6e9f0',
    borderLeft: '1px solid rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
  },
  chatClose: {
    background: 'none',
    border: 'none',
    color: 'rgba(0, 0, 0, 0.5)',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  chatMessages: {
    flex: 1,
    overflow: 'auto',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  chatMsg: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  chatSender: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#3f6fe0',
  },
  chatText: {
    fontSize: '0.85rem',
    color: '#fff',
    wordBreak: 'break-word',
  },
  chatInputRow: {
    display: 'flex',
    padding: '0.5rem',
    borderTop: '1px solid rgba(0, 0, 0, 0.08)',
    gap: '0.375rem',
  },
  chatInput: {
    flex: 1,
    padding: '0.5rem 0.75rem',
    background: 'rgba(0, 0, 0, 0.06)',
    border: '1px solid rgba(0, 0, 0, 0.12)',
    borderRadius: '0.375rem',
    color: '#fff',
    fontSize: '0.85rem',
    outline: 'none',
  },
  chatSendBtn: {
    padding: '0.5rem 0.75rem',
    background: '#3f6fe0',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
};
