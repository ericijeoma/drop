// src/domains/rides/entities/RidePolicy.ts
// Value object: business rules for the rides domain.
// Single source of truth — nothing else hardcodes these values.

export const RidePolicy = {
  // Minimum fare by vehicle type (NGN)
  MIN_FARE: {
    motorbike: 500,
    car:       800,
    van:       1200,
  } as const,

  // Rate per km by vehicle type (NGN)
  RATE_PER_KM: {
    motorbike: 80,
    car:       120,
    van:       180,
  } as const,

  // Base fare by vehicle type (NGN)
  BASE_FARE: {
    motorbike: 150,
    car:       250,
    van:       400,
  } as const,

  // Surge multiplier during peak hours
  SURGE_MULTIPLIER: 1.5,

  // Peak hours (24h format, inclusive)
  PEAK_HOURS: { start: 7, end: 9, eveningStart: 17, eveningEnd: 20 } as const,

  // Max ride booking radius (km) — escalates: try 5 → 10 → 20
  MATCHING_RADII_KM: [5, 10, 20] as const,

  // How long a ride stays 'pending' before timing out
  PENDING_TIMEOUT_MINUTES: 3,

  // Driver commission (80% goes to driver)
  DRIVER_COMMISSION_RATE: 0.80,
} as const;