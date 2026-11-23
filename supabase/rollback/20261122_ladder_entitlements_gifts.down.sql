-- Rollback for 20261122_ladder_entitlements_gifts.sql. DESTRUCTIVE: purchase and gift records are lost. Export first:
--   copy (select * from public.ladder_entitlements) to stdout with csv header;  (and the same for ladder_gift_codes)
begin;
drop function if exists public.ladder_redeem_gift(text, uuid, text, text, smallint, smallint[], smallint, date, date);
drop function if exists public.ladder_claim();
drop table if exists public.ladder_entitlements;
drop table if exists public.ladder_gift_codes;
drop table if exists public.ladder_stripe_events;
commit;
