// src/shared/types/index.ts
// Shared TypeScript contracts used across all domains.
// These are pure types — zero runtime code, zero imports from external libraries.

// ── Coordinates ─────────────────────────────────────────────
export interface Coords {
  readonly lat: number;
  readonly lng: number;
}

export interface AddressWithCoords {
  readonly address: string;
  readonly coords: Coords;
}

// ── Enums (mirror SQL enums exactly) ────────────────────────
export type UserRole      = 'customer' | 'driver' | 'admin';
export type RideStatus    = 'pending' | 'active' | 'completed' | 'cancelled' | 'timed_out';
export type OrderStatus   = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
export type DriverStatus  = 'offline' | 'online' | 'busy';
export type VehicleType   = 'motorbike' | 'car' | 'van';
export type PaymentStatus = 'pending' | 'captured' | 'refunded' | 'failed';
export type PackageSize   = 'small' | 'medium' | 'large';

// ── Domain errors ────────────────────────────────────────────
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// ── Result type (Programming Pearls: define the problem shape) ──
export type Result<T> =
  | { ok: true;  value: T }
  | { ok: false; error: DomainError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(code: string, message: string): Result<never> {
  return { ok: false, error: new DomainError(message, code) };
}

// ── Pagination ───────────────────────────────────────────────
export interface PaginatedResult<T> {
  readonly data: T[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

// ── Admin types ──────────────────────────────────────────────
export interface AdminStats {
  readonly total_users: number;
  readonly total_drivers: number;
  readonly online_drivers: number;
  readonly active_rides: number;
  readonly active_orders: number;
  readonly rides_today: number;
  readonly orders_today: number;
  readonly revenue_today: number;
  readonly pending_rides: number;
}