import React,{useEffect,useMemo,useState} from 'react'
import {
  AlertTriangle,ArrowRight,CheckCircle2,CircleHelp,Clock3,Database,
  FileCheck2,FileSignature,HardDrive,KeyRound,RefreshCw,Server,
  ShieldAlert,ShieldCheck,TimerReset,UploadCloud,Users,XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const PRIORITY_ORDER={HIGH:0,MEDIUM:1,LOW:2}
const QUALITY_ORDER={RED:0,YELLOW:1,GREEN:2}
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
const AUTH_LABELS={
  SUCCESS:'Anmeldung erfolgreich',
  INVALID_INPUT:'Ungültige Eingabe',
  INVALID_CREDENTIALS:'Anmeldung abgewiesen',
  ACCESS_DISABLED:'Zugang nicht freigeschaltet',
  RATE_LIMITED:'Rate-Limit aktiv',
  TECHNICAL_ERROR:'Technischer Loginfehler',
}

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function tone(priority){return priority==='HIGH'?'bad':priority==='MEDIUM'?'warn':'info'}
function ratingTone(value){return value==='GREEN'?'ok':value==='YELLOW'?'warn':value==='RED'?'bad':'info'}
function fmt(value){return Number(value||0).toLocaleString('de-DE')}
function fmtDateTime(value){return value?new Date(value).toLocaleString('de-DE'):'—'}
function fmtPercent(value){return Number(value||0).toLocaleString('de-DE',{minimumFractionDigits:0,maximumFractionDigits:2})+' %'}

export default function AdminDashboard({onNavigate}){
  const [metrics,setMetrics]=useState(null)
  const [actions,setActions]=useState([])
  const [ops,setOps]=useState(null)
  const [quality,setQuality]=useState([])
  const [authEvents,setAuthEvents]=useState([])
  const [runtimeEvents,setRuntimeEvents]=useState([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  async function load(){
    setBusy(true);setError('')
    try{
      const [mr,ar,or,qr,aer,rer]=await Promise.all([
        supabase.from('vn_admin_dashboard_p2').select('*').single(),
        supabase.from('vn_admin_action_queue_p2')
          .select('*')
          .order('sort_at',{ascending:false})
          .limit(100),
        supabase.from('vn_admin_ops_status_p4').select('*').single(),
        supabase.from('vn_admin_data_quality_p4').select('*'),
        supabase.from('vn_admin_auth_events_p4')
          .select('*')
          .order('occurred_at',{ascending:false})
          .limit(12),
        supabase.from('vn_admin_runtime_events_p4')
          .select('*')
          .order('occurred_at',{ascending:false})
          .limit(12),
      ])
      const first=[mr,ar,or,qr,aer,rer].find(r=>r.error)?.error
      if(first)throw first
      setMetrics(mr.data||null)
      setActions(ar.data||[])
      setOps(or.data||null)
      setQuality(qr.data||[])
      setAuthEvents(aer.data||[])
      setRuntimeEvents(rer.data||[])
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  useEffect(()=>{load()},[])

  const sorted=useMemo(()=>[...actions].sort((a,b)=>{
    const p=(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)
    if(p)return p
    return new Date(b.sort_at||0)-new Date(a.sort_at||0)
  }),[actions])

  const sortedQuality=useMemo(()=>[...quality].sort((a,b)=>{
    const r=(QUALITY_ORDER[a.rating]??9)-(QUALITY_ORDER[b.rating]??9)
    if(r)return r
    return Number(b.issue_percent||0)-Number(a.issue_percent||0)
  }),[quality])

  const urgent=sorted.filter(a=>a.priority==='HIGH')
  const next=sorted.filter(a=>a.priority!=='HIGH')
  const actionableCount=sorted.length
  const qualityRed=sortedQuality.filter(q=>q.rating==='RED').length
  const qualityYellow=sortedQuality.filter(q=>q.rating==='YELLOW').length
  const runtimeBad=Number(ops?.runtime_errors_24h||0)>0
  const runtimeWarn=Number(ops?.runtime_timeouts_24h||0)>0||Number(ops?.runtime_warnings_24h||0)>0
  const uploadBad=Number(ops?.upload_errors_7d||0)>0
  const uploadWarn=Number(ops?.uploads_stale_processing||0)>0||Number(ops?.uploads_stale_review||0)>0
  const authBad=Number(ops?.auth_technical_24h||0)>0

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

    <section className="panel admin-ops-panel">
      <div className="sectionbar">
        <div><h2>Betrieb & Überwachung</h2><p>Technischer Zustand der Anwendung in den letzten 24 Stunden.</p></div>
        <div className="admin-command-actions">
          <Badge tone={runtimeBad||uploadBad||authBad?'bad':runtimeWarn||uploadWarn?'warn':'ok'}>
            {runtimeBad||uploadBad||authBad?'Handlungsbedarf':runtimeWarn||uploadWarn?'Beobachten':'Betrieb stabil'}
          </Badge>
          <Badge tone="info">P4</Badge>
        </div>
      </div>

      <div className="ops-health-grid">
        <HealthCard icon={Database} title="Datenbank" tone="ok"
          value={ops?.database_size||'—'}
          meta={'Online seit '+fmtDateTime(ops?.database_started_at)}/>
        <HealthCard icon={KeyRound} title="Authentifizierung" tone={authBad?'bad':'ok'}
          value={fmt(ops?.auth_success_24h)+' erfolgreich'}
          meta={fmt(ops?.auth_failures_24h)+' abgewiesen · '+fmt(ops?.auth_technical_24h)+' technisch'}/>
        <HealthCard icon={Server} title="Runtime 24h" tone={runtimeBad?'bad':runtimeWarn?'warn':'ok'}
          value={fmt(ops?.runtime_errors_24h)+' Fehler'}
          meta={fmt(ops?.runtime_warnings_24h)+' Warnungen · '+fmt(ops?.runtime_timeouts_24h)+' Timeouts/langsam'}/>
        <HealthCard icon={UploadCloud} title="Upload-Pipeline" tone={uploadBad?'bad':uploadWarn?'warn':'ok'}
          value={fmt(ops?.upload_errors_7d)+' Fehler / 7 Tage'}
          meta={fmt(ops?.uploads_stale_processing)+' Verarbeitung >2h · '+fmt(ops?.uploads_stale_review)+' Review >7d'}/>
        <HealthCard icon={Users} title="Zugriffsschutz" tone={ops?.active_user_gate_enabled?'ok':'bad'}
          value={fmt(ops?.active_users)+' aktive Nutzer'}
          meta={fmt(ops?.inactive_users)+' deaktiviert · Active-User-Gate '+(ops?.active_user_gate_enabled?'aktiv':'nicht aktiv')}/>
        <HealthCard icon={HardDrive} title="Backup / Recovery" tone="info"
          value="Plattformverwaltet"
          meta="Letzter Backup-Zeitpunkt und PITR sind aus der App nicht verifizierbar."/>
      </div>

      <div className="ops-meta-row">
        <span><b>{fmt(ops?.active_contracts)}</b> aktive Verträge</span>
        <span><b>{fmt(ops?.active_positions)}</b> aktive Positionen</span>
        <span><b>{fmt(ops?.review_queue_high)}</b> hohe Prüffälle</span>
        <span><b>{fmt(ops?.knowledge_revalidation_required)}</b> Wissen revalidieren</span>
        <span><Clock3 size={14}/> Stand {fmtDateTime(ops?.generated_at)}</span>
      </div>
    </section>

    <section className="panel admin-quality-panel">
      <div className="sectionbar">
        <div><h2>Datenqualität</h2><p>Ampel aus messbaren Lücken im aktiven Vertrags- und Positionsbestand.</p></div>
        <div className="admin-command-actions">
          <Badge tone={qualityRed?'bad':'ok'}>{qualityRed} rot</Badge>
          <Badge tone={qualityYellow?'warn':'ok'}>{qualityYellow} gelb</Badge>
        </div>
      </div>
      <div className="quality-list">
        {sortedQuality.map(item=><button key={item.metric_key} type="button" className={'quality-row '+String(item.rating||'GREEN').toLowerCase()} onClick={()=>onNavigate?.(item.route)}>
          <span className="quality-state">
            {item.rating==='RED'?<XCircle size={19}/>:item.rating==='YELLOW'?<AlertTriangle size={19}/>:<CheckCircle2 size={19}/>}
          </span>
          <span className="quality-copy">
            <b>{item.label}</b>
            <small>{item.description}</small>
          </span>
          <span className="quality-numbers">
            <strong>{fmt(item.issue_count)}</strong>
            <small>von {fmt(item.total_count)} · {fmtPercent(item.issue_percent)}</small>
          </span>
          <Badge tone={ratingTone(item.rating)}>{item.rating==='GREEN'?'Grün':item.rating==='YELLOW'?'Gelb':'Rot'}</Badge>
          <ArrowRight size={15}/>
        </button>)}
      </div>
    </section>

    <div className="admin-dashboard-grid">
      <details className="panel ops-detail">
        <summary>
          <span><KeyRound size={17}/><b>Login-Audit</b></span>
          <Badge tone={Number(ops?.auth_technical_24h||0)?'bad':'info'}>{authEvents.length} letzte</Badge>
        </summary>
        <p className="ops-detail-note">Keine Passwörter, IP-Adressen oder Klartext-Benutzernamen werden protokolliert.</p>
        <div className="ops-event-list">
          {authEvents.map(e=><div className="ops-event-row" key={e.event_id}>
            <span className={'ops-event-dot '+authTone(e.outcome)}></span>
            <span><b>{AUTH_LABELS[e.outcome]||e.outcome}</b><small>{e.actor_label}{e.login_ref?' · Ref. '+e.login_ref:''}</small></span>
            <span><small>{e.code||'—'}</small><b>{fmtDateTime(e.occurred_at)}</b></span>
          </div>)}
          {!authEvents.length&&<div className="empty-panel">Seit Aktivierung des P4-Audits noch keine Login-Ereignisse.</div>}
        </div>
      </details>

      <details className="panel ops-detail">
        <summary>
          <span><TimerReset size={17}/><b>Runtime-Ereignisse</b></span>
          <Badge tone={runtimeBad?'bad':'info'}>{runtimeEvents.length} letzte</Badge>
        </summary>
        <p className="ops-detail-note">Gespeichert werden nur Bereich, Fehlercode, Schweregrad und Laufzeit – keine Vertragsinhalte oder Suchbegriffe.</p>
        <div className="ops-event-list">
          {runtimeEvents.map(e=><div className="ops-event-row" key={e.event_id}>
            <span className={'ops-event-dot '+String(e.severity||'INFO').toLowerCase()}></span>
            <span><b>{e.area}</b><small>{e.code}{e.route?' · '+e.route:''}</small></span>
            <span><small>{e.duration_ms!=null?fmt(e.duration_ms)+' ms':'—'}</small><b>{fmtDateTime(e.occurred_at)}</b></span>
          </div>)}
          {!runtimeEvents.length&&<div className="empty-panel">Keine Runtime-Ereignisse seit Aktivierung der P4-Telemetrie.</div>}
        </div>
      </details>
    </div>

    <section className="panel admin-system-state">
      <div className="sectionbar">
        <div><h2>Systemstatus</h2><p>Kompakter Zustand des Vertragsbestands.</p></div>
        <Badge tone="info">P4 Monitoring</Badge>
      </div>
      <div className="admin-state-row">
        <span><b>{fmt(metrics?.contracts_active)}</b> aktive Verträge</span>
        <span><b>{fmt(metrics?.review_queue_open)}</b> offene Prüffälle</span>
        <span><b>{fmt(metrics?.questions_open)}</b> offene Vertragsfragen</span>
        <span><ShieldCheck size={15}/> Active-User-Gate aktiv</span>
        <span><Clock3 size={15}/> Stand {metrics?.generated_at?new Date(metrics.generated_at).toLocaleString('de-DE'):'—'}</span>
      </div>
    </section>
  </div>
}

function HealthCard({icon:Icon,title,tone='info',value,meta}){
  return <article className={'ops-health-card '+tone}>
    <span className="ops-health-icon"><Icon size={19}/></span>
    <span><small>{title}</small><strong>{value}</strong><em>{meta}</em></span>
  </article>
}

function authTone(outcome){
  if(outcome==='SUCCESS')return 'ok'
  if(outcome==='TECHNICAL_ERROR'||outcome==='ACCESS_DISABLED')return 'error'
  return 'warn'
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
