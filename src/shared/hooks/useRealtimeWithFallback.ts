// ────────────────────────────────────────────────────────────
// src/shared/hooks/useRealtimeWithFallback.ts
// Supabase Realtime subscription with polling fallback.
// If WebSocket drops, falls back to polling every 10s.
// FilterClause is fully typed — no 'any'.
// ────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { supabase }                    from '@/shared/lib/supabase';
import { logger }                      from '@/shared/lib/logger';

type SupabaseTable  = 'rides' | 'orders' | 'drivers' | 'notifications';
type EventType      = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface FilterClause {
  readonly column: string;
  readonly value:  string;
}

interface UseRealtimeOptions<T> {
  table:         SupabaseTable;
  event?:        EventType;
  filter?:       FilterClause;
  onData:        (payload: T) => void;
  fallbackQuery: () => Promise<void>;
  pollIntervalMs?: number;
}

export function useRealtimeWithFallback<T>({
  table,
  event   = '*',
  filter,
  onData,
  fallbackQuery,
  pollIntervalMs = 10_000,
}: UseRealtimeOptions<T>): { isRealtime: boolean } {
  const [isRealtime, setIsRealtime] = useState(false);
  const pollIntervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef                  = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channelName = `${table}:${filter?.column ?? 'all'}:${filter?.value ?? 'all'}`;
    const filterStr   = filter ? `${filter.column}=eq.${filter.value}` : undefined;

    // Build the channel
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
          onData(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtime(true);
          // Clear polling fallback — realtime is working
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          logger.debug(`Realtime subscribed: ${channelName}`);
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsRealtime(false);
          logger.warn(`Realtime degraded: ${channelName} — switching to polling`);
          // Start polling fallback
          if (!pollIntervalRef.current) {
            fallbackQuery();
            pollIntervalRef.current = setInterval(fallbackQuery, pollIntervalMs);
          }
        }
      });

    // Initial data fetch
    fallbackQuery();

    return () => {
      channelRef.current = null;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [table, event, filter?.column, filter?.value, pollIntervalMs]);

  return { isRealtime };
}


