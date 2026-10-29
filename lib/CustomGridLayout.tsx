'use client';

import * as React from 'react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import {
  TrackLoop,
} from '@livekit/components-react';
import { usePinned } from './PinnedContext';

export interface CustomGridLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  tracks: TrackReferenceOrPlaceholder[];
}

/**
 * Scrollable grid layout — shows ALL participants in a 2-column grid
 * that scrolls vertically. Pinned participants appear first, then
 * currently speaking, then the rest.
 */
export function CustomGridLayout({ tracks, children, ...props }: CustomGridLayoutProps) {
  const { pinnedIds } = usePinned();

  // Build keys that change when speaking/pin state changes, so sort re-runs
  const speakingKey = tracks
    .map((t) => `${t.participant?.identity}:${t.participant?.isSpeaking ? '1' : '0'}`)
    .join(',');
  const pinnedKey = Array.from(pinnedIds).sort().join(',');

  // Sort tracks: pinned first, then speaking, then rest
  const sortedTracks = React.useMemo(() => {
    return [...tracks].sort((a, b) => {
      const aPinned = pinnedIds.has(a.participant?.identity ?? '') ? 0 : 1;
      const bPinned = pinnedIds.has(b.participant?.identity ?? '') ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;

      const aSpeaking = a.participant?.isSpeaking ? 0 : 1;
      const bSpeaking = b.participant?.isSpeaking ? 0 : 1;
      return aSpeaking - bSpeaking;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, pinnedKey, speakingKey]);

  return (
    <div
      {...props}
      className={`lk-grid-layout ${props.className || ''}`}
    >
      <TrackLoop tracks={sortedTracks}>{children}</TrackLoop>
    </div>
  );
}
