// ────────────────────────────────────────────────────────────
// src/shared/lib/offlineQueue.ts
// Idempotent offline mutation queue.
// When the user goes offline, failed mutations are stored here.
// When connectivity returns, they are replayed in order.
// ────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'drop-offline-queue';

export interface QueuedAction {
  readonly id:            string;
  readonly type:          string;    // e.g. 'BOOK_RIDE', 'CONFIRM_DELIVERY'
  readonly payload:       unknown;
  readonly idempotencyKey: string;   // prevents double-execution on retry
  readonly queuedAt:      string;    // ISO timestamp
  readonly retries:       number;
}

const MAX_RETRIES = 3;

export const offlineQueue = {
  async push(action: Omit<QueuedAction, 'queuedAt' | 'retries'>): Promise<void> {
    const queue = await offlineQueue.getAll();
    // Deduplicate by idempotencyKey — never queue same action twice
    const exists = queue.some(q => q.idempotencyKey === action.idempotencyKey);
    if (exists) return;
    const newQueue: QueuedAction[] = [
      ...queue,
      { ...action, queuedAt: new Date().toISOString(), retries: 0 },
    ];
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
  },

  async getAll(): Promise<QueuedAction[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
    } catch {
      return [];
    }
  },

  async remove(id: string): Promise<void> {
    const queue = await offlineQueue.getAll();
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(queue.filter(q => q.id !== id))
    );
  },

  async incrementRetry(id: string): Promise<void> {
    const queue = await offlineQueue.getAll();
    const updated = queue.map(q =>
      q.id === id ? { ...q, retries: q.retries + 1 } : q
    );
    // Remove actions that have exceeded max retries
    const pruned = updated.filter(q => q.retries <= MAX_RETRIES);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(pruned));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  },
};


