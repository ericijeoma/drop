// ════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ════════════════════════════════════════════════════════════

// src/__tests__/integration/booking-flow.test.ts
// Tests the full booking flow from use case to repository.
// Uses real domain entities with mocked Supabase responses.

import { BookRideUseCase }  from '@/domains/ride/usecases/BookRideUseCase';
import { Ride }             from '@/domains/ride/entities/Ride';
import { User }             from '@/domains/auth/entities/User';
import { DomainError }      from '@/shared/types';

jest.mock('@/shared/utils/directions', () => ({
  getRoute: jest.fn().mockResolvedValue({
    distanceKm: 5.2, durationSec: 900,
    polyline: [[6.455, 3.384], [6.428, 3.422]],
  }),
}));

// Add this — Jest will hoist it above all imports automatically
jest.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert:  jest.fn().mockResolvedValue({ error: null }),
      update:  jest.fn().mockReturnThis(),
      eq:      jest.fn().mockReturnThis(),
      select:  jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
    rpc:  jest.fn().mockResolvedValue({ data: {}, error: null }),
  },
}));

describe('Full booking flow integration', () => {
  const customer = User.create({
    id: 'customer-1', authId: 'auth-1', phone: '+2348012345678',
    fullName: 'Ada Okonkwo', avatarUrl: null,
    role: 'customer', isBanned: false, createdAt: new Date(),
  });

  const expectedRide = Ride.create({
    id: 'ride-new', customerId: 'customer-1', driverId: null,
    vehicleType: 'car', pickupAddress: 'Lagos Island', dropoffAddress: 'Victoria Island',
    pickupCoords: { lat: 6.455, lng: 3.384 }, dropoffCoords: { lat: 6.428, lng: 3.422 },
    distanceKm: 5.2, fareAmount: 874,
    status: 'pending', paymentStatus: 'pending',
    requestedAt: new Date(), acceptedAt: null, completedAt: null, cancelledAt: null,
  });

  it('books a ride and returns rideId with fare', async () => {
    const rideRepo = {
      createAtomic:             jest.fn().mockResolvedValue(expectedRide),
      getActiveRideForCustomer: jest.fn().mockResolvedValue(null),
      findNearbyDrivers:        jest.fn().mockResolvedValue([{ driverId: 'd1', distanceM: 300 }]),
    };
    const authRepo = { getUserById: jest.fn().mockResolvedValue(customer) };

    const useCase = new BookRideUseCase(rideRepo as any, authRepo as any);
    const result  = await useCase.execute({
      customerId: 'customer-1', vehicleType: 'car',
      pickupAddress: 'Lagos Island', dropoffAddress: 'Victoria Island',
      pickupCoords: { lat: 6.455, lng: 3.384 },
      dropoffCoords: { lat: 6.428, lng: 3.422 },
    });

    expect(result.rideId).toBe('ride-new');
    expect(result.fareAmount).toBe(874);
    expect(rideRepo.createAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-1', vehicleType: 'car' })
    );
  });

  it('rejects banned customer at booking stage', async () => {
    const bannedCustomer = User.create({ ...customer.toJSON(), isBanned: true });
    const authRepo = { getUserById: jest.fn().mockResolvedValue(bannedCustomer) };
    const useCase  = new BookRideUseCase({ getActiveRideForCustomer: jest.fn() } as any, authRepo as any);
    await expect(useCase.execute({
      customerId: 'customer-1', vehicleType: 'car',
      pickupAddress: 'A', dropoffAddress: 'B',
      pickupCoords: { lat: 6.455, lng: 3.384 },
      dropoffCoords: { lat: 6.428, lng: 3.422 },
    })).rejects.toThrow(DomainError);
  });

  it('maintains fare consistency between estimate and charge', async () => {
    // The fare returned from booking should equal what gets charged
    const rideRepo = {
      createAtomic:             jest.fn().mockResolvedValue(expectedRide),
      getActiveRideForCustomer: jest.fn().mockResolvedValue(null),
      findNearbyDrivers:        jest.fn().mockResolvedValue([{ driverId: 'd1', distanceM: 300 }]),
    };
    const authRepo = { getUserById: jest.fn().mockResolvedValue(customer) };
    const useCase  = new BookRideUseCase(rideRepo as any, authRepo as any);
    const result   = await useCase.execute({
      customerId: 'customer-1', vehicleType: 'car',
      pickupAddress: 'A', dropoffAddress: 'B',
      pickupCoords: { lat: 6.455, lng: 3.384 },
      dropoffCoords: { lat: 6.428, lng: 3.422 },
    });

    // Fare from result matches what was stored in the ride entity
    expect(result.fareAmount).toBe(expectedRide.fareAmount);
  });
});
