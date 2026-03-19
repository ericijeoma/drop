// ────────────────────────────────────────────────────────────
// src/shared/hooks/usePayment.ts
//
// Now only owns: Stripe UI presentation.
// Fetching and confirming payment go through use cases.
// Zero direct Supabase calls.
// ────────────────────────────────────────────────────────────

import { useState }                    from 'react';
import { useStripe }                   from '@stripe/stripe-react-native';
import { useMutation }                 from '@tanstack/react-query';
import { DomainError }                 from '@/shared/types';
import { logger }                      from '@/shared/lib/logger';
import { InitiatePaymentUseCase }      from '@/domains/payment/usecases/InitiatePaymentUseCase';
import { CapturePaymentUseCase }       from '@/domains/payment/usecases/CapturePaymentUseCase';
import { SupabasePaymentRepository }   from '@/shared/repositories/SupabasePaymentRepository';

// ── Use case instances ────────────────────────────────────────
const paymentRepo    = new SupabasePaymentRepository();
const initiateUseCase = new InitiatePaymentUseCase(paymentRepo);
const captureUseCase  = new CapturePaymentUseCase(paymentRepo);

// ── Types ─────────────────────────────────────────────────────
type PaymentTarget =
  | { rideId: string;  orderId?: never }
  | { orderId: string; rideId?: never  };

type UsePaymentOptions = PaymentTarget & {
  fareAmount: number;
  onSuccess:  () => void;
  onError?:   (message: string) => void;
};

interface UsePaymentResult {
  pay:        () => Promise<void>;
  isPaying:   boolean;
  isComplete: boolean;
  error:      string | null;
}

export function usePayment({
  rideId,
  orderId,
  fareAmount,
  onSuccess,
  onError,
}: UsePaymentOptions): UsePaymentResult {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isComplete, setIsComplete] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null);

      // ── Step 1: Fetch payment record + create PaymentIntent ──
      // Delegated entirely to InitiatePaymentUseCase —
      // no Supabase calls here.
      const sheetData = await initiateUseCase.execute(
        rideId  ?? null,
        orderId ?? null,
      );

      // Already captured — skip Stripe entirely
      if (!sheetData) {
        setIsComplete(true);
        onSuccess();
        return;
      }

      // ── Step 2: Initialise Stripe Payment Sheet ───────────────
      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName:       'Drop',
        paymentIntentClientSecret: sheetData.clientSecret,
        defaultBillingDetails: {
          address: { country: 'NG' },
        },
        appearance: {
          colors: {
            primary:    '#4ADE80',
            background: '#1A1B1F',
          },
        },
        applePay: { merchantCountryCode: 'NG' },
        googlePay: {
          merchantCountryCode: 'NG',
          testEnv:             __DEV__,
        },
      });

      if (initErr) throw new DomainError(initErr.message, 'SHEET_INIT_FAILED');

      // ── Step 3: Present sheet — user taps Pay ─────────────────
      const { error: presentErr } = await presentPaymentSheet();

      if (presentErr) {
        if (presentErr.code === 'Canceled') return;
        throw new DomainError(presentErr.message, 'PAYMENT_DECLINED');
      }

      // ── Step 4: Confirm capture via use case ──────────────────
      // No Supabase call here — delegated to CapturePaymentUseCase.
      await captureUseCase.execute(sheetData.paymentId);

      logger.info('Payment flow complete', {
        paymentId: sheetData.paymentId,
        rideId,
        orderId,
        amount: fareAmount,
      });

      setIsComplete(true);
      onSuccess();
    },

    onError: (e: unknown) => {
      const message = e instanceof DomainError
        ? e.message
        : 'Payment failed. Please try again.';
      setError(message);
      onError?.(message);
      logger.error('Payment failed', {
        rideId,
        orderId,
        error: e instanceof Error ? e.message : String(e),
      });
    },
  });

  return {
    pay:       mutation.mutateAsync,
    isPaying:  mutation.isPending,
    isComplete,
    error,
  };
}