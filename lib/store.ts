'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Side, ScoreActionType } from '@/lib/types';

export interface QueuedVote {
  match_id: string;
  judge_id: string;
  player_side: Side;
  action_type: ScoreActionType;
}

interface OfflineQueueState {
  votes: QueuedVote[];
  enqueue: (vote: QueuedVote) => void;
  clear: () => void;
}

// Votes cast while a judge tablet is offline are queued here (persisted to
// localStorage) and replayed through cast_vote() once reconnected.
export const useOfflineQueue = create<OfflineQueueState>()(
  persist(
    (set) => ({
      votes: [],
      enqueue: (vote) => set((s) => ({ votes: [...s.votes, vote] })),
      clear: () => set({ votes: [] }),
    }),
    { name: 'offline-vote-queue' }
  )
);
