import React,{useEffect,useMemo,useState} from 'react'
import {
  AlertTriangle,ArrowRight,CircleHelp,Clock3,FileCheck2,
  FileSignature,RefreshCw,ShieldAlert,UploadCloud,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const PRIORITY_ORDER={HIGH:0,MEDIUM:1,LOW:2}
const TYPE_LABELS={
  PRECHECK:'Vertragsvorprüfung',
  SIGNATURE:'Unterschrift',
  PUBLISH:'Veröffentlichung',
  UPLOAD_REVIEW:'Änderungsprüfung',
  REVIEW_QUEUE:'Prüfqueue',
  QUESTION:'Vertragsfrage',
}
const TYPE_ICONS={
  PRECHECK:FileCheck2,
  SIGNATURE:FileSignature,
  PUBLISH:UploadCloud,
  UPLOAD_REVIEW:UploadCloud,
  REVIEW_QUEUE:ShieldAlert,
  QUESTION:CircleHelp,
}

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function tone(priority){return priority==='HIGH'?'bad':priority==='MEDIUM'?'warn':'info'}
function fmt(value){return Number(value||0).toLocaleString('de-DE')}

export default function AdminDashboard({onNavigate}){
  const [metrics,setMetrics]=useState(null)
  const [actions,setActions]=useState([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  async function load(){
    setBusy(true);setError('')
    try{
      const [mr,ar]=await Promise.all([
        supabase.from('vn_admin_dashboard_p2').select('*').single(),
        supabase.from('vn_admin_action_queue_p2')
          .select('*')
          .order('sort_at',{ascending:false})
          .limit(100),
      ])
      if(mr.error)throw mr.error
      if(ar.error)throw ar.error
      setMetrics(mr.data||null)
      setActions(ar.data||[])
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  useEffect(()=>{load()},[])

  const sorted=useMemo(()=>[...actions].sort((a,b)=>{
    const p=(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)
    if(p)return p
    return new Date(b.sort_at||0)-new Date(a.sort_at||0)
  }),[actions])

  const urgent=sorted.filter(a=>a.priority==='HIGH')
  const next=sorted.filter(a=>a.priority!=='HIGH')
  const actionableCount=sorted.length

  const kpis=[
    ['Offene Vorprüfungen',metrics?.prechecks_open||0,'precheck'],
    ['Rote Blocker',metrics?.prechecks_red||0,'precheck'],
    ['Zur Unterschrift',metrics?.awaiting_signature||0,'precheck'],
    ['Unterschrieben / offen',metrics?.signed_unpublished||0,'changes'],
    ['Änderungen prüfen',metrics?.uploads_review||0,'changes'],
    ['Hohe Prüfqueue',metrics?.review_queue_high||0,'data'],
    ['Vertragsfragen offen',metrics?.questions_open||0,'questions'],
    ['Aktive Verträge',metrics?.contracts_active||0,'contracts'],
  ]

  return <div className="admin-dashboard">
    {error&&<div className="alert error">{error}</div>}

    <section className="panel admin-command">
      <div className="sectionbar">
        <div>
          <h2>Arbeitsvorrat Vertragsmanagement</h2>
          <p>Nur Vorgänge, bei denen eine Entscheidung, Prüfung oder Veröffentlichung erforderlich ist.</p>
        </div>
        <div className="admin-command-actions">
          <Badge tone={urgent.length?'bad':'ok'}>{urgent.length} dringend</Badge>
          <Badge tone={actionableCount?'warn':'ok'}>{actionableCount} Aufgaben</Badge>
          <button className="secondary icon-button" type="button" onClick={load} disabled={busy} title="Aktualisieren">
            <RefreshCw className={busy?'spin':''} size={17}/>
          </button>
        </div>
      </div>

      <div className="admin-kpi-grid">
        {kpis.map(([label,value,route])=><button key={label} type="button" className="admin-kpi" onClick={()=>onNavigate?.(route)}>
          <small>{label}</small>
          <strong>{fmt(value)}</strong>
          <span>öffnen <ArrowRight size={13}/></span>
        </button>)}
      </div>
    </section>

    <div className="admin-dashboard-grid">
      <section className="panel">
        <div className="sectionbar">
          <div><h2>Dringend</h2><p>Blocker und Vorgänge mit unmittelbarem Handlungsbedarf.</p></div>
          <Badge tone={urgent.length?'bad':'ok'}>{urgent.length}</Badge>
        </div>
        <div className="admin-action-list">
          {urgent.slice(0,12).map(item=><ActionRow key={item.item_type+'-'+item.entity_id} item={item} onNavigate={onNavigate}/>)}
          {!urgent.length&&!busy&&<div className="admin-all-clear"><ShieldAlert size={22}/><div><b>Keine dringenden Blocker</b><span>Aktuell liegt kein hoch priorisierter Vertragsvorgang vor.</span></div></div>}
        </div>
      </section>

      <section className="panel">
        <div className="sectionbar">
          <div><h2>Als Nächstes</h2><p>Weitere offene Aufgaben nach Priorität und Aktualität.</p></div>
          <Badge>{next.length}</Badge>
        </div>
        <div className="admin-action-list">
          {next.slice(0,16).map(item=><ActionRow key={item.item_type+'-'+item.entity_id} item={item} onNavigate={onNavigate}/>)}
          {!next.length&&!busy&&<div className="empty-panel">Keine weiteren Aufgaben vorhanden.</div>}
        </div>
      </section>
    </div>

    <section className="panel admin-system-state">
      <div className="sectionbar">
        <div><h2>Systemstatus</h2><p>Kompakter Zustand des Vertragsbestands.</p></div>
        <Badge tone="info">P2 Read Model</Badge>
      </div>
      <div className="admin-state-row">
        <span><b>{fmt(metrics?.contracts_active)}</b> aktive Verträge</span>
        <span><b>{fmt(metrics?.review_queue_open)}</b> offene Prüffälle</span>
        <span><b>{fmt(metrics?.questions_open)}</b> offene Vertragsfragen</span>
        <span><Clock3 size={15}/> Stand {metrics?.generated_at?new Date(metrics.generated_at).toLocaleString('de-DE'):'—'}</span>
      </div>
    </section>
  </div>
}

function ActionRow({item,onNavigate}){
  const Icon=TYPE_ICONS[item.item_type]||AlertTriangle
  return <button type="button" className="admin-action-row" onClick={()=>onNavigate?.(item.route,item.entity_id)}>
    <span className={'admin-action-icon '+String(item.priority||'LOW').toLowerCase()}><Icon size={17}/></span>
    <span className="admin-action-copy">
      <small>{TYPE_LABELS[item.item_type]||item.item_type}</small>
      <b>{item.title}</b>
      <span>{item.subtitle||item.status||'Bearbeitung erforderlich'}</span>
    </span>
    <span className="admin-action-meta">
      <Badge tone={tone(item.priority)}>{item.priority||'LOW'}</Badge>
      <ArrowRight size={16}/>
    </span>
  </button>
}
