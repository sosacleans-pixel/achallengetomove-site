# Running plans server (A Challenge to Move: Walk to 5K, 5K Faster, 10K)

Server checkout and cross-device access for `/doing-a-5k/app/`. Target: the existing Supabase project
`olncfwohfpgpmygxjpcm` (the 22-Day app's project, app.coachsalimheyaime.com magic-link auth), so one sign-in works
for both apps. **Nothing here has been applied or deployed.** No secret is in this repo; functions read them from
their environment. The app's `SERVER.realCheckout` flag (doing-a-5k/app/js/ladder/config.js) stays **off** until launch.

```
migrations/20261122_ladder_entitlements_gifts.sql   tables, RLS, ladder_claim(), ladder_redeem_gift()
rollback/20261122_ladder_entitlements_gifts.down.sql
functions/ladder-checkout        POST: one-time Stripe Checkout Session (purchase, restart, repeat, gift)
functions/ladder-stripe-webhook  Stripe -> entitlements / gift codes (signature-verified, idempotent)
functions/ladder-redeem-gift     POST (signed in): look up or redeem a gift code
functions/ladder-gift-code       POST (signed in): the buyer gets the code for a gift they paid for
functions/_shared/ladder-config.ts  GENERATED from config.js (node doing-a-5k/app/tools/sync-server-config.mjs)
tests/                           deno tests with Stripe event fixtures; tests/sql/run.sh = local Postgres RLS tests
```

## Data model
- `ladder_entitlements`: one row per purchase, restart, repeat or redeemed gift: email, user_id, level_id,
  days_per_week, train_days, start_date, access_end (inclusive, plan length + 2 weeks), kind, start_from,
  start_core_index, Stripe session/payment ids, refunded_at.
- `ladder_gift_codes`: code_hash (HMAC of the code; the code itself is never stored and is re-derived from the
  Checkout Session id with `GIFT_CODE_SECRET`), level, buyer email/name/user, recipient name/email, message,
  purchased_on, deliver_on, redeem_by (5 years), redeemed_at/by/level, refunded_at, reminder_dates, reminders_sent,
  stop_reminders, stopped_at.
- `ladder_stripe_events`: processed event ids (server only).
- RLS: anon has no access; signed-in users can only SELECT their own rows (entitlements by user_id; gifts they
  bought, without code_hash or who redeemed). Nobody can insert, update or delete through the API: all writes go
  through the functions with the service role. `ladder_claim()` attaches rows bought with the user's *confirmed*
  email after sign-in. Account deletion keeps purchase records with user_id set to null (financial record).

## Deploy (in order, by the project owner)
1. SQL Editor: run `migrations/20261122_ladder_entitlements_gifts.sql` (one transaction, safe to re-run).
2. Secrets (never echo them):
   ```bash
   supabase link --project-ref olncfwohfpgpmygxjpcm
   supabase secrets set GIFT_CODE_SECRET="$(openssl rand -base64 32)"   # never rotate after the first gift: old codes would stop matching
   supabase secrets set SITE_URL=https://achallengetomove.com ALLOWED_ORIGINS=https://achallengetomove.com,https://www.achallengetomove.com
   supabase secrets set STRIPE_SECRET_KEY="$STRIPE_RESTRICTED_KEY"     # restricted key: Checkout Sessions write
   ```
3. Functions: `supabase functions deploy ladder-checkout ladder-stripe-webhook ladder-redeem-gift ladder-gift-code`
   (JWT settings are in `config.toml`: checkout and webhook verify themselves; redeem and gift-code require a JWT).
4. Stripe webhook endpoint `https://olncfwohfpgpmygxjpcm.supabase.co/functions/v1/ladder-stripe-webhook`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`; then
   `supabase secrets set STRIPE_WEBHOOK_SECRET=...` from the create response without printing it.
5. Auth: add `https://achallengetomove.com/doing-a-5k/app/` (and www) to Authentication > URL Configuration >
   Redirect URLs, so the magic link can return to the app.
6. Launch only (Salim's yes): set `SERVER.realCheckout = true` and `SERVER.supabaseAnonKey` (the project's public
   anon key) in config.js; turn off the old Doing a 5K $6.99 payment link in Stripe.

Not built yet: gift delivery and reminder emails (columns are ready; sending needs approval and Resend), the STOP
link, and an admin refund screen (refund in the Stripe Dashboard; `charge.refunded` deactivates the code or access).

## Tests
```bash
deno test --allow-read supabase/tests/           # webhook, signature, checkout params, redeem, gift code
supabase/tests/sql/run.sh                        # local Postgres 17 only: RLS, grants, claim, redeem (never Supabase)
node doing-a-5k/app/tests/server.test.mjs        # browser client with fake fetch; flag stays off
```
