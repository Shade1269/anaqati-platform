-- ============================================================
-- نظام المعارض — ربط الإشعارات بـ SMS عبر Prelude (Migration 004)
-- نفس مزوّد Blackaxis (api.prelude.dev). schema: exhibitions
-- ============================================================

-- إعدادات عامة (رابط الدوال + المفتاح العام للاستدعاء)
create table if not exists exhibitions.app_config (
  key   text primary key,
  value text
);
insert into exhibitions.app_config(key,value) values
  ('functions_base_url','https://axzqbqzdvtlbgbwzeiry.supabase.co/functions/v1'),
  ('anon_key','sb_publishable_9HzBp1FRow_JM8a5Hs81Ag_OZ48Y3Xi')
on conflict (key) do update set value=excluded.value;

-- قوالب Prelude (المفتاح المنطقي → معرّف القالب في لوحة Prelude)
create table if not exists exhibitions.sms_templates (
  template_key        text primary key,        -- مثال: notification_ar
  prelude_template_id text not null,           -- من لوحة Prelude
  description         text,
  is_active           boolean not null default true
);

-- سجل الرسائل المرسلة
create table if not exists exhibitions.sms_log (
  id                  uuid primary key default gen_random_uuid(),
  recipient           text not null,
  template_key        text,
  variables           jsonb,
  status              text not null default 'queued',  -- queued|sent|failed|skipped
  provider            text default 'prelude',
  provider_message_id text,
  error               text,
  created_at          timestamptz not null default now()
);

-- RLS + صلاحيات (الوصول الفعلي عبر service_role/الـ trigger)
alter table exhibitions.app_config   enable row level security;
alter table exhibitions.sms_templates enable row level security;
alter table exhibitions.sms_log      enable row level security;
do $$ declare t text; begin
  foreach t in array array['app_config','sms_templates','sms_log'] loop
    execute format('drop policy if exists admin_all on exhibitions.%I', t);
    execute format('create policy admin_all on exhibitions.%I for all to authenticated using (exhibitions.is_admin()) with check (exhibitions.is_admin())', t);
  end loop;
end $$;
grant all on exhibitions.app_config, exhibitions.sms_templates, exhibitions.sms_log to service_role;

-- ============================================================
-- إرسال SMS عبر استدعاء Edge Function (pg_net) — يُستدعى من الـ trigger
-- ============================================================
create or replace function exhibitions.send_sms(p_phone text, p_template_key text, p_vars jsonb)
returns bigint language plpgsql security definer set search_path=exhibitions,public,extensions as $$
declare v_url text; v_key text; v_req bigint;
begin
  if p_phone is null or p_phone='' then return null; end if;
  select value into v_url from exhibitions.app_config where key='functions_base_url';
  select value into v_key from exhibitions.app_config where key='anon_key';
  select net.http_post(
    url     := v_url || '/send-sms',
    headers := jsonb_build_object('Content-Type','application/json','apikey',v_key,'Authorization','Bearer '||v_key),
    body    := jsonb_build_object('to',p_phone,'template_key',p_template_key,'variables',p_vars)
  ) into v_req;
  return v_req;
end $$;

-- ============================================================
-- Trigger: كل إشعار جديد لمستخدم عنده رقم جوال → SMS (لو القالب مُفعّل)
-- يتجاهل بصمت لو ما في قالب مُسجّل بعد (تدهور آمن)
-- ============================================================
create or replace function exhibitions._notify_sms() returns trigger
language plpgsql security definer set search_path=exhibitions,public,extensions as $$
declare v_phone text; v_tmpl text;
begin
  select phone into v_phone from exhibitions.profiles where id = NEW.recipient_id;
  if v_phone is null then return NEW; end if;
  select prelude_template_id into v_tmpl from exhibitions.sms_templates
    where template_key='notification_ar' and is_active limit 1;
  if v_tmpl is null then return NEW; end if;   -- لا يوجد قالب بعد → اكتفِ بالإشعار داخل النظام
  perform exhibitions.send_sms(v_phone,'notification_ar',
    jsonb_build_object('body', coalesce(NEW.title,'') ||
      case when coalesce(NEW.body,'')<>'' then ' - '||NEW.body else '' end));
  return NEW;
end $$;

drop trigger if exists trg_notify_sms on exhibitions.notifications;
create trigger trg_notify_sms after insert on exhibitions.notifications
  for each row execute function exhibitions._notify_sms();

-- منع استدعاء الدوال الداخلية مباشرة من العملاء
revoke execute on function exhibitions.send_sms(text,text,jsonb) from anon, authenticated;
