import React,{useEffect,useMemo,useState} from 'react'
import {
  AlertTriangle,CheckCircle2,Clock3,FileCheck2,FileQuestion,
  FileWarning,RefreshCw,Send,UploadCloud,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const STATUS_LABELS={
  NEW:'Neu',IN_REVIEW:'In Prüfung',CLARIFICATION:'Rückfrage / offen',
  APPROVED:'Fachlich freigegeben',APPROVED_WITH_CONDITIONS:'Mit Auflagen freigegeben',
  READY_FOR_SIGNATURE:'Zur Unterschrift',SIGNED:'Unterschrieben',ACTIVE:'Aktiv',
}
function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function fmt(value){return Number(value||0).toLocaleString('de-DE')}
function date(value){return value?new Date(value).toLocaleDateString('de-DE'):'—'}

export default function AdminDashboard({onNavigate}){
  const [summary,setSummary]=useState(null)
  const [prechecks,setPrechecks]=useState([])
  const [uploads,setUploads]=useState([])
  const [questions,setQuestions]=useState([])
  const [sourceGaps,setSourceGaps]=useState(null)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')

  async function load(){
    setBusy(true);setError('')
    try{
      const [sr,pr,ur,qr]=await Promise.all([
        supabase.rpc('vn_admin_dashboard_summary'),
        supabase.from('vn_admin_contract_precheck_overview')
          .select('precheck_id,contract_id,contract_name,filename,status,overall_rating,pending_count,red_count,yellow_count,updated_at')
          .in('status',['NEW','IN_REVIEW','CLARIFICATION','APPROVED','APPROVED_WITH_CONDITIONS','READY_FOR_SIGNATURE','SIGNED'])
          .order('updated_at',{ascending:false})
          .limit(8),
        supabase.from('contract_uploads')
          .select('upload_id,contract_id,filename,upload_status,change_count,review_count,received_at')
          .eq('upload_status','REVIEW')
          .order('received_at',{ascending:false})
          .limit(6),
        supabase.from('vn_contract_questions')
          .select('question_id,question_text,payer,pg,status,created_at')
          .not('status','in','(CLOSED,RESOLVED,ANSWERED)')
          .order('created_at',{ascending:false})
          .limit(6),
      ])
      const first=[sr,pr,ur,qr].find(r=>r.error)?.error
      if(first)throw first
      setSummary(Array.isArray(sr.data)?sr.data[0]:(sr.data||null))
      setPrechecks(pr.data||[])
      setUploads(ur.data||[])
      setQuestions(qr.data||[])

      // Quellenlücken sind bewusst separat/lazy: die bestehende Prüfung ist aufwendiger.
      supabase.rpc('vn_admin_missing_contract_sources').then(({data,error:e})=>{
        if(!e)setSourceGaps((data||[]).length)
      })
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  useEffect(()=>{load()},[])

  const attention=useMemo(()=>[
    {key:'blocked',label:'Blockierte Vorprüfungen',value:summary?.blocked_prechecks||0,tone:'bad',icon:AlertTriangle,go:'precheck'},
    {key:'clarification',label:'Rückfragen offen',value:summary?.clarification_prechecks||0,tone:'warn',icon:FileQuestion,go:'precheck'},
    {key:'signature',label:'Zur Unterschrift',value:summary?.ready_for_signature||0,tone:'info',icon:Send,go:'precheck'},
    {key:'signed',label:'Unterschrieben, nicht veröffentlicht',value:summary?.signed_unpublished||0,tone:'warn',icon:Clock3,go:'changes'},
  ],[summary])

  return <div className="admin-dashboard">
    <section className="panel admin-dashboard-hero">
      <div className="sectionbar">
        <div><h2>Arbeitsvorrat Vertragsmanagement</h2><p>Was jetzt Aufmerksamkeit benötigt – ohne die einzelnen Fachbereiche durchsuchen zu müssen.</p></div>
        <button className="secondary icon-button" type="button" onClick={load} disabled={busy} title="Aktualisieren"><RefreshCw className={busy?'spin':''} size={17}/></button>
      </div>
      {error&&<div className="alert error">{error}</div>}
      <div className="admin-focus-grid">
        {attention.map(item=>{
          const Icon=item.icon
          return <button key={item.key} className={'admin-focus-card '+item.tone} type="button" onClick={()=>onNavigate?.(item.go)}>
            <span className="admin-focus-icon"><Icon size={19}/></span>
            <strong>{fmt(item.value)}</strong>
            <span>{item.label}</span>
          </button>
        })}
      </div>
    </section>

    <section className="metrics admin-overview-metrics">
      <article className="metric clickable" onClick={()=>onNavigate?.('precheck')}><span>Vorprüfungen offen</span><strong>{fmt(summary?.open_prechecks)}</strong></article>
      <article className="metric clickable" onClick={()=>onNavigate?.('changes')}><span>Uploads in Prüfung</span><strong>{fmt(summary?.uploads_in_review)}</strong></article>
      <article className="metric clickable" onClick={()=>onNavigate?.('questions')}><span>Vertragsfragen offen</span><strong>{fmt(summary?.open_questions)}</strong></article>
      <article className="metric clickable" onClick={()=>onNavigate?.('contracts')}><span>Aktive Verträge</span><strong>{fmt(summary?.active_contracts)}</strong></article>
      <article className="metric clickable" onClick={()=>onNavigate?.('missingSources')}><span>Quellenlücken</span><strong>{sourceGaps==null?'…':fmt(sourceGaps)}</strong></article>
    </section>

    <div className="grid admin-work-grid">
      <section className="panel span2">
        <div className="sectionbar">
          <div><h2>Nächste Vertragsentscheidungen</h2><p>Aktuelle Vorprüfungen nach letzter Bearbeitung.</p></div>
          <button className="secondary inline-button" type="button" onClick={()=>onNavigate?.('precheck')}><FileCheck2 size={15}/> Alle Vorprüfungen</button>
        </div>
        <div className="admin-work-list">
          {prechecks.map(r=>{
            const blocked=Number(r.red_count||0)>0||Number(r.pending_count||0)>0
            return <button className="admin-work-row" type="button" key={r.precheck_id} onClick={()=>onNavigate?.('precheck')}>
              <span className={'admin-work-state '+(blocked?'bad':Number(r.yellow_count||0)>0?'warn':'ok')}>
                {blocked?<AlertTriangle size={16}/>:<CheckCircle2 size={16}/>}
              </span>
              <span className="admin-work-main"><b>{r.contract_name||r.contract_id}</b><small>{r.filename||'ohne Dateiname'} · {date(r.updated_at)}</small></span>
              <span className="admin-work-meta"><Badge tone={blocked?'bad':Number(r.yellow_count||0)>0?'warn':'info'}>{STATUS_LABELS[r.status]||r.status}</Badge><small>{Number(r.red_count||0)} rot · {Number(r.pending_count||0)} offen</small></span>
            </button>
          })}
          {!busy&&!prechecks.length&&<div className="empty-panel">Keine offenen Vertragsentscheidungen.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="sectionbar"><div><h2>Uploads</h2><p>Änderungssätze mit fachlicher Prüfung.</p></div><Badge tone={uploads.length?'warn':'ok'}>{uploads.length}</Badge></div>
        <div className="admin-mini-list">
          {uploads.map(r=><button type="button" key={r.upload_id} onClick={()=>onNavigate?.('changes')}>
            <UploadCloud size={16}/><span><b>{r.filename||r.contract_id}</b><small>{Number(r.change_count||0)} Änderungen · {date(r.received_at)}</small></span>
          </button>)}
          {!busy&&!uploads.length&&<div className="empty-panel">Keine Uploads in Prüfung.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="sectionbar"><div><h2>Vertragsfragen</h2><p>Offene fachliche Rückfragen.</p></div><Badge tone={questions.length?'warn':'ok'}>{questions.length}</Badge></div>
        <div className="admin-mini-list">
          {questions.map(r=><button type="button" key={r.question_id} onClick={()=>onNavigate?.('questions')}>
            <FileQuestion size={16}/><span><b>{r.question_text}</b><small>{[r.payer,r.pg&&'PG '+r.pg,date(r.created_at)].filter(Boolean).join(' · ')}</small></span>
          </button>)}
          {!busy&&!questions.length&&<div className="empty-panel">Keine offenen Vertragsfragen.</div>}
        </div>
      </section>

      <section className="panel admin-gap-card">
        <div><FileWarning size={20}/><span><small>Datenpflege</small><b>{sourceGaps==null?'Quellenlücken werden geprüft …':fmt(sourceGaps)+' Verträge mit Quellenlücke'}</b></span></div>
        <button className="secondary inline-button" type="button" onClick={()=>onNavigate?.('missingSources')}>Quellenpflege öffnen</button>
      </section>
    </div>
  </div>
}
