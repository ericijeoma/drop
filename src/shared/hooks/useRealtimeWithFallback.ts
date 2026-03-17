// ────────────────────────────────────────────────────────────
// src/shared/hooks/useRealtimeWithFallback.ts
//
// Supabase Realtime subscription with polling fallback.
// If WebSocket drops, falls back to polling every pollIntervalMs.
//
// Stability contract for callers:
//   - `filter` must be a stable reference — wrap in useMemo at
//     the call site. A new object on every render restarts the
//     subscription.
//   - `onData` and `fallbackQuery` are captured via refs so they
//     do NOT need to be stable — no useMemo/useCallback required
//     from callers for these two.
// ────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { supabase }                    from '@/shared/lib/supabase';
import { logger }                      from '@/shared/lib/logger';

type SupabaseTable = 'rides' | 'orders' | 'drivers' | 'notifications';
type EventType     = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface FilterClause {
  readonly column: string;
  readonly value:  string;
}

interface UseRealtimeOptions<T> {
  table:           SupabaseTable;
  event?:          EventType;
  /**
   * Must be a stable reference.
   * Wrap in useMemo at the call site:
   *   const filter = useMemo(() => ({ column: 'id', value: id }), [id]);
   */
  filter?:         FilterClause;
  onData:          (payload: T) => void;
  fallbackQuery:   () => Promise<void>;
  pollIntervalMs?: number;
}

export function useRealtimeWithFallback<T>({
  table,
  event          = '*',
  filter,
  onData,
  fallbackQuery,
  pollIntervalMs = 10_000,
}: UseRealtimeOptions<T>): { isRealtime: boolean } {
  const [isRealtime, setIsRealtime] = useState(false);

  const pollIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef       = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ✅ Fix 2: capture callbacks in refs so they never appear in the
  // subscription effect's dependency array. The effect reads
  // onDataRef.current and fallbackQueryRef.current at call time,
  // always getting the latest version without re-subscribing.
  const onDataRef        = useRef(onData);
  const fallbackQueryRef = useRef(fallbackQuery);

  useEffect(() => { onDataRef.current = onData; },        [onData]);
  useEffect(() => { fallbackQueryRef.current = fallbackQuery; }, [fallbackQuery]);

  useEffect(() => {
    const channelName = `${table}:${filter?.column ?? 'all'}:${filter?.value ?? 'all'}`;
    const filterStr   = filter ? `${filter.column}=eq.${filter.value}` : undefined;

    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes' as Parameters<typeof channel.on>[0],
        {
          event:  event,
          schema: 'public',
          table:  table,
          filter: filterStr,
        },
        (payload: { new: T }) => {
          // Read from ref — always latest onData without re-subscribing
          onDataRef.current(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtime(true);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          logger.debug(`Realtime subscribed: ${channelName}`);
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsRealtime(false);
          logger.warn(`Realtime degraded: ${channelName} — switching to polling`);
          if (!pollIntervalRef.current) {
            fallbackQueryRef.current();
            pollIntervalRef.current = setInterval(
              () => fallbackQueryRef.current(),
              pollIntervalMs,
            );
          }
        }
      });

    // Initial fetch on mount or when subscription target changes
    fallbackQueryRef.current();

    return () => {
      channelRef.current = null;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      supabase.removeChannel(channel);
    };

  // ✅ Fix 1: filter as a whole object — not split into ?.column / ?.value
  // onData and fallbackQuery are intentionally excluded — they live in refs
  }, [table, event, filter, pollIntervalMs]);

  return { isRealtime };
}