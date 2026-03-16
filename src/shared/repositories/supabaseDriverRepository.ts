// ────────────────────────────────────────────────────────────
// src/shared/repositories/SupabaseDriverRepository.ts
//
// Infrastructure adapter — the ONLY file that touches
// supabase.from('drivers'). All driver persistence lives here.
// ────────────────────────────────────────────────────────────

import { supabase }              from '@/shared/lib/supabase';
import type { DriverRepository } from '@/domains/driver/repositories/DriverRepository';
import {
  DriverProfile,
  type DriverProfileProps,
}                                 from '@/domains/driver/entities/DriverProfile';
import type {
  DriverStatus,
  Coords,
  PaginatedResult,
}                                 from '@/shared/types';
import { logger }                 from '@/shared/lib/logger';

// ── Constants ────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── GeoJSON type ─────────────────────────────────────────────

/**
 * PostGIS returns geography columns as GeoJSON via Supabase.
 * Coordinates are always [longitude, latitude] per the GeoJSON spec.
 */
interface GeoJSONPoint {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
}

function isGeoJSONPoint(value: unknown): value is GeoJSONPoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as GeoJSONPoint).type === 'Point' &&
    Array.isArray((value as GeoJSONPoint).coordinates) &&
    (value as GeoJSONPoint).coordinates.length === 2
  );
}

// ── Row mapper ───────────────────────────────────────────────

function toDriver(row: Record<string, unknown>): DriverProfile {
  const rawLocation = row.current_location;

  // Safely parse the GeoJSON point — warn and fall back to null
  // if the shape is unexpected rather than crashing at runtime.
  let currentLocation: Coords | null = null;
  if (rawLocation !== null && rawLocation !== undefined) {
    if (isGeoJSONPoint(rawLocation)) {
      currentLocation = {
        lng: rawLocation.coordinates[0],  // GeoJSON: longitude is index 0
        lat: rawLocation.coordinates[1],  // GeoJSON: latitude  is index 1
      };
    } else {
      logger.warn('toDriver: unexpected current_location shape', {
        driverId: row.id,
        rawLocation,
      });
    }
  }

  const props: DriverProfileProps = {
    id:              row.id            as string,
    userId:          row.user_id       as string,
    vehicleType:     row.vehicle_type  as DriverProfileProps['vehicleType'],
    vehiclePlate:    row.vehicle_plate as string,
    vehicleModel:    row.vehicle_model as string,
    status:          row.status        as DriverStatus,
    currentLocation,
    rating:          Number(row.rating),
    totalTrips:      Number(row.total_trips),
    isVerified:      row.is_verified   as boolean,
    fcmToken:        row.fcm_token     as string | null,
  };

  return DriverProfile.createUnverified(props);
}

// ── Repository ───────────────────────────────────────────────

export class SupabaseDriverRepository implements DriverRepository {

  async getByUserId(userId: string): Promise<DriverProfile | null> {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return toDriver(data);
  }

  async getById(driverId: string): Promise<DriverProfile | null> {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', driverId)
      .single();
    if (error || !data) return null;
    return toDriver(data);
  }

  async create(props: DriverProfileProps): Promise<DriverProfile> {
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        user_id:       props.userId,
        vehicle_type:  props.vehicleType,
        vehicle_plate: props.vehiclePlate,
        vehicle_model: props.vehicleModel,
        status:        'offline',
        is_verified:   false,
      })
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Failed to create driver');
    return toDriver(data as Record<string, unknown>);
  }

  async updateStatus(
    driverId: string,
    status: DriverStatus,
  ): Promise<DriverProfile> {
    const { data, error } = await supabase
      .from('drivers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', driverId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Driver not found');
    return toDriver(data as Record<string, unknown>);
  }

  async updateLocation(driverId: string, coords: Coords): Promise<void> {
    // PostGIS WKT format: POINT(longitude latitude)
    const { error } = await supabase
      .from('drivers')
      .update({
        current_location: `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', driverId);
    if (error) {
      logger.warn('updateLocation failed', { driverId, error: error.message });
    }
  }

  async updateFcmToken(driverId: string, token: string): Promise<void> {
    const { error } = await supabase
      .from('drivers')
      .update({ fcm_token: token })
      .eq('id', driverId);
    if (error) {
      logger.warn('updateFcmToken failed', { driverId, error: error.message });
    }
  }

  async getAll(cursor?: string): Promise<PaginatedResult<DriverProfile>> {
    let query = supabase
      .from('drivers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    // cursor is a created_at ISO string — must match the .order() field
    if (cursor) query = query.lt('created_at', cursor);

    const { data, error, count } = await query;
    if (error) throw error;

    const drivers = (data ?? []).map(toDriver);
    const lastRow  = data?.[data.length - 1];

    return {
      data:       drivers,
      total:      count ?? 0,
      hasMore:    drivers.length === PAGE_SIZE,
      // ✅ Fixed: cursor must be created_at, not id
      nextCursor: lastRow ? (lastRow.created_at as string) : undefined,
    };
  }

  async setVerified(
    driverId: string,
    verified: boolean,
  ): Promise<DriverProfile> {
    const { data, error } = await supabase
      .from('drivers')
      .update({ is_verified: verified })
      .eq('id', driverId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Driver not found');
    return toDriver(data as Record<string, unknown>);
  }
}