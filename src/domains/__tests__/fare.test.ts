// src/shared/utils/__tests__/fare.test.ts
// Unit tests for fare calculation — the most critical business function.
// Run with: npm test -- --testPathPattern=fare

import { calculateFare, calculateDriverEarnings } from '../fare';
import { RidePolicy } from '@/domains/rides/entities/RidePolicy';

describe('calculateFare', () => {
  // Fixed time for deterministic tests — 10am (not peak)
  const offPeak = new Date('2026-03-14T10:00:00');
  // Peak hour — 8am morning rush
  const morningPeak = new Date('2026-03-14T08:00:00');
  // Peak hour — 6pm evening rush
  const eveningPeak = new Date('2026-03-14T18:00:00');

  describe('off-peak car trip', () => {
    it('calculates correct fare for 5km car trip', () => {
      const result = calculateFare(5, 'car', offPeak);
      const expected = RidePolicy.BASE_FARE.car + (5 * RidePolicy.RATE_PER_KM.car);
      expect(result.totalFare).toBe(Math.round(expected));
      expect(result.isSurge).toBe(false);
      expect(result.surgeMultiplier).toBe(1.0);
    });

    it('enforces minimum fare for very short trip', () => {
      const result = calculateFare(0.1, 'motorbike', offPeak);
      expect(result.totalFare).toBe(RidePolicy.MIN_FARE.motorbike);
    });

    it('minimum fare for van is greater than car', () => {
      const vanResult  = calculateFare(0.1, 'van',  offPeak);
      const carResult  = calculateFare(0.1, 'car',  offPeak);
      const motoResult = calculateFare(0.1, 'motorbike', offPeak);
      expect(vanResult.totalFare).toBeGreaterThan(carResult.totalFare);
      expect(carResult.totalFare).toBeGreaterThan(motoResult.totalFare);
    });
  });

  describe('surge pricing', () => {
    it('applies surge multiplier during morning peak', () => {
      const offPeakResult  = calculateFare(5, 'car', offPeak);
      const morningResult  = calculateFare(5, 'car', morningPeak);
      expect(morningResult.isSurge).toBe(true);
      expect(morningResult.surgeMultiplier).toBe(RidePolicy.SURGE_MULTIPLIER);
      expect(morningResult.totalFare).toBeGreaterThan(offPeakResult.totalFare);
    });

    it('applies surge multiplier during evening peak', () => {
      const result = calculateFare(5, 'car', eveningPeak);
      expect(result.isSurge).toBe(true);
      expect(result.surgeMultiplier).toBe(1.5);
    });

    it('surge fare = off-peak fare × SURGE_MULTIPLIER (above minimum)', () => {
      const offPeakResult = calculateFare(10, 'car', offPeak);
      const surgeResult   = calculateFare(10, 'car', morningPeak);
      const expectedSurge = Math.round(offPeakResult.totalFare * RidePolicy.SURGE_MULTIPLIER);
      expect(surgeResult.totalFare).toBe(expectedSurge);
    });
  });

  describe('distance scaling', () => {
    it('longer trip costs more', () => {
      const short = calculateFare(2, 'car', offPeak);
      const long  = calculateFare(20, 'car', offPeak);
      expect(long.totalFare).toBeGreaterThan(short.totalFare);
    });

    it('fare increases linearly with distance (above minimum)', () => {
      const trip5  = calculateFare(5,  'car', offPeak);
      const trip10 = calculateFare(10, 'car', offPeak);
      const trip15 = calculateFare(15, 'car', offPeak);
      // Each additional 5km should add RATE_PER_KM.car * 5
      const increment = RidePolicy.RATE_PER_KM.car * 5;
      expect(trip10.totalFare - trip5.totalFare).toBe(increment);
      expect(trip15.totalFare - trip10.totalFare).toBe(increment);
    });
  });

  describe('breakdown correctness', () => {
    it('baseFare + distanceFee reflects the calculation', () => {
      const result = calculateFare(5, 'car', offPeak);
      expect(result.baseFare).toBe(RidePolicy.BASE_FARE.car);
      expect(result.distanceFee).toBe(5 * RidePolicy.RATE_PER_KM.car);
    });
  });
});

describe('calculateDriverEarnings', () => {
  it('returns 80% of fare amount', () => {
    expect(calculateDriverEarnings(1000)).toBe(800);
    expect(calculateDriverEarnings(874)).toBe(Math.round(874 * 0.8));
  });

  it('earnings are always less than fare', () => {
    [500, 874, 1500, 3000].forEach(fare => {
      expect(calculateDriverEarnings(fare)).toBeLessThan(fare);
    });
  });
});