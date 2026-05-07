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

// Public actions slaan de password-check over — bedoeld voor share-URLs
// waarmee een collega zonder login een foto kan uploaden.
// Beveiliging zit in de unguessable share_token.
//   - share-get-design / share-set-image: per-mockup share (één design)
//   - share-get-run / share-set-image-by-run: run-level share (alle mockups
//     in één bulk-run via één gedeelde token)
const PUBLIC_ACTIONS = new Set([
    "share-get-design",
    "share-set-image",
    "share-get-run",
    "share-set-image-by-run",
]);

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

    let body: { resource?: string; action?: string; payload?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON" }, 400);
    }

    const { resource, action, payload } = body;

    // Public share-actions: skip password gate, but still require a valid token
    if (action && PUBLIC_ACTIONS.has(action)) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const token = (payload as { share_token?: string })?.share_token;
        if (!token || typeof token !== "string" || token.length < 16) {
            return json({ error: "Invalid share token" }, 400);
        }

        try {
            // === RUN-LEVEL SHARE (één link voor alle mockups in een bulk-run) ===
            if (action === "share-get-run" || action === "share-set-image-by-run") {
                const { data: rows, error: lookupErr } = await supabase
                    .from("designs_v3")
                    .select("id, content, style, platform_id, format_id, run_share_expires_at, awaiting_photo, bulk_run_label, bulk_run_id")
                    .eq("run_share_token", token);
                if (lookupErr) throw lookupErr;
                if (!rows || rows.length === 0) return json({ error: "Token not found" }, 404);

                const expiresAt = rows[0].run_share_expires_at;
                if (expiresAt && new Date(expiresAt) < new Date()) {
                    return json({ error: "Share link verlopen" }, 410);
                }

                if (action === "share-get-run") {
                    return json({
                        bulk_run_label: rows[0].bulk_run_label,
                        designs: rows.map((d) => ({
                            id: d.id,
                            content: d.content,
                            style: d.style,
                            platform_id: d.platform_id,
                            format_id: d.format_id,
                            awaiting_photo: d.awaiting_photo,
                        })),
                    });
                }

                // share-set-image-by-run: verify design_id is in this run
                const designId = (payload as { design_id?: string }).design_id;
                const imageData = (payload as { imageData?: unknown }).imageData;
                if (!designId) return json({ error: "design_id required" }, 400);
                if (!imageData || typeof imageData !== "object") {
                    return json({ error: "imageData required" }, 400);
                }
                const target = rows.find((r) => r.id === designId);
                if (!target) return json({ error: "design_id not in this run" }, 403);
                const updatedContent = {
                    ...(target.content as Record<string, unknown>),
                    mainImage: imageData,
                };
                const { error: updErr } = await supabase
                    .from("designs_v3")
                    .update({ content: updatedContent, awaiting_photo: false })
                    .eq("id", designId)
                    .eq("run_share_token", token);
                if (updErr) throw updErr;
                return json({ ok: true });
            }

            // === PER-MOCKUP SHARE ===
            // Lookup mockup by token + check expiry
            const { data: design, error: lookupErr } = await supabase
                .from("designs_v3")
                .select("id, content, style, platform_id, format_id, share_expires_at, awaiting_photo, bulk_run_label")
                .eq("share_token", token)
                .maybeSingle();
            if (lookupErr) throw lookupErr;
            if (!design) return json({ error: "Token not found" }, 404);
            if (design.share_expires_at && new Date(design.share_expires_at) < new Date()) {
                return json({ error: "Share link verlopen" }, 410);
            }

            if (action === "share-get-design") {
                return json({
                    id: design.id,
                    content: design.content,
                    style: design.style,
                    platform_id: design.platform_id,
                    format_id: design.format_id,
                    awaiting_photo: design.awaiting_photo,
                    bulk_run_label: design.bulk_run_label,
                });
            }

            if (action === "share-set-image") {
                const imageData = (payload as { imageData?: unknown }).imageData;
                if (!imageData || typeof imageData !== "object") {
                    return json({ error: "imageData required" }, 400);
                }
                const updatedContent = {
                    ...(design.content as Record<string, unknown>),
                    mainImage: imageData,
                };
                const { error: updErr } = await supabase
                    .from("designs_v3")
                    .update({ content: updatedContent, awaiting_photo: false })
                    .eq("share_token", token);
                if (updErr) throw updErr;
                return json({ ok: true });
            }
            return json({ error: "Unknown public action" }, 400);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return json({ error: msg }, 500);
        }
    }

    // Private actions: require team password
    const password = req.headers.get("x-password");
    if (!password || password !== SHARED_PASSWORD) {
        return json({ error: "Unauthorized" }, 401);
    }

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
        if (action === "delete-many") {
            const ids = (payload as { ids?: string[] })?.ids;
            if (!Array.isArray(ids) || ids.length === 0) {
                return json({ error: "ids required" }, 400);
            }
            const { error } = await supabase.from(resource).delete().in("id", ids);
            if (error) throw error;
            return json({ ok: true, count: ids.length });
        }
        return json({ error: "Unknown action" }, 400);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ error: msg }, 500);
    }
});
