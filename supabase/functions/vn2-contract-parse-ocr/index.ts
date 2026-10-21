import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const MAX_PAGES = 250;
const MAX_PAGE_CHARS = 16000;
const MAX_TOTAL_CHARS = 2000000;
const MAX_HINTS = 5000;
const asString = (value: unknown) => String(value ?? "").trim();
const isoDate = (value: string) => {
  const m = value.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/);
  return m ? [m[3], m[2].padStart(2, "0"), m[1].padStart(2, "0")].join("-") : null;
};
const parseEuro = (line: string) => {
  const m = [...line.matchAll(/(?:EUR|€)?\s*(\d{1,5}(?:[.,]\d{2}))\s*(?:EUR|€)?/gi)];
  if (!m.length) return null;
  const raw = m[m.length - 1][1];
  const n = Number(raw.replace(".", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const key = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).slice(0, 12).map(n => n.toString(16).padStart(2, "0")).join("");
};
Deno.serve(async (req: Request) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json"
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const pub = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const sec = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, pub, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: user, error: userError } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (userError || !user.user) return json({ error: "Authentication required" }, 401);
    const { data: profile, error: profileError } = await userClient.from("vn_users")
      .select("role,active").eq("auth_user_id", user.user.id).maybeSingle();
    if (profileError || profile?.active !== true || !["ADMIN", "EDITOR"].includes(profile.role))
      return json({ error: "Aktive Vertragsbearbeiterberechtigung erforderlich." }, 403);

    const request = await req.json();
    const uploadId = asString(request?.upload_id);
    const pageInput = request?.pages;
    if (!uploadId || !Array.isArray(pageInput) || pageInput.length < 1 || pageInput.length > MAX_PAGES)
      return json({ error: "Ungültige OCR-Seitenliste (maximal 250 Seiten)." }, 400);
    if (pageInput.some((p: any, i: number) =>
      !p || p.page !== i + 1 || typeof p.text !== "string" ||
      p.text.length > MAX_PAGE_CHARS || !["ocr", "text", "failed"].includes(p.method)
    )) return json({ error: "Ungültige OCR-Seitenstruktur." }, 400);
    const total = pageInput.reduce((n: number, p: any) => n + p.text.length, 0);
    if (total > MAX_TOTAL_CHARS) return json({ error: "OCR-Textmenge überschreitet das Limit." }, 413);
    const pages = pageInput.map((p: any) => ({
      page: p.page as number,
      method: p.method as string,
      text: p.text.replace(/\0/g, ""),
      confidence: typeof p.confidence === "number" && Number.isFinite(p.confidence) ?
        Math.max(0, Math.min(100, p.confidence)) : null
    }));
    const admin = createClient(url, sec, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: upload, error: uploadError } = await admin.from("contract_uploads")
      .select("upload_id,contract_id,filename,source_sha256,upload_status")
      .eq("upload_id", uploadId).eq("uploaded_by_user_id", user.user.id).maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload) return json({ error: "Upload not found" }, 404);
    if (!upload.filename?.toLowerCase().endsWith(".pdf")) return json({ error: "Not a PDF upload" }, 400);
    if (!["RECEIVED", "PARSING", "SOURCE_ONLY"].includes(upload.upload_status))
      return json({ error: "Upload cannot be parsed in its current state" }, 409);
    const { data: contract, error: contractError } = await admin.from("contracts")
      .select("contract_name").eq("contract_id", upload.contract_id).single();
    if (contractError) throw contractError;

    const text = pages.map(p => p.text).join("\n");
    const lines = pages.flatMap(p => p.text.split(/\r?\n/).map(line => ({ page: p.page, line: line.replace(/\s+/g, " ").trim(), method: p.method }))).filter(x => x.line);
    const pgs = [...new Set([...text.matchAll(/\bPG\s*0?(\d{1,2})\b/gi)].map(m => m[1].padStart(2, "0")))].slice(0, 30);
    const legs = [...new Set([...text.matchAll(/\b(?:1\d{6,7}|\d{4}[A-Z]\d{2,3})\b/g)].map(m => m[0]))].slice(0, 50);
    const valid = text.match(/(?:g[uü]ltig\s+ab|ab)\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]20\d{2})/i);
    const validFrom = valid ? isoDate(valid[1]) : null;
    const lower = (upload.filename + " " + text.slice(0, 4000)).toLowerCase();
    const componentType = lower.includes("rahmenvertrag") ? "Rahmenvertrag" :
      /preisvereinbarung|vergütungsvereinbarung|verguetungsvereinbarung/.test(lower) ? "Preiskondition" :
      lower.includes("leistungsbeschreibung") ? "Leistungsbeschreibung" :
      lower.includes("faq") ? "FAQ" : lower.includes("anlage") ? "Anlage" : "Dokument";
    const failed = pages.filter(p => p.method === "failed" || (!p.text.trim() && p.method !== "text")).map(p => p.page);
    const ocrPageCount = pages.filter(p => p.method === "ocr").length;
    const docKey = "DOC-" + (upload.source_sha256 ? String(upload.source_sha256).slice(0, 24) : await key(upload.filename + "|" + text.slice(0, 2000)));
    const items: any[] = [{
      entity_type: "DOCUMENT", entity_key: docKey, display_name: upload.filename,
      payload: {
        filename: upload.filename, contract_name: contract.contract_name,
        total_pages: pages.length, component_type: componentType, product_groups: pgs, legs,
        valid_from: validFrom, extracted_characters: text.length,
        text_excerpt: text.slice(0, 12000), parser_confidence: "OCR_UNVERIFIED",
        ocr_page_count: ocrPageCount, ocr_failed_pages: failed, review_required: true
      }
    }];
    for (let i = 0; i < lines.length && items.length <= MAX_HINTS; i++) {
      const row = lines[i];
      const match = row.line.match(/\b(\d{2}\.\d{2}\.\d{2}\.\d{1,4})\b/);
      if (!match) continue;
      const price = parseEuro(row.line);
      if (price === null) continue;
      const code = match[1];
      const last = code.split(".").pop() ?? "";
      const name = row.line.replace(code, " ").replace(/(?:EUR|€)?\s*\d{1,5}(?:[.,]\d{2})\s*(?:EUR|€)?/gi, " ").replace(/\s+/g, " ").trim();
      const payload = {
        pg: code.slice(0, 2), code: last.length <= 2 ? code : null,
        pos: last.length >= 3 ? code : null,
        contract: contract.contract_name, bezeichnung: name || null, leistung: name || null,
        preis: price, gueltig_ab: validFrom, authoritative: false,
        source_page: row.page, review_required: true, parser_confidence: row.method === "ocr" ? "OCR_REGEX_HINT" : "PDF_TEXT_REGEX_HINT"
      };
      items.push({ entity_type: "POSITION_HINT", entity_key: "PDFPOS-" + await key(code + "|" + price + "|" + name + "|" + row.page + "|" + i), display_name: name || code, payload });
    }
    for (let i = 0; i < items.length; i += 250) {
      const { error } = await admin.rpc("stage_contract_upload_items", { p_upload_id: uploadId, p_items: items.slice(i, i + 250) });
      if (error) throw error;
    }
    const summary = {
      parser: "pdf-ocr-2.1", pages: pages.length, product_groups: pgs, legs,
      valid_from: validFrom, component_type: componentType, position_hints: items.length - 1,
      ocr_pages: ocrPageCount, failed_pages: failed,
      extracted_characters: text.length, suggested_complete_entity_types: [],
      manual_review_required: true
    };
    const { error: updateError } = await admin.from("contract_uploads")
      .update({ upload_status: "PARSING", parser_version: "vn2-browser-ocr-2.1", summary })
      .eq("upload_id", uploadId);
    if (updateError) throw updateError;
    return json({
      parser: "vn2-contract-parse-pdf-ocr", result: {
        upload_id: uploadId, pages: pages.length, component_type: componentType,
        product_groups: pgs, legs, valid_from: validFrom,
        position_hints: items.length - 1, ocr_pages: ocrPageCount,
        failed_pages: failed, status: "PARSING", suggested_complete_entity_types: []
      }
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
