import React,{useEffect,useState} from 'react'
import {AlertTriangle,BookOpen,ChevronDown,ClipboardCheck,ExternalLink,LoaderCircle,RefreshCw,ShieldCheck} from 'lucide-react'
import {
  getOcrRuleCandidates,scanOcrRuleCandidates,decideOcrRuleCandidate,
  createOcrKnowledgeDraft,getContractUploadOriginalLink
} from '../lib/contractUpload.js'
import './ContractOcrRuleReview.css'
import OcrRuleScopeEditor from './OcrRuleScopeEditor.jsx'

const LABELS={
  GENEHMIGUNG:'Genehmigung / KVA',FRIST:'Fristen / Gültigkeit',LEGS:'LEGS',
  ABRECHNUNG:'Abrechnung',VERSORGUNG:'Versorgung',VERORDNUNG:'Verordnung',
  DOKUMENTATION:'Dokumentation'
}
const STATUSES={PENDING:'Noch ungeprüft',CONFIRMED:'Fachlich bestätigt',REJECTED:'Nicht übernehmen',SUPERSEDED:'Überholt'}
const LABELS_FIELDS={
  legs_codes:'Erkannte LEGS',hmv_codes:'Erkannte HMV-Nummern',
  durations_literal:'Textstellen mit Zeitangaben',
  amounts_literal_eur:'Beträge mit EUR-Kennzeichnung'
}
function HintFields({fields={}}){
  return <div className="ocr-rule-fields">
    {Object.entries(LABELS_FIELDS).map(([field,label])=>{
      const items=fields[field]
      return Array.isArray(items)&&items.length?<div key={field}>
        <b>{label}:</b> <span>{items.join(' · ')}</span>
      </div>:null
    })}
    <small>Hinweise sind nicht geprüft. Zuordnung zu Vertrag, Kasse, IK, PG, Gültigkeit und Leistungsumfang muss bestätigt werden.</small>
  </div>
}
function SourcePageLink({uploadId,page}){
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function open(){
    const tab=window.open('about:blank','_blank')
    setBusy(true);setError('')
    try{
      const link=await getContractUploadOriginalLink(uploadId)
      if(!link?.url)throw new Error('Keine Originalquelle verfügbar')
      const url=link.url+'#page='+encodeURIComponent(page)
      if(tab)tab.location.replace(url)
      else window.location.assign(url)
    }catch(e){
      if(tab)tab.close()
      setError(e?.message||'Original nicht verfügbar')
    }finally{setBusy(false)}
  }
  return <span className="ocr-rule-page">
    <button className="secondary compact-action" onClick={open} disabled={busy} type="button">
      {busy?<LoaderCircle className="spin" size={14}/>:<ExternalLink size={14}/>} Originalseite {page}
    </button>
    {error&&<small role="alert">{error}</small>}
  </span>
}
export default function ContractOcrRuleReview({upload}){
  const uploadId=upload?.upload_id
  const available=Boolean(upload?.summary?.ocr_text_storage_path)
  const [expanded,setExpanded]=useState(false)
  const [report,setReport]=useState(null)
  const [candidates,setCandidates]=useState([])
  const [status,setStatus]=useState('')
  const [kind,setKind]=useState('')
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [notes,setNotes]=useState({})
  const [drafts,setDrafts]=useState({})
  const [showDraft,setShowDraft]=useState({})
  async function load({offset=0,append=false,currentStatus=status,currentKind=kind}={}){
    if(!uploadId)return
    setBusy('load');setError('')
    try{
      const result=await getOcrRuleCandidates(uploadId,{
        offset,limit:25,status:currentStatus,kind:currentKind
      })
      setReport(result)
      setCandidates(previous=>append?[...previous,...(result.candidates||[])]:result.candidates||[])
    }catch(e){setError(e.message)}
    finally{setBusy('')}
  }
  useEffect(()=>{
    setExpanded(false);setReport(null);setCandidates([]);setStatus('');setKind('')
    setNotes({});setDrafts({});setShowDraft({});setError('');setMessage('')
  },[uploadId])
  async function toggle(){
    if(expanded){setExpanded(false);return}
    setExpanded(true)
    await load({currentStatus:'',currentKind:''})
  }
  async function scan(){
    setBusy('scan');setError('');setMessage('')
    try{
      const result=await scanOcrRuleCandidates(uploadId)
      setMessage((result.generated??0)+' OCR-Regelhinweise gefunden. Bestehende Prüfentscheidungen bleiben erhalten.')
      const rows=await getOcrRuleCandidates(uploadId,{offset:0,limit:25,status,kind})
      setReport(rows);setCandidates(rows.candidates||[])
    }catch(e){setError(e.message)}
    finally{setBusy('')}
  }
  async function decide(item,target){
    const note=String(notes[item.candidate_id]||'').trim()
    if(note.length<12){setError('Für jede Entscheidung ist eine fachliche Begründung mit mindestens 12 Zeichen erforderlich.');return}
    setBusy(item.candidate_id);setError('');setMessage('')
    try{
      await decideOcrRuleCandidate(uploadId,item.candidate_id,target,note)
      setMessage(target==='CONFIRMED'?'Kandidat fachlich bestätigt – noch keine veröffentlichte Regel.':'Kandidat verworfen.')
      await load({offset:0})
    }catch(e){setError(e.message)}
    finally{setBusy('')}
  }
  async function createDraft(item){
    const draft=String(drafts[item.candidate_id]||'').trim()
    if(draft.length<20){setError('Bitte den fachlich geprüften Regeltext mit mindestens 20 Zeichen formulieren.');return}
    if(!window.confirm('Diesen geprüften Kandidaten als DRAFT in die Wissensbasis übernehmen? Es erfolgt keine Veröffentlichung.'))return
    setBusy(item.candidate_id);setError('');setMessage('')
    try{
      const result=await createOcrKnowledgeDraft(uploadId,item.candidate_id,draft)
      setMessage('Wissensentwurf '+result.knowledge_id+' gespeichert (DRAFT, Revalidierung erforderlich).')
      setShowDraft(previous=>({...previous,[item.candidate_id]:false}))
      await load({offset:0})
    }catch(e){setError(e.message)}
    finally{setBusy('')}
  }
  if(!available||!uploadId)return null
  const pagination=report?.pagination||{}
  return <section className="panel ocr-rule-review">
    <div className="sectionbar">
      <div><h2><ClipboardCheck size={18}/> OCR-Regelhinweise</h2>
        <p>Genehmigung, Fristen, Versorgung, LEGS und Abrechnung – fachlich geprüft statt automatisch veröffentlicht</p>
      </div>
      <button className="secondary inline-button" onClick={toggle} type="button">
        <ChevronDown size={16} className={expanded?'ocr-rule-expanded':''}/>
        {expanded?'Prüfliste einklappen':'Regelhinweise prüfen'}
      </button>
    </div>
    {expanded&&<>
      <div className="ocr-rule-toolbar">
        <button className="secondary inline-button" type="button" onClick={scan} disabled={Boolean(busy)}>
          {busy==='scan'?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}
          Prüfkandidaten aus OCR aktualisieren
        </button>
        <label>Status
          <select value={status} aria-label="OCR-Regelstatus" onChange={e=>{
            setStatus(e.target.value);load({currentStatus:e.target.value,offset:0})
          }}>
            <option value="">Alle außer Filter</option>
            {Object.entries(STATUSES).map(([value,label])=><option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Regelart
          <select value={kind} aria-label="OCR-Regelart" onChange={e=>{
            setKind(e.target.value);load({currentKind:e.target.value,offset:0})
          }}>
            <option value="">Alle Themen</option>
            {Object.entries(LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="note"><AlertTriangle size={16}/>
        Nur erkennbare Textmerkmale werden vorgeschlagen, keine verbindlichen Regeln. Fachliche Bestätigung ist nicht gleich Veröffentlichung. Der spätere Wissensentwurf bleibt DRAFT und revalidierungsbedürftig.
      </div>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {message&&<div className="alert success">{message}</div>}
      {busy==='load'&&!candidates.length&&<div className="ocr-rule-loading"><LoaderCircle className="spin" size={16}/> Prüfkandidaten laden …</div>}
      <div className="ocr-rule-items">
        {candidates.map(item=><article className="ocr-rule-item" key={item.candidate_id}>
          <div className="ocr-rule-heading">
            <div><small>{LABELS[item.rule_kind]||item.rule_kind} · {item.clause_key} · {item.ocr_quality==='OCR'?'Scan-OCR':'PDF-Text'}</small>
              <b>{item.display_title}</b>
            </div>
            <span className={'ocr-rule-state '+item.status.toLowerCase()}>{STATUSES[item.status]||item.status}</span>
          </div>
          <p>{item.source_excerpt}</p>
          <div className="ocr-rule-source"><SourcePageLink uploadId={uploadId} page={item.source_page}/>
            {item.source_end_page>item.source_page&&<small>Bis Seite {item.source_end_page}</small>}
          </div>
          <HintFields fields={item.proposed_fields}/>
          {item.scope?.scope_status==='VERIFIED'&&<div className="ocr-rule-draft-success">
            <ShieldCheck size={14}/> Geltungsbereich bestätigt: Kostenträger {item.scope.payer_mode==='EXACT'?item.scope.payer:'Vertragsumfang'},
            PG {item.scope.pg_mode==='EXACT'?item.scope.pg:'Vertragsumfang'},
            IK {item.scope.ik_mode==='EXACT'?item.scope.ik:'Vertragsumfang'},
            LEGS {item.scope.legs_mode==='EXACT'?item.scope.legs:'Vertragsumfang'}.
            Standort-Vertragsbeitritt und PQ sind weiterhin getrennt zu prüfen.
          </div>}
          {report?.can_decide&&['PENDING','CONFIRMED'].includes(item.status)&&!item.knowledge_id&&
            <OcrRuleScopeEditor key={item.candidate_id} uploadId={uploadId} item={item}
              onUpdated={()=>load({offset:0})}/>}
          {item.scope?.scope_status!=='VERIFIED'&&<div className="ocr-rule-reviewed">
            Keine geprüfte Vertragsgeltung: Dieser Hinweis darf nicht in die Wissensbasis übernommen werden.
          </div>}
          {item.status==='PENDING'&&report?.can_decide&&<div className="ocr-rule-decision">
            <label>Fachliche Begründung
              <textarea maxLength={800} value={notes[item.candidate_id]||''}
                onChange={e=>setNotes(previous=>({...previous,[item.candidate_id]:e.target.value}))}
                placeholder="Quellenprüfung, Geltungsbereich und Entscheidung dokumentieren …"/>
            </label>
            <div className="ocr-rule-actions">
              <button className="primary inline-button" type="button" disabled={Boolean(busy)||String(notes[item.candidate_id]||'').trim().length<12}
                onClick={()=>decide(item,'CONFIRMED')}><ShieldCheck size={15}/> Als Prüfkandidat bestätigen</button>
              <button className="secondary inline-button" type="button" disabled={Boolean(busy)||String(notes[item.candidate_id]||'').trim().length<12}
                onClick={()=>decide(item,'REJECTED')}>Nicht übernehmen</button>
            </div>
          </div>}
          {item.status==='CONFIRMED'&&<>
            {item.review_note&&<div className="ocr-rule-reviewed"><b>Prüfvermerk:</b> {item.review_note}</div>}
            {item.knowledge_id?<div className="ocr-rule-draft-success">
              Wissensentwurf angelegt · Kennung {item.knowledge_id} · noch nicht freigegeben.
            </div>:report?.can_draft&&item.scope?.scope_status==='VERIFIED'?<>
              <button className="secondary inline-button" type="button"
                onClick={()=>setShowDraft(p=>({...p,[item.candidate_id]:!p[item.candidate_id]}))}>
                <BookOpen size={15}/> Fachlich formulierten Wissensentwurf anlegen
              </button>
              {showDraft[item.candidate_id]&&<div className="ocr-rule-draft">
                <label>Geprüfter Regeltext – wird ausdrücklich nur als DRAFT gespeichert
                  <textarea maxLength={2500} value={drafts[item.candidate_id]||''}
                    onChange={e=>setDrafts(p=>({...p,[item.candidate_id]:e.target.value}))}
                    placeholder="Vertraglich gesicherte Aussage mit allen relevanten Einschränkungen formulieren …"/>
                </label>
                <button className="primary inline-button" type="button" disabled={Boolean(busy)||String(drafts[item.candidate_id]||'').trim().length<20}
                  onClick={()=>createDraft(item)}>
                  <BookOpen size={15}/> Als DRAFT speichern (nicht veröffentlichen)
                </button>
              </div>}
            </>}
          </>}
          {item.status==='REJECTED'&&item.review_note&&<div className="ocr-rule-reviewed"><b>Verworfen:</b> {item.review_note}</div>}
          {item.status==='SUPERSEDED'&&<div className="ocr-rule-reviewed">Dieser Kandidat stammt aus einer früheren Texterkennung und wird nicht mehr zur Übernahme angeboten.</div>}
        </article>)}
      </div>
      {!candidates.length&&!busy&&<div className="empty-panel">
        Keine Regelhinweise vorhanden. Über „Prüfkandidaten aus OCR aktualisieren“ lassen sich vorhandene OCR-Vertragsseiten ohne erneuten Upload auswerten.
      </div>}
      {pagination.has_more&&<button className="secondary inline-button" type="button" disabled={Boolean(busy)}
        onClick={()=>load({offset:pagination.offset+pagination.limit,append:true})}>
        <ChevronDown size={15}/> Weitere Regelhinweise ({candidates.length}/{pagination.total})
      </button>}
    </>}
  </section>
}
