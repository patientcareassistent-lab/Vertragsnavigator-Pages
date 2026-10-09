import React,{useMemo,useState} from 'react'
import { CheckCircle2,LoaderCircle,RefreshCw,Send } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const statuses={OPEN:'Offen',IN_REVIEW:'In Prüfung',ANSWERED:'Beantwortet',CLOSED:'Abgeschlossen'}
export default function QuestionsQueue({questions=[],loaded=false,canAnswer=false,canAcknowledge=false,onChanged,onRefresh}){
  const [drafts,setDrafts]=useState({})
  const [query,setQuery]=useState('')
  const [statusFilter,setStatusFilter]=useState('ALLE')
  const visible=useMemo(()=>questions.filter(q=>{
    if(statusFilter!=='ALLE'&&q.status!==statusFilter)return false
    const text=[q.question_text,q.answer_text,q.payer,q.pg,q.hmv_code,q.position_code].join(' ').toLocaleLowerCase('de')
    return text.includes(query.trim().toLocaleLowerCase('de'))
  }),[questions,query,statusFilter])
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const act=async(q,action)=>{
    const answer=(drafts[q.question_id]||'').trim()
    if(action==='answer'&&answer.length<2){setError('Bitte eine fachliche Antwort eingeben.');return}
    setBusy(q.question_id);setError('');setMessage('')
    try{
      const {data,error:dbError}=action==='answer'
        ?await supabase.rpc('vn_answer_contract_question',{p_question_id:q.question_id,p_answer_text:answer})
        :await supabase.rpc('vn_ack_contract_question',{p_question_id:q.question_id})
      if(dbError)throw dbError
      setMessage(action==='answer'?'Antwort gespeichert; die zuständige PG-Administration kann den Fall abschließen.':'Die Frage wurde nach fachlicher Prüfung abgeschlossen.')
      if(typeof onChanged==='function')onChanged(data)
      setDrafts(x=>({...x,[q.question_id]:''}))
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }
  return <section className="panel">
    <div className="sectionbar"><div><h2>Vertragsfragen bearbeiten</h2><p>Antworten und Abschließen gemäß fachlicher Zuständigkeit.</p></div><button className="secondary" type="button" onClick={onRefresh} disabled={!onRefresh||!!busy}><RefreshCw size={15}/> Aktualisieren</button></div>
    <div className="question-queue-filters">
      <label>Fragen durchsuchen<input aria-label="Fragen durchsuchen" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Frage, Kasse, PG, Position …"/></label>
      <label>Bearbeitungsstatus<select aria-label="Fragenstatus" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALLE">Alle Status</option>{Object.entries(statuses).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
    </div>
    <p className="question-queue-count" role="status">{loaded?visible.length+' von '+questions.length+' geladenen Fragen angezeigt':'Fragen werden geladen …'}{loaded&&questions.length===100?' · Es werden höchstens 100 Fragen geladen.':''}</p>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {message&&<div className="alert success" role="status">{message}</div>}
    {!loaded?<div className="precheck-loading"><LoaderCircle className="spin" size={17}/> Fragen werden geladen …</div>:<div className="question-list">
      {visible.map(q=><article className="question-row" key={q.question_id} style={{display:'block'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10}}><b>{q.question_text}</b><span className="badge">{statuses[q.status]||q.status}</span></div>
        <small>{[q.payer,q.pg&&('PG '+q.pg),q.hmv_code,q.position_code].filter(Boolean).join(' · ')||'ohne Zuordnung'}</small>
        {q.answer_text&&<div className="question-answer"><b>Fachliche Antwort</b><p>{q.answer_text}</p></div>}
        {canAnswer&&['OPEN','IN_REVIEW','ANSWERED'].includes(q.status)&&<div className="formstack" style={{marginTop:10}}>
          <label>Antwort<textarea rows={2} value={drafts[q.question_id]||''} onChange={e=>setDrafts(x=>({...x,[q.question_id]:e.target.value}))} placeholder="Begründete Antwort auf Grundlage der Vertragsquelle"/></label>
          <button type="button" className="secondary" disabled={!!busy} onClick={()=>act(q,'answer')}><Send size={14}/> Antwort speichern</button>
        </div>}
        {canAcknowledge&&q.status==='ANSWERED'&&<button type="button" className="primary" style={{marginTop:10}} disabled={!!busy} onClick={()=>act(q,'close')}><CheckCircle2 size={14}/> Antwort fachlich bestätigen und schließen</button>}
        {q.status==='ANSWERED'&&!canAcknowledge&&<p className="tiny">Die fachliche Bestätigung steht noch aus.</p>}
      </article>)}
      {!visible.length&&<div className="empty-panel">{questions.length?'Keine Fragen entsprechen der aktuellen Filterung.':'Keine für diese Rolle sichtbaren Vertragsfragen vorhanden.'}</div>}
    </div>}
  </section>
}
