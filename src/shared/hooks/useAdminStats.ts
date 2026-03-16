// ────────────────────────────────────────────────────────────
// src/shared/hooks/useAdminStats.ts
// Polls admin dashboard stats every 30 seconds.
// ────────────────────────────────────────────────────────────

import { useQuery }              from '@tanstack/react-query';
import { GetDashboardStatsUseCase } from '@/domains/admin/usecases/GetDashboardStatsUseCase';

const useCase = new GetDashboardStatsUseCase();

export function useAdminStats(adminUserId: string) {
  return useQuery({
    queryKey:          ['adminStats'],
    queryFn:           () => useCase.execute(adminUserId),
    staleTime:         30_000,  // refresh every 30s
    refetchInterval:   30_000,
  });
}