// src/shared/lib/supabase.ts
// Supabase client — single instance, custom fetch timeout.
// Imported ONLY by src/shared/repositories/*.

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL  = Constants.expoConfig?.extra?.supabaseUrl  as string;
const SUPABASE_ANON = Constants.expoConfig?.extra?.supabaseAnon as string;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in app config');
}

// Custom SecureStore adapter — sessions survive app restarts securely
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore can fail in Expo Go — graceful degradation
      console.warn('[supabase] SecureStore setItem failed:', key);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      console.warn('[supabase] SecureStore removeItem failed:', key);
    }
  },
};

// 10 second timeout — critical for 3G reliability
const fetchWithTimeout = (
  url: RequestInfo | URL,
  options?: RequestInit
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 10_000);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            secureStoreAdapter,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,  // mobile — no URL session detection
  },
  global: {
    fetch: fetchWithTimeout,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export type SupabaseClient = typeof supabase;