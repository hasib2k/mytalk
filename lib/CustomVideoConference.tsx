'use client';

/**
 * Custom VideoConference component — identical to LiveKit's default VideoConference
 * but uses CustomGridLayout with lowered minWidth thresholds so mobile devices
 * can display 8 tiles per page instead of just 1.
 */

import type { WidgetState } from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  CarouselLayout,
  ConnectionStateToast,
  FocusLayout,
  FocusLayoutContainer,
  LayoutContextProvider,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useCreateLayoutContext,
  usePinnedTracks,
  useTracks,
  isTrackReference,
  useRoomContext,
  useMaybeLayoutContext,
  useParticipants,
  useChat,
  useLocalParticipant,
} from '@livekit/components-react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { CustomGridLayout } from './CustomGridLayout';
import { CustomChat, ChatPanelContent } from './CustomChat';
import { ParticipantsPanelContent } from './ParticipantsSidebar';

export interface CustomVideoConferenceProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CustomVideoConference({
  ...props
}: CustomVideoConferenceProps) {
  const [widgetState, setWidgetState] = React.useState<WidgetState>({
    showChat: false,
    unreadMessages: 0,
    showSettings: false,
  });

  // Desktop unified side panel state
  const [desktopPanelOpen, setDesktopPanelOpen] = React.useState(false);
  const [desktopTab, setDesktopTab] = React.useState<'chat' | 'participants'>('chat');

  // Use refs so event handlers always see latest values (no stale closures)
  const desktopPanelOpenRef = React.useRef(desktopPanelOpen);
  const desktopTabRef = React.useRef(desktopTab);
  React.useEffect(() => { desktopPanelOpenRef.current = desktopPanelOpen; }, [desktopPanelOpen]);
  React.useEffect(() => { desktopTabRef.current = desktopTab; }, [desktopTab]);

  // Ref for outside-click detection
  const desktopPanelRef = React.useRef<HTMLDivElement>(null);

  // Helper: close the desktop panel and reset widget chat state
  const closeDesktopPanel = React.useCallback(() => {
    setDesktopPanelOpen(false);
    setWidgetState((s) => ({ ...s, showChat: false }));
    window.dispatchEvent(new Event('desktop-panel-closed'));
  }, []);

  // Outside click to close desktop panel
  React.useEffect(() => {
    if (!desktopPanelOpen) return;
    const handleClick = (e: MouseEvent) => {
      const panel = desktopPanelRef.current;
      if (!panel) return;
      // Ignore clicks inside the panel
      if (panel.contains(e.target as Node)) return;
      // Ignore clicks on control bar buttons (they handle their own logic)
      const controlBar = document.querySelector('.lk-control-bar');
      if (controlBar?.contains(e.target as Node)) return;
      closeDesktopPanel();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [desktopPanelOpen, closeDesktopPanel]);

  // Listen for chat / participants button presses on desktop
  React.useEffect(() => {
    const openChat = () => {
      if (desktopPanelOpenRef.current && desktopTabRef.current === 'chat') {
        closeDesktopPanel();
      } else {
        setDesktopTab('chat');
        setDesktopPanelOpen(true);
      }
    };
    const openParticipants = () => {
      if (desktopPanelOpenRef.current && desktopTabRef.current === 'participants') {
        closeDesktopPanel();
      } else {
        setDesktopTab('participants');
        setDesktopPanelOpen(true);
      }
    };
    window.addEventListener('open-desktop-chat', openChat);
    window.addEventListener('open-desktop-participants', openParticipants);
    return () => {
      window.removeEventListener('open-desktop-chat', openChat);
      window.removeEventListener('open-desktop-participants', openParticipants);
    };
  }, [closeDesktopPanel]);

  const lastAutoFocusedScreenShareTrack = React.useRef<TrackReferenceOrPlaceholder | null>(null);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );

  const widgetUpdate = React.useCallback((state: WidgetState) => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 960;
    setWidgetState((prev) => {
      // On desktop, chat is handled by our own button — ignore showChat from LiveKit
      const next = isDesktop ? { ...state, showChat: false } : state;
      // Bail out if nothing actually changed, otherwise a new object reference
      // on every call triggers an infinite re-render loop.
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const k of keys) {
        if ((prev as any)[k] !== (next as any)[k]) return next;
      }
      return prev;
    });
  }, []);

  const layoutContext = useCreateLayoutContext();

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare);

  const focusTrack = usePinnedTracks(layoutContext)?.[0];
  const carouselTracks = tracks.filter(
    (track) => !(focusTrack && track.participant?.identity === focusTrack.participant?.identity && track.source === focusTrack.source),
  );

  React.useEffect(() => {
    if (
      screenShareTracks.some((track) => track.publication.isSubscribed) &&
      lastAutoFocusedScreenShareTrack.current === null
    ) {
      layoutContext.pin.dispatch?.({ msg: 'set_pin', trackReference: screenShareTracks[0] });
      lastAutoFocusedScreenShareTrack.current = screenShareTracks[0];
    } else if (
      lastAutoFocusedScreenShareTrack.current &&
      !screenShareTracks.some(
        (track) =>
          track.publication.trackSid ===
          lastAutoFocusedScreenShareTrack.current?.publication?.trackSid,
      )
    ) {
      layoutContext.pin.dispatch?.({ msg: 'clear_pin' });
      lastAutoFocusedScreenShareTrack.current = null;
    }
  }, [
    screenShareTracks
      .map((ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`)
      .join(),
    focusTrack,
    tracks,
  ]);

  return (
    <div className="lk-video-conference" {...props}>
      <LayoutContextProvider
        value={layoutContext}
        onWidgetChange={widgetUpdate}
      >
        <MeetingTitleBar />
        <div className="lk-video-conference-inner">
          {!focusTrack ? (
            <div className="lk-grid-layout-wrapper">
              <CustomGridLayout tracks={tracks}>
                <ParticipantTile />
              </CustomGridLayout>
            </div>
          ) : (
            <div className="lk-focus-layout-wrapper">
              <FocusLayoutContainer>
                <CarouselLayout tracks={carouselTracks}>
                  <ParticipantTile />
                </CarouselLayout>
                {focusTrack && <FocusLayout trackRef={focusTrack} />}
              </FocusLayoutContainer>
            </div>
          )}
          <ControlBar variation="minimal" controls={{ microphone: false, chat: false, settings: false, camera: false, screenShare: false, leave: false }} />
          <DesktopChatButton />
        </div>
        {/* Mobile chat panel — hidden on desktop via CSS */}
        <CustomChat style={{ display: widgetState.showChat ? 'flex' : 'none' }} />

        {/* Desktop unified side panel — hidden on mobile via CSS */}
        {desktopPanelOpen && (
          <div className="desktop-side-panel" ref={desktopPanelRef}>
            {/* Tab bar + close button in one row */}
            <div className="dsp-header-row">
              <div className="dsp-tab-bar">
                <div className={`dsp-tab ${desktopTab === 'chat' ? 'dsp-tab-active' : ''}`}>
                  Chat
                </div>
                <div className={`dsp-tab ${desktopTab === 'participants' ? 'dsp-tab-active' : ''}`}>
                  Participants
                </div>
              </div>
              <button
                className="dsp-close"
                aria-label="Close panel"
                onClick={closeDesktopPanel}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {/* Tab content */}
            <div className="dsp-content">
              {desktopTab === 'chat' ? (
                <div className="dsp-chat-inner">
                  <ChatPanelContent onClose={closeDesktopPanel} />
                </div>
              ) : (
                <div className="dsp-participants-inner">
                  <ParticipantsPanelContent onClose={closeDesktopPanel} />
                </div>
              )}
            </div>
          </div>
        )}

      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

/** Chat button — on desktop dispatches custom event to open desktop panel,
 *  on mobile triggers LiveKit's built-in chat widget.
 *  Tracks unread message count on both mobile and desktop. */
function DesktopChatButton() {
  const layoutContext = useMaybeLayoutContext();
  const { chatMessages } = useChat();
  const [controlBar, setControlBar] = React.useState<Element | null>(null);
  const [unread, setUnread] = React.useState(0);
  const lastSeenCount = React.useRef(chatMessages.length);
  const panelOpenRef = React.useRef(false);

  React.useEffect(() => {
    const findBar = () => {
      const bar = document.querySelector('.lk-control-bar');
      if (bar) setControlBar(bar);
    };
    findBar();
    const interval = setInterval(findBar, 500);
    return () => clearInterval(interval);
  }, []);

  // Track when desktop panel opens/closes to reset unread
  React.useEffect(() => {
    const onOpen = () => {
      panelOpenRef.current = true;
      lastSeenCount.current = chatMessages.length;
      setUnread(0);
    };
    const onClose = () => { panelOpenRef.current = false; };
    window.addEventListener('open-desktop-chat', onOpen);
    window.addEventListener('desktop-panel-closed', onClose);
    return () => {
      window.removeEventListener('open-desktop-chat', onOpen);
      window.removeEventListener('desktop-panel-closed', onClose);
    };
  }, [chatMessages.length]);

  // Update unread count when new messages arrive
  React.useEffect(() => {
    const newCount = chatMessages.length;
    if (newCount > lastSeenCount.current && !panelOpenRef.current) {
      setUnread(newCount - lastSeenCount.current);
    } else if (panelOpenRef.current) {
      lastSeenCount.current = newCount;
      setUnread(0);
    }
  }, [chatMessages.length]);

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 960) {
      window.dispatchEvent(new Event('open-desktop-chat'));
    } else {
      layoutContext?.widget.dispatch?.({ msg: 'toggle_chat' });
    }
    lastSeenCount.current = chatMessages.length;
    setUnread(0);
  };

  const button = (
    <button className="lk-button lk-chat-toggle" onClick={handleClick}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      </svg>
      <span className="lk-btn-label">Chat</span>
      {unread > 0 && <span className="lk-chat-unread-badge">{unread}</span>}
    </button>
  );

  return controlBar ? createPortal(button, controlBar) : null;
}

/** Displays the meeting title from room metadata */
function MeetingTitleBar() {
  const room = useRoomContext();
  const layoutContext = useMaybeLayoutContext();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const canPublish = localParticipant?.permissions?.canPublish ?? false;
  const [title, setTitle] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const parseTitle = (metadata?: string) => {
      try {
        const meta = JSON.parse((metadata ?? room.metadata) || '{}');
        setTitle(meta.title || '');
      } catch {
        setTitle('');
      }
    };

    parseTitle();
    room.on(RoomEvent.RoomMetadataChanged, parseTitle);
    const onConnected = () => parseTitle();
    room.on(RoomEvent.Connected, onConnected);

    const interval = setInterval(() => {
      if (room.metadata) {
        parseTitle();
        clearInterval(interval);
      }
    }, 500);
    const timeout = setTimeout(() => clearInterval(interval), 10000);

    return () => {
      room.off(RoomEvent.RoomMetadataChanged, parseTitle);
      room.off(RoomEvent.Connected, onConnected);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [room]);

  const roomCode = room.name || '';
  const titleRef = React.useRef<HTMLDivElement>(null);
  const displayTitle = title || 'Meeting';
  const participantCount = participants.length;

  // Check overflow and apply marquee
  React.useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const existingSpan = el.querySelector('.marquee-scroll');
    if (existingSpan) {
      el.textContent = displayTitle;
    }
    requestAnimationFrame(() => {
      if (el.scrollWidth > el.clientWidth + 2) {
        el.textContent = '';
        const span = document.createElement('span');
        span.className = 'marquee-scroll';
        span.textContent = displayTitle + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0' + displayTitle + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0';
        el.appendChild(span);
      }
    });
  }, [displayTitle]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="meeting-title-bar">
      <div className="meeting-title-left">
        <div className="meeting-title-text" ref={titleRef}>{displayTitle}</div>
        <div className="meeting-title-meta">
          <div className="meeting-live-dot" />
          Live · {roomCode} · {participantCount} in meeting
        </div>
      </div>
      <div className="meeting-title-right">
        <button
          className="meeting-copy-link-btn"
          onClick={handleCopyLink}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.6 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.6-1.5"/></svg>
          <span>{copied ? 'Copied!' : 'Copy link'}</span>
        </button>
        {canPublish && (
          <button
            className={`meeting-mic-btn ${isMicrophoneEnabled ? 'is-on' : 'is-off'}`}
            aria-label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
            onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {})}
          >
            {isMicrophoneEnabled ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 16.9A7 7 0 0 1 5 11M12 18v3"/></svg>
            )}
            <span className="meeting-mic-label">{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
