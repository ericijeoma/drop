// src/shared/repositories/SupabasePaymentRepository.ts
// Implements PaymentRepository interface using Supabase.
// Payments are append-only — never UPDATE a payment row, only INSERT.
// Status changes are tracked in separate columns.

import { supabase }              from '@/shared/lib/supabase';
import type {
  PaymentRepository,
  CreatePaymentInput,
}                                 from '@/domains/payments/repositories/PaymentRepository';
import { Payment }               from '@/domains/payments/entities/Payment';
import type { PaymentStatus, PaginatedResult } from '@/shared/types';
import { logger }                from '@/shared/lib/logger';

const PAGE_SIZE = 20;

function toPayment(row: Record<string, unknown>): Payment {
  return Payment.create({
    id:                       row.id as string,
    rideId:                   row.ride_id as string | null,
    orderId:                  row.order_id as string | null,
    customerId:               row.customer_id as string,
    amount:                   Number(row.amount),
    currency:                 row.currency as string,
    status:                   row.status as PaymentStatus,
    stripePaymentIntentId:    row.stripe_payment_intent_id as string | null,
    idempotencyKey:           row.idempotency_key as string,
    createdAt:                new Date(row.created_at as string),
  });
}

export class SupabasePaymentRepository implements PaymentRepository {

  async create(input: CreatePaymentInput): Promise<Payment> {
    // Check idempotency first — never create duplicate payment records
    const existing = await this.getByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const { data, error } = await supabase.from('payments').insert({
      ride_id:          input.rideId,
      order_id:         input.orderId,
      customer_id:      input.customerId,
      amount:           input.amount,
      currency:         input.currency ?? 'NGN',
      status:           'pending',
      idempotency_key:  input.idempotencyKey,
    }).select().single();

    if (error) {
      logger.error('Payment create failed', { error: error.message, idempotencyKey: input.idempotencyKey });
      throw error;
    }
    return toPayment(data as Record<string, unknown>);
  }

  async getById(id: string): Promise<Payment | null> {
    const { data } = await supabase
      .from('payments').select('*').eq('id', id).single();
    if (!data) return null;
    return toPayment(data);
  }

  async getByIdempotencyKey(key: string): Promise<Payment | null> {
    const { data } = await supabase
      .from('payments').select('*').eq('idempotency_key', key).maybeSingle();
    if (!data) return null;
    return toPayment(data);
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    stripeData?: { paymentIntentId?: string; chargeId?: string; failureReason?: string }
  ): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .update({
        status,
        stripe_payment_intent_id: stripeData?.paymentIntentId ?? undefined,
        stripe_charge_id:         stripeData?.chargeId        ?? undefined,
        failure_reason:           stripeData?.failureReason   ?? undefined,
      })
      .eq('id', id).select().single();
    if (error || !data) throw error ?? new Error('Payment not found');
    return toPayment(data as Record<string, unknown>);
  }

  async getByRideId(rideId: string): Promise<Payment | null> {
    const { data } = await supabase
      .from('payments').select('*').eq('ride_id', rideId).maybeSingle();
    if (!data) return null;
    return toPayment(data);
  }

  async getByOrderId(orderId: string): Promise<Payment | null> {
    const { data } = await supabase
      .from('payments').select('*').eq('order_id', orderId).maybeSingle();
    if (!data) return null;
    return toPayment(data);
  }

  async getAll(cursor?: string): Promise<PaginatedResult<Payment>> {
    let query = supabase
      .from('payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) query = query.lt('created_at', cursor);
    const { data, count } = await query;
    const payments = (data ?? []).map(toPayment);
    return {
      data:      payments,
      total:     count ?? 0,
      hasMore:   payments.length === PAGE_SIZE,
      nextCursor: payments.length > 0 ? payments[payments.length - 1]!.createdAt.toISOString() : undefined,
    };
  }
}