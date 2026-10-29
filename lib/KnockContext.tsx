'use client';

import React from 'react';
import { RoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

export interface KnockReq {
  id: string;
  name?: string;
  imageUrl?: string;
  bio?: string;
  role?: string;
}

interface KnockCtxValue {
  isHost: boolean;
  requests: KnockReq[];
  decide: (ids: string[], approve: boolean) => void;
}

const KnockCtx = React.createContext<KnockCtxValue>({ isHost: false, requests: [], decide: () => {} });

export function useKnock(): KnockCtxValue {
  return React.useContext(KnockCtx);
}

/**
 * Single source of truth for pending join (knock) requests in a meeting.
 * Polls the admin API ONCE for the host and shares the result with every
 * consumer (floating panel + participants sidebar), so there's no duplicate
 * polling that would trip the admin endpoint's rate limit.
 */
export function KnockProvider({ children }: { children: React.ReactNode }) {
  const room = React.useContext(RoomContext);
  const [isHost, setIsHost] = React.useState(false);
  const [requests, setRequests] = React.useState<KnockReq[]>([]);

  // Track host role (may change mid-meeting).
  React.useEffect(() => {
    if (!room) return;
    const check = () => {
      try {
        setIsHost(JSON.parse(room.localParticipant.metadata || '{}').role === 'host');
      } catch {
        setIsHost(false);
      }
    };
    check();
    room.localParticipant.on('participantMetadataChanged', check);
    room.on(RoomEvent.Connected, check);
    return () => {
      room.localParticipant.off('participantMetadataChanged', check);
      room.off(RoomEvent.Connected, check);
    };
  }, [room]);

  // Poll pending knock requests (host only).
  React.useEffect(() => {
    if (!room || !isHost) {
      setRequests([]);
      return;
    }
    let active = true;
    const poll = async () => {
      const token = sessionStorage.getItem('adminToken');
      if (!token) return;
      try {
        const res = await fetch(`/api/admin?roomName=${encodeURIComponent(room.name)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const r = (data.rooms || []).find((x: any) => x.name === room.name) || (data.rooms || [])[0];
        let meta: any = {};
        try { meta = JSON.parse(r?.metadata || '{}'); } catch {}
        const knock: KnockReq[] = Array.isArray(meta.knock)
          ? meta.knock.filter((k: any) => k.status === 'pending')
          : [];
        if (active) {
          setRequests((prev) => {
            const prevIds = prev.map((r) => r.id).join(',');
            const nextIds = knock.map((k) => k.id).join(',');
            return prevIds === nextIds ? prev : knock;
          });
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [room, isHost]);

  const decide = React.useCallback(async (ids: string[], approve: boolean) => {
    const token = sessionStorage.getItem('adminToken');
    if (!room || !token || ids.length === 0) return;
    setRequests((rs) => rs.filter((r) => !ids.includes(r.id))); // optimistic
    await Promise.all(ids.map((id) =>
      fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: approve ? 'approve_knock' : 'reject_knock', roomName: room.name, knockId: id }),
      }).catch(() => {}),
    ));
  }, [room]);

  const value = React.useMemo(() => ({ isHost, requests, decide }), [isHost, requests, decide]);

  return <KnockCtx.Provider value={value}>{children}</KnockCtx.Provider>;
}
