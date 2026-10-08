import React,{useEffect,useState} from 'react'
import { CheckCircle2,LoaderCircle,RefreshCw,ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const TYPES={REQUIRED:'Erforderlich',OPTIONAL:'Möglich',EXCLUDED:'Nicht kombinierbar'}
const STATUSES={PENDING:'Zur Prüfung',APPROVED:'Quellengeprüft',REJECTED:'Abgelehnt'}
export default function AddonCandidateReview({canReview=false}){
  const [rows,setRows]=useState([])
  const [busy,setBusy]=useState('')
  const [filter,setFilter]=useState('PENDING')
  const [notes,setNotes]=useState({})
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  async function reload(){
    setBusy('load');setError('')
    try{
      const {data,error:dbError}=await supabase.from('vn_position_addon_candidates')
        .select('candidate_id,contract_id,base_position_row_id,addon_position_row_id,suggested_relation_type,source_reference,source_page,original_condition,review_status,review_note,reviewed_at')
        .eq('review_status',filter).order('created_at',{ascending:false}).limit(100)
      if(dbError)throw dbError
      setRows(data||[])
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }
  useEffect(()=>{reload()},[filter])
  async function review(row,approved){
    const note=(notes[row.candidate_id]||'').trim()
    if(note.length<12){setError('Bitte eine fachliche Begründung (mindestens 12 Zeichen) und den Quellbezug dokumentieren.');return}
    if(approved&&!window.confirm('Zusatzrelation als quellengeprüfte Vertragsregel für die Versorgung veröffentlichen?'))return
    setBusy(row.candidate_id);setError('');setMessage('')
    try{
      const {error:rpcError}=await supabase.rpc('vn_review_addon_candidate',{
        p_candidate_id:row.candidate_id,p_approved:approved,p_note:note,
      })
      if(rpcError)throw rpcError
      setMessage(approved?'Zusatzrelation als geprüft veröffentlicht.':'Kandidat mit Begründung abgelehnt.')
      await reload()
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }
  return <section className="panel addon-review">
    <div className="sectionbar"><div><h2>Zusatzpositionen und Kombinationsregeln</h2><p>Vertragsquellenbasierte Zuordnung vor Verwendung im Positionsvergleich prüfen.</p></div><button className="secondary" type="button" onClick={reload} disabled={!!busy}><RefreshCw size={15}/> Aktualisieren</button></div>
    <div className="note">Kandidaten sind bis zur fachlichen Freigabe nicht Bestandteil der verbindlichen Vertragsmatrix. Die Vorschläge wurden nur aus expliziten Stellen einer Vertrags-/Positionsquelle abgeleitet.</div>
    <label style={{maxWidth:250,margin:'14px 0'}}>Prüfstatus<select value={filter} onChange={e=>setFilter(e.target.value)}>{Object.entries(STATUSES).map(([x,y])=><option key={x} value={x}>{y}</option>)}</select></label>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {message&&<div className="alert success" role="status">{message}</div>}
    <div className="knowledge-list">{rows.map(row=><article className="knowledge-card" key={row.candidate_id}>
      <div className="knowledge-head"><div><b>{TYPES[row.suggested_relation_type]||row.suggested_relation_type}: {row.addon_position_row_id}</b><small>Grundposition: {row.base_position_row_id} · Vertrag: {row.contract_id}</small></div><span className="badge">{STATUSES[row.review_status]||row.review_status}</span></div>
      <p>{row.original_condition}</p>
      <small>Beleg: {row.source_reference} · Originalseite {row.source_page||'nicht erfasst'}</small>
      {row.review_status==='PENDING'&&canReview&&<div className="formstack" style={{marginTop:13}}>
        <label>Fachlicher Prüfvermerk<textarea rows={2} placeholder="Bedingung anhand Originalvertrag kontrolliert; ggf. abweichende Interpretation…" value={notes[row.candidate_id]||''} onChange={e=>setNotes(a=>({...a,[row.candidate_id]:e.target.value}))}/></label>
        <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
          <button type="button" className="primary" disabled={!!busy} onClick={()=>review(row,true)}><ShieldCheck size={15}/> Quelle geprüft – freigeben</button>
          <button type="button" className="secondary" disabled={!!busy} onClick={()=>review(row,false)}>Kandidat ablehnen</button>
        </div>
      </div>}
      {row.review_note&&<p><b>Prüfvermerk:</b> {row.review_note}</p>}
      {row.review_status==='PENDING'&&!canReview&&<small>Bitte durch zuständige PG-Administration prüfen lassen.</small>}
    </article>)}
    {!rows.length&&<div className="empty-panel">{busy?'Laden …':'Keine Kandidaten in dieser Auswahl.'}</div>}</div>
  </section>
}
