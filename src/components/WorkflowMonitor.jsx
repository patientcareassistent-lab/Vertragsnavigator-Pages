import React,{useEffect,useMemo,useState} from 'react'
import {AlertTriangle,CheckCircle2,Clock3,ExternalLink,RefreshCw,Save,ShieldCheck} from 'lucide-react'
import {supabase} from '../lib/supabase.js'
import './WorkflowMonitor.css'

const PRIORITY={P0:0,P1:1,P2:2,P3:3}
const STATUS={OFFEN:'Offen',IN_ARBEIT:'In Arbeit',BLOCKIERT:'Blockiert',TESTEN:'Testen',ERLEDIGT:'Erledigt',ZURUECKGESTELLT:'Zurückgestellt'}
const EXEC={SUCCESS:'Erfolgreich',FAILURE:'Fehlgeschlagen',CANCELLED:'Abgebrochen',IN_PROGRESS:'Läuft',QUEUED:'In Warteschlange',REVIEW:'Prüfung offen',OPEN:'Nicht abgeschlossen',UNKNOWN:'Nicht erfasst'}
const RESTART={CONTINUE:'Ab letztem Schritt fortsetzen',RETEST_AFTER_FIX:'Nach Korrektur erneut prüfen',VERIFY_FIRST:'Vor Neustart prüfen',NO_RESTART:'Kein Neustart',MONITOR:'Nur überwachen'}
const isOpen=item=>!['ERLEDIGT','ZURUECKGESTELLT'].includes(item.business_status)
const date=value=>value?new Date(value).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'Nicht erfasst'
const safeUrl=value=>/^https:\/\/[^\s]+$/i.test(String(value||''))?value:null
const toBacklog=row=>({
  workflow_key:'backlog-'+row.id,
  reference_code:row.reference_code||'VM-'+row.id,
  project_name:'Vertragsnavigator',
  source_kind:'BACKLOG',
  title:row.title,
  priority:row.priority||'P2',
  business_status:row.status,
  execution_status:'UNKNOWN',
  restart_advice:row.status==='ERLEDIGT'?'MONITOR':row.kind==='TEST'||row.kind==='FEHLER'?'VERIFY_FIRST':'CONTINUE',
  owner_name:row.owner_name||'',
  error_cause:row.kind==='FEHLER'?row.description:'',
  next_action:row.acceptance_criteria||row.description||'Fachprüfung laut Backlog',
  evidence_note:row.resolution_note||'',
  last_checked_at:row.updated_at,
  last_run_at:null,
  last_run_url:null,
  backlog_id:row.id,
  source_reference:row.source_reference||'',
})
const draftFrom=item=>({
  priority:item.priority,
  business_status:item.business_status,
  restart_advice:item.restart_advice,
  owner_name:item.owner_name||'',
  next_action:item.next_action||'',
  evidence_note:item.evidence_note||'',
  evidence_url:item.evidence_url||'',
  evidence_checked_at:Boolean(item.evidence_checked_at),
})
export default function WorkflowMonitor({onNavigate}){
  const [items,setItems]=useState([])
  const [busy,setBusy]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [statusFilter,setStatusFilter]=useState('OPEN')
  const [projectFilter,setProjectFilter]=useState('ALLE')
  const [term,setTerm]=useState('')
  const [selectedKey,setSelectedKey]=useState('')
  const [draft,setDraft]=useState(null)
  const [history,setHistory]=useState([])
  const [historyError,setHistoryError]=useState('')

  async function reload(){
    setBusy(true);setError('')
    try{
      const [a,b]=await Promise.all([
        supabase.from('vn_development_backlog').select('id,reference_code,kind,priority,title,description,acceptance_criteria,status,owner_name,source_reference,resolution_note,updated_at').limit(500),
        supabase.from('vn_workflow_monitor_external').select('*').limit(250),
      ])
      if(a.error)throw a.error
      if(b.error)throw b.error
      setItems([...(a.data||[]).map(toBacklog),...(b.data||[])])
    }catch(e){setError('Workflow-Monitor konnte nicht geladen werden: '+(e.message||String(e)))}
    finally{setBusy(false)}
  }
  useEffect(()=>{reload()},[])
  const selected=items.find(r=>r.workflow_key===selectedKey)
  useEffect(()=>{
    setDraft(selected?draftFrom(selected):null)
    setHistory([])
    setHistoryError('')
    if(!selected||selected.source_kind==='BACKLOG')return
    let alive=true
    supabase.from('vn_workflow_monitor_audit').select('event_id,event_at,actor_id,previous_state,current_state')
      .eq('workflow_key',selected.workflow_key).order('event_at',{ascending:false}).limit(8)
      .then(({data,error:err})=>{if(alive){setHistory(data||[]);if(err)setHistoryError('Änderungsverlauf nicht abrufbar.')}})
    return()=>{alive=false}
  },[selectedKey])
  const projects=useMemo(()=>[...new Set(items.map(r=>r.project_name))].sort(),[items])
  const visible=useMemo(()=>items.filter(row=>{
    if(statusFilter==='OPEN'&&!isOpen(row))return false
    if(statusFilter==='DONE'&&isOpen(row))return false
    if(projectFilter!=='ALLE'&&row.project_name!==projectFilter)return false
    const q=term.trim().toLocaleLowerCase('de-DE')
    return !q||[row.title,row.project_name,row.reference_code,row.error_cause,row.next_action,row.owner_name].join(' ').toLocaleLowerCase('de-DE').includes(q)
  }).sort((a,b)=>{
    const ar=isOpen(a)?0:1,br=isOpen(b)?0:1
    return ar-br||(PRIORITY[a.priority]??9)-(PRIORITY[b.priority]??9)||new Date(b.last_run_at||b.last_checked_at||0)-new Date(a.last_run_at||a.last_checked_at||0)
  }),[items,statusFilter,projectFilter,term])
  const open=items.filter(isOpen)
  const blocked=open.filter(x=>x.business_status==='BLOCKIERT').length
  const failed=open.filter(x=>x.execution_status==='FAILURE').length
  const unowned=open.filter(x=>!x.owner_name).length
  const checked=items.filter(x=>x.source_kind==='GITHUB_ACTION'&&x.last_checked_at).map(x=>x.last_checked_at).sort()
  async function save(){
    if(!selected||selected.source_kind==='BACKLOG'||!draft)return
    if(draft.evidence_checked_at&&!draft.evidence_note.trim()){setError('Für einen bestätigten Prüfnachweis ist eine Begründung erforderlich.');return}
    if(draft.evidence_url&&!safeUrl(draft.evidence_url)){setError('Nachweis-URL muss eine vollständige HTTPS-Adresse sein.');return}
    setSaving(true);setError('');setNotice('')
    const patch={
      priority:draft.priority,
      business_status:draft.business_status,
      restart_advice:draft.restart_advice,
      owner_name:draft.owner_name.trim(),
      next_action:draft.next_action.trim(),
      evidence_note:draft.evidence_note.trim(),
      evidence_url:draft.evidence_url.trim()||null,
      evidence_checked_at:draft.evidence_checked_at?(selected.evidence_checked_at||new Date().toISOString()):null,
    }
    const {error:err}=await supabase.from('vn_workflow_monitor_external').update(patch).eq('workflow_key',selected.workflow_key)
    if(err)setError('Status konnte nicht gespeichert werden: '+(err.message||String(err)))
    else{setNotice('Workflow aktualisiert; Änderung revisionssicher protokolliert.');await reload();setSelectedKey('')}
    setSaving(false)
  }
  return <section className="panel workflow-monitor" id="workflow-monitor" aria-label="Workflow-Monitor">
    <div className="sectionbar">
      <div><h2>Workflow-Monitor</h2><p>Offene Fachprüfungen aus dem bestehenden Backlog und dokumentierte technische Ausführungen. Kein automatischer Neustart.</p></div>
      <button className="secondary" onClick={reload} disabled={busy} type="button"><RefreshCw size={16} className={busy?'spin':''}/> Aktualisieren</button>
    </div>
    <div className="workflow-metrics">
      <div><strong>{open.length}</strong><span>Offen / in Arbeit</span></div>
      <div><strong>{blocked}</strong><span>Blockiert</span></div>
      <div><strong>{failed}</strong><span>Fehlgeschlagene aktuelle Läufe</span></div>
      <div><strong>{unowned}</strong><span>Noch ohne Verantwortliche</span></div>
    </div>
    <p className="workflow-sync">GitHub-Status zuletzt abgefragt: {date(checked.at(-1))}. Fachvorgänge werden beim Öffnen aus dem Live-Backlog geladen. Ein erfolgreicher Build ist keine fachliche Freigabe.</p>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {notice&&<p role="status">{notice}</p>}
    <div className="workflow-filters">
      <label>Ansicht <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="OPEN">Offene Vorgänge</option><option value="DONE">Abgeschlossene / zurückgestellte</option><option value="ALL">Alle</option></select></label>
      <label>Projekt <select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="ALLE">Alle Projekte</option>{projects.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
      <label>Suche <input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Workflow, Fehlerursache, ID …"/></label>
    </div>
    <div className="workflow-table-scroll">
      <table className="workflow-table">
        <thead><tr><th>Prio</th><th>Workflow / Projekt</th><th>Status</th><th>Letzte Ausführung</th><th>Fehlerursache</th><th>Neustartentscheidung</th><th>Verantwortlich</th><th>Prüfnachweis</th><th></th></tr></thead>
        <tbody>{visible.map(item=><tr key={item.workflow_key}>
          <td><span className={'workflow-priority '+String(item.priority).toLowerCase()}>{item.priority}</span></td>
          <td><strong>{item.title}</strong><small>{item.project_name}{item.reference_code?' · '+item.reference_code:''}</small></td>
          <td><span className={'workflow-state '+(isOpen(item)?'open':'done')}>{STATUS[item.business_status]||item.business_status}</span><small>{EXEC[item.execution_status]||item.execution_status}</small></td>
          <td>{date(item.last_run_at)}{safeUrl(item.last_run_url)&&<a href={item.last_run_url} target="_blank" rel="noopener noreferrer" aria-label="GitHub-Lauf öffnen"><ExternalLink size={14}/></a>}<small>Prüfstand: {date(item.last_checked_at)}</small></td>
          <td className="workflow-reason" title={item.error_cause||''}>{item.error_cause||'—'}</td>
          <td>{RESTART[item.restart_advice]||item.restart_advice}</td>
          <td>{item.owner_name||<em>Nicht zugewiesen</em>}</td>
          <td>{item.evidence_checked_at?<span className="workflow-proof"><CheckCircle2 size={15}/> Nachweis bestätigt</span>:item.evidence_note?<span className="workflow-proof pending"><Clock3 size={15}/> Vermerk vorhanden</span>:<span className="workflow-proof pending"><AlertTriangle size={15}/> Ausstehend</span>}</td>
          <td><button className="secondary" type="button" onClick={()=>setSelectedKey(selectedKey===item.workflow_key?'':item.workflow_key)}>Details</button></td>
        </tr>)}
        {!visible.length&&!busy&&<tr><td colSpan="9">Keine Vorgänge zu dieser Filterung.</td></tr>}
        </tbody>
      </table>
    </div>
    {selected&&draft&&<div className="workflow-details">
      <div className="sectionbar"><div><h3>{selected.title}</h3><p>{selected.source_kind==='BACKLOG'?'Fachvorgang aus dem zentralen Entwicklungs-Backlog':'Technische Ausführung / Importstatus'}</p></div><button className="secondary" type="button" onClick={()=>setSelectedKey('')}>Schließen</button></div>
      <p><b>Ursache:</b> {selected.error_cause||'Keine dokumentierte Fehlerursache.'}</p>
      <p><b>Nächster Schritt:</b> {selected.next_action||'Nicht definiert.'}</p>
      {selected.source_kind==='BACKLOG'?<button type="button" className="secondary" onClick={()=>onNavigate?.('backlog')}>Im Entwicklungs-Backlog bearbeiten</button>:<>
        <div className="workflow-edit-grid">
          <label>Priorität <select value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value})}>{Object.keys(PRIORITY).map(v=><option key={v}>{v}</option>)}</select></label>
          <label>Bearbeitungsstand <select value={draft.business_status} onChange={e=>setDraft({...draft,business_status:e.target.value})}>{Object.keys(STATUS).map(v=><option key={v} value={v}>{STATUS[v]}</option>)}</select></label>
          <label>Neustart <select value={draft.restart_advice} onChange={e=>setDraft({...draft,restart_advice:e.target.value})}>{Object.entries(RESTART).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
          <label>Verantwortlich <input value={draft.owner_name} onChange={e=>setDraft({...draft,owner_name:e.target.value})} placeholder="Noch nicht zugewiesen"/></label>
          <label className="workflow-wide">Nächster Schritt <textarea rows="2" value={draft.next_action} onChange={e=>setDraft({...draft,next_action:e.target.value})}/></label>
          <label className="workflow-wide">Prüf- / Abschlussvermerk <textarea rows="2" value={draft.evidence_note} onChange={e=>setDraft({...draft,evidence_note:e.target.value})}/></label>
          <label className="workflow-wide">Nachweis-Link (HTTPS) <input value={draft.evidence_url} onChange={e=>setDraft({...draft,evidence_url:e.target.value})}/></label>
          <label className="workflow-confirm"><input type="checkbox" checked={draft.evidence_checked_at} onChange={e=>setDraft({...draft,evidence_checked_at:e.target.checked})}/> Nachweis fachlich/technisch bestätigt</label>
        </div>
        <button type="button" className="primary" disabled={saving} onClick={save}><Save size={16}/> {saving?'Speichere …':'Änderung dokumentieren'}</button>
        {historyError&&<small>{historyError}</small>}
        {!!history.length&&<details className="workflow-history"><summary><ShieldCheck size={15}/> Änderungsverlauf ({history.length} letzte)</summary>{history.map(event=><p key={event.event_id}>{date(event.event_at)} · {event.previous_state?'Status '+event.previous_state.business_status+' → '+event.current_state.business_status:'Erstaufnahme'} · {event.actor_id?'Benutzer':'System/Import'}</p>)}</details>}
      </>}
    </div>}
  </section>
