// src/shared/lib/queryClient.ts
// React Query client with AsyncStorage persistence.
// Cache survives app restarts — critical for offline-first UX on 3G.

import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale data shown immediately, refetch in background
      staleTime:           1000 * 60 * 5,   // 5 minutes
      gcTime:              1000 * 60 * 60,   // 1 hour (formerly cacheTime)
      retry:               3,
      retryDelay:          (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      // Aggressive on 3G — don't refetch unnecessarily
      refetchOnWindowFocus:   false,
      refetchOnReconnect:     true,
      refetchOnMount:         true,
      networkMode:            'offlineFirst',
    },
    mutations: {
      retry:       1,
      networkMode: 'offlineFirst',
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key:     'drop-query-cache',
  // Throttle writes — not every single query update needs to persist immediately
  throttleTime: 1000,
});

// Connect persister to queryClient
persistQueryClient({
  queryClient,
  persister:         asyncStoragePersister,
  maxAge:            1000 * 60 * 60 * 24,  // 24 hours
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      // Only persist successful queries — not errors
      query.state.status === 'success',
  },
});


