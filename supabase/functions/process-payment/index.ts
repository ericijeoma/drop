// supabase/functions/process-payment/index.ts
// Stripe payment processing — MUST run server-side.
// Payment secrets never touch the client device.

import { serve }               from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe                  from 'https://esm.sh/stripe@14.0.0?target=deno';
import { createClient }        from 'https://esm.sh/@supabase/supabase-js@2';

const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-11-20.acacia' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { paymentId, stripePaymentMethodId } = await req.json() as {
      paymentId:              string;
      stripePaymentMethodId:  string;
    };

    // Fetch the pending payment record
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !payment) {
      return new Response(JSON.stringify({ error: 'Payment not found or already processed' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Idempotency: check if Stripe payment intent already exists
    if (payment.stripe_payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
      if (existing.status === 'succeeded') {
        return new Response(JSON.stringify({ success: true, alreadyCaptured: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Create Stripe payment intent
    const intent = await stripe.paymentIntents.create({
      amount:               payment.amount * 100,  // Stripe uses kobo (NGN smallest unit)
      currency:             payment.currency.toLowerCase(),
      payment_method:       stripePaymentMethodId,
      confirm:              true,
      return_url:           'drop://payment-complete',
      metadata: {
        payment_id:   payment.id,
        customer_id:  payment.customer_id,
        ride_id:      payment.ride_id ?? '',
        order_id:     payment.order_id ?? '',
      },
      idempotency_key: payment.idempotency_key,
    });

    const succeeded = intent.status === 'succeeded';

    // Update payment record
    await supabase.from('payments').update({
      status:                    succeeded ? 'captured' : 'failed',
      stripe_payment_intent_id:  intent.id,
      stripe_charge_id:          intent.latest_charge as string | null,
      failure_reason:            succeeded ? null : intent.last_payment_error?.message,
    }).eq('id', paymentId);

    // If ride payment succeeded, update ride payment_status
    if (succeeded && payment.ride_id) {
      await supabase.from('rides')
        .update({ payment_status: 'captured' })
        .eq('id', payment.ride_id);
    }

    if (succeeded && payment.order_id) {
      await supabase.from('orders')
        .update({ payment_status: 'captured' })
        .eq('id', payment.order_id);
    }

    return new Response(JSON.stringify({ success: succeeded }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('process-payment error:', error);
    return new Response(JSON.stringify({ error: 'Payment processing failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});


