// ────────────────────────────────────────────────────────────
// src/domains/payments/entities/Payment.ts
// ────────────────────────────────────────────────────────────

import type { PaymentStatus } from '@/shared/types';
import { DomainError } from '@/shared/types';

export interface PaymentProps {
  readonly id: string;
  readonly rideId: string | null;
  readonly orderId: string | null;
  readonly customerId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly stripePaymentIntentId: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
}

export class Payment {
  private _status: PaymentStatus;

  private constructor(private readonly props: PaymentProps) {
    this._status = props.status;
  }

  static create(props: PaymentProps): Payment {
    if (props.amount <= 0) {
      throw new DomainError('Payment amount must be greater than zero.', 'INVALID_AMOUNT');
    }
    if (!props.idempotencyKey) {
      throw new DomainError('Idempotency key is required.', 'MISSING_IDEMPOTENCY_KEY');
    }
    // Must belong to exactly one: ride or order
    const hasRide  = props.rideId !== null;
    const hasOrder = props.orderId !== null;
    if (hasRide === hasOrder) {
      throw new DomainError(
        'Payment must belong to either a ride or an order, not both or neither.',
        'INVALID_PAYMENT_REFERENCE'
      );
    }
    return new Payment(props);
  }

  get id(): string                              { return this.props.id; }
  get rideId(): string | null                   { return this.props.rideId; }
  get orderId(): string | null                  { return this.props.orderId; }
  get customerId(): string                      { return this.props.customerId; }
  get amount(): number                          { return this.props.amount; }
  get currency(): string                        { return this.props.currency; }
  get status(): PaymentStatus                   { return this._status; }
  get stripePaymentIntentId(): string | null    { return this.props.stripePaymentIntentId; }
  get idempotencyKey(): string                  { return this.props.idempotencyKey; }
  get createdAt(): Date                         { return this.props.createdAt; }

  capture(): void {
    if (this._status !== 'pending') {
      throw new DomainError('Can only capture a pending payment.', 'PAYMENT_NOT_PENDING');
    }
    this._status = 'captured';
  }

  markFailed(): void {
    if (this._status !== 'pending') {
      throw new DomainError('Can only fail a pending payment.', 'PAYMENT_NOT_PENDING');
    }
    this._status = 'failed';
  }

  isPending(): boolean   { return this._status === 'pending'; }
  isCaptured(): boolean  { return this._status === 'captured'; }

  toJSON() {
    return { ...this.props, status: this._status };
  }
}