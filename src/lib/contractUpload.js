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

export async function parseContractUpload(uploadId){
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
