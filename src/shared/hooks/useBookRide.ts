// ────────────────────────────────────────────────────────────
// src/shared/hooks/useBookRide.ts
// Wraps BookRideUseCase in React Query mutation.
// ────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookRideUseCase }              from '@/domains/rides/usecases/BookRideUseCase';
import { SupabaseRideRepository }       from '@/shared/repositories/SupabaseRideRepository';
import { SupabaseAuthRepository }       from '@/shared/repositories/SupabaseAuthRepository';
import type { BookRideInput }           from '@/domains/rides/usecases/BookRideUseCase';

const rideRepo = new SupabaseRideRepository();
const authRepo = new SupabaseAuthRepository();
const useCase  = new BookRideUseCase(rideRepo, authRepo);

export function useBookRide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BookRideInput) => useCase.execute(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rides'] });
      queryClient.invalidateQueries({ queryKey: ['activeRide'] });
    },
  });
}


