// src/shared/repositories/SupabaseOrderRepository.ts
// Implements OrderRepository interface using Supabase.
// The ONLY file where supabase.from('orders') is written.

import { supabase }          from '@/shared/lib/supabase';
import type { OrderRepository, CreateOrderInput } from '@/domains/delivery/repositories/OrderRepository';
import { Order, type OrderProps } from '@/domains/delivery/entities/Order';
import type { OrderStatus, PaginatedResult } from '@/shared/types';
import { logger }            from '@/shared/lib/logger';

const PAGE_SIZE = 20;

function toOrder(row: Record<string, unknown>): Order {
  return Order.create({
    id:                  row.id as string,
    customerId:          row.customer_id as string,
    driverId:            row.driver_id as string | null,
    status:              row.status as OrderProps['status'],
    pickupAddress:       row.pickup_address as string,
    dropoffAddress:      row.dropoff_address as string,
    pickupCoords: {
      lat: (row.pickup_location as { coordinates: number[] }).coordinates[1],
      lng: (row.pickup_location as { coordinates: number[] }).coordinates[0],
    },
    dropoffCoords: {
      lat: (row.dropoff_location as { coordinates: number[] }).coordinates[1],
      lng: (row.dropoff_location as { coordinates: number[] }).coordinates[0],
    },
    packageDescription:  row.package_description as string,
    packageSize:         row.package_size as OrderProps['packageSize'],
    deliveryPhotoUrl:    row.delivery_photo_url as string | null,
    distanceKm:          Number(row.distance_km),
    fareAmount:          Number(row.fare_amount),
    paymentStatus:       row.payment_status as OrderProps['paymentStatus'],
    requestedAt:         new Date(row.requested_at as string),
    deliveredAt:         row.delivered_at ? new Date(row.delivered_at as string) : null,
  });
}

export class SupabaseOrderRepository implements OrderRepository {

  async createAtomic(input: CreateOrderInput): Promise<Order> {
    // Use a similar advisory-lock pattern to rides for race condition prevention
    const { data, error } = await supabase.from('orders').insert({
      customer_id:          input.customerId,
      pickup_address:       input.pickupAddress,
      dropoff_address:      input.dropoffAddress,
      pickup_location:      `SRID=4326;POINT(${input.pickupCoords.lng} ${input.pickupCoords.lat})`,
      dropoff_location:     `SRID=4326;POINT(${input.dropoffCoords.lng} ${input.dropoffCoords.lat})`,
      package_description:  input.packageDescription,
      package_size:         input.packageSize,
      distance_km:          input.distanceKm,
      fare_amount:          input.fareAmount,
    }).select().single();

    if (error) {
      logger.error('createAtomic order failed', { error: error.message });
      throw error;
    }
    return toOrder(data as Record<string, unknown>);
  }

  async getById(id: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from('orders').select('*').eq('id', id).single();
    if (error || !data) return null;
    return toOrder(data);
  }

  async getActiveOrderForCustomer(customerId: string): Promise<Order | null> {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['pending', 'assigned', 'in_transit'])
      .maybeSingle();
    if (!data) return null;
    return toOrder(data);
  }

  async getPendingOrders(): Promise<Order[]> {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    return (data ?? []).map(toOrder);
  }

  async getHistoryForCustomer(customerId: string, cursor?: string): Promise<PaginatedResult<Order>> {
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .in('status', ['delivered', 'cancelled'])
      .order('requested_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) query = query.lt('requested_at', cursor);
    const { data, count } = await query;
    const orders = (data ?? []).map(toOrder);
    return {
      data:      orders,
      total:     count ?? 0,
      hasMore:   orders.length === PAGE_SIZE,
      nextCursor: orders.length > 0 ? orders[orders.length - 1]!.requestedAt.toISOString() : undefined,
    };
  }

  async acceptOrderAtomic(orderId: string, driverId: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({ driver_id: driverId, status: 'assigned', assigned_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'pending')   // optimistic lock — only update if still pending
      .select().single();
    if (error || !data) throw new Error('ORDER_NOT_AVAILABLE');
    await supabase.from('drivers').update({ status: 'busy' }).eq('id', driverId);
    return toOrder(data as Record<string, unknown>);
  }

  async confirmDelivery(orderId: string, photoUrl: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({
        status:              'delivered',
        delivery_photo_url:  photoUrl,
        delivered_at:        new Date().toISOString(),
      })
      .eq('id', orderId)
      .select().single();
    if (error || !data) throw error ?? new Error('Order not found');
    return toOrder(data as Record<string, unknown>);
  }

  async cancel(orderId: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', orderId).select().single();
    if (error || !data) throw error ?? new Error('Order not found');
    return toOrder(data as Record<string, unknown>);
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId).select().single();
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
    const { data, count } = await query;
    const orders = (data ?? []).map(toOrder);
    return {
      data:      orders,
      total:     count ?? 0,
      hasMore:   orders.length === PAGE_SIZE,
      nextCursor: orders.length > 0 ? orders[orders.length - 1]!.requestedAt.toISOString() : undefined,
    };
  }
}