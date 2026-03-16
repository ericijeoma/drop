// ────────────────────────────────────────────────────────────
// src/shared/hooks/useDriverLocation.ts
// Streams driver GPS to Supabase in real-time.
// Proper cleanup prevents the memory leak where location keeps
// updating after the screen unmounts.
// ────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import * as Location         from 'expo-location';
import { supabase }          from '@/shared/lib/supabase';
import { logger }            from '@/shared/lib/logger';
import type { Coords }       from '@/shared/types';

interface UseDriverLocationOptions {
  driverId:   string;
  isOnline:   boolean;
  onUpdate?:  (coords: Coords) => void;
}

export function useDriverLocation({
  driverId,
  isOnline,
  onUpdate,
}: UseDriverLocationOptions): void {
  // Cancelled flag — prevents state updates after unmount
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isOnline || !driverId) return;

    cancelledRef.current = false;
    let subscription: Location.LocationSubscription | null = null;

    async function startTracking(): Promise<void> {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('Location permission denied');
        return;
      }

      // Request background permission for when app is minimised during trips
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        logger.warn('Background location permission denied — tracking may pause when app is minimised');
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy:            Location.Accuracy.High,
          timeInterval:        5_000,   // every 5 seconds
          distanceInterval:    20,      // or every 20 metres
        },
        async (location) => {
          if (cancelledRef.current) return;

          const coords: Coords = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          };

          onUpdate?.(coords);

          // Update PostGIS location — WKT format for geography column
          const { error } = await supabase
            .from('drivers')
            .update({
              current_location: `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
              updated_at:       new Date().toISOString(),
            })
            .eq('id', driverId);

          if (error && !cancelledRef.current) {
            logger.warn('Failed to update driver location', { error: error.message });
          }
        }
      );
    }

    startTracking().catch((err) => {
      if (!cancelledRef.current) {
        logger.error('Location tracking error', { error: String(err) });
      }
    });

    // Cleanup: cancel flag + remove subscription
    return () => {
      cancelledRef.current = true;
      subscription?.remove();
    };
  }, [driverId, isOnline, onUpdate]);
}


