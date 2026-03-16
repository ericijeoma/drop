// ────────────────────────────────────────────────────────────
// src/shared/repositories/SupabasePaymentRepository.ts
//
// Infrastructure adapter — the ONLY file that touches
// supabase.from('payments'). All payment persistence lives here.
//
// Payments are append-only — never UPDATE a payment row,
// only INSERT. Status changes update existing rows but
// never delete or replace them.
// ────────────────────────────────────────────────────────────

import { supabase }              from '@/shared/lib/supabase';
import type {
  PaymentRepository,
  CreatePaymentInput,
  StripeUpdateData,
}                                from '@/domains/payment/repositories/PaymentRepository';
import { Payment }               from '@/domains/payment/entities/Payment';
import type { PaymentStatus, PaginatedResult } from '@/shared/types';
import { logger }                from '@/shared/lib/logger';

// ── Constants ────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── Row mapper ───────────────────────────────────────────────

function toPayment(row: Record<string, unknown>): Payment {
  return Payment.create({
    id:                    row.id                       as string,
    rideId:                row.ride_id                  as string | null,
    orderId:               row.order_id                 as string | null,
    customerId:            row.customer_id              as string,
    amount:                Number(row.amount),
    currency:              row.currency                 as string,
    status:                row.status                   as PaymentStatus,
    stripePaymentIntentId: row.stripe_payment_intent_id as string | null,
    idempotencyKey:        row.idempotency_key          as string,
    createdAt:             new Date(row.created_at      as string),
  });
}

// ── Repository ───────────────────────────────────────────────

export class SupabasePaymentRepository implements PaymentRepository {

  async create(input: CreatePaymentInput): Promise<Payment> {
    // Fast-path idempotency check — return existing record on retry.
    // NOTE: the database must ALSO have a unique constraint on
    // idempotency_key to guard against concurrent duplicate inserts
    // that slip past this code-level check.
    const existing = await this.getByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    const { data, error } = await supabase
      .from('payments')
      .insert({
        ride_id:         input.rideId,
        order_id:        input.orderId,
        customer_id:     input.customerId,
        amount:          input.amount,
        currency:        input.currency ?? 'NGN',
        status:          'pending',             // invariant — always starts pending
        idempotency_key: input.idempotencyKey,
      })
      .select()
      .single();

    if (error) {
      logger.error('Payment create failed', {
        error:          error.message,
        idempotencyKey: input.idempotencyKey,
      });
      throw error;
    }
    return toPayment(data as Record<string, unknown>);
  }

  async getById(id: string): Promise<Payment | null> {
    // ✅ Fixed: was .single() which throws when no row is found.
    // .maybeSingle() returns null cleanly — absence is not an error.
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.warn('getById failed', { id, error: error.message });
      return null;
    }
    if (!data) return null;
    return toPayment(data);
  }

  async getByIdempotencyKey(key: string): Promise<Payment | null> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) {
      logger.warn('getByIdempotencyKey failed', { key, error: error.message });
      return null;
    }
    if (!data) return null;
    return toPayment(data);
  }

  async updateStatus(
    id:          string,
    status:      PaymentStatus,
    stripeData?: StripeUpdateData,
  ): Promise<Payment> {
    // ✅ Fixed: removed `?? undefined` — optional chaining already
    // returns undefined when stripeData is absent, which tells
    // Supabase to omit those fields from the PATCH entirely,
    // preserving whatever values are already in the row.
    const { data, error } = await supabase
      .from('payments')
      .update({
        status,
        stripe_payment_intent_id: stripeData?.paymentIntentId,
        stripe_charge_id:         stripeData?.chargeId,
        failure_reason:           stripeData?.failureReason,
      })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Payment not found');
    return toPayment(data as Record<string, unknown>);
  }

  async getByRideId(rideId: string): Promise<Payment | null> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('ride_id', rideId)
      .maybeSingle();
    if (error) {
      logger.warn('getByRideId failed', { rideId, error: error.message });
      return null;
    }
    if (!data) return null;
    return toPayment(data);
  }

  async getByOrderId(orderId: string): Promise<Payment | null> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) {
      logger.warn('getByOrderId failed', { orderId, error: error.message });
      return null;
    }
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

    // ✅ Fixed: destructure error so query failures surface instead
    // of silently returning an empty list to the caller
    const { data, error, count } = await query;
    if (error) throw error;

    const payments = (data ?? []).map(toPayment);
    const lastRow  = data?.[data.length - 1];

    return {
      data:      payments,
      total:     count ?? 0,
      hasMore:   payments.length === PAGE_SIZE,
      // ✅ Fixed: read cursor from raw row, not through domain entity
      // — consistent with every other repository in this codebase
      nextCursor: lastRow
        ? (lastRow.created_at as string)
        : undefined,
    };
  }
}