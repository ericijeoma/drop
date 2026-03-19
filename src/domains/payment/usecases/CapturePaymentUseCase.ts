// ────────────────────────────────────────────────────────────
// src/domains/payment/usecases/CapturePaymentUseCase.ts
//
// Confirms payment capture with our backend after
// the Stripe sheet succeeds.
// ────────────────────────────────────────────────────────────

import type { PaymentRepository } from '../repositories/PaymentRepository';
import { DomainError }            from '@/shared/types';
import { supabase }               from '@/shared/lib/supabase';
import { logger }                 from '@/shared/lib/logger';

export class CapturePaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async execute(paymentId: string): Promise<void> {
    const { error } = await supabase.functions.invoke(
      'process-payment',
      { body: { paymentId } },
    );

    if (error) {
      throw new DomainError(
        'Payment was taken but confirmation failed. Contact support.',
        'CAPTURE_CONFIRM_FAILED',
      );
    }

    logger.info('Payment captured', { paymentId });
  }
}