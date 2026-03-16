// ────────────────────────────────────────────────────────────
// src/domains/ride/repositories/RideRepository.ts
//
// Domain port — what the ride bounded context needs from
// any persistence provider. Zero infrastructure imports.
// ────────────────────────────────────────────────────────────

import type { Ride, RideProps }            from '@/domains/ride/entities/Ride';
import type { Coords, VehicleType, PaginatedResult } from '@/shared/types';

// ── Input / Output Value Objects ─────────────────────────────

/**
 * CreateRideInput
 *
 * Value Object — the exact data needed to open a new ride request.
 * No ID (database assigns it). No status (always starts 'pending').
 * No driverId (none assigned yet).
 */
export interface CreateRideInput {
  customerId:     string;
  vehicleType:    RideProps['vehicleType'];
  pickupAddress:  string;
  dropoffAddress: string;
  pickupCoords:   Coords;
  dropoffCoords:  Coords;
  distanceKm:     number;
  fareAmount:     number;
}

/**
 * NearbyDriver
 *
 * Value Object — a lightweight projection returned by the
 * spatial nearby-driver query. Not a full DriverProfile —
 * only the fields the ride domain needs to make a match.
 * It has no identity of its own; it is a snapshot of
 * proximity data at a point in time.
 */
export interface NearbyDriver {
  driverId:    string;
  userId:      string;
  distanceM:   number;
  vehicleType: VehicleType;
  rating:      number;
}

/**
 * RideRepository
 *
 * The single source of truth for ride persistence within
 * the ride bounded context.
 *
 * Rules:
 *  - All methods are async.
 *  - Nullable returns mean "not found" — not a failure.
 *  - Throw only for genuine persistence or business-rule failures.
 *  - This repository manages ONLY the rides table.
 *    Driver status changes triggered by ride events belong in
 *    the use case layer — not here.
 */
export interface RideRepository {

  // ── Queries ──────────────────────────────────────────────

  /**
   * Find a ride by its unique ID.
   * Returns null if not found.
   */
  getById(id: string): Promise<Ride | null>;

  /**
   * Find the single active ride for a customer.
   * Active means status is 'pending' or 'active'.
   * Returns null if the customer has no active ride.
   */
  getActiveRideForCustomer(customerId: string): Promise<Ride | null>;

  /**
   * Returns all rides currently in 'pending' status that have
   * not yet timed out, ordered oldest first — fairness queue.
   */
  getPendingRides(): Promise<Ride[]>;

  /**
   * Returns paginated ride history for a customer.
   * History means status is completed, cancelled, or timed_out.
   * Newest first. Cursor is the requestedAt ISO string of the
   * last record returned.
   */
  getHistoryForCustomer(
    customerId: string,
    cursor?: string,
  ): Promise<PaginatedResult<Ride>>;

  /**
   * Returns all rides currently assigned to and active for
   * a specific driver.
   */
  getAssignedRidesForDriver(driverId: string): Promise<Ride[]>;

  /**
   * Returns a paginated list of ALL rides across all customers.
   * Admin use only. Newest first.
   * Cursor is the requestedAt ISO string of the last record.
   */
  getAllRides(cursor?: string): Promise<PaginatedResult<Ride>>;

  /**
   * Finds available online drivers near a location within
   * a given radius. Optionally filtered by vehicle type.
   * Returns lightweight NearbyDriver projections, not full
   * DriverProfile entities — the ride domain only needs
   * proximity data to make a match.
   */
  findNearbyDrivers(
    coords:       Coords,
    radiusM:      number,
    vehicleType?: VehicleType,
  ): Promise<NearbyDriver[]>;

  // ── Commands ─────────────────────────────────────────────

  /**
   * Atomically creates a new ride request via a database
   * stored procedure. The procedure enforces the business rule
   * that a customer cannot have two active rides simultaneously.
   *
   * Throws 'CUSTOMER_HAS_ACTIVE_RIDE' if that rule is violated.
   * Throws on any other persistence failure.
   */
  createAtomic(input: CreateRideInput): Promise<Ride>;

  /**
   * Atomically assigns a driver to a pending ride via a database
   * stored procedure. Enforces two rules at the database level:
   *   1. The ride must still be 'pending' (not already taken)
   *   2. The driver must not already have an active ride
   *
   * Throws 'RIDE_NOT_AVAILABLE' if the ride was already taken.
   * Throws 'DRIVER_HAS_ACTIVE_RIDE' if the driver is already busy.
   *
   * ⚠️  NOTE FOR USE CASE LAYER: After calling this method,
   * the use case must separately call DriverRepository.updateStatus()
   * to set the driver to 'busy'. This repository does not touch
   * the drivers table.
   */
  acceptRideAtomic(rideId: string, driverId: string): Promise<Ride>;

  /**
   * Marks a ride as completed. Records the completion timestamp.
   * Throws if the ride is not found.
   */
  complete(rideId: string): Promise<Ride>;

  /**
   * Cancels a ride. Records the cancellation timestamp.
   * Throws if the ride is not found.
   */
  cancel(rideId: string): Promise<Ride>;
}