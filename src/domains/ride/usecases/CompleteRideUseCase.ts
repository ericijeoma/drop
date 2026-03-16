// ────────────────────────────────────────────────────────────
// src/domains/rides/usecases/CompleteRideUseCase.ts
// ────────────────────────────────────────────────────────────

import type { RideRepository }   from '../repositories/RideRepository';
import type { DriverRepository } from '@/domains/drivers/repositories/DriverRepository';
import type { PaymentRepository } from '@/domains/payments/repositories/PaymentRepository';
import { DomainError } from '@/shared/types';
import { logger } from '@/shared/lib/logger';

export class CompleteRideUseCase {
  constructor(
    private readonly rideRepository:    RideRepository,
    private readonly driverRepository:  DriverRepository,
    private readonly paymentRepository: PaymentRepository
  ) {}

  async execute(rideId: string, driverUserId: string): Promise<void> {
    const ride = await this.rideRepository.getById(rideId);
    if (!ride) throw new DomainError('Ride not found.', 'RIDE_NOT_FOUND');

    const driver = await this.driverRepository.getByUserId(driverUserId);
    if (!driver) throw new DomainError('Driver not found.', 'DRIVER_NOT_FOUND');

    // Verify driver owns this ride
    if (ride.driverId !== driver.id) {
      throw new DomainError('You are not assigned to this ride.', 'UNAUTHORIZED');
    }

    if (!ride.isActive()) {
      throw new DomainError(
        `Cannot complete a ride with status '${ride.status}'.`,
        'RIDE_NOT_ACTIVE'
      );
    }

    // Complete the ride
    await this.rideRepository.complete(rideId);

    // Free driver back to online
    await this.driverRepository.updateStatus(driver.id, 'online');

    // Create pending payment record (actual charge via Edge Function)
    const idempotencyKey = `${rideId}:payment:${Date.now()}`;
    await this.paymentRepository.create({
      rideId:          rideId,
      orderId:         null,
      customerId:      ride.customerId,
      amount:          ride.fareAmount,
      currency:        'NGN',
      idempotencyKey,
    });

    logger.info('Ride completed', { rideId, driverId: driver.id, fare: ride.fareAmount });
  }
}


