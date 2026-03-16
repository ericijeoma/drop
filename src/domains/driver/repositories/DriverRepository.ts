// ────────────────────────────────────────────────────────────
// src/domains/driver/repositories/DriverRepository.ts
//
// Domain port — what the driver bounded context needs from
// any persistence provider. Zero infrastructure imports.
// ────────────────────────────────────────────────────────────

import type { DriverProfile, DriverProfileProps } from '@/domains/driver/entities/DriverProfile';
import type { DriverStatus, Coords, PaginatedResult } from '@/shared/types';

export interface DriverRepository {

  // ── Queries ──────────────────────────────────────────────

  /**
   * Find a driver by their linked user account ID.
   * Returns null if the user has not registered as a driver.
   */
  getByUserId(userId: string): Promise<DriverProfile | null>;

  /**
   * Find a driver by their own driver profile ID.
   * Returns null if no driver with that ID exists.
   */
  getById(driverId: string): Promise<DriverProfile | null>;

  /**
   * Returns a page of all drivers, ordered by newest first.
   * Pass the previous page's nextCursor to get the next page.
   * Cursor is the created_at ISO string of the last returned record.
   */
  getAll(cursor?: string): Promise<PaginatedResult<DriverProfile>>;

  // ── Commands ─────────────────────────────────────────────

  /**
   * Persists a new driver profile.
   * Always created with status 'offline' and isVerified false.
   * Throws if the insert fails.
   */
  create(props: DriverProfileProps): Promise<DriverProfile>;

  /**
   * Updates the online/offline/busy status of a driver.
   * Throws if the driver does not exist.
   */
  updateStatus(driverId: string, status: DriverStatus): Promise<DriverProfile>;

  /**
   * Records the driver's current GPS position.
   * Degrades gracefully on failure — warns without throwing —
   * because a missed location ping should not crash the app.
   */
  updateLocation(driverId: string, coords: Coords): Promise<void>;

  /**
   * Stores the Firebase Cloud Messaging token for push notifications.
   * Degrades gracefully on failure — warns without throwing.
   */
  updateFcmToken(driverId: string, token: string): Promise<void>;

  /**
   * Sets the verified flag on a driver profile (admin action).
   * Throws if the driver does not exist.
   */
  setVerified(driverId: string, verified: boolean): Promise<DriverProfile>;
}