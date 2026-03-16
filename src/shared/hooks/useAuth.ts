// ────────────────────────────────────────────────────────────
// src/shared/hooks/useAuth.ts
// Authentication state for the entire app.
// ────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useQueryClient }      from '@tanstack/react-query';
import { supabase }            from '@/shared/lib/supabase';
import type { User }           from '@/domains/auth/entities/User';
import { SupabaseAuthRepository } from '@/shared/repositories/SupabaseAuthRepository';

const authRepo = new SupabaseAuthRepository();

export function useAuth() {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient           = useQueryClient();

  useEffect(() => {
    // Load current session on mount
    authRepo.getCurrentUser().then((u) => {
      setUser(u);
      setLoading(false);
    });

    // Listen to auth state changes (token refresh, sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          const u = await authRepo.getCurrentUser();
          setUser(u);
        }
        if (event === 'SIGNED_OUT') {
          setUser(null);
          queryClient.clear();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return { user, loading, isAuthenticated: user !== null };
}


