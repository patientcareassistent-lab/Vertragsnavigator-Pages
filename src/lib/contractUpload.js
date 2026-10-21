import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase.js'

const CURRENT_UPLOAD_KEY='vn2.currentContractUpload'
const ALLOWED_EXTENSIONS=new Set(['pdf','zip','csv','txt','doc','docx','xls','xlsx','msg'])
const MAX_BYTES=50*1024*1024
const CORE_URL=import.meta.env.VITE_VN2_CORE_URL||'https://orydywvgzghresinulpo.supabase.co'
const CORE_KEY=import.meta.env.VITE_VN2_CORE_PUBLISHABLE_KEY||'sb_publishable_81eMBcOeHrOZ5tHd0k60mw_cx50EAQ0'

const coreClient=createClient(CORE_URL,CORE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
})

function ensureClient(){
  if(!supabase)throw new Error('Supabase ist nicht konfiguriert.')
}

function friendlyError(error,fallback='Vorgang fehlgeschlagen.'){
  const raw=error?.message||error?.error_description||error?.error||fallback
  return String(raw).replace(/^FunctionsHttpError:\s*/,'')
}

async function invoke(name,body){
  ensureClient()
  const {data:{session},error:sessionError}=await supabase.auth.getSession()
  if(sessionError||!session?.access_token)throw new Error('Anmeldung ist nicht mehr gültig.')

  const response=await fetch(CORE_URL+'/functions/v1/'+name,{
    method:'POST',
    headers:{
      Authorization:'Bearer '+session.access_token,
      apikey:CORE_KEY,
      'Content-Type':'application/json',
    },
    body:JSON.stringify(body||{}),
  })

  let data=null
  try{data=await response.json()}catch{}
  if(!response.ok||data?.error){
    throw new Error(friendlyError(data,'VN2-Backend HTTP '+response.status))
  }
  return data
}

export function validateContractFile(file){
  if(!file)throw new Error('Bitte eine Datei auswählen.')
  if(file.size<=0)throw new Error('Die Datei ist leer.')
  if(file.size>MAX_BYTES)throw new Error('Die Datei ist größer als 50 MB.')
  const ext=(file.name.split('.').pop()||'').toLowerCase()
  if(!ALLOWED_EXTENSIONS.has(ext))throw new Error('Dieser Dateityp wird nicht unterstützt.')
  return ext
}

export function saveCurrentUploadId(uploadId){
  if(uploadId)localStorage.setItem(CURRENT_UPLOAD_KEY,uploadId)
  else localStorage.removeItem(CURRENT_UPLOAD_KEY)
}

export function getCurrentUploadId(){
  return localStorage.getItem(CURRENT_UPLOAD_KEY)||''
}

export async function uploadContractSource(contractId,file,contractName=''){
  validateContractFile(file)
  if(!contractId)throw new Error('Bitte zuerst einen Vertrag auswählen.')

  const prep=await invoke('vn2-contract-upload',{
    contract_id:contractId,
    contract_name:contractName||null,
    filename:file.name,
    bytes:file.size,
    mime_type:file.type||'application/octet-stream',
  })
  const token=prep?.upload?.token
  if(!prep?.path||!prep?.bucket||!token)throw new Error('Signierter Upload konnte nicht vorbereitet werden.')

  const {error:uploadError}=await coreClient.storage
    .from(prep.bucket)
    .uploadToSignedUrl(prep.path,token,file,{
      contentType:file.type||undefined,
    })
  if(uploadError)throw new Error(friendlyError(uploadError,'Datei konnte nicht hochgeladen werden.'))

  const resolvedContractId=prep?.contract_id||contractId
  const completed=await invoke('vn2-contract-upload-complete',{
    contract_id:resolvedContractId,
    path:prep.path,
    filename:file.name,
    parser_version:'vn2-ui-2.2',
  })
  if(completed?.upload_id)saveCurrentUploadId(completed.upload_id)
  return completed
}

export async function getContractUploadOriginalLink(uploadId){
  return invoke('vn2-contract-upload-original',{upload_id:uploadId})
}

// Nur Authenticated Edge Functions dürfen OCR-Kandidaten lesen oder bearbeiten.
export async function getOcrRuleCandidates(uploadId,{offset=0,limit=25,status='',kind=''}={}){
  return invoke('vn2-contract-ocr-rules',{upload_id:uploadId,action:'list',offset,limit,status,kind})
}

export async function scanOcrRuleCandidates(uploadId){
  return invoke('vn2-contract-ocr-rules',{upload_id:uploadId,action:'scan'})
}

export async function decideOcrRuleCandidate(uploadId,candidateId,status,reviewNote){
  return invoke('vn2-contract-ocr-rules',{
    upload_id:uploadId,action:'decide',candidate_id:candidateId,status,review_note:reviewNote
  })
}

export async function createOcrKnowledgeDraft(uploadId,candidateId,decisionText){
  return invoke('vn2-contract-ocr-rules',{
    upload_id:uploadId,action:'draft',candidate_id:candidateId,decision_text:decisionText
  })
}

export async function getContractOcrReview(uploadId,{baselineUploadId='',offset=0,limit=20,category=''}={}){
  return invoke('vn2-contract-ocr-review',{
    upload_id:uploadId,
    baseline_upload_id:baselineUploadId||null,
    offset,limit,category,
  })
}

export async function fetchContractUploadOriginal(uploadId){
  const data=await getContractUploadOriginalLink(uploadId)
  if(!data?.url||!data?.filename)throw new Error('Gespeichertes PDF-Original nicht verfügbar.')
  const response=await fetch(data.url,{cache:'no-store'})
  if(!response.ok)throw new Error('Original-PDF konnte nicht erneut geladen werden (HTTP '+response.status+').')
  const blob=await response.blob()
  return new File([blob],data.filename,{type:'application/pdf'})
}

export async function parseContractUpload(uploadId,ocrPages=null){
  // Der Backend-Parser erhält nur extrahierte Seiten. Das originale PDF bleibt im privaten Storage unverändert.
  if(Array.isArray(ocrPages)&&ocrPages.length){
    return invoke('vn2-contract-parse-ocr',{upload_id:uploadId,pages:ocrPages})
  }
  return invoke('vn2-contract-parse',{upload_id:uploadId,mark_ready:false})
}

export async function markContractUploadReady(uploadId,types){
  return invoke('vn2-contract-upload-ready',{
    upload_id:uploadId,
    complete_entity_types:types,
  })
}

export async function compareContractUpload(uploadId){
  return invoke('vn2-contract-upload-compare',{upload_id:uploadId})
}

export async function getContractUploadStatus(uploadId){
  return invoke('vn2-contract-upload-status',{upload_id:uploadId})
}

export async function listContractUploads(){
  const data=await invoke('vn2-contract-upload-list',{})
  return data?.uploads||[]
}

export async function acceptContractUpload(uploadId,expectedChangeCount,resolutionNote=''){
  return invoke('vn2-contract-upload-accept',{
    upload_id:uploadId,
    expected_change_count:Number(expectedChangeCount),
    resolution_note:resolutionNote||null,
  })
}


export async function saveContractIkScopes(uploadId,scopes=[]){
  return invoke('vn2-contract-upload-ik',{
    upload_id:uploadId,
    scopes:Array.isArray(scopes)?scopes:[],
  })
}


export async function saveContractErpMapping(uploadId,contractGroup,mappingAction='UPSERT'){
  return invoke('vn2-contract-upload-erp',{
    upload_id:uploadId,
    erp_system:'SaniVision',
    contract_group:contractGroup||'',
    mapping_action:mappingAction,
  })
}
