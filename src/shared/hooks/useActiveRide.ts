// ────────────────────────────────────────────────────────────
// src/shared/hooks/useActiveRide.ts
// Polls or subscribes to the current active ride.
// Used by track-ride.tsx and trip.tsx.
// ────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { useQuery }              from '@tanstack/react-query';
import { useRealtimeWithFallback } from './useRealtimeWithFallback';
import { SupabaseRideRepository }  from '@/shared/repositories/SupabaseRideRepository';
import type { Ride }               from '@/domains/rides/entities/Ride';

const rideRepo = new SupabaseRideRepository();

export function useActiveRide(rideId: string | null) {
  const [realtimeRide, setRealtimeRide] = useState<Ride | null>(null);

  const { data: fetchedRide, refetch } = useQuery({
    queryKey:  ['ride', rideId],
    queryFn:   () => rideId ? rideRepo.getById(rideId) : null,
    enabled:   !!rideId,
    staleTime: 5000,
  });

  const fallbackQuery = useCallback(async () => {
    if (rideId) await refetch();
  }, [rideId, refetch]);

  const { isRealtime } = useRealtimeWithFallback<Record<string, unknown>>({
    table:  'rides',
    event:  'UPDATE',
    filter: rideId ? { column: 'id', value: rideId } : undefined,
    onData: (payload) => {
      // Parse incoming realtime payload into a Ride entity
      rideRepo.getById(rideId!).then(r => {
        if (r) setRealtimeRide(r);
      });
    },
    fallbackQuery,
  });

  return {
    ride:       realtimeRide ?? fetchedRide ?? null,
    isRealtime,
    refetch,
  };
}


