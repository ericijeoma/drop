// src/shared/utils/fare.ts
// Pure fare calculation — no side effects, no imports from infrastructure.
// Tested in isolation. Used by BookRideUseCase and PlaceOrderUseCase.

import { RidePolicy } from '@/domains/ride/entities/RidePolicy';
import type { VehicleType } from '@/shared/types';

export interface FareBreakdown {
  readonly baseFare:    number;
  readonly distanceFee: number;
  readonly surgeMultiplier: number;
  readonly totalFare:   number;
  readonly isSurge:     boolean;
}

/**
 * Calculate fare using road distance (from OSRM, not straight-line PostGIS).
 * Programming Pearls principle: define the problem correctly first.
 * Road distance ≈ 20-40% longer than straight-line — use actual road km.
 */
export function calculateFare(
  roadDistanceKm: number,
  vehicleType: VehicleType,
  now: Date = new Date()
): FareBreakdown {
  const rates  = RidePolicy;
  const base   = rates.BASE_FARE[vehicleType];
  const perKm  = rates.RATE_PER_KM[vehicleType];
  const minFare = rates.MIN_FARE[vehicleType];

  const raw  = base + roadDistanceKm * perKm;
  const isSurge = isPeakHour(now);
  const multiplier = isSurge ? rates.SURGE_MULTIPLIER : 1.0;
  const withSurge  = raw * multiplier;
  const total      = Math.max(withSurge, minFare);

  return {
    baseFare:         roundNaira(base),
    distanceFee:      roundNaira(roadDistanceKm * perKm),
    surgeMultiplier:  multiplier,
    totalFare:        roundNaira(total),
    isSurge,
  };
}

/**
 * Calculate driver earnings from a fare.
 */
export function calculateDriverEarnings(fareAmount: number): number {
  return roundNaira(fareAmount * RidePolicy.DRIVER_COMMISSION_RATE);
}

function isPeakHour(date: Date): boolean {
  const hour = date.getHours();
  const p = RidePolicy.PEAK_HOURS;
  return (hour >= p.start && hour <= p.end) ||
         (hour >= p.eveningStart && hour <= p.eveningEnd);
}

function roundNaira(amount: number): number {
  // Round to nearest naira (no kobo)
  return Math.round(amount);
}


