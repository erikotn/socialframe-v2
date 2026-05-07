// SocialFrame v2 — password-gated data proxy
//
// Why this exists:
//   The frontend can't talk to Postgres directly without exposing a service
//   key. Anon-key + RLS would work for per-user auth, but we want a single
//   shared team password instead. So this function:
//     1. Checks the x-password header against the SHARED_PASSWORD secret
//     2. If valid, performs the DB action with the service role key
//     3. Returns the result
//
// Required env (set via: Supabase dashboard → Edge Functions → Manage secrets):
//   - SHARED_PASSWORD       — your team password
//   - SUPABASE_URL          — auto-injected by the runtime
//   - SUPABASE_SERVICE_ROLE_KEY — auto-injected by the runtime
//
// Deploy:  supabase functions deploy data --no-verify-jwt
//   (--no-verify-jwt because we use our own password-gate; the anon key is
//    only used by the client to *invoke* the function, not for auth.)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHARED_PASSWORD = Deno.env.get("SHARED_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SECRET_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
        "authorization, content-type, x-password, apikey",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

// Tables that this gated proxy is allowed to read/write.
// Add new tools here as the platform grows.
//   - pmax_designs added 2026-04 voor pmaxframe
//   - designs_v3 added 2026-05 voor socialframe-v3 (bulk-feature)
const VALID_RESOURCES = ["designs", "brand_kits", "pmax_designs", "designs_v3"];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    if (!SHARED_PASSWORD) {
        return json(
            { error: "Server not configured (SHARED_PASSWORD missing)" },
            500,
        );
    }

    const password = req.headers.get("x-password");
    if (!password || password !== SHARED_PASSWORD) {
        return json({ error: "Unauthorized" }, 401);
    }

    let body: { resource?: string; action?: string; payload?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON" }, 400);
    }

    const { resource, action, payload } = body;
    if (!resource || !VALID_RESOURCES.includes(resource)) {
        return json({ error: "Unknown resource" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        if (action === "list") {
            const { data, error } = await supabase
                .from(resource)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return json(data);
        }
        if (action === "save") {
            if (!payload || typeof payload !== "object") {
                return json({ error: "payload required" }, 400);
            }
            const { data, error } = await supabase
                .from(resource)
                .upsert(payload as Record<string, unknown>)
                .select()
                .single();
            if (error) throw error;
            return json(data);
        }
        if (action === "delete") {
            const id = (payload as { id?: string })?.id;
            if (!id) return json({ error: "id required" }, 400);
            const { error } = await supabase.from(resource).delete().eq("id", id);
            if (error) throw error;
            return json({ ok: true });
        }
        return json({ error: "Unknown action" }, 400);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ error: msg }, 500);
    }
});
