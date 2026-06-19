// ============================================================
// send-sms — نظام المعارض
// يرسل SMS عبر Prelude Transactional API (نفس مزوّد Blackaxis)
// يُستدعى من trigger قاعدة البيانات عبر pg_net، أو POST يدوي.
// Body: { to: "+9665...", template_key: "notification_ar", variables: { body: "..." } }
// Secrets المطلوبة على المشروع: PRELUDE_API_KEY  (واختياري: PRELUDE_SENDER_ID)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PRELUDE_API_KEY = Deno.env.get('PRELUDE_API_KEY')!;
const PRELUDE_SENDER_ID = Deno.env.get('PRELUDE_SENDER_ID') || null;
const PRELUDE_CALLBACK_URL = Deno.env.get('PRELUDE_CALLBACK_URL') || null;

// عميل يستهدف سكيمة exhibitions
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'exhibitions' },
  auth: { autoRefreshToken: false, persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// تطبيع رقم الجوال السعودي إلى E.164
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('966')) return `+${d}`;
  if (d.startsWith('05') && d.length === 10) return `+966${d.slice(1)}`;
  if (d.startsWith('5') && d.length === 9) return `+966${d}`;
  if (phone.startsWith('+')) return phone.replace(/\s/g, '');
  return `+${d}`;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { to, template_key, variables } = await req.json();
    if (!to || !template_key) {
      return json({ success: false, error: 'to و template_key مطلوبة' }, 400);
    }

    const phone = normalizePhone(String(to));
    if (!phone) {
      await supabase.from('sms_log').insert({
        recipient: String(to), template_key, variables,
        status: 'skipped', error: 'رقم جوال غير صالح',
      });
      return json({ success: false, error: 'رقم جوال غير صالح', skipped: true });
    }

    // جلب معرّف قالب Prelude
    const { data: tmpl, error: tErr } = await supabase
      .from('sms_templates')
      .select('prelude_template_id')
      .eq('template_key', template_key)
      .eq('is_active', true)
      .single();

    if (tErr || !tmpl) {
      await supabase.from('sms_log').insert({
        recipient: phone, template_key, variables,
        status: 'skipped', error: 'قالب غير مُسجّل',
      });
      return json({ success: false, error: `قالب غير مُسجّل: ${template_key}` }, 404);
    }

    const payload: Record<string, unknown> = {
      template_id: tmpl.prelude_template_id,
      to: phone,
      variables: variables || {},
      locale: 'ar',
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    if (PRELUDE_SENDER_ID) payload.from = PRELUDE_SENDER_ID;
    if (PRELUDE_CALLBACK_URL) payload.callback_url = PRELUDE_CALLBACK_URL;

    let res: Response, data: any;
    try {
      res = await fetch('https://api.prelude.dev/v2/transactional', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PRELUDE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      data = await res.json().catch(() => ({}));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from('sms_log').insert({
        recipient: phone, template_key, variables, status: 'failed', error: msg,
      });
      return json({ success: false, error: msg }, 500);
    }

    if (!res.ok) {
      const msg = data?.message || data?.error || `HTTP ${res.status}`;
      await supabase.from('sms_log').insert({
        recipient: phone, template_key, variables, status: 'failed', error: msg,
      });
      return json({ success: false, error: msg, prelude: data }, 502);
    }

    await supabase.from('sms_log').insert({
      recipient: phone, template_key, variables,
      status: 'sent', provider_message_id: data?.id || null,
    });
    return json({ success: true, prelude_id: data?.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ success: false, error: msg }, 500);
  }
});
