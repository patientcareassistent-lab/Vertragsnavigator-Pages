import React,{useEffect,useMemo,useRef,useState} from 'react'
import {
  AlertTriangle,CheckCircle2,ChevronLeft,ChevronRight,Circle,
  CloudUpload,FileCheck2,ListChecks,LoaderCircle,RefreshCw,ShieldCheck,XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import ContractUpload from './ContractUpload.jsx'

const PAGE_SIZE=20
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
  RECEIVED:'Datei hochgeladen',
  DUPLICATE:'Bereits vorhanden',
  PARSING:'Inhalt erkannt',
  READY:'Bereit zum Vergleich',
  REVIEW:'Änderungen geprüft',
  ACCEPTED:'Veröffentlicht',
  ERROR:'Fehler',
}
const STATUS_TONES={
  IN_REVIEW:'info',CLARIFICATION:'warn',APPROVED:'ok',APPROVED_WITH_CONDITIONS:'warn',
  REJECTED:'bad',READY_FOR_SIGNATURE:'info',SIGNED:'ok',ACTIVE:'ok',ARCHIVED:'',
  ACCEPTED:'ok',DUPLICATE:'info',REVIEW:'warn',ERROR:'bad',READY:'info',PARSING:'info',
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

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function fmtDate(value){return value?new Date(value).toLocaleDateString('de-DE'):'—'}
function statusLabel(value){return STATUS_LABELS[value]||value||'—'}
function toneForStatus(value){return STATUS_TONES[value]||''}
function ratingTone(value){return value==='GREEN'?'ok':value==='YELLOW'?'warn':value==='RED'?'bad':'info'}
function isDone(f){return f.finding_status!=='OPEN'||f.rating!=='PENDING'}

export default function ContractPrecheck({userId,onOpenChanges,contracts=[],sites=[]}){
  const [prechecks,setPrechecks]=useState([])
  const [selectedId,setSelectedId]=useState('')
  const [selected,setSelected]=useState(null)
  const [findings,setFindings]=useState([])
  const [events,setEvents]=useState([])
  const [legacyUploads,setLegacyUploads]=useState([])
  const [legacyUploadId,setLegacyUploadId]=useState('')
  const [query,setQuery]=useState('')
  const [debouncedQuery,setDebouncedQuery]=useState('')
  const [page,setPage]=useState(0)
  const [total,setTotal]=useState(0)
  const [metrics,setMetrics]=useState({open:0,approved:0,signed:0,active:0})
  const [showUpload,setShowUpload]=useState(false)
  const [activeFindingId,setActiveFindingId]=useState('')
  const [busy,setBusy]=useState(false)
  const [detailBusy,setDetailBusy]=useState(false)
  const [autosaveState,setAutosaveState]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  const listAbortRef=useRef(null)
  const detailAbortRef=useRef(null)
  const findingSaveTimers=useRef(new Map())
  const decisionSaveTimer=useRef(null)
  const creatingUploadRef=useRef(new Set())

  useEffect(()=>{
    const timer=setTimeout(()=>{setDebouncedQuery(query.trim());setPage(0)},350)
    return()=>clearTimeout(timer)
  },[query])

  useEffect(()=>{
    loadOverview()
    return()=>listAbortRef.current?.abort()
  },[page,debouncedQuery])

  useEffect(()=>{
    loadMetrics()
    loadLegacyUploads()
  },[])

  useEffect(()=>{
    if(!selectedId){setSelected(null);setFindings([]);setEvents([]);return}
    loadSelected(selectedId)
    return()=>detailAbortRef.current?.abort()
  },[selectedId])

  async function loadOverview(preferId=''){
    listAbortRef.current?.abort()
    const controller=new AbortController()
    listAbortRef.current=controller
    setBusy(true);setError('')
    try{
      const from=page*PAGE_SIZE
      let request=supabase.from('vn_admin_contract_precheck_overview')
        .select('*',{count:'exact'})
        .order('updated_at',{ascending:false})
        .range(from,from+PAGE_SIZE-1)
        .abortSignal(controller.signal)
      if(debouncedQuery)request=request.ilike('search_text','%'+debouncedQuery.replace(/[%_]/g,'')+'%')
      const {data,count,error:e}=await request
      if(e){
        if(e.name==='AbortError'||/abort/i.test(String(e.message||'')))return
        throw e
      }
      const rows=data||[]
      setPrechecks(rows)
      setTotal(count||0)
      if(preferId){
        setSelectedId(preferId)
      }else if(!selectedId&&rows[0]){
        setSelectedId(rows[0].precheck_id)
      }else if(selectedId&&page>0&&!rows.length){
        setPage(Math.max(0,page-1))
      }
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  async function loadMetrics(){
    const requests=[
      supabase.from('contract_prechecks').select('*',{count:'exact',head:true}).in('status',['NEW','IN_REVIEW','CLARIFICATION']),
      supabase.from('contract_prechecks').select('*',{count:'exact',head:true}).in('status',['APPROVED','APPROVED_WITH_CONDITIONS','READY_FOR_SIGNATURE']),
      supabase.from('contract_prechecks').select('*',{count:'exact',head:true}).eq('status','SIGNED'),
      supabase.from('contract_prechecks').select('*',{count:'exact',head:true}).eq('status','ACTIVE'),
    ]
    const rows=await Promise.all(requests)
    const first=rows.find(r=>r.error)?.error
    if(first){setError(first.message||String(first));return}
    setMetrics({
      open:rows[0].count||0,
      approved:rows[1].count||0,
      signed:rows[2].count||0,
      active:rows[3].count||0,
    })
  }

  async function loadLegacyUploads(){
    const {data,error:e}=await supabase.from('contract_uploads')
      .select('upload_id,contract_id,filename,upload_status,received_at')
      .eq('workflow_context','STANDARD')
      .not('upload_status','in','(ACCEPTED,BASELINE,REJECTED)')
      .order('received_at',{ascending:false})
      .limit(50)
    if(e){setError(e.message);return}
    setLegacyUploads(data||[])
  }

  async function loadSelected(id){
    detailAbortRef.current?.abort()
    const controller=new AbortController()
    detailAbortRef.current=controller
    setDetailBusy(true);setError('')
    try{
      const [sr,fr,er]=await Promise.all([
        supabase.from('vn_admin_contract_precheck_overview')
          .select('*').eq('precheck_id',id).single().abortSignal(controller.signal),
        supabase.from('contract_precheck_findings')
          .select('*').eq('precheck_id',id).order('sort_order').order('created_at')
          .abortSignal(controller.signal),
        supabase.from('contract_precheck_events')
          .select('*').eq('precheck_id',id).order('created_at',{ascending:false}).limit(60)
          .abortSignal(controller.signal),
      ])
      const first=[sr,fr,er].find(r=>r.error)?.error
      if(first){
        if(first.name==='AbortError'||/abort/i.test(String(first.message||'')))return
        throw first
      }
      const nextFindings=fr.data||[]
      setSelected(sr.data||null)
      setFindings(nextFindings)
      setEvents(er.data||[])
      setActiveFindingId(current=>{
        if(current&&nextFindings.some(f=>f.finding_id===current))return current
        return nextFindings.find(f=>f.finding_status==='OPEN'&&f.rating==='PENDING')?.finding_id
          ||nextFindings.find(f=>f.finding_status==='OPEN'&&['RED','YELLOW'].includes(f.rating))?.finding_id
          ||nextFindings[0]?.finding_id||''
      })
    }catch(e){setError(e.message||String(e))}
    finally{setDetailBusy(false)}
  }

  async function refreshSelectedOverview(id=selectedId){
    if(!id)return
    const {data,error:e}=await supabase.from('vn_admin_contract_precheck_overview')
      .select('*').eq('precheck_id',id).single()
    if(e){setError(e.message);return}
    setSelected(data)
  }

  async function startPrecheck(uploadId=legacyUploadId){
    if(!uploadId){setError('Bitte zuerst einen Vertragsupload auswählen.');return}
    if(creatingUploadRef.current.has(uploadId))return
    creatingUploadRef.current.add(uploadId)
    setBusy(true);setError('');setMessage('')
    try{
      const {data,error:e}=await supabase.rpc('vn_admin_create_contract_precheck',{p_upload_id:uploadId})
      if(e)throw e
      const precheckId=typeof data==='string'?data:(data?.precheck_id||data)
      if(!precheckId)throw new Error('Vorprüfung wurde angelegt, aber keine Prüf-ID zurückgegeben.')
      setLegacyUploadId('')
      setShowUpload(false)
      setMessage('Upload analysiert und Vertragsvorprüfung angelegt.')
      setPage(0)
      setDebouncedQuery('')
      setQuery('')
      await Promise.all([loadMetrics(),loadLegacyUploads()])
      await loadOverview(precheckId)
      setSelectedId(precheckId)
    }catch(e){
      const raw=String(e.message||e)
      if(/besteht bereits eine Vorprüfung/i.test(raw)){
        const {data}=await supabase.from('contract_prechecks').select('precheck_id').eq('upload_id',uploadId).maybeSingle()
        if(data?.precheck_id){
          setShowUpload(false)
          setSelectedId(data.precheck_id)
          setMessage('Die vorhandene Vertragsvorprüfung wurde geöffnet.')
        }else setError(raw)
      }else setError(raw)
    }finally{
      creatingUploadRef.current.delete(uploadId)
      setBusy(false)
    }
  }

  async function updateFinding(findingId,patch){
    setError('');setMessage('')
    const current=findings.find(r=>r.finding_id===findingId)
    if(!current)return
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
    await Promise.all([refreshSelectedOverview(),loadOverview(),loadMetrics()])
  }

  function queueFindingAutosave(findingId,key,value){
    setFindings(rows=>rows.map(r=>r.finding_id===findingId?{...r,[key]:value}:r))
    const timerKey=findingId+':'+key
    const old=findingSaveTimers.current.get(timerKey)
    if(old)clearTimeout(old)
    setAutosaveState('saving')
    const timer=setTimeout(async()=>{
      const {error:e}=await supabase.from('contract_precheck_findings')
        .update({[key]:value||null})
        .eq('finding_id',findingId)
      findingSaveTimers.current.delete(timerKey)
      if(e){setAutosaveState('error');setError(e.message)}
      else{
        setAutosaveState('saved')
        setTimeout(()=>setAutosaveState(current=>current==='saved'?'':current),1200)
      }
    },650)
    findingSaveTimers.current.set(timerKey,timer)
  }

  function updateDecision(value){
    const id=selectedId
    setSelected(current=>current?{...current,decision_note:value}:current)
    if(decisionSaveTimer.current)clearTimeout(decisionSaveTimer.current)
    setAutosaveState('saving')
    decisionSaveTimer.current=setTimeout(async()=>{
      const {error:e}=await supabase.from('contract_prechecks').update({
        decision_note:value||null,
        reviewed_by:userId||null,
      }).eq('precheck_id',id)
      if(e){setAutosaveState('error');setError(e.message)}
      else{
        setAutosaveState('saved')
        setTimeout(()=>setAutosaveState(current=>current==='saved'?'':current),1200)
      }
    },700)
  }

  async function setWorkflowStatus(nextStatus){
    if(!selected)return
    if(decisionSaveTimer.current){clearTimeout(decisionSaveTimer.current);decisionSaveTimer.current=null}
    setBusy(true);setError('');setMessage('')
    try{
      const {error:e}=await supabase.from('contract_prechecks').update({
        status:nextStatus,
        reviewed_by:userId||null,
        decision_note:selected.decision_note||null,
      }).eq('precheck_id',selected.precheck_id)
      if(e)throw e
      setMessage('Status: '+statusLabel(nextStatus))
      await Promise.all([loadOverview(selected.precheck_id),loadMetrics()])
      await loadSelected(selected.precheck_id)
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  const completedCount=findings.filter(isDone).length
  const pendingCount=findings.filter(f=>f.finding_status==='OPEN'&&f.rating==='PENDING').length
  const redCount=findings.filter(f=>f.finding_status==='OPEN'&&f.rating==='RED').length
  const yellowCount=findings.filter(f=>f.finding_status==='OPEN'&&f.rating==='YELLOW').length
  const acceptedRiskCount=findings.filter(f=>f.finding_status==='ACCEPTED_RISK').length
  const progress=findings.length?Math.round(completedCount/findings.length*100):0
  const activeFinding=findings.find(f=>f.finding_id===activeFindingId)||findings[0]||null
  const activeIndex=Math.max(0,findings.findIndex(f=>f.finding_id===activeFinding?.finding_id))
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE))
  const uploadPublished=selected?.upload_status==='ACCEPTED'
  const canApproveGreen=selected?.overall_rating==='GREEN'&&pendingCount===0&&redCount===0&&yellowCount===0&&acceptedRiskCount===0
  const canApproveConditional=redCount===0&&pendingCount===0&&(yellowCount>0||acceptedRiskCount>0)&&['GREEN','YELLOW'].includes(selected?.overall_rating)
  const canSendToSignature=selected?.overall_rating==='GREEN'&&['APPROVED','APPROVED_WITH_CONDITIONS'].includes(selected?.status)
  const canMarkSigned=selected?.status==='READY_FOR_SIGNATURE'
  const canActivate=selected?.status==='SIGNED'&&uploadPublished

  let blockerTone='ok'
  let blockerTitle='Freigabe grundsätzlich möglich'
  let blockerText='Alle Pflichtprüfpunkte sind bewertet.'
  if(redCount>0){
    blockerTone='bad';blockerTitle='Freigabe blockiert';blockerText=redCount+' roter Prüfpunkt'+(redCount===1?'':'e')+' muss zuerst geklärt werden.'
  }else if(pendingCount>0){
    blockerTone='warn';blockerTitle='Prüfung noch nicht vollständig';blockerText=pendingCount+' Prüfpunkt'+(pendingCount===1?' ist':'e sind')+' noch offen.'
  }else if(yellowCount>0||acceptedRiskCount>0){
    blockerTone='warn';blockerTitle='Freigabe nur mit Auflagen';blockerText=(yellowCount+acceptedRiskCount)+' Risiko-/Auflagenpunkt'+((yellowCount+acceptedRiskCount)===1?'':'e')+' ist dokumentiert.'
  }

  function moveFinding(delta){
    if(!findings.length)return
    const next=Math.max(0,Math.min(findings.length-1,activeIndex+delta))
    setActiveFindingId(findings[next].finding_id)
  }
  function jumpNextOpen(){
    if(!findings.length)return
    const after=[...findings.slice(activeIndex+1),...findings.slice(0,activeIndex+1)]
    const next=after.find(f=>f.finding_status==='OPEN'&&f.rating==='PENDING')
      ||after.find(f=>f.finding_status==='OPEN'&&['RED','YELLOW'].includes(f.rating))
    if(next)setActiveFindingId(next.finding_id)
  }

  return <div className="precheck-workspace p1">
    <section className="panel span2 precheck-start">
      <div className="sectionbar">
        <div><h2>Vertrag vor Unterschrift prüfen</h2><p>Upload, Analyse, fachliche Prüfung und Freigabe laufen jetzt in einem geführten Admin-Prozess.</p></div>
        <div className="precheck-start-actions">
          <button className="primary inline-button" onClick={()=>setShowUpload(v=>!v)}><CloudUpload size={17}/>{showUpload?'Upload schließen':'Neuen Vertrag prüfen'}</button>
          <button className="secondary icon-button" onClick={()=>{loadOverview();loadMetrics()}} title="Aktualisieren"><RefreshCw className={busy?'spin':''} size={16}/></button>
        </div>
      </div>
      {error&&<div className="alert error">{error}</div>}
      {message&&<div className="alert success">{message}</div>}
      <div className="metrics precheck-metrics">
        <article className="metric"><span>Offen / in Prüfung</span><strong>{metrics.open}</strong></article>
        <article className="metric"><span>Freigegeben</span><strong>{metrics.approved}</strong></article>
        <article className="metric"><span>Unterschrieben</span><strong>{metrics.signed}</strong></article>
        <article className="metric"><span>Aktiv</span><strong>{metrics.active}</strong></article>
      </div>
      {showUpload&&<div className="precheck-upload-embedded">
        <ContractUpload
          contracts={contracts}
          sites={sites}
          canFach
          precheckMode
          onPrecheckReady={startPrecheck}
          onOpenChanges={onOpenChanges}
        />
      </div>}
      {!showUpload&&legacyUploads.length>0&&<details className="precheck-existing-upload">
        <summary>Bereits vorhandenen, noch nicht veröffentlichten Upload übernehmen</summary>
        <div className="precheck-new-row">
          <label>Vorhandener Upload<select value={legacyUploadId} onChange={e=>setLegacyUploadId(e.target.value)}>
            <option value="">Upload auswählen …</option>
            {legacyUploads.map(u=><option key={u.upload_id} value={u.upload_id}>{u.contract_id} · {u.filename||'ohne Dateiname'} · {statusLabel(u.upload_status)}</option>)}
          </select></label>
          <button className="secondary inline-button" type="button" onClick={()=>startPrecheck()} disabled={!legacyUploadId||busy}><FileCheck2 size={17}/> Vorprüfung anlegen</button>
        </div>
      </details>}
    </section>

    <section className="panel precheck-list-panel">
      <div className="sectionbar">
        <div><h2>Vorprüfungen</h2><p>{total.toLocaleString('de-DE')} Prüffälle · serverseitig geladen</p></div>
        <input className="compact" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Vertrag / Datei …"/>
      </div>
      <div className="precheck-list">
        {prechecks.map(r=><button key={r.precheck_id} type="button" className={'precheck-list-row '+(selectedId===r.precheck_id?'selected':'')} onClick={()=>setSelectedId(r.precheck_id)}>
          <span className={'precheck-dot '+String(r.overall_rating||'PENDING').toLowerCase()}></span>
          <span className="precheck-list-main">
            <b>{r.contract_name||r.contract_id}</b>
            <small>{r.filename||'ohne Upload'} · {r.completed_count}/{r.finding_count} geprüft · {fmtDate(r.updated_at)}</small>
          </span>
          <Badge tone={toneForStatus(r.status)}>{statusLabel(r.status)}</Badge>
        </button>)}
        {!prechecks.length&&!busy&&<div className="empty-panel">Keine Vorprüfungen für diese Suche.</div>}
        {busy&&<div className="precheck-loading"><LoaderCircle className="spin" size={17}/> Prüffälle werden geladen …</div>}
      </div>
      <div className="precheck-pagination">
        <button className="secondary icon-button" disabled={page===0||busy} onClick={()=>setPage(p=>Math.max(0,p-1))}><ChevronLeft size={17}/></button>
        <span>Seite {page+1} von {totalPages}</span>
        <button className="secondary icon-button" disabled={page+1>=totalPages||busy} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button>
      </div>
    </section>

    <section className="panel precheck-detail">
      {!selected?<div className="empty-panel">Links eine Vorprüfung auswählen.</div>:<>
        <div className="sectionbar">
          <div>
            <h2>{selected.contract_name||selected.contract_id}</h2>
            <p>{selected.filename||'Kein Upload verknüpft'} · angelegt {fmtDate(selected.created_at)}</p>
          </div>
          <div className="precheck-head-badges">
            {autosaveState&&<Badge tone={autosaveState==='error'?'bad':'info'}>{autosaveState==='saving'?'Speichert …':autosaveState==='saved'?'Gespeichert':'Speicherfehler'}</Badge>}
            <Badge tone={ratingTone(selected.overall_rating)}>Ampel {RATING_LABELS[selected.overall_rating]||selected.overall_rating}</Badge>
            <Badge tone={toneForStatus(selected.status)}>{statusLabel(selected.status)}</Badge>
          </div>
        </div>

        <div className="precheck-flow">
          {['IN_REVIEW','APPROVED','READY_FOR_SIGNATURE','SIGNED','ACTIVE'].map((s,i)=><React.Fragment key={s}>
            <span className={selected.status===s?'current':(selected.status==='APPROVED_WITH_CONDITIONS'&&s==='APPROVED')?'current':''}>{statusLabel(s)}</span>
            {i<4&&<i>→</i>}
          </React.Fragment>)}
        </div>

        <div className={'precheck-blocker '+blockerTone}>
          <div className="precheck-blocker-icon">{blockerTone==='bad'?<XCircle size={22}/>:blockerTone==='warn'?<AlertTriangle size={22}/>:<CheckCircle2 size={22}/>}</div>
          <div><b>{blockerTitle}</b><p>{blockerText}</p></div>
          <div className="precheck-blocker-kpis"><span><strong>{redCount}</strong> rot</span><span><strong>{yellowCount+acceptedRiskCount}</strong> Auflagen</span><span><strong>{pendingCount}</strong> offen</span></div>
        </div>

        <div className="precheck-progress-card">
          <div className="precheck-progress-head">
            <div><small>Prüffortschritt</small><b>{completedCount} von {findings.length} Prüfpunkten bewertet</b></div>
            <strong>{progress}%</strong>
          </div>
          <div className="precheck-progress-track"><span style={{width:progress+'%'}}></span></div>
        </div>

        <div className="precheck-context">
          <div><small>Uploadstatus</small><strong>{statusLabel(selected.upload_status)}</strong></div>
          <div><small>Publication Hold</small><strong>{selected.publication_hold?'Aktiv – keine Veröffentlichung':'nicht aktiv'}</strong></div>
          <div><small>Upload-Diff</small><strong>{Number(selected.change_count||0)} Änderungen</strong></div>
          <div><small>Produktgruppen</small><strong>{(selected.product_groups||[]).join(', ')||'—'}</strong></div>
        </div>

        {detailBusy?<div className="precheck-loading"><LoaderCircle className="spin" size={17}/> Prüfpunkte werden geladen …</div>:<>
          <div className="precheck-guide-index" aria-label="Prüfpunkte">
            {findings.map((f,i)=><button key={f.finding_id} type="button" onClick={()=>setActiveFindingId(f.finding_id)}
              className={(activeFinding?.finding_id===f.finding_id?'active ':'')+String(f.rating||'PENDING').toLowerCase()+(f.finding_status!=='OPEN'?' resolved':'')}>
              <span>{i+1}</span>
              <b>{CATEGORY_LABELS[f.category]||f.category}</b>
              <small>{f.finding_status==='NOT_APPLICABLE'?'n/a':f.finding_status==='ACCEPTED_RISK'?'Risiko akzeptiert':RATING_LABELS[f.rating]||f.rating}</small>
            </button>)}
          </div>

          {activeFinding&&<article className={'precheck-finding guided '+String(activeFinding.rating||'PENDING').toLowerCase()+(activeFinding.finding_status!=='OPEN'?' resolved':'')}>
            <div className="precheck-finding-head">
              <div className="precheck-finding-title">
                {activeFinding.rating==='GREEN'?<CheckCircle2 size={20}/>:activeFinding.rating==='RED'?<XCircle size={20}/>:activeFinding.rating==='YELLOW'?<AlertTriangle size={20}/>:<Circle size={20}/>}
                <div><small>Prüfpunkt {activeIndex+1} von {findings.length} · {CATEGORY_LABELS[activeFinding.category]||activeFinding.category}</small><b>{activeFinding.title}</b>{activeFinding.auto_generated&&<em>automatisch vorbefüllt</em>}</div>
              </div>
              <div className="rating-control" aria-label={'Bewertung '+activeFinding.title}>
                {['PENDING','GREEN','YELLOW','RED'].map(v=><button key={v} type="button" className={activeFinding.rating===v&&activeFinding.finding_status==='OPEN'?'active '+v.toLowerCase():''} onClick={()=>updateFinding(activeFinding.finding_id,{rating:v,finding_status:'OPEN'})}>{RATING_LABELS[v]}</button>)}
                <button type="button" className={activeFinding.finding_status==='NOT_APPLICABLE'?'active na':''} onClick={()=>updateFinding(activeFinding.finding_id,{finding_status:activeFinding.finding_status==='NOT_APPLICABLE'?'OPEN':'NOT_APPLICABLE'})}>n/a</button>
                {activeFinding.rating==='YELLOW'&&<button type="button" className={activeFinding.finding_status==='ACCEPTED_RISK'?'active risk':''} onClick={()=>updateFinding(activeFinding.finding_id,{finding_status:activeFinding.finding_status==='ACCEPTED_RISK'?'OPEN':'ACCEPTED_RISK'})}>Risiko akzeptieren</button>}
              </div>
            </div>
            <div className="precheck-finding-body guided-body">
              <label>Bewertung / Hinweis<textarea rows="4" value={activeFinding.note||''} onChange={e=>queueFindingAutosave(activeFinding.finding_id,'note',e.target.value)} placeholder="fachliche Bewertung, Risiko oder Auflage …"/></label>
              <label>Quelle / Seite<input value={activeFinding.source_reference||''} onChange={e=>queueFindingAutosave(activeFinding.finding_id,'source_reference',e.target.value)} placeholder="z. B. § 8 / Anlage 2 / Seite 14"/></label>
            </div>
            <div className="precheck-guide-actions">
              <button className="secondary inline-button" type="button" disabled={activeIndex===0} onClick={()=>moveFinding(-1)}><ChevronLeft size={16}/> Zurück</button>
              <button className="secondary inline-button" type="button" onClick={jumpNextOpen}><ListChecks size={16}/> Nächster offener Punkt</button>
              <button className="secondary inline-button" type="button" disabled={activeIndex>=findings.length-1} onClick={()=>moveFinding(1)}>Weiter <ChevronRight size={16}/></button>
            </div>
          </article>}
        </>}

        <section className="precheck-decision-box">
          <div>
            <h3>Freigabeentscheidung</h3>
            <p>Rot blockiert. Ungeprüfte Punkte blockieren. Gelb bzw. akzeptierte Risiken erfordern eine dokumentierte Freigabe mit Auflagen.</p>
          </div>
          <label>Entscheidungsnotiz <span className="field-hint">wird automatisch gespeichert</span><textarea rows="3" value={selected.decision_note||''} onChange={e=>updateDecision(e.target.value)} placeholder="Begründung, Auflagen oder Rückfrage dokumentieren …"/></label>
          <div className="precheck-actions">
            <button className="secondary" type="button" disabled={busy} onClick={()=>setWorkflowStatus('CLARIFICATION')}>Rückfrage / offen</button>
            <button className="danger-button" type="button" disabled={busy} onClick={()=>setWorkflowStatus('REJECTED')}>Ablehnen</button>
            <button className="secondary" type="button" disabled={busy||!canApproveConditional} onClick={()=>setWorkflowStatus('APPROVED_WITH_CONDITIONS')}>Mit Auflagen freigeben</button>
            <button className="primary" type="button" disabled={busy||!canApproveGreen} onClick={()=>setWorkflowStatus('APPROVED')}><ShieldCheck size={16}/> Fachlich freigeben</button>
            <button className="primary" type="button" disabled={busy||!canSendToSignature} onClick={()=>setWorkflowStatus('READY_FOR_SIGNATURE')}>Zur Unterschrift</button>
            <button className="primary" type="button" disabled={busy||!canMarkSigned} onClick={()=>setWorkflowStatus('SIGNED')}>Unterschrift dokumentieren</button>
          </div>
          {selected.status==='SIGNED'&&!uploadPublished&&<div className="review-callout">
            <div><AlertTriangle size={18}/><div><b>Unterschrift dokumentiert – Veröffentlichung noch offen</b><p>Der Upload ist weiterhin gesperrt. Jetzt darf der geprüfte Vertragsstand veröffentlicht werden.</p></div></div>
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
