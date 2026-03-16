// ────────────────────────────────────────────────────────────
// src/shared/repositories/SupabaseOrderRepository.ts
//
// Infrastructure adapter — the ONLY file that touches
// supabase.from('orders'). All order persistence lives here.
// ────────────────────────────────────────────────────────────

import { supabase }          from '@/shared/lib/supabase';
import type {
  OrderRepository,
  CreateOrderInput,
}                            from '@/domains/delivery/repositories/OrderRepository';
import { Order, type OrderProps } from '@/domains/delivery/entities/Order';
import type { OrderStatus, Coords, PaginatedResult } from '@/shared/types';
import { logger }            from '@/shared/lib/logger';

// ── Constants ─────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── GeoJSON type + guard ──────────────────────────────────────

/**
 * PostGIS returns geography columns as GeoJSON via Supabase.
 * Coordinates are always [longitude, latitude] per the GeoJSON spec.
 *
 * Using a tuple [number, number] instead of number[] guarantees
 * TypeScript knows exactly two numbers exist — eliminating the
 * 'number | undefined' error from indexed access.
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

/**
 * Extracts a Coords Value Object from a raw PostGIS GeoJSON column.
 *
 * Unlike driver location (which is optional and degrades gracefully),
 * order coordinates are REQUIRED. An order without a pickup or
 * dropoff location is fundamentally broken — we throw immediately
 * so the problem surfaces at the data layer, not silently later
 * when a driver tries to navigate.
 */
function extractCoords(raw: unknown, fieldName: string): Coords {
  if (!isGeoJSONPoint(raw)) {
    // Log full detail before throwing so the bad row is traceable
    logger.error(`toOrder: invalid GeoJSON for ${fieldName}`, { raw });
    throw new Error(`Invalid or missing coordinates for ${fieldName}`);
  }
  return {
    lng: raw.coordinates[0], // GeoJSON: longitude is always index 0
    lat: raw.coordinates[1], // GeoJSON: latitude  is always index 1
  };
}

// ── Row mapper ────────────────────────────────────────────────

function toOrder(row: Record<string, unknown>): Order {
  return Order.create({
    id:                 row.id                as string,
    customerId:         row.customer_id       as string,
    driverId:           row.driver_id         as string | null,
    status:             row.status            as OrderProps['status'],
    pickupAddress:      row.pickup_address    as string,
    dropoffAddress:     row.dropoff_address   as string,

    // ✅ Fixed: extractCoords validates the GeoJSON shape and uses
    // a tuple type — TypeScript now knows coordinates[0] and [1]
    // are always numbers, never undefined.
    pickupCoords:  extractCoords(row.pickup_location,  'pickup_location'),
    dropoffCoords: extractCoords(row.dropoff_location, 'dropoff_location'),

    packageDescription: row.package_description as string,
    packageSize:        row.package_size        as OrderProps['packageSize'],
    deliveryPhotoUrl:   row.delivery_photo_url  as string | null,
    distanceKm:         Number(row.distance_km),
    fareAmount:         Number(row.fare_amount),
    paymentStatus:      row.payment_status      as OrderProps['paymentStatus'],
    requestedAt:        new Date(row.requested_at as string),
    deliveredAt:        row.delivered_at
                          ? new Date(row.delivered_at as string)
                          : null,
  });
}

// ── Repository ────────────────────────────────────────────────

export class SupabaseOrderRepository implements OrderRepository {

  async createAtomic(input: CreateOrderInput): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        customer_id:         input.customerId,
        pickup_address:      input.pickupAddress,
        dropoff_address:     input.dropoffAddress,
        // WKT format for writing to PostGIS: POINT(longitude latitude)
        pickup_location:     `SRID=4326;POINT(${input.pickupCoords.lng} ${input.pickupCoords.lat})`,
        dropoff_location:    `SRID=4326;POINT(${input.dropoffCoords.lng} ${input.dropoffCoords.lat})`,
        package_description: input.packageDescription,
        package_size:        input.packageSize,
        distance_km:         input.distanceKm,
        fare_amount:         input.fareAmount,
        // status defaults to 'pending' — enforced here, not left to DB default alone
        status:              'pending',
      })
      .select()
      .single();

    if (error) {
      logger.error('createAtomic order failed', { error: error.message });
      throw error;
    }
    return toOrder(data as Record<string, unknown>);
  }

  async getById(id: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return toOrder(data);
  }

  async getActiveOrderForCustomer(customerId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['pending', 'assigned', 'in_transit'])
      .maybeSingle();
    if (error) {
      logger.warn('getActiveOrderForCustomer failed', {
        customerId,
        error: error.message,
      });
      return null;
    }
    if (!data) return null;
    return toOrder(data);
  }

  async getPendingOrders(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true }); // oldest first — fairness
    if (error) {
      logger.error('getPendingOrders failed', { error: error.message });
      throw error;
    }
    return (data ?? []).map(toOrder);
  }

  async getHistoryForCustomer(
    customerId: string,
    cursor?: string,
  ): Promise<PaginatedResult<Order>> {
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .in('status', ['delivered', 'cancelled'])
      .order('requested_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) query = query.lt('requested_at', cursor);

    const { data, error, count } = await query;

    // ✅ Fixed: original silently swallowed the error — now we throw
    if (error) throw error;

    const orders  = (data ?? []).map(toOrder);
    const lastRow = data?.[data.length - 1];

    return {
      data:       orders,
      total:      count ?? 0,
      hasMore:    orders.length === PAGE_SIZE,
      // cursor is requestedAt — must match the .order() and .lt() field
      nextCursor: lastRow
        ? (lastRow.requested_at as string)
        : undefined,
    };
  }

  async acceptOrderAtomic(orderId: string, driverId: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({
        driver_id:   driverId,
        status:      'assigned',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('status', 'pending') // optimistic lock — only succeeds if still pending
      .select()
      .single();

    if (error || !data) throw new Error('ORDER_NOT_AVAILABLE');

    // ✅ Fixed: driver status update REMOVED from here.
    // This repository must not touch supabase.from('drivers').
    // After calling acceptOrderAtomic(), the use case layer must call:
    //   await driverRepository.updateStatus(driverId, 'busy')
    // Keeping cross-domain writes in the use case preserves bounded
    // context isolation and makes failures independently traceable.

    return toOrder(data as Record<string, unknown>);
  }

  async confirmDelivery(orderId: string, photoUrl: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status:             'delivered',
        delivery_photo_url: photoUrl,
        delivered_at:       new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Order not found');
    return toOrder(data as Record<string, unknown>);
  }

  async cancel(orderId: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status:       'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Order not found');
    return toOrder(data as Record<string, unknown>);
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Order not found');
    return toOrder(data as Record<string, unknown>);
  }

  async getAllOrders(cursor?: string): Promise<PaginatedResult<Order>> {
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .order('requested_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) query = query.lt('requested_at', cursor);

    const { data, error, count } = await query;
    if (error) throw error;

    const orders  = (data ?? []).map(toOrder);
    const lastRow = data?.[data.length - 1];

    return {
      data:       orders,
      total:      count ?? 0,
      hasMore:    orders.length === PAGE_SIZE,
      nextCursor: lastRow
        ? (lastRow.requested_at as string)
        : undefined,
    };
  }
}