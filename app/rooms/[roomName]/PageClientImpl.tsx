'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { decodePassphrase } from '@/lib/client-utils';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { ConnectionDetails } from '@/lib/types';
import {
  LocalUserChoices,
  RoomContext,
  useParticipants,
} from '@livekit/components-react';
import { CustomVideoConference } from '@/lib/CustomVideoConference';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  VideoCodec,
  Room,
  DeviceUnsupportedError,
  RoomConnectOptions,
  RoomEvent,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { AudioOnlyPreJoin } from '@/lib/AudioOnlyPreJoin';
import { ParticipantsSidebar } from '@/lib/ParticipantsSidebar';
import { PinnedProvider, usePinned } from '@/lib/PinnedContext';
import { saveMeeting } from '@/lib/meetingHistory';
import { RaiseHandButton } from '@/lib/RaiseHandButton';
import { HostLeaveButton } from '@/lib/HostLeaveButton';
import { KnockRequests } from '@/lib/KnockRequests';
import { KnockProvider } from '@/lib/KnockContext';
import { MeetingPip } from '@/lib/MeetingPip';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';

export function PageClientImpl(props: {
  roomName: string;
  serverUrl?: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
  singlePeerConnection: boolean;
  role: string;
  hostKey?: string;
}) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(
    undefined,
  );
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
    undefined,
  );
  const [roomExpired, setRoomExpired] = React.useState(false);
  // Knock-to-join state for private rooms
  const [knockStatus, setKnockStatus] = React.useState<'none' | 'pending' | 'rejected' | 'expired' | 'locked'>('none');
  const knockIdRef = React.useRef<string | null>(null);
  const knockValuesRef = React.useRef<(LocalUserChoices & { imageUrl?: string }) | null>(null);
  // Effective auth (role + host key) for this session. Initialised from the URL
  // (props), but restored from sessionStorage on auto-rejoin so a page reload
  // keeps the SAME role even if the URL no longer carries ?role / ?hk.
  const authRef = React.useRef<{ role: string; hk: string }>({
    role: props.role,
    hk: props.hostKey || '',
  });
  // Track if we're attempting auto-rejoin to avoid flashing the pre-join page
  const [isAutoRejoining, setIsAutoRejoining] = React.useState(() => {
    try {
      return !!sessionStorage.getItem(`rejoin_${props.roomName}`);
    } catch { return false; }
  });

  React.useEffect(() => {
    if (props.serverUrl) {
      new Room().prepareConnection(props.serverUrl);
    }
  }, [props.serverUrl]);

  // On load, immediately show the "Meeting Expired" screen if this meeting has
  // been ended — so opening an ended link shows expired without needing to
  // fill in the pre-join form first.
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/room-info?roomName=${encodeURIComponent(props.roomName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ended) {
          setRoomExpired(true);
          setIsAutoRejoining(false);
          try { sessionStorage.removeItem(`rejoin_${props.roomName}`); } catch {}
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [props.roomName]);

  const buildConnUrl = React.useCallback((values: LocalUserChoices & { imageUrl?: string }, knockId?: string | null) => {
    const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
    url.searchParams.append('roomName', props.roomName);
    url.searchParams.append('participantName', values.username);
    url.searchParams.append('role', authRef.current.role);
    if (authRef.current.hk) url.searchParams.append('hk', authRef.current.hk);
    if (values.imageUrl) url.searchParams.append('imageUrl', values.imageUrl);
    if ((values as any).bio) url.searchParams.append('bio', (values as any).bio);
    if (props.region) url.searchParams.append('region', props.region);
    if (knockId) url.searchParams.append('knockId', knockId);
    return url.toString();
  }, [props.roomName, props.region]);

  // Interpret a connection-details response. Returns true when terminal
  // (connected, room ended, rejected) so polling can stop.
  const applyConnectionData = React.useCallback((data: any): boolean => {
    if (data.error === 'room_ended') {
      setRoomExpired(true);
      setIsAutoRejoining(false);
      try { sessionStorage.removeItem(`rejoin_${props.roomName}`); } catch {}
      return true;
    }
    if (data.status === 'pending_approval') {
      knockIdRef.current = data.knockId;
      setKnockStatus('pending');
      setIsAutoRejoining(false);
      return false;
    }
    if (data.status === 'rejected') {
      setKnockStatus('rejected');
      setIsAutoRejoining(false);
      try { sessionStorage.removeItem(`rejoin_${props.roomName}`); } catch {}
      return true;
    }
    if (data.status === 'expired') {
      setKnockStatus('expired');
      setIsAutoRejoining(false);
      return true;
    }
    if (data.status === 'locked') {
      setKnockStatus('locked');
      setIsAutoRejoining(false);
      try { sessionStorage.removeItem(`rejoin_${props.roomName}`); } catch {}
      return true;
    }
    if (data.participantToken) {
      if (data.adminToken) sessionStorage.setItem('adminToken', data.adminToken);
      setKnockStatus('none');
      setConnectionDetails(data);
      // Preserve role + host key so a reload (session) or a "Rejoin" from the
      // home history (localStorage) both come back with the SAME role.
      saveMeeting(props.roomName, authRef.current.role, authRef.current.hk || undefined);
      return true;
    }
    return false;
  }, [props.roomName]);

  const handlePreJoinSubmit = React.useCallback(async (values: LocalUserChoices & { imageUrl?: string }) => {
    setPreJoinChoices(values);
    knockValuesRef.current = values;
    // Save choices + the effective role/host-key so we can auto-rejoin on reload
    // with the SAME role even if the URL no longer carries ?role / ?hk.
    try {
      sessionStorage.setItem(`rejoin_${props.roomName}`, JSON.stringify({
        username: values.username,
        imageUrl: values.imageUrl,
        bio: (values as any).bio,
        role: authRef.current.role,
        hk: authRef.current.hk,
      }));
    } catch {}
    const resp = await fetch(buildConnUrl(values));
    const data = await resp.json();
    applyConnectionData(data);
  }, [props.roomName, buildConnUrl, applyConnectionData]);

  // Poll for admission while waiting in a private room's lobby.
  React.useEffect(() => {
    if (knockStatus !== 'pending') return;
    const interval = setInterval(async () => {
      const values = knockValuesRef.current;
      const knockId = knockIdRef.current;
      if (!values || !knockId) return;
      try {
        const resp = await fetch(buildConnUrl(values, knockId));
        const data = await resp.json();
        applyConnectionData(data);
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [knockStatus, buildConnUrl, applyConnectionData]);

  // Auto-rejoin on page reload if user was previously in this room
  const autoRejoinAttempted = React.useRef(false);
  React.useEffect(() => {
    if (autoRejoinAttempted.current || preJoinChoices) return;
    autoRejoinAttempted.current = true;
    try {
      const saved = sessionStorage.getItem(`rejoin_${props.roomName}`);
      if (saved) {
        const data = JSON.parse(saved);
        // Restore the role/host-key captured at first join so the reload keeps
        // the same role regardless of what the current URL carries.
        if (data.role) {
          authRef.current = { role: data.role, hk: data.hk || '' };
        }
        handlePreJoinSubmit({
          username: data.username,
          videoEnabled: false,
          audioEnabled: true,
          videoDeviceId: '',
          audioDeviceId: '',
          imageUrl: data.imageUrl,
          bio: data.bio,
        } as any).catch(() => setIsAutoRejoining(false));
      } else {
        setIsAutoRejoining(false);
      }
    } catch {
      setIsAutoRejoining(false);
    }
  }, [props.roomName, preJoinChoices, handlePreJoinSubmit]);

  if (roomExpired) {
    return (
      <main data-lk-theme="default" style={{ height: '100%' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1.25rem',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(255,100,100,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#e04848">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          <h2 style={{ color: '#1f2440', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Meeting Expired
          </h2>
          <p style={{ color: 'rgba(0, 0, 0, 0.5)', fontSize: '1rem', margin: 0, maxWidth: 400 }}>
            This meeting has ended and is no longer available. Please contact the admin for a new meeting room.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem 2rem',
              background: 'linear-gradient(135deg, #5b8dee 0%, #4a7dd4 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '2rem',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Go to Home
          </button>
        </div>
      </main>
    );
  }

  // Private-room lobby: waiting for admission / declined / expired
  if (knockStatus !== 'none' && connectionDetails === undefined) {
    return (
      <KnockLobby
        status={knockStatus}
        roomName={props.roomName}
        onRetry={() => {
          const v = knockValuesRef.current;
          knockIdRef.current = null;
          setKnockStatus('none');
          if (v) handlePreJoinSubmit(v);
        }}
      />
    );
  }

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      {connectionDetails === undefined || preJoinChoices === undefined ? (
        isAutoRejoining ? (
          /* Show a minimal loading screen while auto-reconnecting (prevents pre-join flash) */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#e6e9f0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: 48, height: 48, border: '3px solid #ffffff', borderTopColor: '#3f6fe0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ color: '#7d849f', fontSize: 14 }}>Reconnecting...</div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#e6e9f0' }}>
          {/* Desktop header for pre-join page */}
          <div className="prejoin-dk-header">
            <div className="prejoin-dk-header-left">
              <button className="prejoin-dk-back" onClick={() => window.location.href = '/'} aria-label="Back to home">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className="prejoin-dk-logo">
                <span className="prejoin-dk-logo-my">My</span><span className="prejoin-dk-logo-talk">Talk</span>
              </div>
            </div>
            <div className="prejoin-dk-room-pill">
              <div className="prejoin-dk-room-dot" />
              {props.roomName}
            </div>
          </div>
          {/* Desktop two-column layout */}
          <div className="prejoin-dk-body">
            <RoomInfoPanel roomName={props.roomName} role={props.role} />
            <div className="prejoin-dk-right">
              <AudioOnlyPreJoin
                onSubmit={handlePreJoinSubmit}
                role={props.role}
                roomName={props.roomName}
              />
            </div>
          </div>
          {/* Mobile single-column layout */}
          <div className="prejoin-mb-body">
            <AudioOnlyPreJoin
              onSubmit={handlePreJoinSubmit}
              role={props.role}
              roomName={props.roomName}
            />
          </div>
        </div>
        )
      ) : (
        <AudioConferenceComponent
          connectionDetails={connectionDetails}
          userChoices={preJoinChoices}
          options={{
            singlePeerConnection: props.singlePeerConnection,
          }}
          role={props.role}
        />
      )}
    </main>
  );
}

/** Lobby shown to guests of a private room while awaiting host/admin admission. */
function KnockLobby(props: {
  status: 'pending' | 'rejected' | 'expired' | 'locked';
  roomName: string;
  onRetry: () => void;
}) {
  const { status, roomName } = props;
  const pending = status === 'pending';
  const rejected = status === 'rejected';
  const locked = status === 'locked';

  const accent = rejected ? '#e04848' : pending ? '#3f6fe0' : '#d98a12';
  const title = pending
    ? 'Waiting to be let in'
    : rejected
      ? 'Request declined'
      : locked
        ? 'Meeting is locked'
        : 'Request expired';
  const subtitle = pending
    ? 'This is a private meeting. A host or admin needs to admit you. Please keep this page open…'
    : rejected
      ? 'A host declined your request to join this meeting.'
      : locked
        ? 'The host has locked this meeting. New participants cannot join right now.'
        : 'Your join request timed out. You can try requesting again.';

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 20, padding: 32, textAlign: 'center', background: '#e6e9f0', color: '#1f2440',
        fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Roboto, Arial, sans-serif",
      }}>
        <div style={{
          position: 'relative', width: 96, height: 96, borderRadius: '50%', background: '#e6e9f0',
          boxShadow: '10px 10px 24px #c3c8d4', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {pending && (
            <div style={{
              position: 'absolute', inset: -4, borderRadius: '50%',
              border: '3px solid rgba(111,151,255,0.25)', borderTopColor: '#3f6fe0',
              animation: 'spin 1s linear infinite',
            }} />
          )}
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {rejected ? (
              <><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>
            ) : (
              <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>
            )}
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 15, color: '#6a7192', margin: 0, lineHeight: 1.55 }}>{subtitle}</p>
          <div style={{ fontSize: 13, color: '#7d849f', marginTop: 2 }}>Room: {roomName}</div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {(rejected || status === 'expired' || locked) && (
            <button
              onClick={props.onRetry}
              style={{
                height: 46, padding: '0 22px', borderRadius: 14, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff',
                background: 'linear-gradient(145deg,#7aa0ff,#5a83ee)', boxShadow: '5px 5px 12px #c3c8d4',
              }}
            >
              Request again
            </button>
          )}
          <button
            onClick={() => (window.location.href = '/')}
            style={{
              height: 46, padding: '0 22px', borderRadius: 14, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#1f2440',
              background: '#e6e9f0', boxShadow: '5px 5px 10px #c3c8d4',
            }}
          >
            {pending ? 'Cancel' : 'Back to home'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}

function AudioConferenceComponent(props: {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  options: {
    singlePeerConnection: boolean;
  };
  role: string;
}) {
  const keyProvider = new ExternalE2EEKeyProvider();
  const { worker, e2eePassphrase } = useSetupE2EE();
  const e2eeEnabled = !!(e2eePassphrase && worker);

  const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);

  const roomOptions = React.useMemo((): RoomOptions => {
    return {
      videoCaptureDefaults: undefined,
      publishDefaults: {
        dtx: false,
        red: !e2eeEnabled,
      },
      audioCaptureDefaults: {
        deviceId: props.userChoices.audioDeviceId ?? undefined,
      },
      adaptiveStream: false,
      dynacast: false,
      e2ee: keyProvider && worker && e2eeEnabled ? { keyProvider, worker } : undefined,
      singlePeerConnection: props.options.singlePeerConnection,
    };
  }, [props.userChoices]);

  const room = React.useMemo(() => new Room(roomOptions), []);

  React.useEffect(() => {
    if (e2eeEnabled) {
      keyProvider
        .setKey(decodePassphrase(e2eePassphrase))
        .then(() => {
          room.setE2EEEnabled(true).catch((e) => {
            if (e instanceof DeviceUnsupportedError) {
              alert(
                `You're trying to join an encrypted meeting, but your browser does not support it.`,
              );
              console.error(e);
            } else {
              throw e;
            }
          });
        })
        .then(() => setE2eeSetupComplete(true));
    } else {
      setE2eeSetupComplete(true);
    }
  }, [e2eeEnabled, room, e2eePassphrase]);

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  React.useEffect(() => {
    room.on(RoomEvent.Disconnected, handleOnLeave);
    room.on(RoomEvent.EncryptionError, handleEncryptionError);
    room.on(RoomEvent.MediaDevicesError, handleError);

    if (e2eeSetupComplete) {
      room
        .connect(
          props.connectionDetails.serverUrl,
          props.connectionDetails.participantToken,
          connectOptions,
        )
        .catch((error) => {
          handleError(error);
        });

      const canSpeak = props.role === 'host' || props.role === 'moderator';
      if (canSpeak && props.userChoices.audioEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch((error) => {
          handleError(error);
        });
      }
      room.localParticipant.setCameraEnabled(false).catch(() => {});
    }
    return () => {
      room.off(RoomEvent.Disconnected, handleOnLeave);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
      room.off(RoomEvent.MediaDevicesError, handleError);
    };
  }, [e2eeSetupComplete, room, props.connectionDetails, props.userChoices, props.role]);

  const router = useRouter();
  const handleOnLeave = React.useCallback(() => {
    // Clear auto-rejoin data so user doesn't auto-join after leaving
    const roomName = props.connectionDetails.serverUrl ? '' : '';
    try {
      // Clear all rejoin keys for this session
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith('rejoin_')) sessionStorage.removeItem(key);
      }
    } catch {}
    router.push('/');
  }, [router]);
  const handleError = React.useCallback((error: Error) => {
    console.error(error);
    alert(`Error: ${error.message}`);
  }, []);
  const handleEncryptionError = React.useCallback((error: Error) => {
    console.error(error);
    alert(`Encryption error: ${error.message}`);
  }, []);

  // Back-button guard: don't leave the meeting instantly — ask first.
  const [showLeaveConfirm, setShowLeaveConfirm] = React.useState(false);

  const confirmLeave = React.useCallback(() => {
    try { sessionStorage.removeItem('adminToken'); } catch {}
    setShowLeaveConfirm(false);
    room.disconnect(); // fires Disconnected → handleOnLeave clears rejoin + navigates home
  }, [room]);

  React.useEffect(() => {
    // Push a history entry so the browser Back button fires a popstate we can
    // intercept, instead of navigating away and dropping the call.
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      // Re-assert the entry so we stay in the meeting, then ask to leave.
      window.history.pushState(null, '', window.location.href);
      setShowLeaveConfirm(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div className="lk-room-container">
      <RoomContext.Provider value={room}>
        <KnockProvider>
        <PinnedProvider>
          <KeyboardShortcuts />
          <CustomVideoConference />
          <RaiseHandButton />
          <HostLeaveButton />
          <KnockRequests />
          <MeetingPip />
          <AdminTokenWatcher />
          <ParticipantsSidebar />
          <ParticipantProfileImages />
          <KeepAlive />
          <DebugMode />
          <RecordingIndicator />
        </PinnedProvider>
        </KnockProvider>
      </RoomContext.Provider>

      {showLeaveConfirm && (
        <div className="leave-confirm-overlay" onClick={() => setShowLeaveConfirm(false)}>
          <div className="leave-confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="leave-confirm-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e04848" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </div>
            <div className="leave-confirm-title">Leave the meeting?</div>
            <div className="leave-confirm-sub">You&apos;ll be disconnected. You can rejoin anytime with the same link.</div>
            <div className="leave-confirm-actions">
              <button className="leave-confirm-stay" onClick={() => setShowLeaveConfirm(false)}>Stay</button>
              <button className="leave-confirm-leave" onClick={confirmLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Watches for host role and ensures a valid, room-scoped adminToken exists.
 * Fetches a fresh token on connect, metadata change, and periodically.
 * Clears stale tokens from previous rooms.
 */
function AdminTokenWatcher() {
  const room = React.useContext(RoomContext);

  React.useEffect(() => {
    if (!room) return;

    const fetchAdminToken = () => {
      try {
        const meta = JSON.parse(room.localParticipant.metadata || '{}');
        if (meta.role === 'host') {
          // Always fetch a fresh token — old one may be for a different room
          fetch(`/api/admin-token?roomName=${encodeURIComponent(room.name)}&identity=${encodeURIComponent(room.localParticipant.identity)}`)
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
              if (data?.adminToken) {
                sessionStorage.setItem('adminToken', data.adminToken);
              }
            })
            .catch(() => {});
        }
      } catch {}
    };

    // Fetch on metadata change (promotion to host)
    room.localParticipant.on('participantMetadataChanged', fetchAdminToken);

    // Fetch on room connect
    const onConnected = () => {
      // Small delay to ensure metadata is available
      setTimeout(fetchAdminToken, 1000);
    };
    room.on(RoomEvent.Connected, onConnected);

    // Check immediately
    fetchAdminToken();

    // Refresh periodically (token may expire over long meetings)
    const refreshInterval = setInterval(fetchAdminToken, 10 * 60 * 1000); // every 10 min

    return () => {
      room.localParticipant.off('participantMetadataChanged', fetchAdminToken);
      room.off(RoomEvent.Connected, onConnected);
      clearInterval(refreshInterval);
    };
  }, [room]);

  return null;
}

/** Replaces default placeholder avatars with Google profile images + 3-dot menu on tiles */
function ParticipantProfileImages() {
  const participants = useParticipants();
  const room = React.useContext(RoomContext);
  const localName = room?.localParticipant?.name || room?.localParticipant?.identity || '';
  const { pinnedIds, togglePin, isPinned } = usePinned();

  // Tile 3-dot menu state
  const [tileMenuId, setTileMenuId] = React.useState<string | null>(null);
  const [tileMenuPos, setTileMenuPos] = React.useState({ x: 0, y: 0 });

  // Check if local user is host
  let localRole = 'listener';
  try { localRole = JSON.parse(room?.localParticipant?.metadata || '{}').role || 'listener'; } catch {}
  const isHost = localRole === 'host';

  // Build maps of participant name -> imageUrl, handRaised, bio
  const { imageMap, handRaisedMap, bioMap } = React.useMemo(() => {
    const imgMap = new Map<string, string>();
    const handMap = new Map<string, boolean>();
    const bMap = new Map<string, string>();
    participants.forEach((p) => {
      try {
        const meta = JSON.parse(p.metadata || '{}');
        const name = p.name || p.identity;
        if (meta.imageUrl) imgMap.set(name, meta.imageUrl);
        if (meta.isHandRaised) handMap.set(name, true);
        if (meta.bio) bMap.set(name, meta.bio);
      } catch {}
    });
    return { imageMap: imgMap, handRaisedMap: handMap, bioMap: bMap };
  }, [participants]);

  // Build participant info map for tile menus
  const participantInfoMap = React.useMemo(() => {
    const map = new Map<string, { identity: string; name: string; role: string; canPublish: boolean; isHandRaised: boolean }>();
    participants.forEach((p) => {
      let role = 'listener';
      let isHandRaised = false;
      try {
        const meta = JSON.parse(p.metadata || '{}');
        role = meta.role || 'listener';
        isHandRaised = !!meta.isHandRaised;
      } catch {}
      const name = p.name || p.identity;
      map.set(name, {
        identity: p.identity,
        name,
        role,
        canPublish: p.permissions?.canPublish ?? false,
        isHandRaised,
      });
    });
    return map;
  }, [participants]);

  // Close tile menu on outside click
  React.useEffect(() => {
    if (!tileMenuId) return;
    const close = () => setTileMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [tileMenuId]);

  // Admin action for tile menu
  const doTileAction = React.useCallback(async (action: string, identity: string) => {
    setTileMenuId(null);
    const adminToken = sessionStorage.getItem('adminToken') || '';
    try {
      await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ action, roomName: room!.name, identity }),
      });
    } catch {}
  }, [room]);

  const lowerHandFromTile = React.useCallback(async (identity: string) => {
    setTileMenuId(null);
    try {
      await fetch('/api/raise-hand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: room!.name, identity, raised: false }),
      });
    } catch {}
  }, [room]);

  // Stable ref for the setTileMenuId/Pos so DOM handlers don't go stale
  const menuHandlerRef = React.useRef({ setTileMenuId, setTileMenuPos, participantInfoMap });
  menuHandlerRef.current = { setTileMenuId, setTileMenuPos, participantInfoMap };

  React.useEffect(() => {
    const injectAndReorder = () => {
      // 0. Collect all tiles, ensure all visible
      const allTiles = document.querySelectorAll('.lk-participant-tile');
      allTiles.forEach((tile) => {
        (tile as HTMLElement).style.display = '';
      });

      // 1. Inject profile images
      const placeholders = document.querySelectorAll('.lk-participant-placeholder');
      placeholders.forEach((placeholder) => {
        if (placeholder.querySelector('.profile-img-overlay')) return;
        const tile = placeholder.closest('.lk-participant-tile');
        if (!tile) return;
        const nameEl = tile.querySelector('.lk-participant-name');
        if (!nameEl) return;
        const name = nameEl.textContent?.trim() || '';
        const imageUrl = imageMap.get(name);
        if (!imageUrl) return;
        const el = placeholder as HTMLElement;
        el.innerHTML = '';
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = '';
        img.className = 'profile-img-overlay';
        img.referrerPolicy = 'no-referrer';
        // Don't override placeholder styles - CSS handles positioning
        // Just insert the 56px image directly (placeholder acts as the 72px ring)
        img.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:50%;box-shadow:3px 3px 7px #c3c8d4;';
        el.appendChild(img);
      });

      // 2. Inject/remove hand raised indicators on tiles
      allTiles.forEach((tile) => {
        const nameEl = tile.querySelector('.lk-participant-name');
        const name = nameEl?.textContent?.trim() || '';
        const existing = tile.querySelector('.hand-raised-indicator');
        if (handRaisedMap.has(name)) {
          if (!existing) {
            const span = document.createElement('span');
            span.className = 'hand-raised-indicator';
            span.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e6e9f0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0"></path></svg>';
            (tile as HTMLElement).style.position = 'relative';
            tile.appendChild(span);
          }
        } else if (existing) {
          existing.remove();
        }
      });

      // 2b. Inject unmuted mic indicator on tiles (for desktop view)
      allTiles.forEach((tile) => {
        const isMuted = tile.querySelector('.lk-track-muted-indicator-microphone');
        const existing = tile.querySelector('.mic-unmuted-indicator');
        if (!isMuted) {
          // Participant is unmuted — show blue mic icon
          if (!existing) {
            const indicator = document.createElement('div');
            indicator.className = 'mic-unmuted-indicator';
            indicator.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" stroke-width="2.4" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';
            (tile as HTMLElement).appendChild(indicator);
          }
        } else if (existing) {
          existing.remove();
        }
      });

      // 3. Inject/update bio text under participant names
      allTiles.forEach((tile) => {
        const nameEl = tile.querySelector('.lk-participant-name');
        const name = nameEl?.textContent?.trim() || '';
        const bio = bioMap.get(name);
        const existing = tile.querySelector('.tile-bio-text') as HTMLElement;
        if (bio) {
          if (!existing) {
            const bioEl = document.createElement('div');
            bioEl.className = 'tile-bio-text';
            bioEl.dataset.bio = bio;
            bioEl.textContent = bio;
            // Insert after the metadata bar (which contains the name)
            const metaBar = tile.querySelector('.lk-participant-metadata');
            if (metaBar) {
              metaBar.appendChild(bioEl);
            }
          } else if (existing.dataset.bio !== bio) {
            // Only rewrite when the bio actually changed. Rewriting every poll
            // cycle would destroy the injected .marquee-scroll span and restart
            // the scroll animation, making it stutter.
            existing.dataset.bio = bio;
            existing.textContent = bio;
          }
        } else if (existing) {
          existing.remove();
        }
      });

      // 4. Rename local user tile to "You" (after all lookups by original name are done)
      allTiles.forEach((tile) => {
        const nameEl = tile.querySelector('.lk-participant-name');
        const name = nameEl?.textContent?.trim() || '';
        if (name === localName && nameEl) {
          nameEl.textContent = 'You';
        }
      });

      // 4b. Marquee scroll for overflowing name / bio text
      allTiles.forEach((tile) => {
        const els = tile.querySelectorAll('.lk-participant-name, .tile-bio-text');
        els.forEach((el) => {
          const htmlEl = el as HTMLElement;
          // Skip if already has marquee
          if (htmlEl.querySelector('.marquee-scroll')) return;
          // Check if text overflows its container
          if (htmlEl.scrollWidth > htmlEl.clientWidth + 2) {
            const text = htmlEl.textContent || '';
            htmlEl.textContent = '';
            const span = document.createElement('span');
            span.className = 'marquee-scroll';
            span.textContent = text + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0' + text + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0';
            htmlEl.appendChild(span);
          }
        });
      });

      // 5. Inject 3-dot buttons on tiles (host only, not on own tile)
      if (isHost) {
        allTiles.forEach((tile) => {
          const nameEl = tile.querySelector('.lk-participant-name');
          const name = nameEl?.textContent?.trim() || '';
          if (name === 'You') return;

          let dotBtn = tile.querySelector('.tile-three-dot-btn') as HTMLButtonElement;
          if (!dotBtn) {
            dotBtn = document.createElement('button');
            dotBtn.className = 'tile-three-dot-btn';
            dotBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#4f5675"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
            (tile as HTMLElement).style.position = 'relative';
            tile.appendChild(dotBtn);
          }

          dotBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const { participantInfoMap: infoMap, setTileMenuId: setId, setTileMenuPos: setPos } = menuHandlerRef.current;
            const info = infoMap.get(name);
            if (info) {
              const rect = dotBtn.getBoundingClientRect();
              setPos({ x: rect.left, y: rect.bottom + 4 });
              setId((prev: string | null) => prev === info.identity ? null : info.identity);
            }
          };
        });
      }
    };

    injectAndReorder();
    const interval = setInterval(injectAndReorder, 1000);
    return () => clearInterval(interval);
  }, [imageMap, handRaisedMap, bioMap, localName, participants.length, isHost]);

  // (You thumbnail removed — local user shown in main grid as "You")

  // Find the participant info for the open tile menu
  const menuParticipant = React.useMemo(() => {
    if (!tileMenuId) return null;
    for (const info of participantInfoMap.values()) {
      if (info.identity === tileMenuId) {
        return { ...info, isPinned: isPinned(info.identity) };
      }
    }
    return null;
  }, [tileMenuId, participantInfoMap, pinnedIds]);

  return (
    <>
      {/* Tile 3-dot dropdown menu (portal) */}
      {tileMenuId && menuParticipant && createPortal(
        <div
          className="tile-menu-dropdown"
          style={{ position: 'fixed', left: tileMenuPos.x, top: tileMenuPos.y, zIndex: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pin / Unpin */}
          <button className="tile-menu-item" onClick={() => { togglePin(menuParticipant.identity); setTileMenuId(null); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={menuParticipant.isPinned ? '#5b8dee' : 'currentColor'}>
              <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4zm3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z" />
            </svg>
            {menuParticipant.isPinned ? 'Unpin' : 'Pin'}
          </button>

          {/* Lower Hand */}
          {menuParticipant.isHandRaised && (
            <button className="tile-menu-item" style={{ color: '#d98a12' }} onClick={() => lowerHandFromTile(menuParticipant.identity)}>
              <span style={{ fontSize: '0.8rem' }}>✋</span>
              Lower Hand
            </button>
          )}

          {/* Grant Speak / Mute */}
          {!menuParticipant.canPublish ? (
            <button className="tile-menu-item" style={{ color: '#16a34a' }} onClick={() => doTileAction('grant_speak', menuParticipant.identity)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
              Grant Speak
            </button>
          ) : (
            <button className="tile-menu-item" style={{ color: '#d98a12' }} onClick={() => doTileAction('revoke_speak', menuParticipant.identity)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
              </svg>
              Mute
            </button>
          )}

          {/* Make Host */}
          {menuParticipant.role !== 'host' && (
            <button className="tile-menu-item" style={{ color: '#5b8dee' }} onClick={() => {
              if (confirm(`Make ${menuParticipant.name} a Host?`)) doTileAction('make_host', menuParticipant.identity);
              else setTileMenuId(null);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
              </svg>
              Make Host
            </button>
          )}

          <div style={{ height: '1px', background: 'rgba(0, 0, 0, 0.08)', margin: '0.25rem 0' }} />

          {/* Remove */}
          <button className="tile-menu-item" style={{ color: '#e04848' }} onClick={() => {
            if (confirm(`Remove ${menuParticipant.name}?`)) doTileAction('remove_participant', menuParticipant.identity);
            else setTileMenuId(null);
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 3H9V1h6v2zm-1 11V8h-4v6H7l5 5 5-5h-3zm5-9h-1V3c0-.55-.45-1-1-1H7c-.55 0-1 .45-1 1v2H5c-.55 0-1 .45-1 1s.45 1 1 1h14c.55 0 1-.45 1-1s-.45-1-1-1z" />
            </svg>
            Remove
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * Keeps WebRTC audio alive when screen is off / locked.
 * Uses Screen Wake Lock API + silent audio oscillator as fallback
 * to prevent the browser from suspending the tab.
 */
function KeepAlive() {
  React.useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let audioCtx: AudioContext | null = null;

    // 1. Screen Wake Lock API — prevents screen from turning off
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen');
        }
      } catch {}
    };

    requestWakeLock();

    // Re-acquire wake lock when page becomes visible again
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 2. Silent audio oscillator — keeps audio pipeline alive on mobile
    try {
      audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.001; // near-silent
      oscillator.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.start();
    } catch {}

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wakeLock?.release().catch(() => {});
      audioCtx?.close().catch(() => {});
    };
  }, []);

  return null;
}

interface WakeLockSentinel {
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

/** Color palette for participant avatars in the pre-join info panel */
const AVATAR_COLORS = [
  '#e67e22', '#2ecc71', '#e74c3c', '#9b59b6', '#1abc9c',
  '#3498db', '#f39c12', '#e91e63', '#00bcd4', '#8bc34a',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

interface RoomInfo {
  exists: boolean;
  ended?: boolean;
  title?: string;
  hostName?: string;
  participantCount?: number;
  participants?: { name: string; identity: string; role: string; imageUrl: string; bio: string }[];
}

/** Desktop-only left panel showing meeting info, participants, badges */
function RoomInfoPanel({ roomName, role }: { roomName: string; role: string }) {
  const [info, setInfo] = React.useState<RoomInfo | null>(null);

  React.useEffect(() => {
    fetch(`/api/room-info?roomName=${encodeURIComponent(roomName)}`)
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {});

    // Refresh every 5s to see new participants
    const iv = setInterval(() => {
      fetch(`/api/room-info?roomName=${encodeURIComponent(roomName)}`)
        .then(r => r.json())
        .then(setInfo)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, [roomName]);

  const title = info?.title || 'Meeting';
  const hostName = info?.hostName || '';
  const participants = info?.participants || [];
  const count = info?.participantCount || 0;
  const roleLabel = role === 'host' ? 'Host' : role === 'moderator' ? 'Moderator' : 'Listener';
  const showMax = 5;

  return (
    <div className="prejoin-dk-left">
      <div className="prejoin-dk-live">
        <div className="prejoin-dk-live-dot" />
        LIVE NOW
      </div>
      <h1 className="prejoin-dk-title">{title}</h1>
      {hostName && (
        <div className="prejoin-dk-host">
          Hosted by <strong>{hostName}</strong>
        </div>
      )}

      {count > 0 && (
        <div className="prejoin-dk-participants-box">
          <div className="prejoin-dk-participants-label">ALREADY IN THE MEETING</div>
          <div className="prejoin-dk-avatars-row">
            {participants.slice(0, showMax).map((p, i) => (
              <div
                key={p.identity}
                className="prejoin-dk-avatar"
                style={{ background: AVATAR_COLORS[hashStr(p.identity) % AVATAR_COLORS.length], zIndex: showMax - i }}
                title={p.name}
              >
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  getInitials(p.name)
                )}
              </div>
            ))}
            {count > showMax && (
              <div className="prejoin-dk-avatar prejoin-dk-avatar-more" style={{ zIndex: 0 }}>
                +{count - showMax}
              </div>
            )}
            <span className="prejoin-dk-people-text">{count} {count === 1 ? 'person is' : 'people are'} here</span>
          </div>
        </div>
      )}

      <div className="prejoin-dk-badges">
        <div className="prejoin-dk-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2.2" strokeLinecap="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h3ZM3 15a2 2 0 0 0 2 2h1v-5H3Z"/></svg>
          Audio-only
        </div>
        <div className="prejoin-dk-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d98a12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l22 22M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 16.9A7 7 0 0 1 5 11M19 11a7 7 0 0 1-.1 1.2M12 18v3"/></svg>
          Joining as {roleLabel}
        </div>
      </div>
    </div>
  );
}
