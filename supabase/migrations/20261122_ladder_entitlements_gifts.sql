-- A Challenge to Move running plans (Walk to 5K, 5K Faster, 10K) · Coach Salim Heyaime LLC
-- Entitlements (who has access to which level, until when) and gift codes, so access and gifts work across devices.
-- Target: the existing Supabase project olncfwohfpgpmygxjpcm (app.coachsalimheyaime.com magic-link auth).
-- One transaction, safe to re-run. Writes happen ONLY through the edge functions (service role):
--   anon gets nothing; signed-in users can only SELECT their own rows; nobody can insert/update/delete via the API.
-- Rollback: supabase/rollback/20261122_ladder_entitlements_gifts.down.sql (drops these tables: purchase records are lost,
-- export first).
begin;

create extension if not exists pgcrypto;

-- 1) Gift codes. The code itself is never stored: code_hash = HMAC-SHA256(GIFT_CODE_SECRET, 'code:' || CODE).
create table if not exists public.ladder_gift_codes (
  id                    uuid primary key default gen_random_uuid(),
  code_hash             text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  level_id              text not null check (level_id in ('walk-to-5k', '5k-faster', '10k')),
  buyer_email           text not null check (buyer_email = lower(buyer_email)),
  buyer_user_id         uuid references auth.users(id) on delete set null,
  buyer_name            text check (char_length(buyer_name) <= 60),
  recipient_name        text check (char_length(recipient_name) <= 60),
  recipient_email       text check (recipient_email is null or recipient_email = lower(recipient_email)),
  share_myself          boolean not null default false,
  message               text check (char_length(message) <= 300),
  purchased_on          date not null,
  deliver_on            date not null,
  redeem_by             date not null,
  redeemed_at           timestamptz,
  redeemed_by_user_id   uuid references auth.users(id) on delete set null,
  redeemed_level_id     text check (redeemed_level_id in ('walk-to-5k', '5k-faster', '10k')),
  refunded_at           timestamptz,
  reminder_dates        date[] not null default '{}',
  reminders_sent        date[] not null default '{}',
  stop_reminders        boolean not null default false,  -- recipient replied STOP / used the stop link
  stopped_at            timestamptz,
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  amount_cents          integer,
  currency              text,
  created_at            timestamptz not null default now(),
  check (redeem_by >= (purchased_on + interval '5 years')::date),  -- 5 years (Feb 29 rolls to Mar 1, like the app)
  check (deliver_on >= purchased_on),
  check (share_myself or recipient_email is not null)
);
create index if not exists ladder_gift_codes_buyer_user on public.ladder_gift_codes (buyer_user_id);
create index if not exists ladder_gift_codes_buyer_email on public.ladder_gift_codes (buyer_email);
create index if not exists ladder_gift_codes_pi on public.ladder_gift_codes (stripe_payment_intent);

-- 2) Entitlements: one row per purchase, restart, repeat or redeemed gift.
create table if not exists public.ladder_entitlements (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete set null,
  email                 text not null check (email = lower(email)),
  level_id              text not null check (level_id in ('walk-to-5k', '5k-faster', '10k')),
  kind                  text not null check (kind in ('new', 'restart', 'repeat', 'gift')),
  days_per_week         smallint not null check (days_per_week between 2 and 5),
  train_days            smallint[] check (train_days is null or cardinality(train_days) = days_per_week),
  start_date            date not null,
  access_end            date not null check (access_end >= start_date),
  start_from            text not null default 'resume' check (start_from in ('resume', 'start')),
  start_core_index      smallint not null default 1 check (start_core_index between 1 and 36),
  source                text not null check (source in ('stripe', 'gift')),
  gift_id               uuid unique references public.ladder_gift_codes(id),
  stripe_session_id     text unique,
  stripe_payment_intent text,
  amount_cents          integer,
  currency              text,
  refunded_at           timestamptz,
  created_at            timestamptz not null default now(),
  check ((source = 'stripe') = (stripe_session_id is not null)),
  check ((source = 'gift') = (gift_id is not null))
);
create index if not exists ladder_entitlements_user on public.ladder_entitlements (user_id);
create index if not exists ladder_entitlements_email on public.ladder_entitlements (email);
create index if not exists ladder_entitlements_pi on public.ladder_entitlements (stripe_payment_intent);

-- 3) Processed Stripe events (idempotency). Server only.
create table if not exists public.ladder_stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

-- 4) Privileges: start from nothing (Supabase's default grants give anon/authenticated ALL on new tables).
revoke all on table public.ladder_gift_codes, public.ladder_entitlements, public.ladder_stripe_events from anon, authenticated;
grant select on table public.ladder_entitlements to authenticated;
-- Buyers see their gift's status, never the code hash or who redeemed it (Scheduled / Sent / Redeemed only).
grant select (id, level_id, buyer_name, recipient_name, recipient_email, share_myself, message, purchased_on, deliver_on,
              redeem_by, redeemed_at, refunded_at, created_at)
  on table public.ladder_gift_codes to authenticated;
grant all on table public.ladder_gift_codes, public.ladder_entitlements, public.ladder_stripe_events to service_role;

alter table public.ladder_gift_codes enable row level security;
alter table public.ladder_entitlements enable row level security;
alter table public.ladder_stripe_events enable row level security;  -- no policies: nobody but service_role

drop policy if exists "ladder entitlements select own" on public.ladder_entitlements;
create policy "ladder entitlements select own" on public.ladder_entitlements
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "ladder gifts select own purchases" on public.ladder_gift_codes;
create policy "ladder gifts select own purchases" on public.ladder_gift_codes
  for select to authenticated using (buyer_user_id = auth.uid());

-- 5) Claim: after a magic-link sign-in, attach rows bought with this (confirmed) email to the account.
--    Rows are matched by the email Supabase Auth confirmed, never by a value from the client.
create or replace function public.ladder_claim()
returns table (entitlements integer, gifts integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  em text;
  e integer;
  g integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select lower(u.email) into em from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if em is null then return query select 0, 0; return; end if;
  update public.ladder_entitlements set user_id = uid where user_id is null and email = em;
  get diagnostics e = row_count;
  update public.ladder_gift_codes set buyer_user_id = uid where buyer_user_id is null and buyer_email = em;
  get diagnostics g = row_count;
  return query select e, g;
end $$;
revoke all on function public.ladder_claim() from public, anon;
grant execute on function public.ladder_claim() to authenticated;

-- 6) Redeem a gift atomically (service role only; the edge function verifies the user's JWT and hashes the code).
create or replace function public.ladder_redeem_gift(
  p_code_hash text, p_user uuid, p_email text, p_level text, p_days smallint, p_train_days smallint[],
  p_start_core_index smallint, p_today date, p_access_end date)
returns public.ladder_entitlements
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g public.ladder_gift_codes;
  ent public.ladder_entitlements;
begin
  select * into g from public.ladder_gift_codes where code_hash = p_code_hash for update;
  if not found then raise exception 'gift code not found' using errcode = 'P0002'; end if;
  if g.refunded_at is not null then raise exception 'gift code was refunded' using errcode = 'P0001'; end if;
  if g.redeemed_at is not null then raise exception 'gift code already redeemed' using errcode = 'P0001'; end if;
  if p_today > g.redeem_by then raise exception 'gift code expired' using errcode = 'P0001'; end if;
  if p_today < g.deliver_on then raise exception 'gift code not available yet' using errcode = 'P0001'; end if;
  -- the recipient may start the gift level or a lower one (Walk to 5K < 5K Faster < 10K)
  if array_position(array['walk-to-5k', '5k-faster', '10k'], p_level) > array_position(array['walk-to-5k', '5k-faster', '10k'], g.level_id) then
    raise exception 'gift code is for a lower level' using errcode = 'P0001';
  end if;
  update public.ladder_gift_codes
     set redeemed_at = now(), redeemed_by_user_id = p_user, redeemed_level_id = p_level
   where id = g.id;
  insert into public.ladder_entitlements (user_id, email, level_id, kind, days_per_week, train_days, start_date, access_end,
                                          start_core_index, source, gift_id)
  values (p_user, lower(p_email), p_level, 'gift', p_days, p_train_days, p_today, p_access_end,
          coalesce(p_start_core_index, 1), 'gift', g.id)
  returning * into ent;
  return ent;
end $$;
revoke all on function public.ladder_redeem_gift(text, uuid, text, text, smallint, smallint[], smallint, date, date) from public, anon, authenticated;
grant execute on function public.ladder_redeem_gift(text, uuid, text, text, smallint, smallint[], smallint, date, date) to service_role;

commit;
