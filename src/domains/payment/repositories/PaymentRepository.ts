// ────────────────────────────────────────────────────────────
// src/domains/payment/repositories/PaymentRepository.ts
//
// Domain port — what the payment bounded context needs from
// any persistence provider. Zero infrastructure imports.
//
// Core invariant: payments are APPEND-ONLY. Once a payment row
// exists it is never deleted. Status changes are updates to
// existing rows, never replacements. This preserves a full
// audit trail for every financial event.
// ────────────────────────────────────────────────────────────

import type { Payment }           from '@/domains/payment/entities/Payment';
import type { PaymentStatus, PaginatedResult } from '@/shared/types';

// ── Input Value Objects ───────────────────────────────────────

/**
 * CreatePaymentInput
 *
 * Value Object — the data required to open a new payment record.
 * No ID (database assigns it). No status (always starts 'pending').
 *
 * Either rideId OR orderId must be provided — never both, never
 * neither. A payment must always be traceable to exactly one
 * business event.
 *
 * idempotencyKey is the caller's responsibility to generate
 * (e.g. `pay_${rideId}` or `pay_${orderId}`). It prevents
 * duplicate payment rows if the same request is retried.
 */
export interface CreatePaymentInput {
  rideId:          string | null;
  orderId:         string | null;
  customerId:      string;
  amount:          number;
  currency?:       string;        // defaults to 'NGN' in implementation
  idempotencyKey:  string;
}

/**
 * StripeUpdateData
 *
 * Value Object — the optional Stripe-specific fields that may
 * be attached when a payment status changes. Named explicitly
 * so callers are not writing anonymous inline shapes.
 */
export interface StripeUpdateData {
  paymentIntentId?: string;
  chargeId?:        string;
  failureReason?:   string;
}

/**
 * PaymentRepository
 *
 * The single source of truth for payment persistence within
 * the payment bounded context.
 *
 * Rules:
 *  - All methods are async.
 *  - Nullable returns mean "not found" — not a failure.
 *  - Throw only for genuine persistence failures.
 *  - NEVER delete payment rows. NEVER insert to correct a mistake.
 *    Status transitions are the only mutations permitted.
 */
export interface PaymentRepository {

  // ── Queries ─────────────────────────────────────────────

  /**
   * Find a payment by its internal ID.
   * Returns null if not found.
   */
  getById(id: string): Promise<Payment | null>;

  /**
   * Find a payment by its idempotency key.
   * Used to detect and return existing payments on retry.
   * Returns null if no payment was created with this key.
   */
  getByIdempotencyKey(key: string): Promise<Payment | null>;

  /**
   * Find the payment linked to a specific ride.
   * Returns null if no payment exists for that ride yet.
   */
  getByRideId(rideId: string): Promise<Payment | null>;

  /**
   * Find the payment linked to a specific delivery order.
   * Returns null if no payment exists for that order yet.
   */
  getByOrderId(orderId: string): Promise<Payment | null>;

  /**
   * Returns a paginated list of ALL payments, newest first.
   * For admin and finance use only.
   * Cursor is the createdAt ISO string of the last record.
   */
  getAll(cursor?: string): Promise<PaginatedResult<Payment>>;

  // ── Commands ────────────────────────────────────────────

  /**
   * Creates a new payment record in 'pending' status.
   *
   * Idempotent — if a payment with the same idempotencyKey
   * already exists, it is returned immediately without inserting
   * a duplicate. The database must also enforce uniqueness on
   * idempotency_key as a safety net against race conditions.
   *
   * Throws on persistence failure.
   */
  create(input: CreatePaymentInput): Promise<Payment>;

  /**
   * Transitions a payment to a new status.
   * Optionally attaches Stripe metadata (intent ID, charge ID,
   * or failure reason) relevant to the transition.
   *
   * Permitted transitions:
   *   pending → succeeded  (payment captured)
   *   pending → failed     (payment declined)
   *   pending → cancelled  (payment abandoned)
   *
   * Throws if the payment is not found.
   */
  updateStatus(
    id:          string,
    status:      PaymentStatus,
    stripeData?: StripeUpdateData,
  ): Promise<Payment>;
}