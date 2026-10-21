import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { extractOcrClauses } from "./clauseDiff.mjs";
import { extractOcrRuleCandidates } from "./ruleHints.mjs";

const BUCKET="contract-sources",MAX_BYTES=6000000;
const KINDS=["GENEHMIGUNG","FRIST","LEGS","ABRECHNUNG","VERSORGUNG","VERORDNUNG","DOKUMENTATION"];
const txt=x=>String(x??"").trim();
const sha256=async(value)=>{
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
};
const uuid=x=>/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(x);
Deno.serve(async(req:Request)=>{
  const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Content-Type":"application/json","Cache-Control":"no-store"};
  const respond=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers});
  if(req.method==="OPTIONS")return respond({ok:true});
  if(req.method!=="POST")return respond({error:"POST required"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    const url=Deno.env.get("SUPABASE_URL")!;
    const pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")??"{}").default??Deno.env.get("SUPABASE_ANON_KEY")!;
    const secret=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}").default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:currentUser,error:authError}=await client.auth.getUser(auth.replace(/^Bearer\s+/i,""));
    if(authError||!currentUser.user)return respond({error:"Authentication required"},401);
    const {data:profile,error:roleError}=await client.from("vn_users").select("role,active").eq("auth_user_id",currentUser.user.id).maybeSingle();
    if(roleError||profile?.active!==true||!["ADMIN","EDITOR"].includes(profile.role))
      return respond({error:"Aktive Vertragsbearbeiterberechtigung erforderlich."},403);

    const request=await req.json();
    const uploadId=txt(request?.upload_id),action=txt(request?.action)||"list";
    if(!uuid(uploadId))return respond({error:"Ungültige Upload-ID"},400);
    if(!["list","scan","decide","draft"].includes(action))return respond({error:"Unbekannte OCR-Regelaktion"},400);
    if(["decide","draft"].includes(action)&&profile.role!=="ADMIN")
      return respond({error:"Nur ein VN-Administrator darf Regelhinweise entscheiden oder als Entwurf übernehmen."},403);

    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:upload,error:uploadError}=await admin.from("contract_uploads")
      .select("upload_id,contract_id,filename,source_id,source_sha256,upload_status,uploaded_by_user_id,summary")
      .eq("upload_id",uploadId).maybeSingle();
    if(uploadError)throw uploadError;
    if(!upload)return respond({error:"Upload nicht gefunden"},404);
    if(profile.role!=="ADMIN"&&upload.uploaded_by_user_id!==currentUser.user.id)
      return respond({error:"Upload nicht gefunden"},404);
    const ocrPath="derived-ocr/"+uploadId+".json";
    if(txt(upload.summary?.ocr_text_storage_path)!==ocrPath)
      return respond({available:false,reason:"OCR_NOT_AVAILABLE",candidates:[]});
    if(["REJECTED","ERROR","BASELINE"].includes(upload.upload_status))
      return respond({error:"Dieser Upload ist für die OCR-Regelprüfung gesperrt."},409);

    if(action==="scan"){
      const {data:blob,error:fileError}=await admin.storage.from(BUCKET).download(ocrPath);
      if(fileError||!blob)throw fileError??new Error("Private OCR-Arbeitskopie fehlt");
      if(blob.size>MAX_BYTES)return respond({error:"OCR-Arbeitskopie zu groß"},413);
      const sidecar=JSON.parse(await blob.text());
      if(sidecar?.upload_id!==uploadId||sidecar?.contract_id!==upload.contract_id||
         sidecar?.original_sha256!==upload.source_sha256||!Array.isArray(sidecar.pages))
        return respond({error:"OCR-Arbeitskopie stimmt nicht mit dem Upload überein"},409);
      const extracted=extractOcrClauses(sidecar.pages);
      const candidates=extractOcrRuleCandidates(extracted.clauses);
      const rows=[];
      for(const item of candidates){
        const digest=await sha256(upload.source_sha256+"|"+item.clause_key+"|"+item.rule_kind+"|"+item.content_for_hash);
        rows.push({
          upload_id:uploadId,contract_id:upload.contract_id,
          candidate_key:digest,content_hash:digest,
          clause_key:item.clause_key,
          source_page:item.source_page,source_end_page:item.source_end_page,
          rule_kind:item.rule_kind,display_title:item.display_title||item.rule_kind,
          source_excerpt:item.source_excerpt,proposed_fields:item.proposed_fields,
          ocr_quality:item.ocr_quality,status:"PENDING"
        });
      }
      for(let i=0;i<rows.length;i+=100){
        const {error}=await admin.from("vn_ocr_rule_candidates").upsert(
          rows.slice(i,i+100),{onConflict:"upload_id,candidate_key",ignoreDuplicates:true});
        if(error)throw error;
      }
      const keys=new Set(rows.map(row=>row.candidate_key));
      const {data:known,error:knownError}=await admin.from("vn_ocr_rule_candidates")
        .select("candidate_id,candidate_key,status").eq("upload_id",uploadId).neq("status","SUPERSEDED").limit(1500);
      if(knownError)throw knownError;
      const obsolete=(known||[]).filter(row=>!keys.has(row.candidate_key));
      for(let i=0;i<obsolete.length;i+=50){
        const {error}=await admin.from("vn_ocr_rule_candidates")
          .update({status:"SUPERSEDED",updated_at:new Date().toISOString()})
          .eq("upload_id",uploadId).in("candidate_id",obsolete.slice(i,i+50).map(x=>x.candidate_id));
        if(error)throw error;
      }
      return respond({available:true,action:"scan",generated:rows.length,superseded:obsolete.length,
        unchanged_reviews_preserved:true,failed_pages:extracted.quality.failed_pages,
        message:"OCR-Regelhinweise sind unverbindlich. Keine Live-Vertragsdaten wurden verändert."});
    }

    if(action==="decide"){
      const id=txt(request?.candidate_id),status=txt(request?.status),note=txt(request?.review_note);
      if(!uuid(id)||!["CONFIRMED","REJECTED"].includes(status)||note.length<12||note.length>800)
        return respond({error:"Kandidat, Entscheidung und Begründung (12–800 Zeichen) erforderlich."},400);
      const {data:changed,error}=await admin.from("vn_ocr_rule_candidates")
        .update({status,review_note:note,reviewed_at:new Date().toISOString(),
          reviewed_by:currentUser.user.id,updated_at:new Date().toISOString()})
        .eq("candidate_id",id).eq("upload_id",uploadId).eq("status","PENDING")
        .select("candidate_id,status,review_note,reviewed_at,knowledge_id").maybeSingle();
      if(error)throw error;
      if(!changed)return respond({error:"Kandidat bereits entschieden oder nicht mehr vorhanden. Bitte aktualisieren."},409);
      return respond({candidate:changed,message:"Fachliche Entscheidung gespeichert; keine Vertragsregel veröffentlicht."});
    }

    if(action==="draft"){
      const candidateId=txt(request?.candidate_id);
      const decisionText=txt(request?.decision_text);
      if(!uuid(candidateId)||decisionText.length<20||decisionText.length>2500)
        return respond({error:"Bitte einen fachlich formulierten Regeltext (20–2500 Zeichen) eingeben."},400);
      // Transaktionale SECURITY-DEFINER-RPC prüft die ADMIN-Rolle erneut anhand
      // auth.uid(), sperrt den Kandidaten FOR UPDATE und erstellt nur DRAFT.
      const {data:knowledgeId,error:draftError}=await client.rpc("vn_ocr_create_knowledge_draft",{
        p_upload_id:uploadId,p_candidate_id:candidateId,p_decision_text:decisionText
      });
      if(draftError)return respond({error:draftError.message},409);
      return respond({knowledge_id:knowledgeId,status:"DRAFT",
        message:"Wissensentwurf erstellt (DRAFT). Separate Revalidierung und Freigabe erforderlich."});
    }

    const offset=Number(request?.offset??0),limit=Number(request?.limit??25);
    const statusFilter=txt(request?.status),kind=txt(request?.kind);
    if(!Number.isSafeInteger(offset)||offset<0||offset>2500||!Number.isSafeInteger(limit)||limit<1||limit>60)
      return respond({error:"Ungültige Seitenaufteilung"},400);
    if(statusFilter&&!["PENDING","CONFIRMED","REJECTED","SUPERSEDED"].includes(statusFilter))
      return respond({error:"Ungültiger Statusfilter"},400);
    if(kind&&!KINDS.includes(kind))return respond({error:"Ungültiger Themenfilter"},400);
    let query=admin.from("vn_ocr_rule_candidates")
      .select("candidate_id,rule_kind,source_page,source_end_page,clause_key,display_title,source_excerpt,proposed_fields,ocr_quality,status,review_note,reviewed_at,knowledge_id,created_at",{count:"exact"})
      .eq("upload_id",uploadId).order("source_page",{ascending:true})
      .order("rule_kind",{ascending:true}).range(offset,offset+limit-1);
    if(statusFilter)query=query.eq("status",statusFilter);
    if(kind)query=query.eq("rule_kind",kind);
    const {data:items,count,error:listError}=await query;
    if(listError)throw listError;
    return respond({available:true,candidates:items||[],pagination:{
      offset,limit,total:count??0,has_more:offset+limit<(count??0)},
      can_decide:profile.role==="ADMIN",can_draft:profile.role==="ADMIN",
      message:"OCR-Hinweise sind unverbindlich. Nur bestätigte Kandidaten können manuell als nicht freigegebene Wissensentwürfe übernommen werden."});
  }catch(e){return respond({error:e instanceof Error?e.message:String(e)},500)}
});
