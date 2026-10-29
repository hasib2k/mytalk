'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface PinnedContextType {
  pinnedIds: Set<string>;
  togglePin: (identity: string) => void;
  isPinned: (identity: string) => boolean;
}

const PinnedContext = createContext<PinnedContextType>({
  pinnedIds: new Set(),
  togglePin: () => {},
  isPinned: () => false,
});

export function PinnedProvider({ children }: { children: React.ReactNode }) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const togglePin = useCallback((identity: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(identity)) {
        next.delete(identity);
      } else {
        next.add(identity);
      }
      return next;
    });
  }, []);

  const isPinned = useCallback((identity: string) => pinnedIds.has(identity), [pinnedIds]);

  return (
    <PinnedContext.Provider value={{ pinnedIds, togglePin, isPinned }}>
      {children}
    </PinnedContext.Provider>
  );
}

export function usePinned() {
  return useContext(PinnedContext);
}
