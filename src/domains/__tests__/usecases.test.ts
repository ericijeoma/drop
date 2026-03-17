// src/domains/__tests__/usecases.test.ts
// Unit tests for all use cases.
// All repositories are mocked — zero Supabase calls, zero network.
// Run with: npm test -- --testPathPattern=usecases

import { BookRideUseCase }            from '../ride/usecases/BookRideUseCase';
import { AcceptRideUseCase }          from '../ride/usecases/AcceptRideUseCase';
import { CompleteRideUseCase }        from '../ride/usecases/CompleteRideUseCase';
import { PlaceOrderUseCase }          from '../delivery/usecases/PlaceOrderUseCase';
import { ConfirmDeliveryUseCase }     from '../delivery/usecases/ConfirmDeliveryUseCase';
import { UpdateDriverStatusUseCase }  from '../driver/usecases/UpdateDriverStatusUseCase';
import { LoginUseCase }               from '../auth/usecases/LoginUseCase';
import { Ride }                       from '../ride/entities/Ride';
import { Order }                      from '../delivery/entities/Order';
import { DriverProfile }              from '../driver/entities/DriverProfile';
import { User }                       from '../auth/entities/User';


// ── Mock factories ───────────────────────────────────────────

function makeCustomer(overrides = {}): User {
  return User.create({
    id: 'customer-1', authId: 'auth-1', phone: '+2348012345678',
    fullName: 'Test Customer', avatarUrl: null, role: 'customer',
    isBanned: false, createdAt: new Date(), ...overrides,
  });
}

function makePendingRide(overrides = {}): Ride {
  return Ride.create({
    id: 'ride-1', customerId: 'customer-1', driverId: null,
    vehicleType: 'car', pickupAddress: 'Pickup', dropoffAddress: 'Dropoff',
    pickupCoords: { lat: 6.4550, lng: 3.3841 },
    dropoffCoords: { lat: 6.4281, lng: 3.4219 },
    distanceKm: 5.2, fareAmount: 874, status: 'pending',
    paymentStatus: 'pending', requestedAt: new Date(),
    acceptedAt: null, completedAt: null, cancelledAt: null, ...overrides,
  });
}

function makeActiveRide(overrides = {}): Ride {
  return makePendingRide({ ...overrides, status: 'active', driverId: 'driver-1' });
}

function makeCompletedRide(overrides = {}): Ride {
  return makePendingRide({ ...overrides, status: 'completed', driverId: 'driver-1' });
}

function makeDriver(overrides = {}): DriverProfile {
  return DriverProfile.create({
    id: 'driver-1', userId: 'user-2', vehicleType: 'car',
    vehiclePlate: 'LAG-001-AA', vehicleModel: 'Toyota Camry',
    status: 'online', currentLocation: { lat: 6.45, lng: 3.38 },
    rating: 4.8, totalTrips: 120, isVerified: true, fcmToken: null,
    ...overrides,
  });
}

function makeOrder(overrides = {}): Order {
  return Order.create({
    id: 'order-1', customerId: 'customer-1', driverId: null,
    status: 'pending', pickupAddress: 'Pickup', dropoffAddress: 'Dropoff',
    pickupCoords: { lat: 6.4550, lng: 3.3841 },
    dropoffCoords: { lat: 6.4281, lng: 3.4219 },
    packageDescription: 'Documents', packageSize: 'small',
    deliveryPhotoUrl: null, distanceKm: 4.5, fareAmount: 650,
    paymentStatus: 'pending', requestedAt: new Date(), deliveredAt: null,
    ...overrides,
  });
}

// ── Mock repository builders ─────────────────────────────────

function mockRideRepo(overrides = {}) {
  return {
    createAtomic:              jest.fn().mockResolvedValue(makePendingRide()),
    getById:                   jest.fn().mockResolvedValue(makePendingRide()),
    getActiveRideForCustomer:  jest.fn().mockResolvedValue(null),
    getPendingRides:           jest.fn().mockResolvedValue([]),
    getHistoryForCustomer:     jest.fn().mockResolvedValue({ data: [], total: 0, hasMore: false }),
    getAssignedRidesForDriver: jest.fn().mockResolvedValue([]),
    acceptRideAtomic:          jest.fn().mockResolvedValue(makeActiveRide()),
    complete:                  jest.fn().mockResolvedValue(makeCompletedRide()),
    cancel:                    jest.fn().mockResolvedValue(makePendingRide({ status: 'cancelled' })),
    findNearbyDrivers:         jest.fn().mockResolvedValue([{ driverId: 'driver-1', userId: 'user-2', distanceM: 500, vehicleType: 'car', rating: 4.8 }]),
    updateDriverLocation:      jest.fn().mockResolvedValue(undefined),
    getAllRides:                jest.fn().mockResolvedValue({ data: [], total: 0, hasMore: false }),
    ...overrides,
  };
}

function mockAuthRepo(overrides = {}) {
  return {
    getCurrentUser:  jest.fn().mockResolvedValue(makeCustomer()),
    getUserByPhone:  jest.fn().mockResolvedValue(makeCustomer()),
    getUserById:     jest.fn().mockResolvedValue(makeCustomer()),
    sendOtp:         jest.fn().mockResolvedValue(undefined),
    verifyOtp:       jest.fn().mockResolvedValue(makeCustomer()),
    signOut:         jest.fn().mockResolvedValue(undefined),
    updateProfile:   jest.fn().mockResolvedValue(makeCustomer()),
    ...overrides,
  };
}

function mockDriverRepo(overrides = {}) {
  return {
    getByUserId:    jest.fn().mockResolvedValue(makeDriver()),
    getById:        jest.fn().mockResolvedValue(makeDriver()),
    create:         jest.fn().mockResolvedValue(makeDriver()),
    updateStatus:   jest.fn().mockResolvedValue(makeDriver()),
    updateLocation: jest.fn().mockResolvedValue(undefined),
    updateFcmToken: jest.fn().mockResolvedValue(undefined),
    getAll:         jest.fn().mockResolvedValue({ data: [], total: 0, hasMore: false }),
    setVerified:    jest.fn().mockResolvedValue(makeDriver()),
    ...overrides,
  };
}

function mockOrderRepo(overrides = {}) {
  return {
    createAtomic:               jest.fn().mockResolvedValue(makeOrder()),
    getById:                    jest.fn().mockResolvedValue(makeOrder()),
    getActiveOrderForCustomer:  jest.fn().mockResolvedValue(null),
    getPendingOrders:           jest.fn().mockResolvedValue([]),
    getHistoryForCustomer:      jest.fn().mockResolvedValue({ data: [], total: 0, hasMore: false }),
    acceptOrderAtomic:          jest.fn().mockResolvedValue(makeOrder({ status: 'assigned', driverId: 'driver-1' })),
    confirmDelivery:            jest.fn().mockResolvedValue(makeOrder({ status: 'delivered' })),
    cancel:                     jest.fn().mockResolvedValue(makeOrder({ status: 'cancelled' })),
    updateStatus:               jest.fn().mockResolvedValue(makeOrder()),
    getAllOrders:                jest.fn().mockResolvedValue({ data: [], total: 0, hasMore: false }),
    ...overrides,
  };
}

function mockPaymentRepo(overrides = {}) {
  return {
    create:              jest.fn().mockResolvedValue({}),
    getById:             jest.fn().mockResolvedValue(null),
    getByIdempotencyKey: jest.fn().mockResolvedValue(null),
    updateStatus:        jest.fn().mockResolvedValue({}),
    getByRideId:         jest.fn().mockResolvedValue(null),
    getByOrderId:        jest.fn().mockResolvedValue(null),
    getAll:              jest.fn().mockResolvedValue({ data: [], total: 0, hasMore: false }),
    ...overrides,
  };
}

// Mock the directions utility to avoid real network calls
jest.mock('@/shared/utils/directions', () => ({
  getRoute: jest.fn().mockResolvedValue({
    distanceKm: 5.2,
    durationSec: 900,
    polyline: [[6.4550, 3.3841], [6.4281, 3.4219]],
  }),
  haversineKm: jest.fn().mockReturnValue(4.0),
}));

// Mock supabase for use cases that call it directly
jest.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from:  () => ({ upsert: jest.fn().mockResolvedValue({ error: null }), update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), select: jest.fn().mockResolvedValue({ data: [{ score: 5 }], error: null }) }),
    auth:  { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
    rpc:   jest.fn().mockResolvedValue({ data: {}, error: null }),
  },
}));

// ── BookRideUseCase tests ────────────────────────────────────

describe('BookRideUseCase', () => {
  const validInput = {
    customerId:     'customer-1',
    vehicleType:    'car' as const,
    pickupAddress:  '1 Lagos Island',
    dropoffAddress: '2 Victoria Island',
    pickupCoords:   { lat: 6.4550, lng: 3.3841 },
    dropoffCoords:  { lat: 6.4281, lng: 3.4219 },
  };

  it('successfully books a ride', async () => {
    const useCase = new BookRideUseCase(mockRideRepo(), mockAuthRepo());
    const result  = await useCase.execute(validInput);
    expect(result.rideId).toBe('ride-1');
    expect(result.fareAmount).toBeGreaterThan(0);
  });

  it('throws if customer is banned', async () => {
    const authRepo = mockAuthRepo({
      getUserById: jest.fn().mockResolvedValue(makeCustomer({ isBanned: true })),
    });
    const useCase = new BookRideUseCase(mockRideRepo(), authRepo);
    await expect(useCase.execute(validInput)).rejects.toThrow('USER_BANNED');
  });

  it('throws if customer already has active ride', async () => {
    const rideRepo = mockRideRepo({
      getActiveRideForCustomer: jest.fn().mockResolvedValue(makeActiveRide()),
    });
    const useCase = new BookRideUseCase(rideRepo, mockAuthRepo());
    await expect(useCase.execute(validInput))
      .rejects.toThrow('CUSTOMER_HAS_ACTIVE_RIDE');
  });

  it('throws if no drivers available', async () => {
    const rideRepo = mockRideRepo({
      findNearbyDrivers: jest.fn().mockResolvedValue([]),
    });
    const useCase = new BookRideUseCase(rideRepo, mockAuthRepo());
    await expect(useCase.execute(validInput))
      .rejects.toThrow('NO_DRIVERS_AVAILABLE');
  });

  it('throws if customer is not found', async () => {
    const authRepo = mockAuthRepo({
      getUserById: jest.fn().mockResolvedValue(null),
    });
    const useCase = new BookRideUseCase(mockRideRepo(), authRepo);
    await expect(useCase.execute(validInput)).rejects.toThrow('USER_NOT_FOUND');
  });

  it('throws if user is a driver, not a customer', async () => {
    const authRepo = mockAuthRepo({
      getUserById: jest.fn().mockResolvedValue(makeCustomer({ role: 'driver' })),
    });
    const useCase = new BookRideUseCase(mockRideRepo(), authRepo);
    await expect(useCase.execute(validInput)).rejects.toThrow('NOT_CUSTOMER');
  });

  it('calls createAtomic with correct parameters', async () => {
    const rideRepo = mockRideRepo();
    const useCase  = new BookRideUseCase(rideRepo, mockAuthRepo());
    await useCase.execute(validInput);
    expect(rideRepo.createAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId:    'customer-1',
        vehicleType:   'car',
        pickupAddress: '1 Lagos Island',
      })
    );
  });
});

// ── AcceptRideUseCase tests ──────────────────────────────────

describe('AcceptRideUseCase', () => {
  it('accepts a ride successfully', async () => {
    const useCase = new AcceptRideUseCase(mockRideRepo(), mockDriverRepo());
    await expect(useCase.execute('ride-1', 'user-2')).resolves.toEqual({ rideId: 'ride-1' });
  });

  it('throws if driver not found', async () => {
    const driverRepo = mockDriverRepo({ getByUserId: jest.fn().mockResolvedValue(null) });
    const useCase = new AcceptRideUseCase(mockRideRepo(), driverRepo);
    await expect(useCase.execute('ride-1', 'unknown-user')).rejects.toThrow('DRIVER_NOT_FOUND');
  });

  it('throws if driver is offline', async () => {
    const offlineDriver = DriverProfile.createUnverified({
      id: 'driver-1', userId: 'user-2', vehicleType: 'car',
      vehiclePlate: 'LAG-001-AA', vehicleModel: 'Toyota Camry',
      status: 'offline', currentLocation: null,
      rating: 4.8, totalTrips: 10, isVerified: true, fcmToken: null,
    });
    const driverRepo = mockDriverRepo({ getByUserId: jest.fn().mockResolvedValue(offlineDriver) });
    const useCase    = new AcceptRideUseCase(mockRideRepo(), driverRepo);
    await expect(useCase.execute('ride-1', 'user-2')).rejects.toThrow('DRIVER_CANNOT_ACCEPT');
  });

  it('throws RIDE_NOT_AVAILABLE when another driver already accepted', async () => {
    const rideRepo = mockRideRepo({
      acceptRideAtomic: jest.fn().mockRejectedValue(new Error('RIDE_NOT_AVAILABLE')),
    });
    const useCase = new AcceptRideUseCase(rideRepo, mockDriverRepo());
    await expect(useCase.execute('ride-1', 'user-2')).rejects.toThrow('RIDE_NOT_AVAILABLE');
  });
});

// ── CompleteRideUseCase tests ────────────────────────────────

describe('CompleteRideUseCase', () => {
  it('completes a ride and frees the driver', async () => {
    const rideRepo    = mockRideRepo({ getById: jest.fn().mockResolvedValue(makeActiveRide()) });
    const driverRepo  = mockDriverRepo();
    const paymentRepo = mockPaymentRepo();
    const useCase     = new CompleteRideUseCase(rideRepo, driverRepo, paymentRepo);

    await expect(useCase.execute('ride-1', 'user-2')).resolves.toBeUndefined();
    expect(driverRepo.updateStatus).toHaveBeenCalledWith('driver-1', 'online');
    expect(paymentRepo.create).toHaveBeenCalledTimes(1);
  });

  it('throws if driver does not own the ride', async () => {
    const ride        = makeActiveRide({ driverId: 'different-driver' });
    const rideRepo    = mockRideRepo({ getById: jest.fn().mockResolvedValue(ride) });
    const useCase     = new CompleteRideUseCase(rideRepo, mockDriverRepo(), mockPaymentRepo());
    await expect(useCase.execute('ride-1', 'user-2')).rejects.toThrow('UNAUTHORIZED');
  });

  it('throws if ride is not active', async () => {
    const rideRepo = mockRideRepo({ getById: jest.fn().mockResolvedValue(makePendingRide()) });
    const useCase  = new CompleteRideUseCase(rideRepo, mockDriverRepo(), mockPaymentRepo());
    await expect(useCase.execute('ride-1', 'user-2')).rejects.toThrow('RIDE_NOT_ACTIVE');
  });

  it('creates a payment record on completion', async () => {
    const rideRepo    = mockRideRepo({ getById: jest.fn().mockResolvedValue(makeActiveRide()) });
    const paymentRepo = mockPaymentRepo();
    const useCase     = new CompleteRideUseCase(rideRepo, mockDriverRepo(), paymentRepo);
    await useCase.execute('ride-1', 'user-2');
    expect(paymentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ rideId: 'ride-1', amount: 874 })
    );
  });
});

// ── PlaceOrderUseCase tests ──────────────────────────────────

describe('PlaceOrderUseCase', () => {
  const validInput = {
    customerId:         'customer-1',
    pickupAddress:      '1 Lagos Island',
    dropoffAddress:     '2 Victoria Island',
    pickupCoords:       { lat: 6.4550, lng: 3.3841 },
    dropoffCoords:      { lat: 6.4281, lng: 3.4219 },
    packageDescription: 'Important documents',
    packageSize:        'small' as const,
  };

  it('places an order successfully', async () => {
    const useCase = new PlaceOrderUseCase(mockOrderRepo(), mockAuthRepo(), mockRideRepo());
    const result  = await useCase.execute(validInput);
    expect(result.orderId).toBe('order-1');
    expect(result.fareAmount).toBeGreaterThan(0);
  });

  it('throws if customer has active ride', async () => {
    const rideRepo = mockRideRepo({
      getActiveRideForCustomer: jest.fn().mockResolvedValue(makeActiveRide()),
    });
    const useCase = new PlaceOrderUseCase(mockOrderRepo(), mockAuthRepo(), rideRepo);
    await expect(useCase.execute(validInput)).rejects.toThrow('CUSTOMER_HAS_ACTIVE_RIDE');
  });

  it('throws if customer already has active order', async () => {
    const orderRepo = mockOrderRepo({
      getActiveOrderForCustomer: jest.fn().mockResolvedValue(makeOrder({ status: 'assigned' })),
    });
    const useCase = new PlaceOrderUseCase(orderRepo, mockAuthRepo(), mockRideRepo());
    await expect(useCase.execute(validInput)).rejects.toThrow('CUSTOMER_HAS_ACTIVE_ORDER');
  });

  it('throws if package description is empty', async () => {
    const useCase = new PlaceOrderUseCase(mockOrderRepo(), mockAuthRepo(), mockRideRepo());
    await expect(useCase.execute({ ...validInput, packageDescription: '   ' }))
      .rejects.toThrow('MISSING_PACKAGE_DESC');
  });
});

// ── ConfirmDeliveryUseCase tests ─────────────────────────────

describe('ConfirmDeliveryUseCase', () => {
  it('confirms delivery with photo', async () => {
    const order     = makeOrder({ status: 'in_transit', driverId: 'driver-1' });
    const orderRepo = mockOrderRepo({ getById: jest.fn().mockResolvedValue(order) });
    const useCase   = new ConfirmDeliveryUseCase(orderRepo, mockDriverRepo(), mockPaymentRepo());
    await expect(useCase.execute('order-1', 'user-2', 'https://cdn.drop.com/photo.jpg'))
      .resolves.toBeUndefined();
  });

  it('throws if photo URL is empty', async () => {
    const useCase = new ConfirmDeliveryUseCase(mockOrderRepo(), mockDriverRepo(), mockPaymentRepo());
    await expect(useCase.execute('order-1', 'user-2', '')).rejects.toThrow('MISSING_PHOTO');
  });

  it('throws if order is not in_transit', async () => {
    const order     = makeOrder({ status: 'pending', driverId: 'driver-1' });
    const orderRepo = mockOrderRepo({ getById: jest.fn().mockResolvedValue(order) });
    const useCase   = new ConfirmDeliveryUseCase(orderRepo, mockDriverRepo(), mockPaymentRepo());
    await expect(useCase.execute('order-1', 'user-2', 'https://cdn.drop.com/photo.jpg'))
      .rejects.toThrow('ORDER_NOT_IN_TRANSIT');
  });
});

// ── UpdateDriverStatusUseCase tests ─────────────────────────

describe('UpdateDriverStatusUseCase', () => {
  it('sets driver online', async () => {
    const driverRepo = mockDriverRepo();
    const useCase    = new UpdateDriverStatusUseCase(driverRepo);
    await useCase.execute('user-2', 'online');
    expect(driverRepo.updateStatus).toHaveBeenCalledWith('driver-1', 'online');
  });

  it('throws if driver not found', async () => {
    const driverRepo = mockDriverRepo({ getByUserId: jest.fn().mockResolvedValue(null) });
    const useCase    = new UpdateDriverStatusUseCase(driverRepo);
    await expect(useCase.execute('unknown', 'online')).rejects.toThrow('DRIVER_NOT_FOUND');
  });

  it('throws if going offline while busy', async () => {
    const busyDriver = DriverProfile.create({
      id: 'driver-1', userId: 'user-2', vehicleType: 'car',
      vehiclePlate: 'LAG-001', vehicleModel: 'Toyota',
      status: 'busy', currentLocation: null,
      rating: 4.8, totalTrips: 10, isVerified: true, fcmToken: null,
    });
    const driverRepo = mockDriverRepo({ getByUserId: jest.fn().mockResolvedValue(busyDriver) });
    const useCase    = new UpdateDriverStatusUseCase(driverRepo);
    await expect(useCase.execute('user-2', 'offline')).rejects.toThrow('DRIVER_BUSY');
  });
});

// ── LoginUseCase tests ───────────────────────────────────────

describe('LoginUseCase', () => {
  it('sendOtp succeeds with valid phone', async () => {
    const authRepo = mockAuthRepo();
    const useCase  = new LoginUseCase(authRepo);
    await expect(useCase.sendOtp('+2348012345678')).resolves.toBeUndefined();
    expect(authRepo.sendOtp).toHaveBeenCalledWith('+2348012345678');
  });

  it('sendOtp throws with invalid phone', async () => {
    const useCase = new LoginUseCase(mockAuthRepo());
    await expect(useCase.sendOtp('08012345678')).rejects.toThrow('INVALID_PHONE');
  });

  it('verifyOtp throws if token is not 6 digits', async () => {
    const useCase = new LoginUseCase(mockAuthRepo());
    await expect(useCase.verifyOtp('+2348012345678', '123')).rejects.toThrow('INVALID_OTP');
  });

  it('verifyOtp returns user on success', async () => {
    const authRepo = mockAuthRepo();
    const useCase  = new LoginUseCase(authRepo);
    const user     = await useCase.verifyOtp('+2348012345678', '123456');
    expect(user.phone).toBe('+2348012345678');
  });

  it('verifyOtp throws if returned user is banned', async () => {
    const authRepo = mockAuthRepo({
      verifyOtp: jest.fn().mockResolvedValue(makeCustomer({ isBanned: true })),
    });
    const useCase = new LoginUseCase(authRepo);
    await expect(useCase.verifyOtp('+2348012345678', '123456')).rejects.toThrow('USER_BANNED');
  });
});