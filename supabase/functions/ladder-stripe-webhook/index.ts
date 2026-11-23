// Supabase Edge Function: ladder-stripe-webhook (A Challenge to Move running plans)
// Stripe calls this on checkout.session.completed (and async_payment_succeeded, charge.refunded). The signature is
// verified with STRIPE_WEBHOOK_SECRET before anything is read. Writes entitlements and gift codes with the service
// role, idempotently (unique Checkout Session id + processed-event table). Sessions for other products are ignored.
// Deploy: supabase functions deploy ladder-stripe-webhook --no-verify-jwt --project-ref olncfwohfpgpmygxjpcm
// Secrets: STRIPE_WEBHOOK_SECRET, GIFT_CODE_SECRET. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected.
import { handleWebhook, type LadderDb } from "../_shared/ladder-core.ts";
import { admin, env } from "../_shared/ladder-http.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!env("STRIPE_WEBHOOK_SECRET") || !env("GIFT_CODE_SECRET")) return new Response("server not configured", { status: 500 });
  const raw = await req.text();
  const sb = admin();
  const ok = (r: { error: unknown }) => { if (r.error) throw r.error; };
  const db: LadderDb = {
    seenEvent: async (id) => {
      const r = await sb.from("ladder_stripe_events").select("id").eq("id", id).maybeSingle();
      ok(r);
      return !!r.data;
    },
    recordEvent: async (id, type) => ok(await sb.from("ladder_stripe_events").upsert({ id, type }, { onConflict: "id", ignoreDuplicates: true })),
    insertEntitlement: async (row) => ok(await sb.from("ladder_entitlements").upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true })),
    insertGift: async (row) => ok(await sb.from("ladder_gift_codes").upsert(row, { onConflict: "stripe_session_id", ignoreDuplicates: true })),
    markRefunded: async (pi, at) => {
      ok(await sb.from("ladder_entitlements").update({ refunded_at: at }).eq("stripe_payment_intent", pi).is("refunded_at", null));
      ok(await sb.from("ladder_gift_codes").update({ refunded_at: at }).eq("stripe_payment_intent", pi).is("refunded_at", null));
    },
  };
  try {
    const r = await handleWebhook(raw, req.headers.get("Stripe-Signature"), { webhookSecret: env("STRIPE_WEBHOOK_SECRET"), giftSecret: env("GIFT_CODE_SECRET"), db });
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    // 500 makes Stripe retry; nothing about the customer is logged.
    console.error("ladder-stripe-webhook failed", (e as Error)?.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
