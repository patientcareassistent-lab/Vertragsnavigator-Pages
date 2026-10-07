import React,{useEffect,useMemo,useState} from 'react'
import { AlertTriangle,CheckCircle2,Circle,FileCheck2,RefreshCw,ShieldCheck,XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const STATUS_LABELS={
  NEW:'Neu',
  IN_REVIEW:'In Prüfung',
  CLARIFICATION:'Rückfrage / offen',
  APPROVED:'Fachlich freigegeben',
  APPROVED_WITH_CONDITIONS:'Mit Auflagen freigegeben',
  REJECTED:'Abgelehnt',
  READY_FOR_SIGNATURE:'Zur Unterschrift',
  SIGNED:'Unterschrieben',
  ACTIVE:'Aktiv',
  ARCHIVED:'Archiviert',
}
const STATUS_TONES={
  IN_REVIEW:'info',CLARIFICATION:'warn',APPROVED:'ok',APPROVED_WITH_CONDITIONS:'warn',
  REJECTED:'bad',READY_FOR_SIGNATURE:'info',SIGNED:'ok',ACTIVE:'ok',ARCHIVED:'',
}
const RATING_LABELS={PENDING:'Offen',GREEN:'Grün',YELLOW:'Gelb',RED:'Rot'}
const CATEGORY_LABELS={
  SCOPE:'Geltungsbereich',
  TERM:'Laufzeit / Kündigung',
  PQ_ACCESSION:'PQ / Beitritt',
  PRICING:'Preise / Wirtschaftlichkeit',
  AUTHORIZATION:'Genehmigung / eKVA',
  PRESCRIPTION:'Verordnung',
  BILLING:'Abrechnung',
  DOCUMENTATION:'Dokumentation / Formulare',
  SERVICE:'Servicepflichten',
  DEADLINES:'Fristen',
  LIABILITY:'Haftung / Vertragsrisiken',
  CHANGES:'Änderungen zum Bestand',
  OTHER:'Sonstiges',
}
const DEFAULT_CHECKS=[
  ['SCOPE','Vertragsgegenstand, Kasse, Region und Produktgruppen',10],
  ['TERM','Vertragsbeginn, Laufzeit, Kündigungsfristen und Verlängerung',20],
  ['PQ_ACCESSION','PQ-Anforderungen, Beitrittsvoraussetzungen und Standorte',30],
  ['PRICING','Preise, Pauschalen, Rabatte und Preisänderungsmechanismen',40],
  ['AUTHORIZATION','Genehmigungspflicht, eKVA und Freigrenzen',50],
  ['PRESCRIPTION','Verordnungsanforderungen',60],
  ['BILLING','LEGS, LKZ/VWKZ, Versorgungsform und Abrechnungslogik',70],
  ['DOCUMENTATION','Dokumentations- und Formularpflichten',80],
  ['SERVICE','Lieferung, Reparatur, Wartung, Erprobung und Rückholung',90],
  ['DEADLINES','Reaktions-, Liefer-, Genehmigungs- und sonstige Fristen',100],
  ['LIABILITY','Haftung, Vertragsstrafen und sonstige Risiken',110],
  ['CHANGES','Wesentliche Abweichungen zur Vorversion / zum Bestand',120],
]

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function fmtDate(value){return value?new Date(value).toLocaleDateString('de-DE'):'—'}
function statusLabel(value){return STATUS_LABELS[value]||value||'—'}
function toneForStatus(value){return STATUS_TONES[value]||''}
function ratingTone(value){return value==='GREEN'?'ok':value==='YELLOW'?'warn':value==='RED'?'bad':'info'}

export default function ContractPrecheck({userId,onOpenChanges}){
  const [prechecks,setPrechecks]=useState([])
  const [uploads,setUploads]=useState([])
  const [selectedId,setSelectedId]=useState('')
  const [findings,setFindings]=useState([])
  const [events,setEvents]=useState([])
  const [newUploadId,setNewUploadId]=useState('')
  const [query,setQuery]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  async function load(preferId=''){
    setBusy(true);setError('')
    try{
      const [pr,ur]=await Promise.all([
        supabase.from('contract_prechecks')
          .select('precheck_id,contract_id,upload_id,status,overall_rating,decision_note,created_by,reviewed_by,approved_at,signed_at,activated_at,created_at,updated_at,contract:contracts(contract_id,contract_name,payer_families,product_groups),upload:contract_uploads(upload_id,filename,upload_status,item_count,change_count,review_count,baseline_upload_id,received_at,accepted_at)')
          .order('updated_at',{ascending:false})
          .limit(300),
        supabase.from('contract_uploads')
          .select('upload_id,contract_id,filename,upload_status,item_count,change_count,review_count,baseline_upload_id,received_at,accepted_at')
          .order('received_at',{ascending:false})
          .limit(300),
      ])
      if(pr.error)throw pr.error
      if(ur.error)throw ur.error
      const rows=pr.data||[]
      setPrechecks(rows)
      setUploads(ur.data||[])
      const wanted=preferId||selectedId||rows[0]?.precheck_id||''
      setSelectedId(wanted)
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  async function loadDetail(id){
    if(!id){setFindings([]);setEvents([]);return}
    try{
      const [fr,er]=await Promise.all([
        supabase.from('contract_precheck_findings')
          .select('*')
          .eq('precheck_id',id)
          .order('sort_order')
          .order('created_at'),
        supabase.from('contract_precheck_events')
          .select('*')
          .eq('precheck_id',id)
          .order('created_at',{ascending:false})
          .limit(100),
      ])
      if(fr.error)throw fr.error
      if(er.error)throw er.error
      setFindings(fr.data||[])
      setEvents(er.data||[])
    }catch(e){setError(e.message||String(e))}
  }

  useEffect(()=>{load()},[])
  useEffect(()=>{loadDetail(selectedId)},[selectedId])

  const selected=prechecks.find(r=>r.precheck_id===selectedId)||null
  const usedUploads=new Set(prechecks.map(r=>r.upload_id).filter(Boolean))
  const availableUploads=uploads.filter(r=>!usedUploads.has(r.upload_id))
  const filteredPrechecks=useMemo(()=>{
    const q=query.trim().toLowerCase()
    if(!q)return prechecks
    return prechecks.filter(r=>JSON.stringify([
      r.contract?.contract_name,r.contract_id,r.upload?.filename,r.status,r.overall_rating,
    ]).toLowerCase().includes(q))
  },[prechecks,query])

  const metrics=useMemo(()=>({
    open:prechecks.filter(r=>['NEW','IN_REVIEW','CLARIFICATION'].includes(r.status)).length,
    approved:prechecks.filter(r=>['APPROVED','APPROVED_WITH_CONDITIONS','READY_FOR_SIGNATURE'].includes(r.status)).length,
    signed:prechecks.filter(r=>r.status==='SIGNED').length,
    active:prechecks.filter(r=>r.status==='ACTIVE').length,
  }),[prechecks])

  async function startPrecheck(){
    const upload=uploads.find(r=>r.upload_id===newUploadId)
    if(!upload){setError('Bitte zuerst einen Vertragsupload auswählen.');return}
    setBusy(true);setError('');setMessage('')
    try{
      const {data:precheck,error:pe}=await supabase.from('contract_prechecks').insert({
        contract_id:upload.contract_id,
        upload_id:upload.upload_id,
        status:'IN_REVIEW',
        created_by:userId||null,
        reviewed_by:userId||null,
      }).select('*').single()
      if(pe)throw pe

      const diffRating=upload.baseline_upload_id
        ? (Number(upload.change_count||0)>0?'YELLOW':'GREEN')
        : 'PENDING'
      const diffNote=upload.baseline_upload_id
        ? (Number(upload.change_count||0)>0
          ? Number(upload.change_count||0)+' Änderung(en) aus dem Upload-Diff müssen fachlich bewertet werden.'
          : 'Zum vorhandenen Baseline-Upload wurden keine Änderungen erkannt.')
        : 'Kein Baseline-Upload vorhanden; Vergleich zum Bestand fachlich prüfen.'

      const rows=DEFAULT_CHECKS.map(([category,title,sort_order])=>({
        precheck_id:precheck.precheck_id,
        category,
        title,
        sort_order,
        rating:category==='CHANGES'?diffRating:'PENDING',
        note:category==='CHANGES'?diffNote:null,
        source_reference:category==='CHANGES'?(upload.filename||null):null,
        auto_generated:category==='CHANGES',
        created_by:userId||null,
      }))

      if(Number(upload.review_count||0)>0){
        rows.push({
          precheck_id:precheck.precheck_id,
          category:'OTHER',
          title:'Automatische Prüfpunkte aus dem Vertragsupload',
          sort_order:130,
          rating:'YELLOW',
          note:Number(upload.review_count||0)+' Prüfpunkte wurden beim Upload erkannt und müssen bestätigt werden.',
          source_reference:upload.filename||null,
          auto_generated:true,
          created_by:userId||null,
        })
      }

      const {error:fe}=await supabase.from('contract_precheck_findings').insert(rows)
      if(fe)throw fe
      const {error:ee}=await supabase.from('contract_precheck_events').insert({
        precheck_id:precheck.precheck_id,
        event_type:'PRECHECK_STARTED',
        to_status:'IN_REVIEW',
        note:'Vorprüfung über Admin-Menü gestartet.',
        actor_user_id:userId||null,
      })
      if(ee)throw ee

      setNewUploadId('')
      setMessage('Vertragsvorprüfung wurde angelegt.')
      await load(precheck.precheck_id)
      await loadDetail(precheck.precheck_id)
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  async function updateFinding(findingId,patch){
    setError('');setMessage('')
    const current=findings.find(r=>r.finding_id===findingId)
    setFindings(rows=>rows.map(r=>r.finding_id===findingId?{...r,...patch}:r))
    const payload={...patch}
    if('finding_status' in patch){
      payload.resolved_at=patch.finding_status==='OPEN'?null:new Date().toISOString()
      payload.resolved_by=patch.finding_status==='OPEN'?null:(userId||null)
    }
    const {error:e}=await supabase.from('contract_precheck_findings').update(payload).eq('finding_id',findingId)
    if(e){
      setFindings(rows=>rows.map(r=>r.finding_id===findingId?current:r))
      setError(e.message)
      return
    }
    await load(selectedId)
    await loadDetail(selectedId)
  }

  async function saveFindingText(finding){
    const {error:e}=await supabase.from('contract_precheck_findings').update({
      note:finding.note||null,
      source_reference:finding.source_reference||null,
    }).eq('finding_id',finding.finding_id)
    if(e)setError(e.message)
    else setMessage('Prüfhinweis gespeichert.')
  }

  async function saveDecisionNote(){
    if(!selected)return
    const {error:e}=await supabase.from('contract_prechecks').update({
      decision_note:selected.decision_note||null,
      reviewed_by:userId||null,
    }).eq('precheck_id',selected.precheck_id)
    if(e)setError(e.message)
    else setMessage('Entscheidungsnotiz gespeichert.')
  }

  async function setWorkflowStatus(nextStatus){
    if(!selected)return
    setBusy(true);setError('');setMessage('')
    try{
      const {error:e}=await supabase.from('contract_prechecks').update({
        status:nextStatus,
        reviewed_by:userId||null,
        decision_note:selected.decision_note||null,
      }).eq('precheck_id',selected.precheck_id)
      if(e)throw e
      setMessage('Status: '+statusLabel(nextStatus))
      await load(selected.precheck_id)
      await loadDetail(selected.precheck_id)
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  function updateLocalDecision(value){
    setPrechecks(rows=>rows.map(r=>r.precheck_id===selectedId?{...r,decision_note:value}:r))
  }
  function updateLocalFinding(id,key,value){
    setFindings(rows=>rows.map(r=>r.finding_id===id?{...r,[key]:value}:r))
  }

  const canApproveGreen=selected?.overall_rating==='GREEN'
  const canApproveConditional=selected?.overall_rating==='YELLOW'
  const canSendToSignature=selected?.overall_rating==='GREEN'&&['APPROVED','APPROVED_WITH_CONDITIONS'].includes(selected?.status)
  const canMarkSigned=selected?.status==='READY_FOR_SIGNATURE'
  const uploadPublished=selected?.upload?.upload_status==='ACCEPTED'
  const canActivate=selected?.status==='SIGNED'&&uploadPublished

  return <div className="precheck-workspace">
    <section className="panel span2 precheck-start">
      <div className="sectionbar">
        <div><h2>Neue Vorprüfung</h2><p>Ein Vertragsupload wird zunächst geprüft und bleibt bis zur dokumentierten Freigabe getrennt vom produktiven Vertragsbestand.</p></div>
        <button className="secondary icon-button" onClick={()=>load(selectedId)} title="Aktualisieren"><RefreshCw className={busy?'spin':''} size={16}/></button>
      </div>
      {error&&<div className="alert error">{error}</div>}
      {message&&<div className="alert success">{message}</div>}
      <div className="precheck-new-row">
        <label>Vertragsupload<select value={newUploadId} onChange={e=>setNewUploadId(e.target.value)}>
          <option value="">Upload auswählen …</option>
          {availableUploads.map(u=><option key={u.upload_id} value={u.upload_id}>{u.contract_id} · {u.filename||'ohne Dateiname'} · {statusLabel(u.upload_status)}</option>)}
        </select></label>
        <button className="primary" type="button" onClick={startPrecheck} disabled={!newUploadId||busy}><FileCheck2 size={17}/> Vorprüfung starten</button>
      </div>
      {!availableUploads.length&&<div className="note">Für alle vorhandenen Vertragsuploads besteht bereits eine Vorprüfung. Neue Uploads erscheinen hier automatisch.</div>}
      <div className="metrics precheck-metrics">
        <article className="metric"><span>Offen / in Prüfung</span><strong>{metrics.open}</strong></article>
        <article className="metric"><span>Freigegeben</span><strong>{metrics.approved}</strong></article>
        <article className="metric"><span>Unterschrieben</span><strong>{metrics.signed}</strong></article>
        <article className="metric"><span>Aktiv</span><strong>{metrics.active}</strong></article>
      </div>
    </section>

    <section className="panel precheck-list-panel">
      <div className="sectionbar">
        <div><h2>Vorprüfungen</h2><p>Admin-Prüfqueue vor Vertragsunterschrift.</p></div>
        <input className="compact" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Vertrag / Datei …"/>
      </div>
      <div className="precheck-list">
        {filteredPrechecks.map(r=><button key={r.precheck_id} type="button" className={'precheck-list-row '+(selectedId===r.precheck_id?'selected':'')} onClick={()=>setSelectedId(r.precheck_id)}>
          <span className={'precheck-dot '+String(r.overall_rating||'PENDING').toLowerCase()}></span>
          <span className="precheck-list-main"><b>{r.contract?.contract_name||r.contract_id}</b><small>{r.upload?.filename||'ohne Upload'} · {fmtDate(r.updated_at)}</small></span>
          <Badge tone={toneForStatus(r.status)}>{statusLabel(r.status)}</Badge>
        </button>)}
        {!filteredPrechecks.length&&!busy&&<div className="empty-panel">Noch keine Vertragsvorprüfung vorhanden.</div>}
      </div>
    </section>

    <section className="panel precheck-detail">
      {!selected?<div className="empty-panel">Links eine Vorprüfung auswählen.</div>:<>
        <div className="sectionbar">
          <div>
            <h2>{selected.contract?.contract_name||selected.contract_id}</h2>
            <p>{selected.upload?.filename||'Kein Upload verknüpft'} · angelegt {fmtDate(selected.created_at)}</p>
          </div>
          <div className="precheck-head-badges">
            <Badge tone={ratingTone(selected.overall_rating)}>Ampel {RATING_LABELS[selected.overall_rating]||selected.overall_rating}</Badge>
            <Badge tone={toneForStatus(selected.status)}>{statusLabel(selected.status)}</Badge>
          </div>
        </div>

        <div className="precheck-flow">
          {['IN_REVIEW','APPROVED','READY_FOR_SIGNATURE','SIGNED','ACTIVE'].map((s,i)=><React.Fragment key={s}>
            <span className={selected.status===s?'current':(['APPROVED_WITH_CONDITIONS'].includes(selected.status)&&s==='APPROVED')?'current':''}>{statusLabel(s)}</span>
            {i<4&&<i>→</i>}
          </React.Fragment>)}
        </div>

        <div className="precheck-context">
          <div><small>Uploadstatus</small><strong>{statusLabel(selected.upload?.upload_status)}</strong></div>
          <div><small>Upload-Diff</small><strong>{Number(selected.upload?.change_count||0)} Änderungen</strong></div>
          <div><small>Automatische Reviews</small><strong>{Number(selected.upload?.review_count||0)}</strong></div>
          <div><small>Produktgruppen</small><strong>{(selected.contract?.product_groups||[]).join(', ')||'—'}</strong></div>
        </div>

        <div className="precheck-findings">
          {findings.map(f=><article key={f.finding_id} className={'precheck-finding '+String(f.rating||'PENDING').toLowerCase()+(f.finding_status!=='OPEN'?' resolved':'')}>
            <div className="precheck-finding-head">
              <div className="precheck-finding-title">
                {f.rating==='GREEN'?<CheckCircle2 size={18}/>:f.rating==='RED'?<XCircle size={18}/>:f.rating==='YELLOW'?<AlertTriangle size={18}/>:<Circle size={18}/>}
                <div><b>{f.title}</b><small>{CATEGORY_LABELS[f.category]||f.category}{f.auto_generated?' · automatisch vorbefüllt':''}</small></div>
              </div>
              <div className="rating-control" aria-label={'Bewertung '+f.title}>
                {['PENDING','GREEN','YELLOW','RED'].map(v=><button key={v} type="button" className={f.rating===v?'active '+v.toLowerCase():''} onClick={()=>updateFinding(f.finding_id,{rating:v,finding_status:'OPEN'})}>{RATING_LABELS[v]}</button>)}
                <button type="button" className={f.finding_status==='NOT_APPLICABLE'?'active na':''} onClick={()=>updateFinding(f.finding_id,{finding_status:f.finding_status==='NOT_APPLICABLE'?'OPEN':'NOT_APPLICABLE'})}>n/a</button>
              </div>
            </div>
            <div className="precheck-finding-body">
              <label>Bewertung / Hinweis<textarea rows="2" value={f.note||''} onChange={e=>updateLocalFinding(f.finding_id,'note',e.target.value)} placeholder="fachliche Bewertung, Risiko oder Auflage …"/></label>
              <label>Quelle / Seite<input value={f.source_reference||''} onChange={e=>updateLocalFinding(f.finding_id,'source_reference',e.target.value)} placeholder="z. B. § 8 / Anlage 2 / Seite 14"/></label>
              <button className="secondary small-button" type="button" onClick={()=>saveFindingText(f)}>Speichern</button>
            </div>
          </article>)}
          {!findings.length&&<div className="empty-panel">Für diese Vorprüfung wurden noch keine Prüfpunkte angelegt.</div>}
        </div>

        <section className="precheck-decision-box">
          <div>
            <h3>Freigabeentscheidung</h3>
            <p>Rot blockiert die Freigabe. Gelb kann nur mit Auflagen freigegeben werden. Eine Weitergabe zur Unterschrift setzt eine grüne Gesamtampel voraus.</p>
          </div>
          <label>Entscheidungsnotiz<textarea rows="3" value={selected.decision_note||''} onChange={e=>updateLocalDecision(e.target.value)} placeholder="Begründung, Auflagen oder Rückfrage dokumentieren …"/></label>
          <div className="precheck-actions">
            <button className="secondary" type="button" disabled={busy} onClick={saveDecisionNote}>Notiz speichern</button>
            <button className="secondary" type="button" disabled={busy} onClick={()=>setWorkflowStatus('CLARIFICATION')}>Rückfrage / offen</button>
            <button className="danger-button" type="button" disabled={busy} onClick={()=>setWorkflowStatus('REJECTED')}>Ablehnen</button>
            <button className="secondary" type="button" disabled={busy||!canApproveConditional} onClick={()=>setWorkflowStatus('APPROVED_WITH_CONDITIONS')}>Mit Auflagen freigeben</button>
            <button className="primary" type="button" disabled={busy||!canApproveGreen} onClick={()=>setWorkflowStatus('APPROVED')}><ShieldCheck size={16}/> Fachlich freigeben</button>
            <button className="primary" type="button" disabled={busy||!canSendToSignature} onClick={()=>setWorkflowStatus('READY_FOR_SIGNATURE')}>Zur Unterschrift</button>
            <button className="primary" type="button" disabled={busy||!canMarkSigned} onClick={()=>setWorkflowStatus('SIGNED')}>Unterschrift dokumentieren</button>
          </div>
          {selected.status==='SIGNED'&&!uploadPublished&&<div className="review-callout">
            <div><AlertTriangle size={18}/><div><b>Unterschrift dokumentiert – Veröffentlichung noch offen</b><p>Der zugeordnete Vertragsupload ist noch nicht veröffentlicht. Erst danach kann die Vorprüfung auf „Aktiv“ gesetzt werden.</p></div></div>
            <button className="primary inline-button" type="button" onClick={onOpenChanges}>Änderungen veröffentlichen</button>
          </div>}
          {canActivate&&<div className="review-callout success-callout">
            <div><CheckCircle2 size={18}/><div><b>Upload veröffentlicht</b><p>Die Vertragsvorprüfung kann jetzt als aktiv abgeschlossen werden.</p></div></div>
            <button className="primary inline-button" type="button" onClick={()=>setWorkflowStatus('ACTIVE')}>Als aktiv markieren</button>
          </div>}
        </section>

        <details className="precheck-audit">
          <summary>Prüfprotokoll ({events.length})</summary>
          <div className="question-list">
            {events.map(e=><article className="question-row" key={e.event_id}>
              <div><b>{e.event_type==='STATUS_CHANGE'?'Status geändert':'Vorprüfung gestartet'}</b><small>{[e.from_status&&statusLabel(e.from_status),e.to_status&&statusLabel(e.to_status),fmtDate(e.created_at)].filter(Boolean).join(' → ')}</small>{e.note&&<p>{e.note}</p>}</div>
            </article>)}
            {!events.length&&<div className="empty-panel">Noch keine Protokolleinträge.</div>}
          </div>
        </details>
      </>}
    </section>
  </div>
}
