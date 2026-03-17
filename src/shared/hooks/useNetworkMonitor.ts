// src/shared/hooks/useNetworkMonitor.ts
// Detects connectivity changes. Flushes offline queue on reconnect.
// Used in _layout.tsx at the root so it is always active.

import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { offlineQueue }    from '@/shared/lib/offlineQueue';
import { logger }          from '@/shared/lib/logger';

export function useNetworkMonitor(
  onFlush?: (action: import('@/shared/lib/offlineQueue').QueuedAction) => Promise<void>
): void {
  const queryClient    = useQueryClient();
  const wasOfflineRef  = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const isOnline = state.isConnected && state.isInternetReachable !== false;

      if (!isOnline) {
        wasOfflineRef.current = true;
        logger.info('Network lost — offline queue active');
        return;
      }

      if (wasOfflineRef.current && isOnline) {
        wasOfflineRef.current = false;
        logger.info('Network restored — flushing offline queue');

        // Refetch all stale queries
        await queryClient.invalidateQueries();

        // Replay queued actions if handler provided
        if (onFlush) {
          const queue = await offlineQueue.getAll();
          for (const action of queue) {
            try {
              await onFlush(action);
              await offlineQueue.remove(action.id);
              logger.info('Offline action replayed', { type: action.type });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              await offlineQueue.incrementRetry(action.id);
              logger.warn('Offline action replay failed', {
                type: action.type,
                retries: action.retries,
                message
              });
            }
          }
        }
      }
    });

    return unsubscribe;
  }, [queryClient, onFlush]);
}


