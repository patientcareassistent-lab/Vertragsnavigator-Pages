import React,{useEffect,useMemo,useState} from 'react'
import { AlertTriangle, FileWarning, LoaderCircle, RefreshCw, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const arr=v=>Array.isArray(v)?v:[]
const norm=v=>String(v||'').toLowerCase()

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}

export default function MissingSources({onMaintain}){
  const [rows,setRows]=useState([])
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState('ALL')

  async function load(){
    setBusy(true);setError('')
    const {data,error}=await supabase.rpc('vn_admin_missing_contract_sources')
    if(error){setError(error.message||String(error));setRows([])}
    else setRows(data||[])
    setBusy(false)
  }

  useEffect(()=>{load()},[])

  const filtered=useMemo(()=>{
    const q=norm(query.trim())
    return rows.filter(r=>{
      if(filter!=='ALL'&&r.source_status!==filter&&r.priority!==filter)return false
      if(!q)return true
      const hay=norm([
        r.contract_name,r.contract_id,
        arr(r.payer_families).join(' '),
        arr(r.product_groups).join(' '),
        arr(r.iks).join(' '),
        arr(r.missing_items).join(' ')
      ].join(' '))
      return hay.includes(q)
    })
  },[rows,query,filter])

  const critical=rows.filter(r=>r.priority==='KRITISCH').length
  const missingOriginal=rows.filter(r=>arr(r.missing_items).includes('Originalvertrag / Originalquelle')).length
  const missingContent=rows.filter(r=>Number(r.position_count||0)===0&&Number(r.knowledge_count||0)===0).length

  return <section className="missing-sources">
    <div className="metrics source-gap-metrics">
      <article className="metric"><span>Verträge mit Quellenlücke</span><strong>{rows.length.toLocaleString('de-DE')}</strong></article>
      <article className="metric"><span>Kritisch</span><strong>{critical.toLocaleString('de-DE')}</strong></article>
      <article className="metric"><span>Originalquelle fehlt</span><strong>{missingOriginal.toLocaleString('de-DE')}</strong></article>
      <article className="metric"><span>Inhalt fehlt</span><strong>{missingContent.toLocaleString('de-DE')}</strong></article>
    </div>

    <section className="panel">
      <div className="sectionbar missing-source-toolbar">
        <div>
          <h2>Beigetretene Verträge ohne belastbare Quelle</h2>
          <p>Nur Verträge mit aktivem Beitritt. Originalquelle, Vertragsinhalt und betroffene IKs werden getrennt bewertet.</p>
        </div>
        <div className="missing-source-filters">
          <input className="compact" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Vertrag, Kasse, PG oder IK …"/>
          <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="ALL">Alle Lücken</option>
            <option value="KRITISCH">Nur kritisch</option>
            <option value="ORIGINAL_UND_INHALT_FEHLEN">Original + Inhalt fehlen</option>
            <option value="NUR_STRUKTURIERTE_METADATEN">Nur strukturierte Metadaten</option>
            <option value="ORIGINALVERTRAG_FEHLT">Originalvertrag fehlt</option>
            <option value="VERTRAGSINHALT_FEHLT">Vertragsinhalt fehlt</option>
          </select>
          <button className="secondary icon-button" type="button" onClick={load} disabled={busy} title="Neu laden">
            <RefreshCw className={busy?'spin':''} size={16}/>
          </button>
        </div>
      </div>

      {busy&&<div className="source-gap-loading"><LoaderCircle className="spin" size={18}/> Fehlende Quellen werden geprüft …</div>}
      {error&&<div className="alert error">{error}</div>}

      {!busy&&!error&&<div className="tablewrap"><table className="missing-source-table">
        <thead><tr>
          <th>Vertrag</th>
          <th>Aktive Beitritte / IK</th>
          <th>Fehlend</th>
          <th>Vorhandener Inhalt</th>
          <th>Priorität</th>
          <th></th>
        </tr></thead>
        <tbody>
          {filtered.map(r=><tr key={r.contract_id}>
            <td>
              <b>{r.contract_name||r.contract_id}</b>
              <small>{arr(r.payer_families).join(', ')||'—'} · PG {arr(r.product_groups).join(', ')||'—'}</small>
              <small className="detail-only">{r.contract_id}</small>
            </td>
            <td>
              <b>{r.site_count} Standort{Number(r.site_count)===1?'':'e'} · {r.accession_count} Beitritt{Number(r.accession_count)===1?'':'e'}</b>
              <small>{arr(r.iks).join(', ')||'keine IK'}</small>
            </td>
            <td>
              <div className="gap-items">{arr(r.missing_items).map(x=><span key={x}><FileWarning size={13}/>{x}</span>)}</div>
            </td>
            <td>
              <span className="content-count">Komponenten <b>{r.component_count}</b></span>
              <span className="content-count">Positionen <b>{r.position_count}</b></span>
              <span className="content-count">Wissen <b>{r.knowledge_count}</b></span>
            </td>
            <td>
              <Badge tone={r.priority==='KRITISCH'?'bad':'warn'}>{r.priority}</Badge>
              <small>{r.recommended_action}</small>
            </td>
            <td>
              <button className="primary small-action" type="button" onClick={()=>onMaintain?.(r.contract_id)}>
                <Upload size={14}/> Vertrag pflegen
              </button>
            </td>
          </tr>)}
          {!filtered.length&&<tr><td colSpan="6" className="empty">Keine Verträge für diesen Filter.</td></tr>}
        </tbody>
      </table></div>}
    </section>

    <div className="note source-gap-note"><AlertTriangle size={15}/>
      Die Liste bewertet nur eindeutig verknüpfte Originalquellen. Eine lediglich vorhandene Tabellenzeile oder ein abgeleiteter Vertragsname zählt nicht als tatsächlicher Vertrag.
    </div>
  </section>
}
