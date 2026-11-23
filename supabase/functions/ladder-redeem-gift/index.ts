// Supabase Edge Function: ladder-redeem-gift (A Challenge to Move running plans)
// Signed-in recipient redeems a gift code: the code is hashed with GIFT_CODE_SECRET and redeemed atomically by the
// SQL function ladder_redeem_gift (service role only). Access starts on the redemption day.
// Deploy: supabase functions deploy ladder-redeem-gift --project-ref olncfwohfpgpmygxjpcm   (keep JWT verification ON)
// Secrets: GIFT_CODE_SECRET, ALLOWED_ORIGINS. SUPABASE_* are injected.
import { handleRedeem } from "../_shared/ladder-handlers.ts";
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
  const r = await handleRedeem(body, user, {
    giftSecret: env("GIFT_CODE_SECRET"),
    lookup: async (h) => {
      const { data, error } = await sb.from("ladder_gift_codes").select("level_id, buyer_name, message, redeem_by, deliver_on, redeemed_at, refunded_at").eq("code_hash", h).maybeSingle();
      if (error) throw error;
      return data;
    },
    redeem: async (a) => {
      const { data, error } = await sb.rpc("ladder_redeem_gift", {
        p_code_hash: a.codeHash, p_user: a.userId, p_email: a.email, p_level: a.levelId, p_days: a.days,
        p_train_days: a.trainDays, p_start_core_index: a.startCoreIndex, p_today: a.today, p_access_end: a.accessEnd,
      });
      if (error) throw new Error(error.message);
      return data;
    },
  });
  return json(r.body, r.status, origin);
});
