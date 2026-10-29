'use client';

import * as React from 'react';
import {
  useChat,
  useRoomContext,
  useMaybeLayoutContext,
  useParticipants,
} from '@livekit/components-react';

/** Color palette for avatar backgrounds */
const AVATAR_COLORS = [
  'linear-gradient(145deg,#7aa0ff,#5a83ee)',
  'linear-gradient(145deg,#f0ab3f,#de7a24)',
  'linear-gradient(145deg,#16a34a,#3f9e70)',
  'linear-gradient(145deg,#ec6d86,#c94660)',
  'linear-gradient(145deg,#a58cff,#7d62e6)',
  'linear-gradient(145deg,#4fc3e0,#2f97b8)',
  'linear-gradient(145deg,#f08a5d,#d0663c)',
  'linear-gradient(145deg,#e07ad0,#b955a8)',
];

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Inner chat content — usable standalone or embedded in a desktop panel. */
export function ChatPanelContent({ onClose }: { onClose?: () => void }) {
  const room = useRoomContext();
  const layoutContext = useMaybeLayoutContext();
  const { send, chatMessages, isSending } = useChat();
  const participants = useParticipants();
  const [draft, setDraft] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const localIdentity = room.localParticipant.identity;

  // Build a map of participant identity → imageUrl from metadata
  const participantImages = React.useMemo(() => {
    const map: Record<string, string> = {};
    participants.forEach((p) => {
      try {
        const meta = JSON.parse(p.metadata || '{}');
        if (meta.imageUrl) map[p.identity] = meta.imageUrl;
      } catch {}
    });
    return map;
  }, [participants]);

  // Derive room title for subtitle
  const [roomTitle, setRoomTitle] = React.useState('');
  React.useEffect(() => {
    try {
      const meta = JSON.parse(room.metadata || '{}');
      setRoomTitle(meta.title || '');
    } catch {}
  }, [room.metadata]);

  // Auto-scroll on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || isSending) return;
    send(text);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = onClose ?? (() => {
    layoutContext?.widget.dispatch?.({ msg: 'toggle_chat' });
  });

  return (
    <>
      {/* Header */}
      <div className="neo-chat-header">
        <div className="neo-chat-header-left">
          <div className="neo-chat-title">Messages</div>
          <div className="neo-chat-subtitle">
            {roomTitle || room.name} · Everyone in the meeting
          </div>
        </div>
        <button className="neo-chat-close" onClick={handleClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="neo-chat-messages">
        {chatMessages.map((msg, i) => {
          const isLocal = msg.from?.identity === localIdentity;
          const name = msg.from?.name || msg.from?.identity || 'Unknown';
          const initials = getInitials(name);
          const colorIdx = hashString(msg.from?.identity || '') % AVATAR_COLORS.length;
          const bg = AVATAR_COLORS[colorIdx];
          const imageUrl = participantImages[msg.from?.identity || ''];

          const avatar = imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="neo-chat-avatar neo-chat-avatar-img"
            />
          ) : (
            <div className="neo-chat-avatar" style={{ background: bg }}>
              {initials}
            </div>
          );

          return (
            <div
              key={msg.id ?? i}
              className={`neo-chat-entry ${isLocal ? 'neo-chat-local' : 'neo-chat-remote'}`}
            >
              {!isLocal && avatar}
              <div className="neo-chat-bubble-wrap">
                <div className="neo-chat-meta">
                  {name} · {formatTime(msg.timestamp)}
                </div>
                <div className={`neo-chat-bubble ${isLocal ? 'neo-chat-bubble-local' : 'neo-chat-bubble-remote'}`}>
                  {msg.message}
                </div>
              </div>
              {isLocal && avatar}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="neo-chat-form">
        <div className="neo-chat-input-wrap">
          <input
            className="neo-chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isSending}
          />
        </div>
        <button
          className="neo-chat-send"
          onClick={handleSend}
          disabled={isSending || !draft.trim()}
          aria-label="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={draft.trim() ? '#3f6fe0' : '#7d849f'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
          </svg>
        </button>
      </div>
    </>
  );
}

export function CustomChat({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="neo-chat" style={style}>
      <ChatPanelContent />
    </div>
  );
}
