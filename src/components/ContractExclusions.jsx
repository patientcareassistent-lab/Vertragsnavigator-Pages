import React,{useEffect,useMemo,useState} from 'react'
import { AlertTriangle,ArchiveX,CheckCircle2,LoaderCircle,RefreshCcw,ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const reasons={
  NOT_EXISTENT:'Vertrag existiert nicht',
  WRONG_PAYER:'Falscher Kostenträger',
  WRONG_PG:'Falsche Produktgruppe',
  DUPLICATE:'Doppelter Vertrag',
  WRONG_ASSIGNMENT:'Falsche Vertragszuordnung',
  OBSOLETE_IMPORT:'Veralteter Import',
  OTHER:'Sonstiger Grund',
}
export default function ContractExclusions({onChanged}){
  const [rows,setRows]=useState([])
  const [query,setQuery]=useState('')
  const [view,setView]=useState('ACTIVE')
  const [selected,setSelected]=useState('')
  const [reason,setReason]=useState('WRONG_ASSIGNMENT')
  const [note,setNote]=useState('')
  const [audit,setAudit]=useState([])
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  async function load(){
    setBusy('load');setError('')
    try{
      const {data,error:e}=await supabase.from('contracts')
        .select('contract_id,contract_name,payer_families,product_groups,record_status,invalid_reason,invalid_comment,invalidated_at')
        .in('record_status',['ACTIVE','INVALID']).order('contract_name').limit(700)
      if(e)throw e;setRows(data||[])
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }
  useEffect(()=>{load()},[])
  useEffect(()=>{
    let active=true
    if(!selected){setAudit([]);return}
    supabase.from('vn_contract_exclusion_audit')
      .select('previous_status,new_status,reason,comment,changed_at')
      .eq('contract_id',selected).order('changed_at',{ascending:false}).limit(12)
      .then(({data,error:e})=>{if(active){if(e)setError(e.message);else setAudit(data||[])}})
    return()=>{active=false}
  },[selected,rows])
  const visible=useMemo(()=>{
    const q=query.toLocaleLowerCase('de-DE').trim()
    return rows.filter(r=>r.record_status===view&&(!q||[r.contract_id,r.contract_name,(r.payer_families||[]).join(' '),(r.product_groups||[]).join(' ')].join(' ').toLocaleLowerCase('de-DE').includes(q)))
  },[rows,query,view])
  const item=rows.find(r=>r.contract_id===selected)
  async function changeStatus(){
    if(!item)return
    if(note.trim().length<12){setError('Bitte eine nachvollziehbare Begründung mit mindestens 12 Zeichen eintragen.');return}
    const restore=item.record_status==='INVALID'
    if(!window.confirm(restore?'Diesen Vertrag wieder aktivieren?':'Diesen Vertrag von der aktiven Versorgungssuche ausschließen?'))return
    setBusy('save');setError('');setMessage('')
    try{
      const payload=restore
        ?{record_status:'ACTIVE',invalid_reason:null,invalid_comment:null,restoration_comment:note.trim()}
        :{record_status:'INVALID',invalid_reason:reason,invalid_comment:note.trim(),restoration_comment:null}
      const {data,error:e}=await supabase.from('contracts')
        .update(payload).eq('contract_id',item.contract_id).eq('record_status',item.record_status)
        .select('contract_id,record_status').maybeSingle()
      if(e)throw e
      if(!data)throw Error('Der Vertrag wurde zwischenzeitlich geändert; bitte Liste aktualisieren.')
      setNote('');setSelected('')
      await load()
      if(onChanged)await onChanged()
      setMessage(restore?'Vertrag wieder aktiviert und protokolliert.':'Vertrag ausgeschlossen und protokolliert. Die Positionen dürfen nicht mehr als aktive Vertragsversorgung erscheinen.')
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }
  return <div className="grid">
    <section className="panel">
      <div className="sectionbar"><div><h2>Vertragsbestand verwalten</h2><p>Nur Administratoren · keine physische Löschung</p></div><button className="secondary" disabled={!!busy} onClick={load}><RefreshCcw size={14}/> Aktualisieren</button></div>
      <div className="formgrid">
        <label>Status<select value={view} onChange={e=>{setView(e.target.value);setSelected('')}}><option value="ACTIVE">Aktive Verträge</option><option value="INVALID">Ausgeschlossene Verträge</option></select></label>
        <label>Suche<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, Vertrag, Kasse, PG"/></label>
      </div>
      <div className="tablewrap" style={{marginTop:15,maxHeight:490,overflow:'auto'}}><table><thead><tr><th>Vertrag</th><th>Kasse / PG</th><th>Aktion</th></tr></thead><tbody>{visible.map(r=><tr key={r.contract_id}><td><b>{r.contract_name}</b><small style={{display:'block'}}>{r.contract_id}</small></td><td>{(r.payer_families||[]).join(', ')||'—'}<small style={{display:'block'}}>PG {(r.product_groups||[]).join(', ')||'—'}</small></td><td><button className="secondary" type="button" onClick={()=>{setSelected(r.contract_id);setReason('WRONG_ASSIGNMENT');setNote('')}}>{view==='ACTIVE'?'Ausschließen':'Prüfen / reaktivieren'}</button></td></tr>)}{!visible.length&&<tr><td colSpan={3} className="empty">Keine Verträge gefunden.</td></tr>}</tbody></table></div>
    </section>
    <section className="panel">
      <h2>{item?(item.record_status==='ACTIVE'?'Vertrag ausschließen':'Ausgeschlossenen Vertrag prüfen'):'Vertrag auswählen'}</h2>
      <p>Ein Ausschluss entfernt den Vertrag aus der aktiven Suche, bewahrt aber Originalquelle und Historie.</p>
      {item&&<div className="formstack">
        <strong>{item.contract_name}</strong>
        {item.record_status==='INVALID'&&<div className="alert error"><b>Derzeit ausgeschlossen:</b> {reasons[item.invalid_reason]||item.invalid_reason||'—'} · {item.invalid_comment||'Keine Angabe'}</div>}
        {item.record_status==='ACTIVE'&&<label>Grund<select value={reason} onChange={e=>setReason(e.target.value)}>{Object.entries(reasons).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>}
        <label>{item.record_status==='ACTIVE'?'Begründung des Ausschlusses':'Begründung der Reaktivierung'}<textarea rows={4} minLength={12} value={note} onChange={e=>setNote(e.target.value)} placeholder="Quellbezug, Korrekturhinweis, fachliche Prüfung" required/></label>
        <button className="primary" disabled={!!busy||note.trim().length<12} onClick={changeStatus}>{busy==='save'?<LoaderCircle className="spin" size={15}/>:item.record_status==='ACTIVE'?<ArchiveX size={15}/>:<CheckCircle2 size={15}/>} {item.record_status==='ACTIVE'?'Vertrag begründet ausschließen':'Vertrag begründet reaktivieren'}</button>
        <h3 style={{marginBottom:0}}>Änderungshistorie</h3>
        {audit.map((a,i)=><div key={i} className="note"><b>{a.previous_status} → {a.new_status}</b><small style={{display:'block'}}>{new Date(a.changed_at).toLocaleString('de-DE')} · {a.reason}</small><p>{a.comment}</p></div>)}
        {!audit.length&&<small>Keine Statusänderung protokolliert.</small>}
      </div>}
      {error&&<div className="alert error">{error}</div>}
      {message&&<div className="alert success">{message}</div>}
    </section>
  </div>
}
