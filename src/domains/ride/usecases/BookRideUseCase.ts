// src/domains/rides/usecases/BookRideUseCase.ts

import type { RideRepository } from '../repositories/RideRepository';
import type { AuthRepository } from '@/domains/auth/repositories/AuthRepository';
import { getRoute } from '@/shared/utils/directions';
import { calculateFare } from '@/shared/utils/fare';
import { RidePolicy } from '../entities/RidePolicy';
import { DomainError } from '@/shared/types';
import type { VehicleType, Coords } from '@/shared/types';
import { logger } from '@/shared/lib/logger';

export interface BookRideInput {
  readonly customerId:    string;
  readonly vehicleType:   VehicleType;
  readonly pickupAddress: string;
  readonly dropoffAddress: string;
  readonly pickupCoords:  Coords;
  readonly dropoffCoords: Coords;
}

export interface BookRideOutput {
  readonly rideId:      string;
  readonly fareAmount:  number;
  readonly distanceKm:  number;
  readonly isSurge:     boolean;
  readonly driverEta?:  number;
}

export class BookRideUseCase {
  constructor(
    private readonly rideRepository: RideRepository,
    private readonly authRepository: AuthRepository
  ) {}

  async execute(input: BookRideInput): Promise<BookRideOutput> {
    // 1. Validate customer exists and is not banned
    const user = await this.authRepository.getUserById(input.customerId);
    if (!user) throw new DomainError('Customer not found.', 'USER_NOT_FOUND');
    user.assertNotBanned();
    user.assertIsCustomer();

    // 2. Check customer has no active ride (business rule)
    const activeRide = await this.rideRepository.getActiveRideForCustomer(input.customerId);
    if (activeRide) {
      throw new DomainError(
        'You already have an active ride. Complete or cancel it first.',
        'CUSTOMER_HAS_ACTIVE_RIDE'
      );
    }

    // 3. Get road distance from OSRM (not straight-line)
    const route = await getRoute(input.pickupCoords, input.dropoffCoords);
    if (route.distanceKm < 0.1) {
      throw new DomainError(
        'Pickup and dropoff are too close together.',
        'DISTANCE_TOO_SHORT'
      );
    }

    // 4. Calculate fare — Programming Pearls: correct algorithm before optimizing
    const fareBreakdown = calculateFare(route.distanceKm, input.vehicleType);

    // 5. Find nearby drivers to check availability (escalating radius)
    let nearbyDrivers = [];
    for (const radiusKm of RidePolicy.MATCHING_RADII_KM) {
      nearbyDrivers = await this.rideRepository.findNearbyDrivers(
        input.pickupCoords,
        radiusKm * 1000,
        input.vehicleType
      );
      if (nearbyDrivers.length > 0) break;
    }

    if (nearbyDrivers.length === 0) {
      throw new DomainError(
        'No drivers available in your area. Please try again shortly.',
        'NO_DRIVERS_AVAILABLE'
      );
    }

    // 6. Create ride atomically (advisory lock prevents race conditions)
    const ride = await this.rideRepository.createAtomic({
      customerId:      input.customerId,
      vehicleType:     input.vehicleType,
      pickupAddress:   input.pickupAddress,
      dropoffAddress:  input.dropoffAddress,
      pickupCoords:    input.pickupCoords,
      dropoffCoords:   input.dropoffCoords,
      distanceKm:      route.distanceKm,
      fareAmount:      fareBreakdown.totalFare,
    });

    logger.info('Ride booked', {
      rideId:    ride.id,
      customerId: input.customerId,
      fare:      fareBreakdown.totalFare,
      isSurge:   fareBreakdown.isSurge,
    });

    return {
      rideId:     ride.id,
      fareAmount: ride.fareAmount,
      distanceKm: ride.distanceKm,
      isSurge:    fareBreakdown.isSurge,
      driverEta:  nearbyDrivers[0] ? Math.round(nearbyDrivers[0].distanceM / 500 * 60) : undefined,
    };
  }
}


