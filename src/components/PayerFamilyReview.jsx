import React,{useEffect,useMemo,useState} from 'react'
import {
  AlertTriangle,ArrowLeft,CheckCircle2,RefreshCw,Search,ShieldCheck,
  Tags,XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
const fmt=v=>Number(v||0).toLocaleString('de-DE')
const arr=v=>Array.isArray(v)?v:(v?[v]:[])

export default function PayerFamilyReview({onBack,onDataChanged}){
  const [rows,setRows]=useState([])
  const [families,setFamilies]=useState([])
  const [drafts,setDrafts]=useState({})
  const [notes,setNotes]=useState({})
  const [query,setQuery]=useState('')
  const [statusFilter,setStatusFilter]=useState('PENDING')
  const [confidenceFilter,setConfidenceFilter]=useState('ALL')
  const [busy,setBusy]=useState(false)
  const [rowBusy,setRowBusy]=useState('')
  const [message,setMessage]=useState('')

  async function load(refresh=false){
    setBusy(true);setMessage('')
    try{
      if(refresh){
        const {error}=await supabase.rpc('vn_admin_refresh_payer_family_reviews')
        if(error)throw error
      }
      const [rr,fr]=await Promise.all([
        supabase.from('vn_admin_payer_family_review_p5')
          .select('*')
          .order('confidence',{ascending:true})
          .order('partner_display',{ascending:true})
          .order('contract_name',{ascending:true}),
        supabase.from('vn_payer_family_catalog')
          .select('family_code,display_name,category,sort_order')
          .eq('active',true)
          .order('sort_order',{ascending:true}),
      ])
      if(rr.error)throw rr.error
      if(fr.error)throw fr.error
      const next=rr.data||[]
      setRows(next)
      setFamilies(fr.data||[])
      setDrafts(old=>{
        const copy={...old}
        for(const r of next){
          if(!copy[r.contract_id]){
            copy[r.contract_id]=arr(r.current_families).length
              ?arr(r.current_families)
              :arr(r.suggested_families)
          }
        }
        return copy
      })
    }catch(e){
      setMessage(e.message||String(e))
    }finally{
      setBusy(false)
    }
  }

  useEffect(()=>{load(false)},[])

  const stats=useMemo(()=>({
    pending:rows.filter(r=>r.status==='PENDING').length,
    high:rows.filter(r=>r.status==='PENDING'&&r.confidence==='HIGH').length,
    review:rows.filter(r=>r.status==='PENDING'&&r.confidence==='REVIEW').length,
    applied:rows.filter(r=>r.status==='APPLIED').length,
    na:rows.filter(r=>r.status==='NOT_APPLICABLE').length,
  }),[rows])

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return rows.filter(r=>{
      if(statusFilter!=='ALL'&&r.status!==statusFilter)return false
      if(confidenceFilter!=='ALL'&&r.confidence!==confidenceFilter)return false
      if(!q)return true
      return JSON.stringify([
        r.contract_id,r.contract_name,r.partner_code,r.partner_display,
        r.product_groups,r.suggested_families,r.evidence_note
      ]).toLowerCase().includes(q)
    })
  },[rows,query,statusFilter,confidenceFilter])

  function toggleFamily(contractId,code){
    setDrafts(old=>{
      const current=new Set(arr(old[contractId]))
      if(current.has(code))current.delete(code)
      else current.add(code)
      return {...old,[contractId]:[...current]}
    })
  }

  async function applyOne(row){
    const selected=arr(drafts[row.contract_id])
    if(!selected.length){
      setMessage('Bitte mindestens eine Kassenfamilie auswählen.')
      return
    }
    setRowBusy(row.contract_id);setMessage('')
    try{
      const {error}=await supabase.rpc('vn_admin_apply_payer_family_review',{
        p_contract_id:row.contract_id,
        p_families:selected,
        p_note:notes[row.contract_id]||null,
      })
      if(error)throw error
      setMessage('Kassenfamilie wurde übernommen und protokolliert.')
      await load(false)
      await onDataChanged?.()
    }catch(e){
      setMessage(e.message||String(e))
    }finally{
      setRowBusy('')
    }
  }

  async function markNotApplicable(row){
    const note=String(notes[row.contract_id]||'').trim()
    if(!note){
      setMessage('Für „nicht zutreffend“ ist eine Begründung erforderlich.')
      return
    }
    setRowBusy(row.contract_id);setMessage('')
    try{
      const {error}=await supabase.rpc('vn_admin_mark_payer_family_not_applicable',{
        p_contract_id:row.contract_id,
        p_note:note,
      })
      if(error)throw error
      setMessage('Fall wurde mit Begründung als nicht zutreffend dokumentiert.')
      await load(false)
    }catch(e){
      setMessage(e.message||String(e))
    }finally{
      setRowBusy('')
    }
  }

  async function applyAllHigh(){
    if(!stats.high)return
    const ok=window.confirm(
      stats.high+' HIGH-Vorschläge gesammelt übernehmen? Jede Änderung wird einzeln im Änderungsprotokoll dokumentiert.'
    )
    if(!ok)return
    setBusy(true);setMessage('')
    try{
      const {data,error}=await supabase.rpc('vn_admin_apply_all_high_payer_family_reviews',{
        p_note:'P5 Sammelfreigabe HIGH',
      })
      if(error)throw error
      setMessage(fmt(data)+' sichere Kassenfamilien-Zuordnungen wurden übernommen und protokolliert.')
      await load(false)
      await onDataChanged?.()
    }catch(e){
      setMessage(e.message||String(e))
    }finally{
      setBusy(false)
    }
  }

  return <div className="payer-review">
    <section className="panel payer-review-command">
      <div className="sectionbar">
        <div>
          <h2>Kassenfamilien bereinigen</h2>
          <p>Vorschläge werden erst nach Admin-Freigabe in den Vertragsstamm übernommen.</p>
        </div>
        <div className="admin-command-actions">
          <button className="secondary" type="button" onClick={onBack}><ArrowLeft size={15}/> Admin-Cockpit</button>
          <button className="secondary icon-button" type="button" onClick={()=>load(true)} disabled={busy} title="Vorschläge neu berechnen">
            <RefreshCw className={busy?'spin':''} size={17}/>
          </button>
        </div>
      </div>

      <div className="payer-review-kpis">
        <article><small>Offen</small><strong>{fmt(stats.pending)}</strong></article>
        <article className="ok"><small>Sicher vorbereitet</small><strong>{fmt(stats.high)}</strong></article>
        <article className="warn"><small>Manuell prüfen</small><strong>{fmt(stats.review)}</strong></article>
        <article><small>Übernommen</small><strong>{fmt(stats.applied)}</strong></article>
        <article><small>Nicht zutreffend</small><strong>{fmt(stats.na)}</strong></article>
      </div>

      <div className="payer-review-bulk">
        <div>
          <ShieldCheck size={20}/>
          <span><b>{fmt(stats.high)} HIGH-Vorschläge</b><small>Explizite Partner-/Kassenregeln mit dokumentierter Begründung.</small></span>
        </div>
        <button className="primary" type="button" onClick={applyAllHigh} disabled={busy||!stats.high}>
          Sichere Vorschläge gesammelt übernehmen
        </button>
      </div>
    </section>

    {message&&<div className={'alert '+(/übernommen|dokumentiert/.test(message)?'success':'error')}>{message}</div>}

    <section className="panel">
      <div className="payer-review-toolbar">
        <label className="payer-review-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Vertrag oder Kostenträger suchen …"/></label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="PENDING">Nur offen</option>
          <option value="APPLIED">Übernommen</option>
          <option value="NOT_APPLICABLE">Nicht zutreffend</option>
          <option value="ALL">Alle Stati</option>
        </select>
        <select value={confidenceFilter} onChange={e=>setConfidenceFilter(e.target.value)}>
          <option value="ALL">Alle Bewertungen</option>
          <option value="HIGH">HIGH</option>
          <option value="REVIEW">Manuell prüfen</option>
        </select>
        <Badge>{visible.length} Fälle</Badge>
      </div>

      <div className="payer-review-list">
        {visible.map(row=><article className={'payer-review-row '+(row.confidence==='REVIEW'?'manual':'')} key={row.contract_id}>
          <div className="payer-review-head">
            <div>
              <small>{row.partner_display||'Unbekannter Vertragspartner'}{row.partner_code?' · '+row.partner_code:''}</small>
              <b>{row.contract_name}</b>
              <span>{arr(row.product_groups).length?'PG '+arr(row.product_groups).join(', '):'keine PG-Zuordnung'} · {row.contract_id}</span>
            </div>
            <div className="payer-review-badges">
              <Badge tone={row.confidence==='HIGH'?'ok':'warn'}>{row.confidence==='HIGH'?'HIGH':'PRÜFEN'}</Badge>
              <Badge tone={row.status==='APPLIED'?'ok':row.status==='NOT_APPLICABLE'?'info':row.status==='PENDING'?'warn':'bad'}>
                {row.status==='PENDING'?'OFFEN':row.status==='APPLIED'?'ÜBERNOMMEN':row.status==='NOT_APPLICABLE'?'NICHT ZUTREFFEND':row.status}
              </Badge>
            </div>
          </div>

          <div className="payer-review-evidence">
            {row.confidence==='HIGH'?<CheckCircle2 size={17}/>:<AlertTriangle size={17}/>}
            <span><b>Begründung</b>{row.evidence_note}</span>
          </div>

          <div className="payer-review-suggestion">
            <span><small>Vorschlag</small><div className="family-chips">
              {arr(row.suggested_families).length
                ?arr(row.suggested_families).map(v=><Badge key={v} tone="info">{v}</Badge>)
                :<Badge tone="warn">keine automatische Zuordnung</Badge>}
            </div></span>
            {arr(row.current_families).length&&<span><small>Aktuell</small><div className="family-chips">{arr(row.current_families).map(v=><Badge key={v} tone="ok">{v}</Badge>)}</div></span>}
          </div>

          {row.status==='PENDING'&&<>
            <details className="payer-family-editor" open={row.confidence==='REVIEW'}>
              <summary><Tags size={15}/> Kassenfamilie {row.confidence==='HIGH'?'anpassen':'festlegen'}</summary>
              <div className="family-choice-grid">
                {families.map(f=><label key={f.family_code} className={arr(drafts[row.contract_id]).includes(f.family_code)?'selected':''}>
                  <input
                    type="checkbox"
                    checked={arr(drafts[row.contract_id]).includes(f.family_code)}
                    onChange={()=>toggleFamily(row.contract_id,f.family_code)}
                  />
                  <span><b>{f.family_code}</b><small>{f.display_name}</small></span>
                </label>)}
              </div>
            </details>

            <label className="payer-review-note">
              <span>Entscheidungsnotiz</span>
              <input
                value={notes[row.contract_id]||''}
                onChange={e=>setNotes(old=>({...old,[row.contract_id]:e.target.value}))}
                placeholder="optional bei Übernahme · Pflicht bei „nicht zutreffend“"
              />
            </label>

            <div className="payer-review-actions">
              <button className="primary" type="button" disabled={rowBusy===row.contract_id} onClick={()=>applyOne(row)}>
                <CheckCircle2 size={15}/> Zuordnung übernehmen
              </button>
              <button className="secondary danger-lite" type="button" disabled={rowBusy===row.contract_id} onClick={()=>markNotApplicable(row)}>
                <XCircle size={15}/> Nicht zutreffend
              </button>
            </div>
          </>}

          {row.status!=='PENDING'&&row.decision_note&&<div className="payer-review-decision"><b>Entscheidung:</b> {row.decision_note}</div>}
        </article>)}

        {!visible.length&&!busy&&<div className="empty-panel">Keine Fälle für den gewählten Filter.</div>}
      </div>
    </section>
  </div>
}
