// ────────────────────────────────────────────────────────────
// src/domains/admin/usecases/GetDashboardStatsUseCase.ts
// ────────────────────────────────────────────────────────────

import { supabase }    from '@/shared/lib/supabase';
import type { AdminStats } from '@/shared/types';
import { DomainError } from '@/shared/types';

export class GetDashboardStatsUseCase {
  async execute(adminUserId: string): Promise<AdminStats> {
    // RLS enforces this — is_admin() check in SQL function
    const { data, error } = await supabase.rpc('get_admin_stats');
    if (error) throw new DomainError('Failed to fetch stats.', 'STATS_FAILED');
    return data as AdminStats;
  }
}