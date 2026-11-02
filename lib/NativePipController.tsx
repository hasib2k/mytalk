'use client';

import React from 'react';
import { RoomContext } from '@livekit/components-react';
import { ParticipantEvent } from 'livekit-client';
import { isNativeApp } from '@/lib/platform';

/**
 * Drives the native Android Picture-in-Picture window for a meeting:
 *  - Reports the local mic state to native so the PiP Mute/Unmute button shows
 *    the correct icon + label.
 *  - Handles PiP action taps (mute / end) relayed from native via `mytalkpip`.
 *  - Toggles the `pip-active` class so the WebView shows a clean participant grid
 *    (control bar / chat / headers hidden) while floating in PiP.
 *  - Routes the Android back button to enter PiP instead of leaving the meeting.
 */
export function NativePipController() {
  const room = React.useContext(RoomContext);

  React.useEffect(() => {
    if (!room || !isNativeApp()) return;
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      const [{ registerPlugin }, { App }] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/app'),
      ]);
      if (cancelled) return;
      const Pip = registerPlugin<{
        setMuted: (o: { muted: boolean }) => Promise<void>;
        enterPip: () => Promise<void>;
      }>('Pip');

      const reportMuted = () => {
        const muted = !room.localParticipant.isMicrophoneEnabled;
        Pip.setMuted({ muted }).catch(() => {});
      };
      reportMuted();

      // Native PiP action buttons + PiP-mode changes arrive as one event.
      const onPip = (e: Event) => {
        const detail = (e as CustomEvent).detail as string;
        if (detail === 'mute') {
          const enabled = room.localParticipant.isMicrophoneEnabled;
          room.localParticipant.setMicrophoneEnabled(!enabled).then(reportMuted).catch(() => {});
        } else if (detail === 'end') {
          room.disconnect();
        } else if (detail === 'pip-enter') {
          document.documentElement.classList.add('pip-active');
          reportMuted();
        } else if (detail === 'pip-exit') {
          document.documentElement.classList.remove('pip-active');
        }
      };
      window.addEventListener('mytalkpip', onPip as EventListener);
      cleanups.push(() => window.removeEventListener('mytalkpip', onPip as EventListener));

      // Keep native in sync whenever the local mic is toggled from anywhere.
      const lp = room.localParticipant;
      lp.on(ParticipantEvent.TrackMuted, reportMuted);
      lp.on(ParticipantEvent.TrackUnmuted, reportMuted);
      cleanups.push(() => {
        lp.off(ParticipantEvent.TrackMuted, reportMuted);
        lp.off(ParticipantEvent.TrackUnmuted, reportMuted);
      });

      // Android back button → float into PiP instead of leaving the meeting.
      const backSub = await App.addListener('backButton', () => {
        Pip.enterPip().catch(() => {});
      });
      cleanups.push(() => backSub.remove());
    })();

    return () => {
      cancelled = true;
      document.documentElement.classList.remove('pip-active');
      cleanups.forEach((fn) => fn());
    };
  }, [room]);

  return null;
}
