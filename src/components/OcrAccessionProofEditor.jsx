import React,{useState} from 'react'
import {saveAccessionSourceProof,getContractUploadOriginalLink} from '../lib/contractUpload.js'
import './OcrAccessionProofEditor.css'

export default function OcrAccessionProofEditor({uploadId,candidateId,accessions=[],pg='',onSaved}){
  const [form,setForm]=useState({accession_id:'',proof_kind:'BEITRITT',effective_from:'',effective_to:'',pg,source_page:'',source_excerpt:'',evidence_note:''})
  const [checked,setChecked]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const set=(key,value)=>setForm(prev=>({...prev,[key]:value}))
  const valid=Boolean(form.accession_id&&/^\d{4}-\d{2}-\d{2}$/.test(form.effective_from)&&
    /^[1-9]\d{0,2}$/.test(String(form.source_page))&&Number(form.source_page)<=250&&
    form.source_excerpt.trim().length>=25&&form.evidence_note.trim().length>=40&&
    (!form.effective_to||form.effective_to>=form.effective_from))
  async function openOriginal(){
    const tab=window.open('about:blank','_blank')
    try{
      const {url}=await getContractUploadOriginalLink(uploadId)
      if(!url)throw new Error('Original-PDF nicht verfügbar')
      const target=url+(form.source_page?'#page='+encodeURIComponent(form.source_page):'')
      if(tab)tab.location.replace(target)
      else window.location.assign(target)
    }catch(e){if(tab)tab.close();setMessage(e.message)}
  }
  async function submit(verify){
    setBusy(true);setMessage('')
    try{
      const response=await saveAccessionSourceProof(uploadId,candidateId,form.accession_id,{
        ...form,source_page:Number(form.source_page),source_checked:checked
      },verify)
      setMessage(response.message)
      if(onSaved)await onSaved()
      setChecked(false)
    }catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  return <details className="ocr-proof-entry"><summary>Beitrittszeitraum aus Original belegen</summary>
    <p>Nur nach tatsächlich geprüftem Originalnachweis. Keine automatische Freigabe.</p>
    {message&&<div role="status">{message}</div>}
    <label>Beitritt<select aria-label="Nachweis Beitritts-ID" value={form.accession_id} onChange={e=>set('accession_id',e.target.value)}>
      <option value="">Bitte auswählen</option>
      {accessions.map(a=><option key={a.accession_id} value={a.accession_id}>{a.accession_id} · {a.status}</option>)}
    </select></label>
    <label>Art<select aria-label="Nachweisart" value={form.proof_kind} onChange={e=>set('proof_kind',e.target.value)}>
      <option value="BEITRITT">Beitritt</option><option value="KUENDIGUNG">Kündigung</option><option value="EINSCHRAENKUNG">Einschränkung</option>
    </select></label>
    <label>Beginn<input aria-label="Nachweis Beginn" type="date" value={form.effective_from} onChange={e=>set('effective_from',e.target.value)}/></label>
    <label>Ende (optional)<input aria-label="Nachweis Ende" type="date" value={form.effective_to} onChange={e=>set('effective_to',e.target.value)}/></label>
    <label>PG (optional)<input aria-label="Nachweis PG" value={form.pg} maxLength={2} onChange={e=>set('pg',e.target.value.replace(/\D/g,''))}/></label>
    <label>PDF-Seite<input aria-label="Nachweis Seite" type="number" min="1" max="250" value={form.source_page} onChange={e=>set('source_page',e.target.value)}/></label>
    <button type="button" className="secondary inline-button" onClick={openOriginal}>Original-PDF zur Prüfung öffnen</button>
    <label>Wörtlicher Belegauszug<textarea aria-label="Nachweis Auszug" maxLength={1500} value={form.source_excerpt} onChange={e=>set('source_excerpt',e.target.value)}/></label>
    <label>Fachlicher Prüfvermerk<textarea aria-label="Nachweis Prüfnotiz" maxLength={2000} value={form.evidence_note} onChange={e=>set('evidence_note',e.target.value)}/></label>
    <label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/> Originalbeleg kontrolliert</label>
    <div className="ocr-proof-actions">
      <button type="button" className="secondary inline-button" disabled={!valid||busy} onClick={()=>submit(false)}>Entwurf speichern</button>
      <button type="button" className="primary inline-button" disabled={!valid||!checked||busy} onClick={()=>submit(true)}>Quellennachweis bestätigen</button>
    </div>
  </details>
}