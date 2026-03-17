// src/shared/hooks/usePayment.ts
//
// Shared payment hook — handles Stripe collection for BOTH rides and orders.
// Accepts either rideId or orderId. Never both.
//
// Used by:
//   src/app/(customer)/track-ride.tsx     → passes { rideId }
//   src/app/(customer)/track-delivery.tsx → passes { orderId }

import { useState }              from 'react';
import { useStripe }             from '@stripe/stripe-react-native';
import { useMutation }           from '@tanstack/react-query';
import { supabase }              from '@/shared/lib/supabase';
import { logger }                from '@/shared/lib/logger';
import { DomainError }           from '@/shared/types';

// ── Input: exactly one of rideId or orderId must be provided ──
type PaymentTarget =
  | { rideId: string;  orderId?: never }
  | { orderId: string; rideId?: never  };

// ✅ type alias with & handles unions correctly
type UsePaymentOptions = PaymentTarget & {
  fareAmount: number;
  onSuccess:  () => void;
  onError?:   (message: string) => void;
};

interface UsePaymentResult {
  pay:          () => Promise<void>;
  isPaying:     boolean;
  isComplete:   boolean;
  error:        string | null;
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

      // ── Step 1: Fetch the pending payment record ─────────────
      // The payment record was created by CompleteRideUseCase or
      // ConfirmDeliveryUseCase when the trip ended.
      const column = rideId ? 'ride_id' : 'order_id';
      const value  = rideId ?? orderId!;

      const { data: payment, error: fetchErr } = await supabase
        .from('payments')
        .select('id, amount, idempotency_key, stripe_payment_intent_id, status')
        .eq(column, value)
        .eq('status', 'pending')
        .maybeSingle();

      if (fetchErr) throw new DomainError('Could not load payment details.', 'PAYMENT_FETCH_FAILED');

      // Idempotency guard — already captured, skip Stripe entirely
      if (!payment || payment.status === 'captured') {
        setIsComplete(true);
        onSuccess();
        return;
      }

      // ── Step 2: Create a Stripe PaymentIntent via Edge Function ─
      // The Edge Function holds the Stripe secret key — never the client.
      const { data: intentData, error: intentErr } = await supabase.functions.invoke(
        'create-payment-intent',
        {
          body: {
            paymentId:      payment.id,
            amount:         payment.amount,
            currency:       'ngn',
            idempotencyKey: payment.idempotency_key,
          },
        }
      );

      if (intentErr || !intentData?.clientSecret) {
        throw new DomainError('Could not initialise payment.', 'INTENT_CREATION_FAILED');
      }

      // ── Step 3: Initialise Stripe Payment Sheet ───────────────
      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName:        'Drop',
        paymentIntentClientSecret:  intentData.clientSecret,
        defaultBillingDetails: {
          address: { country: 'NG' },
        },
        appearance: {
          colors: {
            primary:    '#4ADE80',
            background: '#1A1B1F',
          },
        },
        // Allow Apple Pay / Google Pay where available
        applePay: {
          merchantCountryCode: 'NG',
        },
        googlePay: {
          merchantCountryCode: 'NG',
          testEnv:             __DEV__,
        },
      });

      if (initErr) throw new DomainError(initErr.message, 'SHEET_INIT_FAILED');

      // ── Step 4: Present the sheet — user taps Pay ─────────────
      const { error: presentErr } = await presentPaymentSheet();

      if (presentErr) {
        // User cancelled — not an error worth logging
        if (presentErr.code === 'Canceled') return;
        throw new DomainError(presentErr.message, 'PAYMENT_DECLINED');
      }

      // ── Step 5: Confirm capture on our backend ────────────────
      const { error: captureErr } = await supabase.functions.invoke(
        'process-payment',
        { body: { paymentId: payment.id } }
      );

      if (captureErr) {
        throw new DomainError(
          'Payment was taken but confirmation failed. Contact support.',
          'CAPTURE_CONFIRM_FAILED'
        );
      }

      logger.info('Payment captured', {
        paymentId: payment.id,
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
      logger.error('Payment failed', { rideId, orderId, error: String(e) });
    },
  });

  return {
    pay:       mutation.mutateAsync,
    isPaying:  mutation.isPending,
    isComplete,
    error,
  };
}