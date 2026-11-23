// Supabase Edge Function: ladder-gift-code (A Challenge to Move running plans)
// The signed-in buyer gets the code for a gift they paid for (by Checkout Session id), on any device.
// Deploy: supabase functions deploy ladder-gift-code --project-ref olncfwohfpgpmygxjpcm   (keep JWT verification ON)
// Secrets: GIFT_CODE_SECRET, ALLOWED_ORIGINS. SUPABASE_* are injected.
import { handleGiftCode } from "../_shared/ladder-handlers.ts";
import { admin, cors, env, json, originOk, userFrom } from "../_shared/ladder-http.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405, origin);
  if (!originOk(origin)) return json({ ok: false, error: "origin not allowed" }, 403, origin);
  if (!env("GIFT_CODE_SECRET")) return json({ ok: false, error: "server not configured" }, 500, origin);
  const body = await req.json().catch(() => null);
  const user = await userFrom(req);
  const sb = admin();
  const r = await handleGiftCode(body, user, {
    giftSecret: env("GIFT_CODE_SECRET"),
    giftBySession: async (sid) => {
      const { data, error } = await sb.from("ladder_gift_codes").select("buyer_email, buyer_user_id, code_hash, level_id, redeem_by, purchased_on, deliver_on, share_myself, recipient_name, recipient_email, buyer_name, message, amount_cents, redeemed_at, refunded_at").eq("stripe_session_id", sid).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return json(r.body, r.status, origin);
});
