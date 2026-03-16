// ────────────────────────────────────────────────────────────
// supabase/functions/timeout-ride/index.ts
// Cron job: marks stale pending rides as timed_out.
// Run every minute via pg_cron or Supabase cron.
// ────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (_req: Request) => {
  const now = new Date().toISOString();

  // Timeout rides that have been pending past their timeout_at
  const { data: timedOutRides, error: rideError } = await supabase
    .from('rides')
    .update({ status: 'timed_out' })
    .eq('status', 'pending')
    .lt('timeout_at', now)
    .select('id, customer_id');

  // Timeout orders similarly
  const { data: timedOutOrders, error: orderError } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .lt('timeout_at', now)
    .select('id, customer_id');

  const timedCount   = timedOutRides?.length ?? 0;
  const cancelCount  = timedOutOrders?.length ?? 0;

  // Notify customers about timed out rides
  if (timedOutRides && timedOutRides.length > 0) {
    const notifications = timedOutRides.map((ride: { id: string; customer_id: string }) => ({
      user_id: ride.customer_id,
      type:    'system_alert',
      title:   'No driver found',
      body:    'We could not find a driver for your ride. Please try again.',
      data:    { ride_id: ride.id },
    }));
    await supabase.from('notifications').insert(notifications);
  }

  console.log(`Timed out: ${timedCount} rides, ${cancelCount} orders`);

  return new Response(JSON.stringify({
    timedOutRides:  timedCount,
    cancelledOrders: cancelCount,
    errors: [rideError?.message, orderError?.message].filter(Boolean),
  }), { headers: { 'Content-Type': 'application/json' } });
});