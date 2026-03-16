// ────────────────────────────────────────────────────────────
// supabase/functions/send-notification/index.ts
// Push notification dispatch via Firebase FCM.
// ────────────────────────────────────────────────────────────

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const FCM_KEY = Deno.env.get('FCM_SERVER_KEY') ?? '';

interface NotificationPayload {
  userId:  string;
  type:    string;
  title:   string;
  body:    string;
  data?:   Record<string, string>;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const payload = await req.json() as NotificationPayload;

    // Get FCM token for user
    const { data: driver } = await supabase
      .from('drivers')
      .select('fcm_token')
      .eq('user_id', payload.userId)
      .maybeSingle();

    const fcmToken = driver?.fcm_token;

    // Log notification to database regardless of delivery success
    await supabase.from('notifications').insert({
      user_id: payload.userId,
      type:    payload.type,
      title:   payload.title,
      body:    payload.body,
      data:    payload.data ?? {},
    });

    // Send push notification if FCM token exists
    if (fcmToken) {
      const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `key=${FCM_KEY}`,
        },
        body: JSON.stringify({
          to:           fcmToken,
          notification: { title: payload.title, body: payload.body },
          data:         payload.data ?? {},
        }),
      });

      if (!fcmRes.ok) {
        console.warn('FCM delivery failed:', await fcmRes.text());
      }
    }

    return new Response(JSON.stringify({ sent: !!fcmToken }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('send-notification error:', error);
    return new Response(JSON.stringify({ error: 'Notification failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});


