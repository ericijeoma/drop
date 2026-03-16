// ────────────────────────────────────────────────────────────
// src/domains/rides/usecases/RateDriverUseCase.ts
// ────────────────────────────────────────────────────────────

import { supabase } from '@/shared/lib/supabase';
import type { RideRepository } from '../repositories/RideRepository';
import { DomainError } from '@/shared/types';

export class RateDriverUseCase {
  constructor(private readonly rideRepository: RideRepository) {}

  async execute(input: {
    rideId:     string;
    customerId: string;
    score:      number;
    comment?:   string;
  }): Promise<void> {
    if (input.score < 1 || input.score > 5) {
      throw new DomainError('Rating must be between 1 and 5.', 'INVALID_RATING');
    }

    const ride = await this.rideRepository.getById(input.rideId);
    if (!ride) throw new DomainError('Ride not found.', 'RIDE_NOT_FOUND');
    if (!ride.isCompleted()) throw new DomainError('Can only rate completed rides.', 'RIDE_NOT_COMPLETED');
    if (ride.customerId !== input.customerId) throw new DomainError('Unauthorized.', 'UNAUTHORIZED');
    if (!ride.driverId) throw new DomainError('No driver on this ride.', 'NO_DRIVER');

    // Upsert — idempotent
    const { error } = await supabase.from('ratings').upsert({
      ride_id:     input.rideId,
      customer_id: input.customerId,
      driver_id:   ride.driverId,
      score:       input.score,
      comment:     input.comment ?? null,
    }, { onConflict: 'ride_id,customer_id' });

    if (error) throw error;

    // Recalculate driver average rating
    const { data } = await supabase
      .from('ratings')
      .select('score')
      .eq('driver_id', ride.driverId);

    if (data && data.length > 0) {
      const avg = data.reduce((sum, r) => sum + r.score, 0) / data.length;
      await supabase
        .from('drivers')
        .update({ rating: Math.round(avg * 100) / 100 })
        .eq('id', ride.driverId);
    }
  }
}


