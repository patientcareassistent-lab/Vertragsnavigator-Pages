import React,{useCallback,useEffect,useState} from 'react'
import { AlertTriangle,CheckCircle2,ClipboardCheck,HelpCircle,LoaderCircle,RefreshCcw } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const PER_PAGE=40
const statuses={NEW:'Neu',READ:'Gelesen',QUESTION_OPEN:'Rückfrage offen',ANSWER_RECEIVED:'Antwort eingegangen',CLARIFIED:'Geklärt',APPROVED:'Freigegeben',NOT_RELEVANT:'Nicht relevant'}
function fmtDate(d){return d?new Date(d).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'—'}
function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}

export default function PGReviewQueue({canReview=false}){
  const [items,setItems]=useState([])
  const [status,setStatus]=useState('NEW')
  const [pg,setPg]=useState('')
  const [page,setPage]=useState(0)
  const [total,setTotal]=useState(0)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [notes,setNotes]=useState({})
  const load=useCallback(async()=>{
    setBusy('Laden');setError('')
    try{
      let q=supabase.from('contract_change_reviews')
        .select('review_id,change_id,contract_id,pg,cluster_code,status,review_note,created_at,updated_at,read_at,approved_at,closed_at',{count:'exact'})
        .eq('status',status)
      if(pg.trim())q=q.eq('pg',pg.trim().padStart(2,'0'))
      const {data,error:dbError,count}=await q.order('created_at',{ascending:false}).range(page*PER_PAGE,page*PER_PAGE+PER_PAGE-1)
      if(dbError)throw dbError
      setItems(data||[]);setTotal(count||0)
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  },[status,pg,page])
  useEffect(()=>{load()},[load])
  useEffect(()=>{setPage(0)},[status,pg])
  const act=async(row,op)=>{
    const id=row.review_id
    const note=(notes[id]||'').trim()
    if(op==='vn_review_mark_not_relevant'&&note.length<3){setError('Für „Nicht relevant“ bitte einen fachlichen Grund mit mindestens drei Zeichen angeben.');return}
    if(op==='vn_review_ask_question'&&note.length<5){setError('Bitte eine konkrete fachliche Frage eingeben.');return}
    if(op==='vn_review_approve'&&!window.confirm('Prüfung für PG '+row.pg+' und '+row.cluster_code+' fachlich freigeben?'))return
    setBusy(id);setError('');setMessage('')
    try{
      const args={p_review_id:id}
      if(op==='vn_review_mark_not_relevant')args.p_reason=note
      if(op==='vn_review_ask_question')args.p_question_text=note
      const {error:dbError}=await supabase.rpc(op,args)
      if(dbError)throw dbError
      setMessage('Fachliche Bearbeitung gespeichert und protokolliert.')
      await load()
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }
  return <div className="pg-review">
    <div className="panel">
      <div className="sectionbar"><div><h2>PG-bezogene Änderungsprüfungen</h2><p>Prüfaufträge je Vertrag, Produktgruppe und Geschäftsbereich. Bearbeitung ausschließlich durch zuständige PG-Administration.</p></div><button type="button" className="secondary" disabled={!!busy} onClick={load}><RefreshCcw size={14}/> Aktualisieren</button></div>
      <div className="note">Aktueller Ausgangsbestand: 947 Prüfaufträge aus Kassenfamilien-Stammdatenkorrekturen. „Nur Stammdaten“ ist ein Hinweis, keine Freigabe. Einzelne Entscheidungen erfordern Prüfung und Begründung.</div>
      <div className="pg-review-filters">
        <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(statuses).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label>Produktgruppe<input value={pg} onChange={e=>setPg(e.target.value)} maxLength={2} placeholder="z. B. 24"/></label>
        <div><small>Treffer in der gewählten Ansicht</small><strong>{total.toLocaleString('de-DE')}</strong></div>
      </div>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {message&&<div className="alert success" role="status">{message}</div>}
      <div className="tablewrap"><table><thead><tr><th>Vertrag / Änderung</th><th>PG</th><th>Bereich</th><th>Status</th><th>Erstellt</th><th>Fachprüfung</th></tr></thead><tbody>
      {items.map(row=><tr key={row.review_id}><td><b>{row.contract_id}</b><small style={{display:'block',color:'#667085'}}>Kassenfamilien-Zuordnung · Änderungs-ID: {row.change_id?.slice(0,8)}</small></td><td><b>{row.pg}</b></td><td>{row.cluster_code||'—'}</td><td><Badge tone={row.status==='APPROVED'?'ok':row.status==='NEW'?'warn':''}>{statuses[row.status]||row.status}</Badge></td><td>{fmtDate(row.created_at)}</td><td style={{minWidth:255}}>
        {!canReview?<small>Nur zuständige PG-Administration darf freigeben.</small>:['APPROVED','NOT_RELEVANT'].includes(row.status)?<small>{row.review_note||'Abgeschlossen'}</small>:<div style={{display:'grid',gap:7}}>
          <textarea rows={2} placeholder="Begründung für Nichtrelevanz oder konkrete Rückfrage" value={notes[row.review_id]||''} onChange={e=>setNotes(x=>({...x,[row.review_id]:e.target.value}))}/>
          <div className="pg-review-buttons">
          {row.status==='NEW'&&<button className="secondary" disabled={!!busy} onClick={()=>act(row,'vn_review_mark_read')}>Gelesen</button>}
          {['READ','CLARIFIED'].includes(row.status)&&<button className="primary" disabled={!!busy} onClick={()=>act(row,'vn_review_approve')}><CheckCircle2 size={13}/> Freigeben</button>}
          {!['QUESTION_OPEN','ANSWER_RECEIVED'].includes(row.status)&&<>
            <button className="secondary" disabled={!!busy} onClick={()=>act(row,'vn_review_mark_not_relevant')}>Nicht relevant</button>
            <button className="secondary" disabled={!!busy} onClick={()=>act(row,'vn_review_ask_question')}><HelpCircle size={13}/> Rückfrage</button>
          </>}
          {row.status==='ANSWER_RECEIVED'&&<button className="secondary" disabled={!!busy} onClick={()=>act(row,'vn_review_mark_clarified')}>Antwort geklärt</button>}
          </div>
        </div>}
      </td></tr>)}
      {!items.length&&<tr><td colSpan={6} className="empty">{busy?'Prüfungen werden geladen …':'Keine Einträge in der gewählten Auswahl'}</td></tr>}
      </tbody></table></div>
      <div className="pg-review-pages"><button className="secondary" disabled={page===0||!!busy} onClick={()=>setPage(x=>x-1)}>Vorherige Seite</button><span>Seite {page+1} / {Math.max(1,Math.ceil(total/PER_PAGE))}</span><button className="secondary" disabled={(page+1)*PER_PAGE>=total||!!busy} onClick={()=>setPage(x=>x+1)}>Nächste Seite</button></div>
    </div>
  </div>
}
