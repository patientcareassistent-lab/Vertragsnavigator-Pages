import React,{useEffect,useMemo,useState} from 'react'
import {RefreshCw,ShieldAlert} from 'lucide-react'
import {supabase} from '../lib/supabase.js'

/**
 * Read-only view of evidence and mapping gaps. No buttons can approve or
 * publish a contract/price relation. The RPC enforces PG/admin permissions.
 */
export default function AddonAuditWorkqueues(){
  const [open,setOpen]=useState(false)
  const [loading,setLoading]=useState(false)
  const [data,setData]=useState(null)
  const [error,setError]=useState('')
  const [tab,setTab]=useState('contracts')
  const [search,setSearch]=useState('')
  const [visible,setVisible]=useState(25)

  useEffect(()=>{
    if(!open||data)return
    let active=true
    async function load(){
      setLoading(true);setError('')
      try{
        const {data:res,error:err}=await supabase.rpc('vn_addon_audit_workqueues_v1')
        if(err)throw err
        if(active)setData(res||{})
      }catch(e){if(active)setError('Prüfqueue: '+(e?.message||String(e)))}
      finally{if(active)setLoading(false)}
    }
    load()
    return()=>{active=false}
  },[open,data])

  const sources=Array.isArray(data?.source_documents)?data.source_documents:[]
  const contracts=Array.isArray(data?.contracts)?data.contracts:[]
  const pgItems=Array.isArray(data?.product_group_reviews)?data.product_group_reviews:[]
  const rows=tab==='sources'?sources:tab==='pg'?pgItems:contracts
  const filtered=useMemo(()=>rows.filter(r=>
     !search.trim()||JSON.stringify(r).toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE'))
   ),[rows,search])

  return <details className="addon-screening-disclosure" style={{margin:'16px 0'}}
      onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary style={{cursor:'pointer',padding:13,fontWeight:700,border:'1px solid #cbd5e1',borderRadius:8}}>
      Quellen- und Vertragsprüfqueue · Originalbelege und nicht zugeordnete Zusätze
    </summary>
    {open&&<div className="panel" style={{marginTop:12}}>
      <p className="note"><ShieldAlert size={16} style={{verticalAlign:'middle'}}/>
        Die Prüfqueue enthält unbearbeitete Originalquellen und maschinell erkannte Textsignale. 
        Keine der Beziehungen ist allein dadurch fachlich oder abrechnungstechnisch freigegeben.
      </p>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {loading&&<p role="status">Quellen und Vertragsprüfungen werden geladen …</p>}
      {!loading&&data&&<>
        <div className="sectionbar">
          <div><h3>Quellenprüfung</h3>
            <p>{sources.length} PDF-Originalquellen · {contracts.length} Verträge mit ungeklärten Beziehungshinweisen · {pgItems.length} PG-Fälle</p>
          </div>
          <button type="button" className="secondary" onClick={()=>{setData(null);setVisible(25)}}><RefreshCw size={15}/> Aktualisieren</button>
        </div>
        <div className="formgrid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))'}}>
          <label>Prüfebene
            <select value={tab} onChange={e=>{setTab(e.target.value);setVisible(25)}}>
              <option value="contracts">Verträge ({contracts.length})</option>
              <option value="pg">Vertrag / PG ({pgItems.length})</option>
              <option value="sources">Originalquellen ({sources.length})</option>
            </select>
          </label>
          <label>Suche in Prüffällen
            <input value={search} placeholder="Vertrag, PG, Quelldatei …" onChange={e=>{setSearch(e.target.value);setVisible(25)}}/>
          </label>
        </div>
        <p className="result-hint">{filtered.length} offene Prüfgegenstände · schreibgeschützt · keine Freigabe möglich</p>
        <div className="knowledge-list">
        {filtered.slice(0,visible).map((row,i)=><article key={(row.document_sha256||row.contract_id||'')+'-'+(row.pg||i)} className="knowledge-card">
          {tab==='sources'?<>
            <div className="knowledge-head"><div><b>{row.archive_path?.split('/').at(-1)||'Originaldokument'}</b>
              <small>{row.archive_name} · {row.pdf_pages} Seiten · {row.evidence_occurrences} Signalstellen</small></div>
              <span className="badge">Quellenprüfung offen</span>
            </div>
            <details><summary>Originalpfad / Fundseiten</summary><small style={{overflowWrap:'anywhere'}}>{row.archive_path}</small>
              <p>Fundseiten: {row.evidence_page_numbers||'Nicht erfasst'}</p>
              <small>Dokument-SHA256: {row.document_sha256}</small>
            </details>
          </>:tab==='pg'?<>
            <div className="knowledge-head"><div><b>PG {row.pg} · {row.contract_id}</b>
              <small>{row.text_signal_rows} technische Texthinweise</small></div>
              <span className="badge">Fachprüfung offen</span>
            </div>
          </>:<>
            <div className="knowledge-head"><div><b>{row.contract_name||row.contract_id}</b>
              <small>{row.text_signal_rows} Beziehungshinweise · {row.screened_rows} Screening-Fälle · {row.related_pg_count} PG im Vertrag</small></div>
              <span className="badge">Zuordnung offen</span>
            </div>
            <small>Vertrags-ID: {row.contract_id}</small>
          </>}
        </article>)}
        {!filtered.length&&<div className="empty-panel">Keine Prüffälle mit diesen Filterkriterien.</div>}
        </div>
        {filtered.length>visible&&<button className="secondary" type="button"
          style={{marginTop:12}} onClick={()=>setVisible(v=>v+25)}>
            Weitere 25 Prüffälle anzeigen
          </button>}
      </>}
    </div>}
  </details>
}
