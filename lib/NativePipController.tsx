'use client';

import React from 'react';
import { RoomContext } from '@livekit/components-react';
import { isNativeApp } from '@/lib/platform';

/**
 * Wires the native Android Picture-in-Picture action buttons to the LiveKit room.
 * When the app is minimized during a meeting, MainActivity shows a PiP window with
 * Mute / End / Open controls; tapping Mute or End dispatches a `mytalkpip` event
 * into the WebView, which we handle here. ("fullscreen"/Open is handled natively.)
 */
export function NativePipController() {
  const room = React.useContext(RoomContext);

  React.useEffect(() => {
    if (!room || !isNativeApp()) return;
    const onPip = (e: Event) => {
      const action = (e as CustomEvent).detail as string;
      if (action === 'mute') {
        const enabled = room.localParticipant.isMicrophoneEnabled;
        room.localParticipant.setMicrophoneEnabled(!enabled).catch(() => {});
      } else if (action === 'end') {
        room.disconnect();
      }
    };
    window.addEventListener('mytalkpip', onPip as EventListener);
    return () => window.removeEventListener('mytalkpip', onPip as EventListener);
  }, [room]);

  return null;
}
