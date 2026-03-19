// ────────────────────────────────────────────────────────────
// src/domains/payment/usecases/InitiatePaymentUseCase.ts
//
// Fetches the pending payment record and returns everything
// the Stripe sheet needs. Does NOT present the sheet —
// that is a UI concern handled by the hook.
// ────────────────────────────────────────────────────────────

import type { PaymentRepository } from '../repositories/PaymentRepository';
import { DomainError }            from '@/shared/types';
import { supabase }               from '@/shared/lib/supabase';
import { logger }                 from '@/shared/lib/logger';

export interface PaymentSheetData {
  paymentId:    string;
  clientSecret: string;
  amount:       number;
}

export class InitiatePaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async execute(
    rideId:  string | null,
    orderId: string | null,
  ): Promise<PaymentSheetData | null> {
    // ── Step 1: Fetch pending payment via repository ──────────
    const payment = rideId
      ? await this.paymentRepository.getByRideId(rideId)
      : await this.paymentRepository.getByOrderId(orderId!);

    if (!payment) {
      throw new DomainError(
        'Could not load payment details.',
        'PAYMENT_FETCH_FAILED',
      );
    }

    // Already captured — nothing to do
    if (payment.isCaptured()) return null;

    // ── Step 2: Create Stripe PaymentIntent via Edge Function ─
    // Edge Function holds the secret key — never the client.
    const { data: intentData, error: intentErr } = await supabase.functions.invoke(
      'create-payment-intent',
      {
        body: {
          paymentId:      payment.id,
          amount:         payment.amount,
          currency:       'ngn',
          idempotencyKey: payment.idempotencyKey,
        },
      },
    );

    if (intentErr || !intentData?.clientSecret) {
      throw new DomainError(
        'Could not initialise payment.',
        'INTENT_CREATION_FAILED',
      );
    }

    logger.debug('PaymentIntent created', { paymentId: payment.id });

    return {
      paymentId:    payment.id,
      clientSecret: intentData.clientSecret,
      amount:       payment.amount,
    };
  }
}