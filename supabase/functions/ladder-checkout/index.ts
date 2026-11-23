// Supabase Edge Function: ladder-checkout (A Challenge to Move running plans)
// Creates a one-time Stripe Checkout Session for a purchase, restart, repeat or gift, from the price IDs in
// doing-a-5k/app/js/ladder/config.js (mirrored in _shared/ladder-config.ts). The client never sends a price.
// Deploy: supabase functions deploy ladder-checkout --no-verify-jwt --project-ref olncfwohfpgpmygxjpcm
//   (JWT is optional here: buyers may check out signed out; the function verifies a JWT itself when one is sent.)
// Secrets: STRIPE_SECRET_KEY (restricted: Checkout Sessions write), SITE_URL, ALLOWED_ORIGINS.
//          SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
import { handleCheckout } from "../_shared/ladder-handlers.ts";
import { admin, env, json, originOk, cors, stripePost, userFrom } from "../_shared/ladder-http.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405, origin);
  if (!originOk(origin)) return json({ ok: false, error: "origin not allowed" }, 403, origin);
  if (!env("STRIPE_SECRET_KEY") || !env("SITE_URL")) return json({ ok: false, error: "server not configured" }, 500, origin);
  const body = await req.json().catch(() => null);
  const user = await userFrom(req);
  const db = admin();
  try {
    const r = await handleCheckout(body, user, {
      siteUrl: env("SITE_URL"),
      hasEntitlement: async (uid, level) => {
        const { count, error } = await db.from("ladder_entitlements").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("level_id", level).is("refunded_at", null);
        if (error) throw error;
        return (count ?? 0) > 0;
      },
      createSession: (p) => stripePost("checkout/sessions", p),
    });
    return json(r.body, r.status, origin);
  } catch (e) {
    console.error("ladder-checkout failed", (e as Error)?.message);
    return json({ ok: false, error: "could not start checkout" }, 502, origin);
  }
});
