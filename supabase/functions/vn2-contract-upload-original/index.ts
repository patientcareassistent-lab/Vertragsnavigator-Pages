import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

Deno.serve(async (req: Request) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS") return respond({ ok: true });
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const pub = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const secret = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(url, pub, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: user, error: userError } = await client.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (userError || !user.user) return respond({ error: "Authentication required" }, 401);
    const { data: profile, error: roleError } = await client.from("vn_users")
      .select("role,active").eq("auth_user_id", user.user.id).maybeSingle();
    if (roleError || profile?.active !== true || !["ADMIN", "EDITOR"].includes(profile.role))
      return respond({ error: "Vertragsbearbeiterberechtigung erforderlich" }, 403);

    const { upload_id: uploadId } = await req.json();
    if (!uploadId || typeof uploadId !== "string") return respond({ error: "upload_id required" }, 400);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: upload, error: readError } = await admin.from("contract_uploads")
      .select("storage_path,filename,upload_status")
      .eq("upload_id", uploadId).eq("uploaded_by_user_id", user.user.id).maybeSingle();
    if (readError) throw readError;
    if (!upload) return respond({ error: "Originalupload nicht gefunden oder nicht berechtigt" }, 404);
    if (!upload.filename?.toLowerCase().endsWith(".pdf"))
      return respond({ error: "Nur PDF-Originale können erneut per OCR gelesen werden" }, 400);
    if (!upload.storage_path || ["REJECTED", "BASELINE"].includes(upload.upload_status))
      return respond({ error: "Original nicht für OCR-Wiederholung verfügbar" }, 409);

    const { data: signed, error: storageError } = await admin.storage
      .from("contract-sources").createSignedUrl(upload.storage_path, 120);
    if (storageError || !signed?.signedUrl) throw storageError ?? new Error("Original nicht lesbar");
    return respond({ url: signed.signedUrl, filename: upload.filename, expires_in: 120 });
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
