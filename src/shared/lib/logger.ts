// ────────────────────────────────────────────────────────────
// src/shared/lib/logger.ts
// Structured logger — writes to Supabase app_logs in production.
// Degrades gracefully offline.
// ────────────────────────────────────────────────────────────

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
    // ✅ Lazy import — only runs in production at call time, never at module load
    const { supabase } = await import('./supabase');
    await supabase.from('app_logs').insert({
      user_id: userId,
      level:   entry.level,
      message: entry.message,
      context: entry.context,
    });
  } catch (error){
    // Log write failures are silently ignored — never crash the app for logging
    console.error("Log failed", error); 
  }
}

function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  if (isDev) {
    const icons: Record<LogLevel, string> = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' };
    console[level === 'debug' ? 'log' : level](`${icons[level]} [Drop] ${message}`, context);
  }
  // In production, only log warn+ to Supabase to reduce writes
  if (!isDev && (level === 'warn' || level === 'error')) {
    // ✅ Lazy import here too
    import('./supabase').then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        const userId = data?.user?.id ?? null;
        writeToSupabase(userId, { level, message, context });
      });
    });
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => log('info',  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log('warn',  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};


