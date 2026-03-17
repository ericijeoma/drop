// ────────────────────────────────────────────────────────────
// src/domains/rides/usecases/AcceptRideUseCase.ts
// ────────────────────────────────────────────────────────────

import type { RideRepository } from '../repositories/RideRepository';
import type { DriverRepository } from '@/domains/driver/repositories/DriverRepository';
import { DomainError } from '@/shared/types';
import { logger } from '@/shared/lib/logger';

export class AcceptRideUseCase {
  constructor(
    private readonly rideRepository:   RideRepository,
    private readonly driverRepository: DriverRepository
  ) {}

  async execute(rideId: string, driverUserId: string): Promise<{ rideId: string }> {
    // 1. Validate driver exists and can accept rides
    const driver = await this.driverRepository.getByUserId(driverUserId);
    if (!driver) throw new DomainError('Driver profile not found.', 'DRIVER_NOT_FOUND');

    if (!driver.canAcceptRide()) {
      throw new DomainError(
        driver.isBusy()
          ? 'You already have an active trip. Complete it before accepting another.'
          : 'You must be online to accept rides.',
        'DRIVER_CANNOT_ACCEPT'
      );
    }

    // 2. Accept atomically — advisory lock in SQL prevents race condition
    // where two drivers try to accept the same ride simultaneously
    try {
      const ride = await this.rideRepository.acceptRideAtomic(rideId, driver.id);
      logger.info('Ride accepted', { rideId: ride.id, driverId: driver.id });
      return { rideId: ride.id };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'RIDE_NOT_AVAILABLE') {
          throw new DomainError(
            'This ride was already accepted by another driver.',
            'RIDE_NOT_AVAILABLE'
          );
        }
        if (error.message === 'DRIVER_HAS_ACTIVE_RIDE') {
          throw new DomainError(
            'You have an active ride. Complete it first.',
            'DRIVER_HAS_ACTIVE_RIDE'
          );
        }
      }
      throw error;
    }
  }
}


