import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { extractOcrClauses, compareOcrClauses, normalizedDocumentKey } from "./clauseDiff.mjs";

const BUCKET="contract-sources";
const MAX_SIDECAR_BYTES=6000000;
const isPdf=v=>String(v||"").toLowerCase().endsWith(".pdf");
const clip=(text,max=2400)=>({
  text:String(text||"").slice(0,max),
  text_truncated:String(text||"").length>max
});
const summarizeClause=c=>({
  key:c.key,section:c.heading,page:c.page,end_page:c.end_page,
  category:c.category,source_method:c.source_method,
  ...clip(c.text)
});
const formatSide=side=>side&&({
  page:side.page,end_page:side.end_page,...clip(side.text)
});
Deno.serve(async(req:Request)=>{
  const headers={
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
    "Content-Type":"application/json","Cache-Control":"no-store"
  };
  const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
  if(req.method==="OPTIONS")return reply({ok:true});
  if(req.method!=="POST")return reply({error:"POST required"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    const url=Deno.env.get("SUPABASE_URL")!;
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")??"{}").default??Deno.env.get("SUPABASE_ANON_KEY")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}").default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:currentUser,error:userError}=await userClient.auth.getUser(auth.replace(/^Bearer\s+/i,""));
    if(userError||!currentUser.user)return reply({error:"Authentication required"},401);
    const {data:profile,error:roleError}=await userClient.from("vn_users")
      .select("role,active").eq("auth_user_id",currentUser.user.id).maybeSingle();
    if(roleError||profile?.active!==true||!["ADMIN","EDITOR"].includes(profile.role))
      return reply({error:"Aktive Vertragsbearbeiterberechtigung erforderlich."},403);
    const payload=await req.json();
    const uploadId=String(payload?.upload_id||"").trim();
    const selectedBaselineId=String(payload?.baseline_upload_id||"").trim();
    const offset=Number(payload?.offset??0),requestedLimit=Number(payload?.limit??20);
    const category=String(payload?.category||"").trim();
    if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(uploadId))
      return reply({error:"Ungültige Upload-ID"},400);
    if(!Number.isSafeInteger(offset)||offset<0||offset>1500||!Number.isSafeInteger(requestedLimit)||requestedLimit<1||requestedLimit>40)
      return reply({error:"Ungültige Seiteneinteilung"},400);
    if(category&&!["GENEHMIGUNG","ABRECHNUNG","FRIST","VERORDNUNG","VERSORGUNG","DOKUMENTATION","SONSTIGES"].includes(category))
      return reply({error:"Ungültige Kategorie"},400);
    const admin=createClient(url,sec,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:upload,error:readError}=await admin.from("contract_uploads")
      .select("upload_id,filename,contract_id,source_sha256,upload_status,uploaded_by_user_id,received_at,summary")
      .eq("upload_id",uploadId).maybeSingle();
    if(readError)throw readError;
    if(!upload)return reply({error:"Upload nicht gefunden"},404);
    if(profile.role!=="ADMIN"&&upload.uploaded_by_user_id!==currentUser.user.id)
      return reply({error:"Upload nicht gefunden"},404);

    function safePath(row:any){
      const stored=String(row?.summary?.ocr_text_storage_path||"");
      const required="derived-ocr/"+row.upload_id+".json";
      return stored===required?stored:null;
    }
    async function readSidecar(row:any){
      const path=safePath(row);
      if(!path)throw new Error("OCR-Arbeitskopie fehlt für "+row.upload_id);
      const {data:blob,error:storageError}=await admin.storage.from(BUCKET).download(path);
      if(storageError||!blob)throw storageError??new Error("OCR-Arbeitskopie nicht vorhanden");
      if(blob.size>MAX_SIDECAR_BYTES)throw new Error("OCR-Arbeitskopie überschreitet das Größenlimit");
      const parsed=JSON.parse(await blob.text());
      if(parsed?.upload_id!==row.upload_id||!Array.isArray(parsed?.pages))
        throw new Error("OCR-Arbeitskopie entspricht nicht dem Upload");
      return parsed;
    }
    if(!isPdf(upload.filename)||!safePath(upload))
      return reply({available:false,reason:"NO_OCR_SOURCE",message:"Für diesen Upload liegt noch keine OCR-Arbeitskopie vor."});
    let listQuery=admin.from("contract_uploads")
      .select("upload_id,filename,contract_id,source_sha256,upload_status,uploaded_by_user_id,received_at,summary")
      .eq("contract_id",upload.contract_id)
      .lt("received_at",upload.received_at)
      .order("received_at",{ascending:false})
      .limit(100);
    if(profile.role!=="ADMIN")listQuery=listQuery.eq("uploaded_by_user_id",currentUser.user.id);
    const {data:history,error:historyError}=await listQuery;
    if(historyError)throw historyError;
    const options=(history||[])
      .filter(row=>row.upload_id!==uploadId&&row.source_sha256!==upload.source_sha256
        &&isPdf(row.filename)&&safePath(row)&&!["REJECTED","ERROR"].includes(row.upload_status))
      .map(row=>({
        upload_id:row.upload_id,filename:row.filename,received_at:row.received_at,
        same_document:normalizedDocumentKey(upload.filename).length>=6
          &&normalizedDocumentKey(upload.filename)===normalizedDocumentKey(row.filename)
      }));
    const selected=selectedBaselineId
      ?options.find(o=>o.upload_id===selectedBaselineId)
      :options.find(o=>o.same_document);
    if(selectedBaselineId&&!selected)
      return reply({error:"Vergleichsfassung nicht zulässig oder nicht vorhanden"},403);

    const currentSidecar=await readSidecar(upload);
    const current=extractOcrClauses(currentSidecar.pages);
    const selectedRow=selected&&(history||[]).find(x=>x.upload_id===selected.upload_id);
    let changeList=[],comparisonSummary=null;
    let baselineQuality=null;
    if(selectedRow){
      const previous=extractOcrClauses((await readSidecar(selectedRow)).pages);
      const diff=compareOcrClauses(current,previous,{maxResults:800});
      changeList=diff.changes;
      comparisonSummary=diff.summary;
      baselineQuality=previous.quality;
    }
    const rawItems=selectedRow?changeList:current.clauses;
    const filtered=category?rawItems.filter(c=>c.category===category):rawItems;
    const rendered=filtered.slice(offset,offset+requestedLimit).map(c=>selectedRow?({
      kind:c.kind,key:c.section_key,section:c.section,category:c.category,
      similarity:c.similarity,before:formatSide(c.before),after:formatSide(c.after),
      review_required:true
    }):summarizeClause(c));
    return reply({
      available:true,
      upload_id:uploadId,
      filename:upload.filename,
      source_sha256:upload.source_sha256,
      quality:current.quality,
      detected_clauses:current.clauses.length,
      categories:["GENEHMIGUNG","ABRECHNUNG","FRIST","VERORDNUNG","VERSORGUNG","DOKUMENTATION","SONSTIGES"],
      baseline_options:options,
      baseline:selected||null,
      baseline_quality:baselineQuality,
      comparison:comparisonSummary,
      mode:selectedRow?"COMPARISON":"CLAUSE_INDEX",
      results:rendered,
      pagination:{offset,limit:requestedLimit,total:filtered.length,has_more:offset+requestedLimit<filtered.length},
      warning:selectedRow
        ?"Unverbindlicher OCR-Textvergleich. 'Nicht gefunden' ist kein nachgewiesener Wegfall. Änderungen fachlich anhand der Originalseiten prüfen."
        :"Kein sicher zugeordneter Vorvertrag. Bitte eine passende Vergleichsfassung auswählen; erkannte Klauseln sind noch keine Vertragsregel."
    });
  }catch(e){
    return reply({error:e instanceof Error?e.message:String(e)},500);
  }
});
