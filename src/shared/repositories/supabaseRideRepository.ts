// ────────────────────────────────────────────────────────────
// src/shared/repositories/SupabaseRideRepository.ts
//
// Infrastructure adapter — the ONLY file that touches
// supabase.from('rides'). All ride persistence lives here.
// ────────────────────────────────────────────────────────────

import { supabase }              from '@/shared/lib/supabase';
import type {
  RideRepository,
  CreateRideInput,
  NearbyDriver,
}                                from '@/domains/ride/repositories/RideRepository';
import { Ride, type RideProps }  from '@/domains/ride/entities/Ride';
import type {
  Coords,
  VehicleType,
  PaginatedResult,
}                                from '@/shared/types';
import { logger }                from '@/shared/lib/logger';

// ✅ RidePolicy removed — was imported but never used anywhere
//    in this file. If fare/policy calculations are needed, they
//    belong in a use case or domain service, not a repository.

// ── Constants ────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── GeoJSON type + guard ──────────────────────────────────────

/**
 * PostGIS returns geography columns as GeoJSON via Supabase.
 * Coordinates are always [longitude, latitude] — longitude first.
 * This is the GeoJSON spec. It is counterintuitive. Do not swap them.
 *
 * Tuple [number, number] instead of number[] guarantees TypeScript
 * knows exactly two numbers exist — no 'number | undefined' errors.
 */
interface GeoJSONPoint {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
}

function isGeoJSONPoint(value: unknown): value is GeoJSONPoint {
  return (
    typeof value === 'object'                           &&
    value !== null                                      &&
    (value as GeoJSONPoint).type === 'Point'            &&
    Array.isArray((value as GeoJSONPoint).coordinates)  &&
    (value as GeoJSONPoint).coordinates.length === 2
  );
}

/**
 * Extracts a Coords Value Object from a raw PostGIS GeoJSON column.
 *
 * Ride coordinates are REQUIRED — throws immediately on bad data.
 * A ride with no pickup or dropoff location is fundamentally broken
 * and must not silently enter the system.
 */
function extractCoords(raw: unknown, fieldName: string): Coords {
  if (!isGeoJSONPoint(raw)) {
    logger.error(`toRide: invalid GeoJSON for ${fieldName}`, { raw });
    throw new Error(`Invalid or missing coordinates for ${fieldName}`);
  }
  return {
    lng: raw.coordinates[0], // GeoJSON: longitude is always index 0
    lat: raw.coordinates[1], // GeoJSON: latitude  is always index 1
  };
}

// ── Row mapper ───────────────────────────────────────────────

function toRide(row: Record<string, unknown>): Ride {
  return Ride.create({
    id:             row.id              as string,
    customerId:     row.customer_id     as string,
    driverId:       row.driver_id       as string | null,
    vehicleType:    row.vehicle_type    as RideProps['vehicleType'],
    pickupAddress:  row.pickup_address  as string,
    dropoffAddress: row.dropoff_address as string,

    // ✅ Fixed: safe GeoJSON extraction with type guard.
    // Throws on bad data rather than silently producing wrong coords.
    pickupCoords:  extractCoords(row.pickup_location,  'pickup_location'),
    dropoffCoords: extractCoords(row.dropoff_location, 'dropoff_location'),

    distanceKm:    Number(row.distance_km),
    fareAmount:    Number(row.fare_amount),
    status:        row.status         as RideProps['status'],
    paymentStatus: row.payment_status as RideProps['paymentStatus'],
    requestedAt:   new Date(row.requested_at as string),
    acceptedAt:    row.accepted_at  ? new Date(row.accepted_at  as string) : null,
    completedAt:   row.completed_at ? new Date(row.completed_at as string) : null,
    cancelledAt:   row.cancelled_at ? new Date(row.cancelled_at as string) : null,
  });
}

// ── Repository ───────────────────────────────────────────────

export class SupabaseRideRepository implements RideRepository {

  async createAtomic(input: CreateRideInput): Promise<Ride> {
    const { data, error } = await supabase.rpc('create_ride_atomic', {
      p_customer_id:     input.customerId,
      p_vehicle_type:    input.vehicleType,
      p_pickup_address:  input.pickupAddress,
      p_dropoff_address: input.dropoffAddress,
      p_pickup_lat:      input.pickupCoords.lat,
      p_pickup_lng:      input.pickupCoords.lng,
      p_dropoff_lat:     input.dropoffCoords.lat,
      p_dropoff_lng:     input.dropoffCoords.lng,
      p_distance_km:     input.distanceKm,
      p_fare_amount:     input.fareAmount,
    });
    if (error) {
      logger.error('createAtomic ride failed', { error: error.message });
      if (error.message.includes('customer_has_active_ride')) {
        throw new Error('CUSTOMER_HAS_ACTIVE_RIDE');
      }
      throw error;
    }
    return toRide(data as Record<string, unknown>);
  }

  async getById(id: string): Promise<Ride | null> {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return toRide(data);
  }

  async getActiveRideForCustomer(customerId: string): Promise<Ride | null> {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['pending', 'active'])
      .maybeSingle();
    if (error || !data) return null;
    return toRide(data);
  }

  async getPendingRides(): Promise<Ride[]> {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('status', 'pending')
      // ✅ Fixed: was .lt('timeout_at', now + 5min) which returned
      // rides expiring soon AND already-expired rides — wrong.
      // Correct logic: timeout_at must be IN THE FUTURE (> now),
      // meaning the ride window is still open.
      .gt('timeout_at', new Date().toISOString())
      .order('requested_at', { ascending: true }); // oldest first — fairness
    if (error || !data) return [];
    return data.map(toRide);
  }

  async getHistoryForCustomer(
    customerId: string,
    cursor?: string,
  ): Promise<PaginatedResult<Ride>> {
    let query = supabase
      .from('rides')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .in('status', ['completed', 'cancelled', 'timed_out'])
      .order('requested_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) query = query.lt('requested_at', cursor);

    const { data, error, count } = await query;
    if (error) throw error;

    const rides   = (data ?? []).map(toRide);
    const lastRow = data?.[data.length - 1];

    return {
      data:      rides,
      total:     count ?? 0,
      hasMore:   rides.length === PAGE_SIZE,
      // ✅ Fixed: reads cursor from raw row, not through domain entity
      nextCursor: lastRow
        ? (lastRow.requested_at as string)
        : undefined,
    };
  }

  async getAssignedRidesForDriver(driverId: string): Promise<Ride[]> {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', driverId)
      .eq('status', 'active');
    if (error || !data) return [];
    return data.map(toRide);
  }

  async acceptRideAtomic(rideId: string, driverId: string): Promise<Ride> {
    const { data, error } = await supabase.rpc('accept_ride_atomic', {
      p_ride_id:   rideId,
      p_driver_id: driverId,
    });
    if (error) {
      if (error.message.includes('ride_not_available'))    throw new Error('RIDE_NOT_AVAILABLE');
      if (error.message.includes('driver_has_active_ride')) throw new Error('DRIVER_HAS_ACTIVE_RIDE');
      throw error;
    }
    return toRide(data as Record<string, unknown>);
  }

  async complete(rideId: string): Promise<Ride> {
    const { data, error } = await supabase
      .from('rides')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', rideId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Ride not found');
    return toRide(data);
  }

  async cancel(rideId: string): Promise<Ride> {
    const { data, error } = await supabase
      .from('rides')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', rideId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Ride not found');
    return toRide(data);
  }

  async findNearbyDrivers(
    coords:       Coords,
    radiusM:      number,
    vehicleType?: VehicleType,
  ): Promise<NearbyDriver[]> {
    const { data, error } = await supabase.rpc('find_nearby_drivers', {
      p_lat:          coords.lat,
      p_lng:          coords.lng,
      p_radius_m:     radiusM,
      p_vehicle_type: vehicleType ?? null,
    });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(row => ({
      driverId:    row.driver_id   as string,
      userId:      row.user_id     as string,
      distanceM:   Number(row.distance_m),
      vehicleType: row.vehicle_type as VehicleType,
      rating:      Number(row.rating),
    }));
  }

  // ✅ Fixed: updateDriverLocation REMOVED.
  //
  // This method was writing to supabase.from('drivers') —
  // a bounded context violation. The ride repository must
  // not touch the drivers table.
  //
  // Driver location updates during a ride must go through
  // DriverRepository.updateLocation() called from the use
  // case layer, exactly as acceptRideAtomic's driver status
  // update was fixed in AcceptRideUseCase.

  async getAllRides(cursor?: string): Promise<PaginatedResult<Ride>> {
    let query = supabase
      .from('rides')
      .select('*', { count: 'exact' })
      .order('requested_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) query = query.lt('requested_at', cursor);

    const { data, error, count } = await query;
    if (error) throw error;

    const rides   = (data ?? []).map(toRide);
    const lastRow = data?.[data.length - 1];

    return {
      data:      rides,
      total:     count ?? 0,
      hasMore:   rides.length === PAGE_SIZE,
      // ✅ Fixed: reads cursor from raw row, not through domain entity
      nextCursor: lastRow
        ? (lastRow.requested_at as string)
        : undefined,
    };
  }
}