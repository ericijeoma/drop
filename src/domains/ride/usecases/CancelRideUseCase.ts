// ────────────────────────────────────────────────────────────
// src/domains/ride/usecases/CancelRideUseCase.ts
// ────────────────────────────────────────────────────────────

import type { RideRepository }   from '../repositories/RideRepository';
import type { DriverRepository } from '@/domains/driver/repositories/DriverRepository';
import { DomainError }           from '@/shared/types';

export class CancelRideUseCase {
  constructor(
    private readonly rideRepository:   RideRepository,
    private readonly driverRepository: DriverRepository,
  ) {}

  async execute(rideId: string, driverUserId: string): Promise<void> {
    const ride = await this.rideRepository.getById(rideId);
    if (!ride) throw new DomainError('Ride not found.', 'RIDE_NOT_FOUND');

    await this.rideRepository.cancel(rideId);

    // Return driver to online — best effort, non-fatal if it fails
    const driver = await this.driverRepository.getByUserId(driverUserId);
    if (driver) {
      await this.driverRepository.updateStatus(driver.id, 'online');
    }
  }
}