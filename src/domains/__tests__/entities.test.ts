// src/domains/__tests__/entities.test.ts
// Unit tests for all domain entities.
// These run with: npm test -- --testPathPattern=entities
// Zero external dependencies — pure TypeScript logic.

import { User } from "../auth/entities/User";
import { Ride } from "../ride/entities/Ride";
import { RidePolicy } from "../ride/entities/RidePolicy";
import { Order } from "../delivery/entities/Order";
import { DriverProfile } from "../driver/entities/DriverProfile";
import { Payment } from "../payment/entities/Payment";
import { DomainError } from "@/shared/types";

// ── Fixtures ─────────────────────────────────────────────────

const validPhone = "+2348012345678";

const validUserProps = {
  id: "user-1",
  authId: "auth-1",
  phone: validPhone,
  fullName: "Test User",
  avatarUrl: null,
  role: "customer" as const,
  isBanned: false,
  createdAt: new Date(),
};

const validRideProps = {
  id: "ride-1",
  customerId: "customer-1",
  driverId: null,
  vehicleType: "car" as const,
  pickupAddress: "1 Lagos Island",
  dropoffAddress: "2 Victoria Island",
  pickupCoords: { lat: 6.455, lng: 3.3841 },
  dropoffCoords: { lat: 6.4281, lng: 3.4219 },
  distanceKm: 5.2,
  fareAmount: 874,
  status: "pending" as const,
  paymentStatus: "pending" as const,
  requestedAt: new Date(),
  acceptedAt: null,
  completedAt: null,
  cancelledAt: null,
};

const validDriverProps = {
  id: "driver-1",
  userId: "user-2",
  vehicleType: "car" as const,
  vehiclePlate: "LAG-001-AA",
  vehicleModel: "Toyota Camry",
  status: "offline" as const,
  currentLocation: null,
  rating: 4.8,
  totalTrips: 120,
  isVerified: true,
  fcmToken: null,
};

// ── User tests ───────────────────────────────────────────────

describe("User entity", () => {
  it("creates a valid user", () => {
    const user = User.create(validUserProps);
    expect(user.phone).toBe(validPhone);
    expect(user.role).toBe("customer");
    expect(user.isBanned).toBe(false);
  });

  it("rejects invalid phone number — no country code", () => {
    expect(() =>
      User.create({ ...validUserProps, phone: "08012345678" }),
    ).toThrow(DomainError);
  });

  it("rejects invalid phone number — letters", () => {
    expect(() =>
      User.create({ ...validUserProps, phone: "+234abcdefg" }),
    ).toThrow(DomainError);
  });

  it("rejects invalid phone number — too short", () => {
    expect(() => User.create({ ...validUserProps, phone: "+2341234" })).toThrow(
      DomainError,
    );
  });

  it("assertNotBanned throws for banned user", () => {
    const user = User.create({ ...validUserProps, isBanned: true });
    expect(() => user.assertNotBanned()).toThrow(DomainError);
    expect(() => user.assertNotBanned()).toThrow("suspended");
  });

  it("assertNotBanned passes for active user", () => {
    const user = User.create(validUserProps);
    expect(() => user.assertNotBanned()).not.toThrow();
  });

  it("isCustomer returns true for customer role", () => {
    const user = User.create({ ...validUserProps, role: "customer" });
    expect(user.isCustomer()).toBe(true);
    expect(user.isDriver()).toBe(false);
    expect(user.isAdmin()).toBe(false);
  });

  it("isAdmin returns true for admin role", () => {
    const user = User.create({ ...validUserProps, role: "admin" });
    expect(user.isAdmin()).toBe(true);
  });

  it("assertIsCustomer throws for driver role", () => {
    const user = User.create({ ...validUserProps, role: "driver" });
    expect(() => user.assertIsCustomer()).toThrow(DomainError);
  });
});

// ── Ride entity tests ────────────────────────────────────────

describe("Ride entity", () => {
  it("creates a valid ride", () => {
    const ride = Ride.create(validRideProps);
    expect(ride.status).toBe("pending");
    expect(ride.driverId).toBeNull();
    expect(ride.fareAmount).toBe(874);
  });

  it("rejects zero fare", () => {
    expect(() => Ride.create({ ...validRideProps, fareAmount: 0 })).toThrow(
      DomainError,
    );
  });

  it("rejects negative fare", () => {
    expect(() => Ride.create({ ...validRideProps, fareAmount: -100 })).toThrow(
      DomainError,
    );
  });

  it("rejects zero distance", () => {
    expect(() => Ride.create({ ...validRideProps, distanceKm: 0 })).toThrow(
      DomainError,
    );
  });

  it("rejects same pickup and dropoff", () => {
    const sameCoords = { lat: 6.455, lng: 3.3841 };
    expect(() =>
      Ride.create({
        ...validRideProps,
        pickupCoords: sameCoords,
        dropoffCoords: sameCoords,
      }),
    ).toThrow(DomainError);
  });

  it("rejects distance > 500km", () => {
    expect(() => Ride.create({ ...validRideProps, distanceKm: 501 })).toThrow(
      DomainError,
    );
  });

  describe("State transitions", () => {
    it("pending → active is allowed", () => {
      const ride = Ride.create(validRideProps);
      expect(() => ride.transition("active")).not.toThrow();
      expect(ride.status).toBe("active");
    });

    it("pending → cancelled is allowed", () => {
      const ride = Ride.create(validRideProps);
      ride.transition("cancelled");
      expect(ride.isCancelled()).toBe(true);
      expect(ride.cancelledAt).not.toBeNull();
    });

    it("active → completed is allowed", () => {
      const ride = Ride.create(validRideProps);
      ride.transition("active");
      ride.transition("completed");
      expect(ride.isCompleted()).toBe(true);
      expect(ride.completedAt).not.toBeNull();
    });

    it("completed → active is ILLEGAL", () => {
      const ride = Ride.create(validRideProps);
      ride.transition("active");
      ride.transition("completed");
      expect(() => ride.transition("active")).toThrow(DomainError);
      expect(() => ride.transition("active")).toThrow(
        "INVALID_RIDE_TRANSITION",
      );
    });

    it("cancelled → active is ILLEGAL", () => {
      const ride = Ride.create(validRideProps);
      ride.transition("cancelled");
      expect(() => ride.transition("active")).toThrow(DomainError);
    });

    it("completed → cancelled is ILLEGAL", () => {
      const ride = Ride.create(validRideProps);
      ride.transition("active");
      ride.transition("completed");
      expect(() => ride.transition("cancelled")).toThrow(DomainError);
    });

    it("pending → completed is ILLEGAL (must go through active)", () => {
      const ride = Ride.create(validRideProps);
      expect(() => ride.transition("completed")).toThrow(DomainError);
    });
  });

  it("assignDriver sets driverId and transitions to active", () => {
    const ride = Ride.create(validRideProps);
    ride.assignDriver("driver-1");
    expect(ride.driverId).toBe("driver-1");
    expect(ride.status).toBe("active");
    expect(ride.acceptedAt).not.toBeNull();
  });

  it("assignDriver on non-pending ride throws", () => {
    const ride = Ride.create({ ...validRideProps, status: "active" });
    expect(() => ride.assignDriver("driver-1")).toThrow(DomainError);
  });

  it("markPaymentCaptured on completed ride succeeds", () => {
    const ride = Ride.create(validRideProps);
    ride.transition("active");
    ride.transition("completed");
    expect(() => ride.markPaymentCaptured()).not.toThrow();
    expect(ride.paymentStatus).toBe("captured");
  });

  it("markPaymentCaptured on non-completed ride throws", () => {
    const ride = Ride.create(validRideProps);
    expect(() => ride.markPaymentCaptured()).toThrow(DomainError);
  });

  it("isTerminal returns true for completed, cancelled, timed_out", () => {
    const completed = Ride.create({ ...validRideProps, status: "completed" });
    const cancelled = Ride.create({ ...validRideProps, status: "cancelled" });
    expect(completed.isTerminal()).toBe(true);
    expect(cancelled.isTerminal()).toBe(true);
  });

  // Priority 2 — timed_out is a real terminal state
  it("pending → timed_out is allowed", () => {
    const ride = Ride.create(validRideProps);
    expect(() => ride.transition("timed_out")).not.toThrow();
    expect(ride.isTerminal()).toBe(true);
  });
});

// ── RidePolicy tests ─────────────────────────────────────────

describe("RidePolicy", () => {
  it("has minimum fares greater than zero for all vehicle types", () => {
    Object.values(RidePolicy.MIN_FARE).forEach((fare) => {
      expect(fare).toBeGreaterThan(0);
    });
  });

  it("has rate per km for all vehicle types", () => {
    const vehicleTypes: (keyof typeof RidePolicy.RATE_PER_KM)[] = [
      "motorbike",
      "car",
      "van",
    ];
    vehicleTypes.forEach((v) => {
      expect(RidePolicy.RATE_PER_KM[v]).toBeGreaterThan(0);
    });
  });

  it("minimum fare for van > car > motorbike", () => {
    expect(RidePolicy.MIN_FARE.van).toBeGreaterThan(RidePolicy.MIN_FARE.car);
    expect(RidePolicy.MIN_FARE.car).toBeGreaterThan(
      RidePolicy.MIN_FARE.motorbike,
    );
  });

  it("driver commission rate is between 0 and 1", () => {
    expect(RidePolicy.DRIVER_COMMISSION_RATE).toBeGreaterThan(0);
    expect(RidePolicy.DRIVER_COMMISSION_RATE).toBeLessThan(1);
  });

  it("matching radii are in ascending order", () => {
    const radii = [...RidePolicy.MATCHING_RADII_KM];
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
    }
  });
});

// ── DriverProfile tests ──────────────────────────────────────

describe("DriverProfile entity", () => {
  it("creates a verified driver", () => {
    const driver = DriverProfile.create(validDriverProps);
    expect(driver.status).toBe("offline");
    expect(driver.isVerified).toBe(true);
  });

  it("rejects creating verified profile for unverified driver", () => {
    expect(() =>
      DriverProfile.create({ ...validDriverProps, isVerified: false }),
    ).toThrow(DomainError);
  });

  it("createUnverified succeeds for registration flow", () => {
    const driver = DriverProfile.createUnverified({
      ...validDriverProps,
      isVerified: false,
    });
    expect(driver.isVerified).toBe(false);
  });

  it("goOnline transitions from offline", () => {
    const driver = DriverProfile.create(validDriverProps);
    driver.goOnline();
    expect(driver.isOnline()).toBe(true);
  });

  it("goOffline from busy throws", () => {
    const driver = DriverProfile.create(validDriverProps);
    driver.goOnline();
    driver.setBusy();
    expect(() => driver.goOffline()).toThrow(DomainError);
  });

  it("canAcceptRide returns true only when online and verified", () => {
    const driver = DriverProfile.create(validDriverProps);
    expect(driver.canAcceptRide()).toBe(false); // offline

    driver.goOnline();
    expect(driver.canAcceptRide()).toBe(true); // online + verified

    driver.setBusy();
    expect(driver.canAcceptRide()).toBe(false); // busy
  });

  it("updateLocation works when online", () => {
    const driver = DriverProfile.create(validDriverProps);
    driver.goOnline();
    driver.updateLocation({ lat: 6.5244, lng: 3.3792 });
    expect(driver.currentLocation).toEqual({ lat: 6.5244, lng: 3.3792 });
  });

  it("updateLocation throws when offline", () => {
    const driver = DriverProfile.create(validDriverProps);
    expect(() => driver.updateLocation({ lat: 6.5244, lng: 3.3792 })).toThrow(
      DomainError,
    );
  });

  // Priority 1 — catches the assertOnline bug we already fixed
  it("assertOnline passes after goOnline", () => {
    const driver = DriverProfile.create(validDriverProps);
    driver.goOnline();
    expect(() => driver.assertOnline()).not.toThrow();
  });
});

// ── Order entity tests ───────────────────────────────────────

describe("Order entity", () => {
  const validOrderProps = {
    id: "order-1",
    customerId: "customer-1",
    driverId: null,
    status: "pending" as const,
    pickupAddress: "1 Lagos Island",
    dropoffAddress: "2 Victoria Island",
    pickupCoords: { lat: 6.455, lng: 3.3841 },
    dropoffCoords: { lat: 6.4281, lng: 3.4219 },
    packageDescription: "Important documents",
    packageSize: "small" as const,
    deliveryPhotoUrl: null,
    distanceKm: 4.5,
    fareAmount: 650,
    paymentStatus: "pending" as const,
    requestedAt: new Date(),
    deliveredAt: null,
  };

  it("creates a valid order", () => {
    const order = Order.create(validOrderProps);
    expect(order.status).toBe("pending");
    expect(order.isPending()).toBe(true);
  });

  it("rejects empty package description", () => {
    expect(() =>
      Order.create({ ...validOrderProps, packageDescription: "   " }),
    ).toThrow(DomainError);
  });

  it("confirmDelivery requires a photo", () => {
    const order = Order.create({ ...validOrderProps, status: "in_transit" });
    expect(() => order.confirmDelivery("")).toThrow(DomainError);
  });

  it("confirmDelivery on in_transit order succeeds", () => {
    const order = Order.create({ ...validOrderProps, status: "in_transit" });
    order.confirmDelivery("https://example.com/photo.jpg");
    expect(order.isDelivered()).toBe(true);
    expect(order.deliveryPhotoUrl).toBe("https://example.com/photo.jpg");
    expect(order.deliveredAt).not.toBeNull();
  });

  it("cannot confirm delivery on pending order", () => {
    const order = Order.create(validOrderProps);
    expect(() =>
      order.confirmDelivery("https://example.com/photo.jpg"),
    ).toThrow(DomainError);
  });

  // ✅ Fix — use transition() which is what the entity exposes
  it("pending → cancelled order is allowed", () => {
    const order = Order.create(validOrderProps);
    expect(() => order.transition("cancelled")).not.toThrow();
    expect(order.isTerminal()).toBe(true);
  });
});

// ── Payment entity tests ─────────────────────────────────────

describe("Payment entity", () => {
  const validPaymentProps = {
    id: "payment-1",
    rideId: "ride-1",
    orderId: null,
    customerId: "customer-1",
    amount: 874,
    currency: "NGN",
    status: "pending" as const,
    stripePaymentIntentId: null,
    idempotencyKey: "customer-1:ride-1:1234567890",
    createdAt: new Date(),
  };

  it("creates a valid payment", () => {
    const payment = Payment.create(validPaymentProps);
    expect(payment.isPending()).toBe(true);
    expect(payment.amount).toBe(874);
  });

  it("rejects zero amount", () => {
    expect(() => Payment.create({ ...validPaymentProps, amount: 0 })).toThrow(
      DomainError,
    );
  });

  it("rejects payment belonging to both ride and order", () => {
    expect(() =>
      Payment.create({
        ...validPaymentProps,
        rideId: "ride-1",
        orderId: "order-1",
      }),
    ).toThrow(DomainError);
  });

  it("rejects payment belonging to neither ride nor order", () => {
    expect(() =>
      Payment.create({
        ...validPaymentProps,
        rideId: null,
        orderId: null,
      }),
    ).toThrow(DomainError);
  });

  it("rejects missing idempotency key", () => {
    expect(() =>
      Payment.create({ ...validPaymentProps, idempotencyKey: "" }),
    ).toThrow(DomainError);
  });

  it("capture transitions from pending to captured", () => {
    const payment = Payment.create(validPaymentProps);
    payment.capture();
    expect(payment.isCaptured()).toBe(true);
  });

  it("double capture throws", () => {
    const payment = Payment.create(validPaymentProps);
    payment.capture();
    expect(() => payment.capture()).toThrow(DomainError);
  });
});
