// HTTP helpers for the ladder edge functions: CORS for the site origins, JSON responses, JWT verification.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { User } from "./ladder-handlers.ts";

export function env(k: string): string {
  return Deno.env.get(k) ?? "";
}
// ALLOWED_ORIGINS: comma-separated, e.g. "https://achallengetomove.com,https://www.achallengetomove.com"
function allowed(): Set<string> {
  return new Set((env("ALLOWED_ORIGINS") || "https://achallengetomove.com,https://www.achallengetomove.com").split(",").map((s) => s.trim()).filter(Boolean));
}
export function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed().has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
export function originOk(origin: string | null): boolean {
  return !origin || allowed().has(origin);
}
export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
export function admin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}
/* Verify the caller's JWT with Supabase Auth (not just decode it). Returns null when there is no valid token. */
export async function userFrom(req: Request): Promise<User | null> {
  const a = req.headers.get("Authorization") ?? "";
  const jwt = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!jwt || jwt === env("SUPABASE_ANON_KEY")) return null;
  const c = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  return { id: data.user.id, email: data.user.email?.toLowerCase() ?? null, emailConfirmed: !!data.user.email_confirmed_at };
}
/* Stripe REST call with the server's restricted key (never sent to the browser, never logged). */
export async function stripePost(path: string, params: Record<string, string>): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: new URLSearchParams(params),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${r.status}: ${j?.error?.message ?? "error"}`);
  return j;
}
