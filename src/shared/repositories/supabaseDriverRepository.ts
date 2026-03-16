// src/shared/repositories/SupabaseDriverRepository.ts
// Implements DriverRepository interface using Supabase.
// The ONLY file where supabase.from('drivers') is written for driver management.

import { supabase }               from '@/shared/lib/supabase';
import type { DriverRepository }  from '@/domains/drivers/repositories/DriverRepository';
import {
  DriverProfile,
  type DriverProfileProps,
}                                  from '@/domains/drivers/entities/DriverProfile';
import type { DriverStatus, Coords, PaginatedResult } from '@/shared/types';
import { logger }                  from '@/shared/lib/logger';

const PAGE_SIZE = 20;

function toDriver(row: Record<string, unknown>): DriverProfile {
  const props: DriverProfileProps = {
    id:            row.id as string,
    userId:        row.user_id as string,
    vehicleType:   row.vehicle_type as DriverProfileProps['vehicleType'],
    vehiclePlate:  row.vehicle_plate as string,
    vehicleModel:  row.vehicle_model as string,
    status:        row.status as DriverStatus,
    currentLocation: row.current_location
      ? {
          lat: (row.current_location as { coordinates: number[] }).coordinates[1],
          lng: (row.current_location as { coordinates: number[] }).coordinates[0],
        }
      : null,
    rating:        Number(row.rating),
    totalTrips:    Number(row.total_trips),
    isVerified:    row.is_verified as boolean,
    fcmToken:      row.fcm_token as string | null,
  };
  // Use createUnverified so we don't throw on unverified drivers from DB
  return DriverProfile.createUnverified(props);
}

export class SupabaseDriverRepository implements DriverRepository {

  async getByUserId(userId: string): Promise<DriverProfile | null> {
    const { data, error } = await supabase
      .from('drivers').select('*').eq('user_id', userId).maybeSingle();
    if (error || !data) return null;
    return toDriver(data);
  }

  async getById(driverId: string): Promise<DriverProfile | null> {
    const { data, error } = await supabase
      .from('drivers').select('*').eq('id', driverId).single();
    if (error || !data) return null;
    return toDriver(data);
  }

  async create(props: DriverProfileProps): Promise<DriverProfile> {
    const { data, error } = await supabase.from('drivers').insert({
      user_id:        props.userId,
      vehicle_type:   props.vehicleType,
      vehicle_plate:  props.vehiclePlate,
      vehicle_model:  props.vehicleModel,
      status:         'offline',
      is_verified:    false,
    }).select().single();
    if (error || !data) throw error ?? new Error('Failed to create driver');
    return toDriver(data as Record<string, unknown>);
  }

  async updateStatus(driverId: string, status: DriverStatus): Promise<DriverProfile> {
    const { data, error } = await supabase
      .from('drivers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', driverId).select().single();
    if (error || !data) throw error ?? new Error('Driver not found');
    return toDriver(data as Record<string, unknown>);
  }

  async updateLocation(driverId: string, coords: Coords): Promise<void> {
    const { error } = await supabase
      .from('drivers')
      .update({
        current_location: `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', driverId);
    if (error) logger.warn('updateLocation failed', { driverId, error: error.message });
  }

  async updateFcmToken(driverId: string, token: string): Promise<void> {
    const { error } = await supabase
      .from('drivers')
      .update({ fcm_token: token })
      .eq('id', driverId);
    if (error) logger.warn('updateFcmToken failed', { driverId });
  }

  async getAll(cursor?: string): Promise<PaginatedResult<DriverProfile>> {
    let query = supabase
      .from('drivers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) query = query.lt('created_at', cursor);
    const { data, count } = await query;
    const drivers = (data ?? []).map(toDriver);
    return {
      data:      drivers,
      total:     count ?? 0,
      hasMore:   drivers.length === PAGE_SIZE,
      nextCursor: drivers.length > 0 ? (drivers[drivers.length - 1] as DriverProfile).id : undefined,
    };
  }

  async setVerified(driverId: string, verified: boolean): Promise<DriverProfile> {
    const { data, error } = await supabase
      .from('drivers')
      .update({ is_verified: verified })
      .eq('id', driverId).select().single();
    if (error || !data) throw error ?? new Error('Driver not found');
    return toDriver(data as Record<string, unknown>);
  }
}