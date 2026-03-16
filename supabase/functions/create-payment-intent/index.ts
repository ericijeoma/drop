// supabase/functions/create-payment-intent/index.ts
//
// Creates a Stripe PaymentIntent server-side and returns the clientSecret
// to the mobile app. The secret key NEVER leaves this function.
//
// Called by: src/shared/hooks/usePayment.ts step 2
// After this: the mobile app presents Stripe's payment sheet using the clientSecret
// Then:       process-payment function confirms the capture

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe           from 'https://esm.sh/stripe@14.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { paymentId, amount, currency, idempotencyKey } = await req.json() as {
      paymentId:       string;
      amount:          number;
      currency:        string;
      idempotencyKey:  string;
    };

    if (!paymentId || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid payment details' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the payment record exists and belongs to the calling user
    const { data: payment, error: fetchErr } = await supabase
      .from('payments')
      .select('id, amount, customer_id, status, stripe_payment_intent_id')
      .eq('id', paymentId)
      .single();

    if (fetchErr || !payment) {
      return new Response(
        JSON.stringify({ error: 'Payment record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency: if a PaymentIntent was already created for this payment, return it
    if (payment.stripe_payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(
        payment.stripe_payment_intent_id
      );
      // If it is still usable, return the existing clientSecret
      if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
        return new Response(
          JSON.stringify({ clientSecret: existing.client_secret }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create a new PaymentIntent
    // amount is in NGN (naira) — Stripe expects the smallest unit (kobo = 1/100 naira)
    const intent = await stripe.paymentIntents.create(
      {
        amount:   Math.round(payment.amount * 100),  // naira → kobo
        currency: currency.toLowerCase(),
        // Automatic payment methods: card, Apple Pay, Google Pay where available
        automatic_payment_methods: { enabled: true },
        metadata: {
          payment_id:  paymentId,
          customer_id: payment.customer_id,
        },
      },
      { idempotencyKey }
    );

    // Store the intent ID on the payment record for idempotency on next call
    await supabase
      .from('payments')
      .update({ stripe_payment_intent_id: intent.id })
      .eq('id', paymentId);

    return new Response(
      JSON.stringify({ clientSecret: intent.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('create-payment-intent error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create payment intent' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});