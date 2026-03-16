// ────────────────────────────────────────────────────────────
// src/shared/lib/logger.ts
// Structured logger — writes to Supabase app_logs in production.
// Degrades gracefully offline.
// ────────────────────────────────────────────────────────────

import { supabase } from './supabase';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level:   LogLevel;
  message: string;
  context: Record<string, unknown>;
}

const isDev = process.env.NODE_ENV === 'development' || __DEV__;

async function writeToSupabase(
  userId: string | null,
  entry: LogEntry
): Promise<void> {
  try {
    await supabase.from('app_logs').insert({
      user_id: userId,
      level:   entry.level,
      message: entry.message,
      context: entry.context,
    });
  } catch {
    // Log write failures are silently ignored — never crash the app for logging
  }
}

function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  if (isDev) {
    const icons: Record<LogLevel, string> = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' };
    console[level === 'debug' ? 'log' : level](`${icons[level]} [Drop] ${message}`, context);
  }
  // In production, only log warn+ to Supabase to reduce writes
  if (!isDev && (level === 'warn' || level === 'error')) {
    // Get current user ID asynchronously — fire and forget
    supabase.auth.getUser().then(({ data }) => {
      const userId = data?.user?.id ?? null;
      writeToSupabase(userId, { level, message, context });
    });
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => log('info',  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log('warn',  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};


