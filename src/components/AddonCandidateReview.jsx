import React,{useEffect,useState} from 'react'
import { ExternalLink,FileCheck2,RefreshCw,ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import './AddonCandidateReview.css'

const TYPES={REQUIRED:'Erforderlich',OPTIONAL:'Möglicher Zusatz',EXCLUDED:'Nicht kombinierbar'}
const STATUSES={PENDING:'Zur Prüfung',APPROVED:'Fachlich freigegeben',REJECTED:'Abgelehnt'}
const displayPosition=(row)=>[row?.pos||row?.code,row?.bezeichnung].filter(Boolean).join(' · ')

export default function AddonCandidateReview({canReview=false}){
  const [rows,setRows]=useState([])
  const [positions,setPositions]=useState({})
  const [busy,setBusy]=useState('')
  const [opening,setOpening]=useState(null)
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
      const candidates=data||[]
      setRows(candidates)
      const ids=[...new Set(candidates.flatMap(row=>[row.base_position_row_id,row.addon_position_row_id]).filter(Boolean))]
      if(!ids.length){setPositions({});return}
      try{
        const {data:details,error:detailsError}=await supabase.from('vn_position_catalog')
          .select('position_row_id,pos,code,pg,bezeichnung,source_doc')
          .in('position_row_id',ids).limit(ids.length)
        if(detailsError)throw detailsError
        setPositions(Object.fromEntries((details||[]).map(row=>[row.position_row_id,row])))
      }catch(_e){
        setPositions({})
        setError('Die Positionsbezeichnungen konnten nicht vollständig geladen werden. Interne Positions-IDs bleiben sichtbar.')
      }
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }
  useEffect(()=>{reload()},[filter])

  async function openSource(row){
    if(opening||busy)return
    setOpening(row.candidate_id);setError('')
    try{
      const {data,error:linkError}=await supabase.functions.invoke('vn2-source-link',{
        body:{position_row_id:row.base_position_row_id}
      })
      if(linkError)throw linkError
      if(!data?.available||!/^https?:\/\//i.test(String(data.url||''))){
        throw new Error('Das Originaldokument ist über den gesicherten Link noch nicht erreichbar. Bitte den angegebenen Quellenpfad und die Originalseite im Vertragsarchiv verwenden.')
      }
      window.open(data.url,'_blank','noopener,noreferrer')
    }catch(e){setError(e.message||String(e))}
    finally{setOpening(null)}
  }

  async function review(row,approved){
    const note=(notes[row.candidate_id]||'').trim()
    if(note.length<12){setError('Bitte eine fachliche Begründung (mindestens 12 Zeichen) und den Quellbezug dokumentieren.');return}
    if(approved&&!window.confirm('Die Originalquelle, alle Bedingungen und die Positionszuordnung selbst geprüft? Nur dann als verbindliche Vertragsregel veröffentlichen.'))return
    setBusy(row.candidate_id);setError('');setMessage('')
    try{
      const {error:rpcError}=await supabase.rpc('vn_review_addon_candidate',{
        p_candidate_id:row.candidate_id,p_approved:approved,p_note:note,
      })
      if(rpcError)throw rpcError
      setMessage(approved?'Zusatzrelation nach Fachfreigabe veröffentlicht.':'Kandidat mit Begründung abgelehnt.')
      await reload()
    }catch(e){setError(e.message||String(e))}
    finally{setBusy('')}
  }

  return <section className="panel addon-review">
    <div className="sectionbar"><div><h2>Zusatzpositionen und Kombinationsregeln</h2><p>Originalvertrag und Positionszuordnung vor der Veröffentlichung fachlich kontrollieren.</p></div><button className="secondary" type="button" onClick={reload} disabled={!!busy}><RefreshCw size={15}/> Aktualisieren</button></div>
    <div className="note">Diese Datensätze sind bis zur persönlichen Fachfreigabe nicht Teil der verbindlichen Vertragsmatrix. Auch ausdrücklich genannte Zusatzpositionen bedeuten keine automatische Abrechenbarkeit. Inklusive Leistungen, Genehmigungspflichten und Ausschlüsse separat prüfen.</div>
    <label className="addon-review-filter">Prüfstatus<select value={filter} onChange={e=>setFilter(e.target.value)}>{Object.entries(STATUSES).map(([x,y])=><option key={x} value={x}>{y}</option>)}</select></label>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {message&&<div className="alert success" role="status">{message}</div>}
    <div className="knowledge-list">
      {rows.map(row=>{
        const base=positions[row.base_position_row_id]
        const addon=positions[row.addon_position_row_id]
        const baseLabel=displayPosition(base)||row.base_position_row_id
        const addonLabel=displayPosition(addon)||row.addon_position_row_id
        return <article className="knowledge-card addon-candidate-card" key={row.candidate_id}>
          <div className="knowledge-head">
            <div><b>{TYPES[row.suggested_relation_type]||row.suggested_relation_type}: {addonLabel}</b>
              <small>Grundposition: {baseLabel} · PG {base?.pg||addon?.pg||'—'}</small>
            </div>
            <span className="badge">{STATUSES[row.review_status]||row.review_status}</span>
          </div>
          <div className="addon-candidate-classification"><span>Zuordnungsvorschlag</span><strong>{TYPES[row.suggested_relation_type]||row.suggested_relation_type}</strong><span>Keine Freigabe</span></div>
          <p className="addon-candidate-rule">{row.original_condition}</p>
          <div className="addon-source">
            <FileCheck2 size={18} aria-hidden="true"/>
            <div><strong>Originalvertrag · Seiten {row.source_page||'nicht erfasst'}</strong><span>{row.source_reference}</span></div>
            <button className="secondary" type="button" onClick={()=>openSource(row)} disabled={!!busy||opening===row.candidate_id} aria-label={'Originalvertrag zu '+(base?.pos||row.base_position_row_id)+' öffnen'}><ExternalLink size={15}/>{opening===row.candidate_id?'Link laden …':'Vertrag öffnen'}</button>
          </div>
          <details className="addon-candidate-ids"><summary>Technische Referenzen</summary><small>Vertrag: {row.contract_id} · Grundposition: {row.base_position_row_id} · Zusatzposition: {row.addon_position_row_id} · Kandidat: {row.candidate_id}</small></details>
          {row.review_status==='PENDING'&&canReview&&<div className="formstack addon-review-form">
            <label>Eigenständiger fachlicher Prüfvermerk<textarea rows={3} placeholder="Originalseite, Kombinierbarkeit, Inklusivleistungen, Genehmigung und Konditionen persönlich kontrolliert; Begründung…" value={notes[row.candidate_id]||''} onChange={e=>setNotes(x=>({...x,[row.candidate_id]:e.target.value}))}/></label>
            <div className="addon-review-actions">
              <button type="button" className="primary" disabled={!!busy} onClick={()=>review(row,true)}><ShieldCheck size={15}/> Nach Quellenprüfung freigeben</button>
              <button type="button" className="secondary" disabled={!!busy} onClick={()=>review(row,false)}>Kandidat ablehnen</button>
            </div>
          </div>}
          {row.review_note&&<p className="addon-review-note"><b>{row.review_status==='PENDING'?'Hinweis aus Datenvorbereitung:':'Fachlicher Prüfvermerk:'}</b> {row.review_note}</p>}
          {row.review_status==='PENDING'&&!canReview&&<small>Freigabe ausschließlich durch zuständige PG-Administration.</small>}
        </article>
      })}
      {!rows.length&&<div className="empty-panel">{busy?'Laden …':'Keine Kandidaten in dieser Auswahl.'}</div>}
    </div>
  </section>
}
