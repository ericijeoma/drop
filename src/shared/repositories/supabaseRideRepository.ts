// src/shared/repositories/SupabaseRideRepository.ts
// Implements RideRepository interface using Supabase.
// This is the ONLY file where supabase.from('rides') is written.

import { supabase } from '@/shared/lib/supabase';
import type { RideRepository, CreateRideInput, NearbyDriver } from '@/domains/rides/repositories/RideRepository';
import { Ride, type RideProps } from '@/domains/rides/entities/Ride';
import type { Coords, VehicleType, PaginatedResult } from '@/shared/types';
import { RidePolicy } from '@/domains/rides/entities/RidePolicy';
import { logger } from '@/shared/lib/logger';

const PAGE_SIZE = 20;

// Map Supabase DB row → Ride domain entity
function toRide(row: Record<string, unknown>): Ride {
  return Ride.create({
    id:             row.id as string,
    customerId:     row.customer_id as string,
    driverId:       row.driver_id as string | null,
    vehicleType:    row.vehicle_type as RideProps['vehicleType'],
    pickupAddress:  row.pickup_address as string,
    dropoffAddress: row.dropoff_address as string,
    // PostGIS returns geography as GeoJSON { type: 'Point', coordinates: [lng, lat] }
    pickupCoords: {
      lat: (row.pickup_location as { coordinates: number[] }).coordinates[1],
      lng: (row.pickup_location as { coordinates: number[] }).coordinates[0],
    },
    dropoffCoords: {
      lat: (row.dropoff_location as { coordinates: number[] }).coordinates[1],
      lng: (row.dropoff_location as { coordinates: number[] }).coordinates[0],
    },
    distanceKm:     Number(row.distance_km),
    fareAmount:     Number(row.fare_amount),
    status:         row.status as RideProps['status'],
    paymentStatus:  row.payment_status as RideProps['paymentStatus'],
    requestedAt:    new Date(row.requested_at as string),
    acceptedAt:     row.accepted_at ? new Date(row.accepted_at as string) : null,
    completedAt:    row.completed_at ? new Date(row.completed_at as string) : null,
    cancelledAt:    row.cancelled_at ? new Date(row.cancelled_at as string) : null,
  });
}

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
      logger.error('createAtomic failed', { error: error.message });
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
      .lt('timeout_at', new Date(Date.now() + 1000 * 60 * 5).toISOString()) // not expired
      .order('requested_at', { ascending: true });
    if (error || !data) return [];
    return data.map(toRide);
  }

  async getHistoryForCustomer(customerId: string, cursor?: string): Promise<PaginatedResult<Ride>> {
    let query = supabase
      .from('rides')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .in('status', ['completed', 'cancelled', 'timed_out'])
      .order('requested_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) query = query.lt('requested_at', cursor);

    const { data, error, count } = await query;
    if (error || !data) return { data: [], total: 0, hasMore: false };

    const rides = data.map(toRide);
    return {
      data:      rides,
      total:     count ?? 0,
      hasMore:   rides.length === PAGE_SIZE,
      nextCursor: rides.length > 0 ? rides[rides.length - 1]!.requestedAt.toISOString() : undefined,
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
      if (error.message.includes('ride_not_available')) throw new Error('RIDE_NOT_AVAILABLE');
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
    coords: Coords,
    radiusM: number,
    vehicleType?: VehicleType
  ): Promise<NearbyDriver[]> {
    const { data, error } = await supabase.rpc('find_nearby_drivers', {
      p_lat:          coords.lat,
      p_lng:          coords.lng,
      p_radius_m:     radiusM,
      p_vehicle_type: vehicleType ?? null,
    });
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map(row => ({
      driverId:    row.driver_id as string,
      userId:      row.user_id as string,
      distanceM:   Number(row.distance_m),
      vehicleType: row.vehicle_type as VehicleType,
      rating:      Number(row.rating),
    }));
  }

  async updateDriverLocation(driverId: string, coords: Coords): Promise<void> {
    const { error } = await supabase
      .from('drivers')
      .update({
        current_location: `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', driverId);
    if (error) logger.warn('updateDriverLocation failed', { driverId, error: error.message });
  }

  async getAllRides(cursor?: string): Promise<PaginatedResult<Ride>> {
    let query = supabase
      .from('rides')
      .select('*', { count: 'exact' })
      .order('requested_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) query = query.lt('requested_at', cursor);
    const { data, error, count } = await query;
    if (error || !data) return { data: [], total: 0, hasMore: false };
    const rides = data.map(toRide);
    return {
      data:      rides,
      total:     count ?? 0,
      hasMore:   rides.length === PAGE_SIZE,
      nextCursor: rides.length > 0 ? rides[rides.length - 1]!.requestedAt.toISOString() : undefined,
    };
  }
}


