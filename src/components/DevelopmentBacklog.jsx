import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, CalendarClock, CheckCircle2, ClipboardList, History, LoaderCircle, Plus, RefreshCw, Save, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import './DevelopmentBacklog.css'

const KIND={FEHLER:'Fehler',AENDERUNG:'Änderungswunsch',DATENQUALITAET:'Datenqualität',TEST:'Test / Abnahme'}
const STATUS={OFFEN:'Offen',IN_ARBEIT:'In Arbeit',BLOCKIERT:'Blockiert',TESTEN:'Testen',ERLEDIGT:'Erledigt',ZURUECKGESTELLT:'Zurückgestellt'}
const PRIORITIES=['P0','P1','P2','P3']
const STATUS_ORDER={OFFEN:0,IN_ARBEIT:1,BLOCKIERT:2,TESTEN:3,ZURUECKGESTELLT:4,ERLEDIGT:5}
const emptyDraft={kind:'FEHLER',priority:'P2',area:'Allgemein',title:'',description:'',acceptance_criteria:'',status:'OFFEN',owner_name:'',source_reference:'',version_target:'',due_date:'',resolution_note:''}

function prettyDate(value){return value?new Date(value).toLocaleDateString('de-DE'):'—'}
function prettyDateTime(value){return value?new Date(value).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'—'}
function code(row){return row.reference_code||'VM-'+String(row.id).padStart(5,'0')}
function fromRow(row){return Object.fromEntries(Object.keys(emptyDraft).map(key=>[key,row[key]??(emptyDraft[key]||'')]))}
function StatusPill({status}){return <span className={'backlog-status backlog-status-'+String(status||'OFFEN').toLowerCase()}>{STATUS[status]||status}</span>}
function PriorityPill({priority}){return <span className={'backlog-priority backlog-priority-'+String(priority||'P2').toLowerCase()}>{priority}</span>}

export default function DevelopmentBacklog({userId,canManage=false,reportOnly=false}){
  const [rows,setRows]=useState([])
  const [runtimeRollups,setRuntimeRollups]=useState({})
  const [busy,setBusy]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [query,setQuery]=useState('')
  const [statusFilter,setStatusFilter]=useState('AKTIV')
  const [kindFilter,setKindFilter]=useState('ALLE')
  const [priorityFilter,setPriorityFilter]=useState('ALLE')
  const [sourceFilter,setSourceFilter]=useState('ALLE')
  const [selectedId,setSelectedId]=useState(null)
  const [draft,setDraft]=useState({...emptyDraft})
  const [creating,setCreating]=useState(false)
  const [history,setHistory]=useState([])
  const [historyBusy,setHistoryBusy]=useState(false)

  async function reload(){
    setBusy(true);setError('')
    try{
      const {data,error:dbError}=await supabase.from('vn_development_backlog')
        .select('*').order('updated_at',{ascending:false}).limit(500)
      if(dbError)throw dbError
      setRows(data||[])
      if(canManage){
        const {data:rollups,error:rollupError}=await supabase.from('vn_backlog_runtime_rollup')
          .select('reference_code,event_count,first_seen_at,last_seen_at').limit(500)
        if(rollupError)throw rollupError
        setRuntimeRollups(Object.fromEntries((rollups||[]).map(r=>[r.reference_code,r])))
      }else setRuntimeRollups({})
    }catch(e){setError('Backlog konnte nicht geladen werden: '+(e.message||String(e)))}
    finally{setBusy(false)}
  }

  useEffect(()=>{if(userId)reload()},[userId,canManage])

  const totals=useMemo(()=>({
    all:rows.length,
    open:rows.filter(r=>!['ERLEDIGT','ZURUECKGESTELLT'].includes(r.status)).length,
    urgent:rows.filter(r=>r.priority==='P0'&&!['ERLEDIGT','ZURUECKGESTELLT'].includes(r.status)).length,
    testing:rows.filter(r=>r.status==='TESTEN').length,
    done:rows.filter(r=>r.status==='ERLEDIGT').length,
  }),[rows])
  const visible=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('de-DE')
    return rows.filter(r=>{
      if(statusFilter==='AKTIV'&&['ERLEDIGT','ZURUECKGESTELLT'].includes(r.status))return false
      if(statusFilter==='ABGESCHLOSSEN'&&!['ERLEDIGT','ZURUECKGESTELLT'].includes(r.status))return false
      if(statusFilter!=='ALLE'&&!['AKTIV','ABGESCHLOSSEN'].includes(statusFilter)&&r.status!==statusFilter)return false
      if(kindFilter!=='ALLE'&&r.kind!==kindFilter)return false
      if(priorityFilter!=='ALLE'&&r.priority!==priorityFilter)return false
      if(sourceFilter==='AUTOMATISCH'&&!r.source_reference?.startsWith('Automatisch:'))return false
      if(sourceFilter==='MANUELL'&&r.source_reference?.startsWith('Automatisch:'))return false
      return !q||[code(r),r.title,r.description,r.area,r.owner_name,r.source_reference].join(' ').toLocaleLowerCase('de-DE').includes(q)
    }).sort((a,b)=>
      (STATUS_ORDER[a.status]??9)-(STATUS_ORDER[b.status]??9)
      || PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority)
      || new Date(b.updated_at)-new Date(a.updated_at)
    )
  },[rows,query,statusFilter,kindFilter,priorityFilter,sourceFilter])

  const selected=rows.find(r=>r.id===selectedId)||null

  async function openRow(row){
    setCreating(false);setSelectedId(row.id);setDraft(fromRow(row))
    setMessage('');setError('');setHistory([]);setHistoryBusy(true)
    const {data,error:dbError}=await supabase.from('vn_development_backlog_events')
      .select('event_id,action,changed_at,previous_record,current_record')
      .eq('item_id',row.id).order('event_id',{ascending:false}).limit(15)
    if(dbError)setError('Änderungshistorie konnte nicht geladen werden: '+dbError.message)
    else setHistory(data||[])
    setHistoryBusy(false)
  }

  function startNew(){
    setCreating(true);setSelectedId(null);setDraft({...emptyDraft})
    setError('');setMessage('');setHistory([])
  }

  function change(field,value){setDraft(old=>({...old,[field]:value}))}

  async function save(e){
    e.preventDefault()
    setError('');setMessage('')
    const title=draft.title.trim(),description=draft.description.trim()
    if(title.length<5){setError('Bitte einen aussagekräftigen Titel mit mindestens fünf Zeichen eingeben.');return}
    if(description.length<10){setError('Bitte den Sachverhalt mit mindestens zehn Zeichen beschreiben.');return}
    if(!creating&&!canManage){setError('Änderungen dürfen nur durch Innendienst oder Administration erfolgen.');return}
    if(!creating&&draft.status==='ERLEDIGT'&&draft.resolution_note.trim().length<5){setError('Für den Abschluss ist ein kurzer Erledigungsvermerk erforderlich.');return}
    setSaving(true)
    const payload={
      kind:canManage?draft.kind:(draft.kind==='AENDERUNG'?'AENDERUNG':'FEHLER'),
      priority:canManage?draft.priority:'P2',
      area:draft.area.trim()||'Allgemein',
      title,description,
      acceptance_criteria:canManage?draft.acceptance_criteria.trim():'',
      status:creating?'OFFEN':draft.status,
      owner_name:canManage?draft.owner_name.trim():'',
      source_reference:creating?'Direktmeldung aus Vertragsnavigator':draft.source_reference.trim(),
      version_target:canManage?draft.version_target.trim():'',
      due_date:canManage&&draft.due_date?draft.due_date:null,
      resolution_note:canManage?draft.resolution_note.trim():'',
    }
    try{
      if(creating){
        const {data,error:dbError}=await supabase.from('vn_development_backlog')
          .insert({...payload,created_by:userId}).select('*').single()
        if(dbError)throw dbError
        setCreating(false);setSelectedId(data.id);setDraft(fromRow(data))
        setRows(current=>[data,...current]);setMessage('Meldung erfasst und dauerhaft gespeichert.')
        await openRow(data)
        setMessage('Meldung erfasst und dauerhaft gespeichert.')
      }else{
        // Optimistische Sperre schützt vor unbemerktem Überschreiben paralleler Änderungen.
        const {data,error:dbError}=await supabase.from('vn_development_backlog')
          .update(payload).eq('id',selected.id).eq('updated_at',selected.updated_at)
          .select('*').maybeSingle()
        if(dbError)throw dbError
        if(!data){setError('Der Eintrag wurde inzwischen geändert. Bitte aktualisieren und erneut öffnen.');return}
        setRows(current=>current.map(r=>r.id===data.id?data:r))
        setDraft(fromRow(data));setMessage('Änderung gespeichert und protokolliert.')
        await openRow(data)
        setMessage('Änderung gespeichert und protokolliert.')
      }
    }catch(e){setError('Speichern fehlgeschlagen: '+(e.message||String(e)))}
    finally{setSaving(false)}
  }

  const showEditor=creating||selected
  return <div className="backlog">
    <div className="backlog-summary">
      <div><small>{reportOnly?'Eigene Meldungen':'Alle erfassten Einträge'}</small><strong>{totals.all}</strong></div>
      <div><small>Offen / in Bearbeitung</small><strong>{totals.open}</strong></div>
      <div><small>Dringend (P0)</small><strong>{totals.urgent}</strong></div>
      <div><small>Im Test</small><strong>{totals.testing}</strong></div>
      <div><small>Erledigt</small><strong>{totals.done}</strong></div>
    </div>
    <div className="backlog-toolbar">
      <div className="backlog-toolbar-heading"><ClipboardList size={20}/><div><strong>Entwicklungs-Backlog</strong><small>Fehler und Änderungswünsche · getrennt vom Vertragsänderungsprotokoll</small></div></div>
      <div className="backlog-toolbar-actions">
        <button type="button" className="secondary" onClick={reload} disabled={busy||saving}><RefreshCw size={15}/> Aktualisieren</button>
        <button type="button" className="primary" onClick={startNew}><Plus size={16}/> {reportOnly?'Meldung erfassen':'Neuer Eintrag'}</button>
      </div>
    </div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {message&&<div className="alert success" role="status">{message}</div>}
    <div className="backlog-filters">
      <label className="backlog-query"><span>Suche</span><div className="backlog-searchbox"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ID, Fehler, Stichwort, Bereich …" aria-label="Backlog durchsuchen"/></div></label>
      <label><span>Status</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="AKTIV">Aktive Einträge</option><option value="ALLE">Alle Status</option><option value="OFFEN">Offen</option><option value="IN_ARBEIT">In Arbeit</option><option value="BLOCKIERT">Blockiert</option><option value="TESTEN">Testen</option><option value="ABGESCHLOSSEN">Abgeschlossen</option></select></label>
      <label><span>Art</span><select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="ALLE">Alle Arten</option>{Object.entries(KIND).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Priorität</span><select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}><option value="ALLE">Alle Prioritäten</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></label>
      {canManage&&<label><span>Herkunft</span><select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="ALLE">Alle Quellen</option><option value="AUTOMATISCH">Automatisch erfasst</option><option value="MANUELL">Manuell / Projektchat</option></select></label>}
    </div>
    <div className={'backlog-main '+(showEditor?'backlog-detail-open':'')}>
      <section className="backlog-list" aria-label="Änderungs- und Fehlerliste">
        <div className="backlog-resultbar"><strong>{visible.length} Einträge</strong><small>Sortierung: Status und Priorität</small></div>
        {busy?<div className="backlog-loading"><LoaderCircle size={20} className="spin"/> Einträge werden geladen …</div>:
          visible.length===0?<div className="backlog-empty">Keine Einträge für die aktuelle Filterung gefunden.</div>:
          <div className="backlog-tablewrap"><table className="backlog-table"><thead><tr><th>Prio / ID</th><th>Änderung oder Fehler</th><th>Status</th><th>Verantwortlich</th><th>Stand</th></tr></thead><tbody>
            {visible.map(row=><tr key={row.id} className={selectedId===row.id?'backlog-selected':''} onClick={()=>openRow(row)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openRow(row)}}} tabIndex={0} aria-label={code(row)+': '+row.title}>
              <td><PriorityPill priority={row.priority}/><small className="backlog-code">{code(row)}</small></td>
              <td><b>{row.title}</b><small>{KIND[row.kind]||row.kind} · {row.area}</small>{runtimeRollups[row.reference_code]&&<small className="backlog-auto-meta">Automatisch erfasst · {Number(runtimeRollups[row.reference_code].event_count).toLocaleString('de-DE')} Vorkommen · zuletzt {prettyDateTime(runtimeRollups[row.reference_code].last_seen_at)}</small>}</td>
              <td><StatusPill status={row.status}/></td>
              <td>{row.owner_name||<span className="backlog-muted">Nicht zugewiesen</span>}</td>
              <td>{prettyDate(row.updated_at)}</td>
            </tr>)}
          </tbody></table></div>}
      </section>
      {showEditor&&<section className="backlog-editor" aria-label={creating?'Neuen Eintrag erfassen':'Eintrag bearbeiten'}>
        <div className="backlog-editor-header"><div><small>{creating?'Neuer Eintrag':code(selected)}</small><h2>{creating?'Fehler oder Änderung erfassen':'Eintrag im Detail'}</h2></div><button className="backlog-close" type="button" aria-label="Detail schließen" onClick={()=>{setCreating(false);setSelectedId(null);setError('');setMessage('')}}><X size={18}/></button></div>
        <form onSubmit={save} className="backlog-editor-form">
          <div className="backlog-formgrid">
            <label>Art<select value={draft.kind} disabled={!creating&&!canManage} onChange={e=>change('kind',e.target.value)}>
              {(canManage?Object.entries(KIND):Object.entries(KIND).filter(([k])=>k==='FEHLER'||k==='AENDERUNG')).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select></label>
            {canManage&&<label>Priorität<select value={draft.priority} onChange={e=>change('priority',e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></label>}
          </div>
          <label>Titel<input maxLength={180} required minLength={5} value={draft.title} readOnly={!creating&&!canManage} onChange={e=>change('title',e.target.value)} placeholder="Was ist zu ändern oder funktioniert nicht?"/></label>
          <label>Bereich<input value={draft.area} readOnly={!creating&&!canManage} onChange={e=>change('area',e.target.value)} placeholder="z. B. Suche, Vertrag, Versorgungsprüfung"/></label>
          <label>Beschreibung<textarea rows={4} required minLength={10} value={draft.description} readOnly={!creating&&!canManage} onChange={e=>change('description',e.target.value)} placeholder="Ist-Zustand, Schritte zum Reproduzieren, betroffene Funktion …"/></label>
          {canManage&&<>
            <label>Erwartetes Ergebnis / Abnahmekriterium<textarea rows={2} value={draft.acceptance_criteria} onChange={e=>change('acceptance_criteria',e.target.value)}/></label>
            <div className="backlog-formgrid">
              <label>Status<select value={draft.status} disabled={creating} onChange={e=>change('status',e.target.value)}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
              <label>Verantwortlich<input value={draft.owner_name} onChange={e=>change('owner_name',e.target.value)} placeholder="Name / Team"/></label>
              <label>Zielversion<input value={draft.version_target} onChange={e=>change('version_target',e.target.value)} placeholder="z. B. VN 2.2"/></label>
              <label>Fällig bis<input type="date" value={draft.due_date||''} onChange={e=>change('due_date',e.target.value)}/></label>
            </div>
            <label>Quelle / Referenz<input value={draft.source_reference} disabled={creating} onChange={e=>change('source_reference',e.target.value)} placeholder="Projektchat, Audit, Ticket"/></label>
            <label>Bearbeitungs- / Erledigungsvermerk<textarea rows={2} value={draft.resolution_note} onChange={e=>change('resolution_note',e.target.value)} placeholder="Maßnahme, Testergebnis, Deployment-Nachweis"/></label>
          </>}
          {!creating&&selected&&<div className="backlog-details-meta"><span><CalendarClock size={14}/> Erfasst: {prettyDateTime(selected.created_at)}</span><span>Aktualisiert: {prettyDateTime(selected.updated_at)}</span>{selected.completed_at&&<span><CheckCircle2 size={14}/> Erledigt: {prettyDate(selected.completed_at)}</span>}{runtimeRollups[selected.reference_code]&&<span>Automatische Meldungen: {runtimeRollups[selected.reference_code].event_count} · zuletzt {prettyDateTime(runtimeRollups[selected.reference_code].last_seen_at)}</span>}</div>}
          {(creating||canManage)&&<button className="primary backlog-save" type="submit" disabled={saving}>{saving?<LoaderCircle className="spin" size={16}/>:<Save size={16}/>} {saving?'Speichern …':creating?'Meldung speichern':'Änderungen speichern'}</button>}
          {!creating&&!canManage&&<div className="backlog-readonly">Die Meldung ist gespeichert. Den Status verwaltet der Innendienst.</div>}
        </form>
        {!creating&&<div className="backlog-history"><h3><History size={16}/> Änderungshistorie</h3>
          {historyBusy?<p>Wird geladen …</p>:history.length?history.map(ev=>{
            const changed=ev.action==='CREATE'?['Erstellt']:
              Object.keys(ev.current_record||{}).filter(k=>!['updated_at','updated_by'].includes(k)&&JSON.stringify(ev.previous_record?.[k])!==JSON.stringify(ev.current_record?.[k]))
            return <div key={ev.event_id} className="backlog-event"><strong>{ev.action==='CREATE'?'Angelegt':'Bearbeitet'}</strong><small>{prettyDateTime(ev.changed_at)}</small><p>{changed.slice(0,8).join(' · ')||'Metadaten aktualisiert'}</p></div>
          }):<p>Noch keine Historie vorhanden.</p>}
        </div>}
      </section>}
    </div>
    {!canManage&&<p className="backlog-footnote"><AlertTriangle size={14}/> Nur eigene Meldungen sind sichtbar. Fachliche Freigaben und Statusänderungen erfolgen im Innendienst.</p>}
  </div>
}
