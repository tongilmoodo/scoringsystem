'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface QueuedAction {
  table: 'score_events' | 'matches';
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  matchId?: string;
}

interface OfflineQueueState {
  queue: QueuedAction[];
  enqueue: (action: QueuedAction) => void;
  clear: () => void;
}

// Actions taken while the tablet is offline are queued here (persisted to
// localStorage) and replayed once the connection is restored.
export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (action) => set((s) => ({ queue: [...s.queue, action] })),
      clear: () => set({ queue: [] }),
    }),
    { name: 'offline-queue' }
  )
);
