import React,{useEffect,useRef,useState} from 'react'
import { ChevronLeft,ChevronRight,RefreshCw,ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const PER_PAGE=40
const PAYER_OPTIONS=[['','Alle Kassenfamilien'],['AOKBW','AOK Baden-Württemberg'],['BARMER','BARMER'],['DAK','DAK'],['GWQ','GWQ'],['IKK','IKK'],['KKH','KKH'],['TK','TK'],['OTHER','Weitere / noch nicht zugeordnet']]
const STATUSES={OPEN:'Ungeprüft',TRIAGED:'Vorprüfung dokumentiert',DISMISSED:'Fehlalarm / nicht zutreffend'}
const SIGNALS={
  BEZEICHNUNG_HINWEIS:'Zusatz-/Zuschlagsbegriff',
  HAUPTPOSITIONS_HINWEIS:'Bezug zur Hauptposition',
  IM_PREIS_ENTHALTEN:'Mögliche Inklusivleistung',
  KOMBINATION_EINGESCHRAENKT:'Kombination eingeschränkt',
  BEDINGT_ZUSATZFAEHIG:'Bedingung für Zusatzabrechnung',
  QUELLENDOKUMENT_NICHT_VERLINKT:'Originaldokument nicht direkt verlinkt',
  VERTRAGS_ID_UNGEKLAERT:'Vertrags-ID ungeklärt'
}
const cleanText=x=>String(x||'').trim()

/**
 * Nichtproduktive Triage: Verknüpfung zur Hauptposition und abrechenbare
 * Relationen werden hier ausdrücklich NICHT freigegeben.
 */
export default function PositionRelationScreening(){
  const [pgRows,setPgRows]=useState([])
  const [pg,setPg]=useState('')
  const [payer,setPayer]=useState('')
  const [status,setStatus]=useState('OPEN')
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(0)
  const [rows,setRows]=useState([])
  const [total,setTotal]=useState(0)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [notes,setNotes]=useState({})
  const [refreshId,setRefreshId]=useState(0)
  const serial=useRef(0)

  useEffect(()=>{
    let active=true
    async function summary(){
      const {data,error:e}=await supabase.from('vn_position_relation_screening_pg')
        .select('pg,total,open_count,triaged_count,dismissed_count')
        .order('pg')
      if(!active)return
      if(e)setError('PG-Übersicht: '+e.message)
      else setPgRows(data||[])
    }
    summary()
    return()=>{active=false}
  },[refreshId])

  useEffect(()=>{
    const id=++serial.current
    async function load(){
      setBusy('load');setError('')
      try{
        let request=supabase.from('vn_position_relation_screening')
          .select('screening_key,pg,family,contract_id,contract_name,pos,code,title,evidence_clause,source_doc,source_page,reference_codes,signal_tags,source_row_count,review_status,review_note',{count:'exact'})
          .eq('review_status',status)
        if(pg)request=request.eq('pg',pg)
        if(payer)request=request.eq('family',payer)
        if(cleanText(search))request=request.ilike('title','%'+cleanText(search).replace(/[%_]/g,'')+'%')
        const {data,error:e,count}=await request.order('created_at',{ascending:false}).range(page*PER_PAGE,(page+1)*PER_PAGE-1)
        if(e)throw e
        if(id!==serial.current)return
        setRows(data||[])
        setTotal(count||0)
      }catch(e){
        if(id===serial.current)setError('Prüfliste: '+(e.message||String(e)))
      }finally{
        if(id===serial.current)setBusy('')
      }
    }
    load()
    return()=>{serial.current++}
  },[pg,payer,status,search,page,refreshId])

  function change(setter,value){
    setter(value)
    setPage(0)
    setMessage('')
  }

  async function triage(row,discard){
    const note=cleanText(notes[row.screening_key])
    if(note.length<12){setError('Bitte Quellenlage und fachliche Begründung mit mindestens 12 Zeichen dokumentieren.');return}
    if(!window.confirm(discard?
      'Hinweis fachlich als Fehlalarm markieren? Kein bestehender Datensatz wird gelöscht.':
      'Vorprüfung dokumentieren? Dies ist ausdrücklich KEINE Freigabe oder Veröffentlichung der Zusatzposition.'))return
    setBusy(row.screening_key);setError('');setMessage('')
    try{
      const {error:e}=await supabase.rpc('vn_triage_position_screening',{
        p_screening_key:row.screening_key,p_discard:discard,p_note:note
      })
      if(e)throw e
      setMessage(discard?'Verdachtsposition als Fehlalarm markiert.':'Vorprüfung dokumentiert. Eine fachliche Zuordnung/Freigabe steht weiterhin aus.')
      setRefreshId(x=>x+1)
    }catch(e){setError(e.message||String(e));setBusy('')}
  }

  const openCount=pgRows.reduce((n,r)=>n+Number(r.open_count||0),0)
  const allCount=pgRows.reduce((n,r)=>n+Number(r.total||0),0)
  return <section className="panel" aria-label="Produktgruppenübergreifende Vertragspositions-Prüfung">
    <div className="sectionbar">
      <div><h2>Positionsbeziehungen · PG-übergreifende Vorprüfung</h2>
        <p>{allCount.toLocaleString('de-DE')} Hinweise in {pgRows.length} Produktgruppen · {openCount.toLocaleString('de-DE')} noch ungeprüft.</p>
      </div>
      <button type="button" className="secondary" disabled={!!busy} onClick={()=>setRefreshId(n=>n+1)}><RefreshCw size={15}/> Aktualisieren</button>
    </div>
    <div className="note"><ShieldAlert size={17} style={{verticalAlign:'middle'}}/> Die Liste enthält ausschließlich automatisch erkannte Textsignale, keine geprüften Haupt-/Zusatzpositions-Verknüpfungen. Erst Originalvertrag, Kostenträger, Vertragsgeltung, Kombination, Inklusivleistung, KVA und Referenzposition prüfen. Eine dokumentierte Vorprüfung publiziert <b>nichts</b> in der Versorgungs- oder Vertragsmatrix.</div>
    <div className="formgrid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))'}}>
      <label>Produktgruppe
        <select value={pg} onChange={e=>change(setPg,e.target.value)}>
          <option value="">Alle PG (mit Hinweisen)</option>
          {pgRows.map(r=><option key={r.pg} value={r.pg}>PG {r.pg} ({r.open_count}/{r.total} offen)</option>)}
        </select>
      </label>
      <label>Krankenkassenfamilie
        <select value={payer} onChange={e=>change(setPayer,e.target.value)}>
          {PAYER_OPTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label>Prüfstatus
        <select value={status} onChange={e=>change(setStatus,e.target.value)}>
          {Object.entries(STATUSES).map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label>Positionsbezeichnung
        <input value={search} onChange={e=>change(setSearch,e.target.value)} placeholder="z. B. Trommelbremse"/>
      </label>
    </div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {message&&<div className="alert success" role="status">{message}</div>}
    <p className="result-hint">{total.toLocaleString('de-DE')} Ergebnisse{busy==='load'?' · Lade …':''} · Seite {page+1}{total>0?' / '+Math.ceil(total/PER_PAGE):''}</p>
    <div className="knowledge-list">
      {rows.map(row=>{
        const signals=(row.signal_tags||[]).filter(t=>t!=='QUELLENDOKUMENT_NICHT_VERLINKT')
        const noSource=(row.signal_tags||[]).includes('QUELLENDOKUMENT_NICHT_VERLINKT')
        return <article key={row.screening_key} className="knowledge-card">
          <div className="knowledge-head">
            <div><b>{row.title||row.pos||'Position ohne Bezeichnung'}</b>
              <small>PG {row.pg} · {row.family==='OTHER'?'Kasse noch prüfen':row.family||'Kasse ungeklärt'} · Vertragsposition {row.pos||'—'} · HMV {row.code||'nicht erfasst'}</small>
            </div>
            <span className="badge">{STATUSES[row.review_status]||row.review_status}</span>
          </div>
          <p><b>Vertrag:</b> {row.contract_name}</p>
          {signals.length>0&&<p><b>Prüfmerkmale:</b> {signals.map(s=>SIGNALS[s]||s).join(' · ')}</p>}
          {!!row.reference_codes?.length&&<p><b>Im Vertragstext genannte Positionsnummern:</b> {row.reference_codes.join(' · ')} <small>(Beziehung noch nicht bestätigt)</small></p>}
          <details><summary>Leistungsbeschreibung / Hinweise aus dem Datenimport</summary>
            <p style={{whiteSpace:'pre-wrap'}}>{row.evidence_clause||'Kein erläuternder Leistungstext vorhanden.'}</p>
            <small>{row.source_row_count} Quellzeile(n) in dieser Gruppe.</small>
          </details>
          <div className="addon-review-note" role="note"><b>Quelle:</b> {row.source_doc||'Originaldokument nicht direkt mit dieser Positionszeile verknüpft'}
            {row.source_page!=null?' · Seite '+row.source_page:''}
            {noSource&&' · Vor fachlicher Freigabe Originalvertragsanlage ermitteln.'}
            {!row.contract_id&&' · Eindeutige Vertrags-ID fehlt.'}
          </div>
          {row.review_status==='OPEN'&&<div className="formstack" style={{marginTop:12}}>
            <label>Dokumentation der Vorprüfung
              <textarea rows={2} value={notes[row.screening_key]||''}
                onChange={e=>setNotes(n=>({...n,[row.screening_key]:e.target.value}))}
                placeholder="Originalvertrag/Seite, Position und Bedingung kontrolliert; Ergebnis …"/>
            </label>
            <div className="addon-review-actions">
              <button type="button" className="secondary" disabled={!!busy} onClick={()=>triage(row,false)}>Vorprüfung dokumentieren (nicht freigeben)</button>
              <button type="button" className="secondary" disabled={!!busy} onClick={()=>triage(row,true)}>Fehlalarm markieren</button>
            </div>
          </div>}
          {row.review_note&&<p><b>Prüfvermerk:</b> {row.review_note}</p>}
        </article>
      })}
      {!busy&&!rows.length&&<div className="empty-panel">Keine Einträge für diese Filter.</div>}
    </div>
    <div className="matrix-actions" style={{justifyContent:'space-between',marginTop:16}}>
      <button className="secondary" type="button" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={!!busy||page===0}><ChevronLeft size={16}/> Zurück</button>
      <button className="secondary" type="button" onClick={()=>setPage(p=>p+1)} disabled={!!busy||(page+1)*PER_PAGE>=total}>Weiter <ChevronRight size={16}/></button>
    </div>
  </section>
}
