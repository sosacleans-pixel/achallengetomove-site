-- RLS and function tests for 20261122_ladder_entitlements_gifts.sql. Run by supabase/tests/sql/run.sh on a local
-- Postgres only. Any failed check raises and stops the run.
\set ON_ERROR_STOP on
insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana@Example.com', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', now()),
  ('cccccccc-0000-0000-0000-000000000003', 'unconfirmed@example.com', null);

-- server writes (service role, as the webhook does)
set role service_role;
insert into public.ladder_entitlements (email, level_id, kind, days_per_week, train_days, start_date, access_end, source, stripe_session_id)
values ('ana@example.com', 'walk-to-5k', 'new', 3, '{1,3,6}', '2026-11-22', '2027-02-27', 'stripe', 'cs_ana'),
       ('ben@example.com', '10k', 'new', 4, null, '2026-11-22', '2027-02-13', 'stripe', 'cs_ben'),
       ('unconfirmed@example.com', '10k', 'new', 2, null, '2026-11-22', '2027-04-10', 'stripe', 'cs_unc');
insert into public.ladder_gift_codes (code_hash, level_id, buyer_email, buyer_name, recipient_name, recipient_email, purchased_on, deliver_on, redeem_by, stripe_session_id)
values (repeat('a', 64), '5k-faster', 'ana@example.com', 'Ana', 'Bo', 'bo@example.com', '2026-11-22', '2026-11-22', '2031-11-22', 'cs_gift');
reset role;

do $$ begin
  -- duplicate session id is refused (webhook relies on on-conflict-do-nothing)
  begin
    insert into public.ladder_entitlements (email, level_id, kind, days_per_week, start_date, access_end, source, stripe_session_id)
    values ('x@example.com', '10k', 'new', 3, '2026-11-22', '2027-02-27', 'stripe', 'cs_ana');
    raise exception 'FAIL: duplicate stripe_session_id accepted';
  exception when unique_violation then null; end;
  -- uppercase email refused
  begin
    insert into public.ladder_entitlements (email, level_id, kind, days_per_week, start_date, access_end, source, stripe_session_id)
    values ('X@example.com', '10k', 'new', 3, '2026-11-22', '2027-02-27', 'stripe', 'cs_x');
    raise exception 'FAIL: uppercase email accepted';
  exception when check_violation then null; end;
  -- gift redeem_by must be 5 years out
  begin
    insert into public.ladder_gift_codes (code_hash, level_id, buyer_email, recipient_name, share_myself, purchased_on, deliver_on, redeem_by, stripe_session_id)
    values (repeat('b', 64), '10k', 'a@example.com', 'C', true, '2026-11-22', '2026-11-22', '2027-11-22', 'cs_short');
    raise exception 'FAIL: short redeem_by accepted';
  exception when check_violation then null; end;
end $$;

-- anon: nothing at all
set role anon;
do $$ begin
  begin perform 1 from public.ladder_entitlements; raise exception 'FAIL: anon can read entitlements'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.ladder_gift_codes; raise exception 'FAIL: anon can read gifts'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.ladder_stripe_events; raise exception 'FAIL: anon can read events'; exception when insufficient_privilege then null; end;
  begin insert into public.ladder_entitlements (email, level_id, kind, days_per_week, start_date, access_end, source, stripe_session_id)
        values ('z@example.com', '10k', 'new', 3, '2026-11-22', '2027-02-27', 'stripe', 'cs_z'); raise exception 'FAIL: anon insert';
  exception when insufficient_privilege then null; end;
  begin perform public.ladder_claim(); raise exception 'FAIL: anon can call ladder_claim'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Ana, signed in: sees nothing until she claims, then only her own rows; cannot write anything
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ declare n int; c record; begin
  select count(*) into n from public.ladder_entitlements; if n <> 0 then raise exception 'FAIL: rows visible before claim (%)', n; end if;
  select * into c from public.ladder_claim(); if c.entitlements <> 1 or c.gifts <> 1 then raise exception 'FAIL: claim %/%', c.entitlements, c.gifts; end if;
  select count(*) into n from public.ladder_entitlements; if n <> 1 then raise exception 'FAIL: Ana sees % entitlements', n; end if;
  select count(*) into n from public.ladder_entitlements where email <> 'ana@example.com'; if n <> 0 then raise exception 'FAIL: Ana sees others'; end if;
  select count(*) into n from (select id, recipient_name, redeemed_at from public.ladder_gift_codes) x; if n <> 1 then raise exception 'FAIL: Ana gift rows %', n; end if;
  begin perform code_hash from public.ladder_gift_codes; raise exception 'FAIL: code_hash readable'; exception when insufficient_privilege then null; end;
  begin perform redeemed_by_user_id from public.ladder_gift_codes; raise exception 'FAIL: redeemer readable'; exception when insufficient_privilege then null; end;
  begin update public.ladder_entitlements set access_end = '2099-01-01'; raise exception 'FAIL: user update'; exception when insufficient_privilege then null; end;
  begin delete from public.ladder_entitlements; raise exception 'FAIL: user delete'; exception when insufficient_privilege then null; end;
  begin insert into public.ladder_entitlements (email, level_id, kind, days_per_week, start_date, access_end, source, stripe_session_id)
        values ('ana@example.com', '10k', 'new', 3, '2026-11-22', '2099-02-27', 'stripe', 'cs_free'); raise exception 'FAIL: user insert';
  exception when insufficient_privilege then null; end;
  begin update public.ladder_gift_codes set stop_reminders = true; raise exception 'FAIL: user gift update'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.ladder_stripe_events; raise exception 'FAIL: user reads events'; exception when insufficient_privilege then null; end;
  begin perform public.ladder_redeem_gift(repeat('a',64), auth.uid(), 'ana@example.com', '10k', 3::smallint, null, 1::smallint, '2026-11-23', '2027-02-28');
        raise exception 'FAIL: user can call ladder_redeem_gift'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- unconfirmed email cannot claim
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
do $$ declare c record; n int; begin
  select * into c from public.ladder_claim(); if c.entitlements <> 0 then raise exception 'FAIL: unconfirmed email claimed'; end if;
  select count(*) into n from public.ladder_entitlements; if n <> 0 then raise exception 'FAIL: unconfirmed sees rows'; end if;
end $$;
reset role;

-- Ben (another user) cannot see Ana's rows even after claiming his own
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
do $$ declare n int; begin
  perform public.ladder_claim();
  select count(*) into n from public.ladder_entitlements; if n <> 1 then raise exception 'FAIL: Ben sees % rows', n; end if;
  select count(*) into n from public.ladder_gift_codes; if n <> 0 then raise exception 'FAIL: Ben sees Ana''s gift'; end if;
end $$;
reset role;

-- redeem (service role): once only, then refused; refunded and expired refused
set role service_role;
do $$ declare e public.ladder_entitlements; begin
  begin perform public.ladder_redeem_gift(repeat('a',64), 'bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', '10k', 3::smallint, null, 1::smallint, '2026-12-01', '2027-03-08');
        raise exception 'FAIL: redeemed a 5K Faster gift as 10K'; exception when raise_exception then if sqlerrm not like '%lower level%' then raise; end if; end;
  begin perform public.ladder_redeem_gift(repeat('a',64), 'bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', '5k-faster', 3::smallint, null, 1::smallint, '2026-11-21', '2027-02-26');
        raise exception 'FAIL: redeemed before delivery'; exception when raise_exception then if sqlerrm not like '%not available yet%' then raise; end if; end;
  e := public.ladder_redeem_gift(repeat('a',64), 'bbbbbbbb-0000-0000-0000-000000000002', 'Ben@Example.com', 'walk-to-5k', 3::smallint, '{1,3,5}', 16::smallint, '2026-12-01', '2027-03-08');
  if e.kind <> 'gift' or e.email <> 'ben@example.com' or e.level_id <> 'walk-to-5k' or e.source <> 'gift' or e.start_core_index <> 16 then raise exception 'FAIL: redeem row %', e; end if;
  begin perform public.ladder_redeem_gift(repeat('a',64), 'bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', '5k-faster', 3::smallint, null, 1::smallint, '2026-12-02', '2027-03-09');
        raise exception 'FAIL: double redeem'; exception when raise_exception then if sqlerrm not like '%already redeemed%' then raise; end if; end;
  insert into public.ladder_gift_codes (code_hash, level_id, buyer_email, recipient_name, share_myself, purchased_on, deliver_on, redeem_by, stripe_session_id, refunded_at)
  values (repeat('c', 64), '10k', 'a@example.com', 'C', true, '2026-11-22', '2026-11-22', '2031-11-22', 'cs_ref', now());
  begin perform public.ladder_redeem_gift(repeat('c',64), 'bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', '10k', 3::smallint, null, 1::smallint, '2026-12-02', '2027-03-09');
        raise exception 'FAIL: refunded redeem'; exception when raise_exception then if sqlerrm not like '%refunded%' then raise; end if; end;
  insert into public.ladder_gift_codes (code_hash, level_id, buyer_email, recipient_name, share_myself, purchased_on, deliver_on, redeem_by, stripe_session_id)
  values (repeat('d', 64), '10k', 'a@example.com', 'C', true, '2020-01-01', '2020-01-01', '2025-01-01', 'cs_old');
  begin perform public.ladder_redeem_gift(repeat('d',64), 'bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', '10k', 3::smallint, null, 1::smallint, '2026-12-02', '2027-03-09');
        raise exception 'FAIL: expired redeem'; exception when raise_exception then if sqlerrm not like '%expired%' then raise; end if; end;
end $$;
reset role;

-- the buyer sees Redeemed, not who redeemed
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ declare r timestamptz; begin
  select redeemed_at into r from public.ladder_gift_codes where level_id = '5k-faster';
  if r is null then raise exception 'FAIL: buyer does not see redeemed'; end if;
end $$;
reset role;
select 'ladder RLS tests: all checks passed' as result;
