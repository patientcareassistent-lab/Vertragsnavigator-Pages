// VN2 Vertragsampel – Beitritt, Gültigkeit und Voraussetzungen
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const META={
  GREEN:{symbol:'●',label:'Aktiv beigetreten',className:'green'},
  YELLOW:{symbol:'●',label:'Beigetreten / prüfen',className:'yellow'},
  RED:{symbol:'●',label:'Nicht aktiv',className:'red'},
  GRAY:{symbol:'●',label:'Unklar',className:'gray'},
}

const arr=value=>Array.isArray(value)?value:(value?[value]:[])

const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ')
function displayCompanyName(value){
  const name=String(value||'')
  const n=norm(name)
  if((n.includes('spectrumk')||n.includes('spectrum k'))&&!n.includes('valuny')){
    return name.replace(/^spectrum\s*k/i,'VALUNY GmbH (ehemals spectrumK)')
  }
  return name
}

function TrafficBadge({status='GRAY'}){
  const meta=META[status]||META.GRAY
  return <span className={'traffic-badge '+meta.className}>
    <span className="traffic-dot" aria-hidden="true">{meta.symbol}</span>
    <span>{meta.label}</span>
  </span>
}

export default function ContractTrafficLightPanel({contracts=[]}){
  const [summaries,setSummaries]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    let cancelled=false
    async function load(){
      setLoading(true);setError('')
      const {data,error}=await supabase
        .from('vn_contract_accession_summary')
        .select('*')
        .order('contract_name')
        .limit(700)
      if(cancelled)return
      if(error){setError(error.message||String(error));setSummaries([])}
      else setSummaries(data||[])
      setLoading(false)
    }
    load()
    return()=>{cancelled=true}
  },[])

  const summaryMap=useMemo(()=>new Map(summaries.map(r=>[r.contract_id,r])),[summaries])
  const rows=useMemo(()=>contracts.map(contract=>({contract,summary:summaryMap.get(contract.contract_id)||null})),[contracts,summaryMap])
  const visibleSummary=useMemo(()=>rows.map(r=>r.summary).filter(Boolean),[rows])
  const counts=useMemo(()=>visibleSummary.reduce((acc,r)=>{
    const key=r.traffic_light||'GRAY'
    acc[key]=(acc[key]||0)+1
    return acc
  },{GREEN:0,YELLOW:0,RED:0,GRAY:0}),[visibleSummary])
  const withoutData=rows.length-visibleSummary.length

  if(loading)return <div className="traffic-loading">Vertragsampel wird geladen …</div>
  if(error)return <div className="alert error">Vertragsampel konnte nicht geladen werden: {error}</div>

  return <div className="traffic-workspace">
    <div className="traffic-summary" aria-label="Vertragsampel Zusammenfassung">
      {['GREEN','YELLOW','RED','GRAY'].map(status=>{
        const meta=META[status]
        return <div className={'traffic-kpi '+meta.className} key={status}>
          <span className="traffic-kpi-dot">{meta.symbol}</span>
          <div><strong>{counts[status]||0}</strong><span>{meta.label}</span></div>
        </div>
      })}
    </div>

    <div className="traffic-legend">
      <b>Vertragsampel</b>
      <span><i className="legend-dot green"/>Grün: aktuell nutzbarer Beitritt an mindestens einem Standort</span>
      <span><i className="legend-dot yellow"/>Gelb: formal beigetreten, aber Voraussetzungen/Prüfung offen</span>
      <span><i className="legend-dot red"/>Rot: kein aktuell nutzbarer Beitritt</span>
      <span><i className="legend-dot gray"/>Grau: Status unklar</span>
      {withoutData>0&&<small>{withoutData} angezeigte Verträge haben keine zuordenbare Teilnahmezeile und werden neutral behandelt.</small>}
    </div>

    <div className="tablewrap traffic-tablewrap">
      <table className="traffic-table">
        <thead><tr>
          <th>Ampel</th>
          <th>Vertrag</th>
          <th>Kostenträger</th>
          <th>PG</th>
          <th>Standorte</th>
          <th>Status / Begründung</th>
          <th>gültig bis</th>
        </tr></thead>
        <tbody>
          {rows.map(({contract,summary})=>{
            const status=summary?.traffic_light||'GRAY'
            const greenSites=arr(summary?.green_sites)
            const siteCount=summary?.site_count||0
            return <tr key={contract.contract_id} className={'traffic-row '+String(status).toLowerCase()}>
              <td><TrafficBadge status={status}/></td>
              <td><b>{displayCompanyName(contract.contract_name||contract.contract_id)}</b><span className="detail-only tiny">{contract.contract_id}</span></td>
              <td>{arr(contract.payer_families).join(', ')||'—'}</td>
              <td>{arr(contract.product_groups).join(', ')||'—'}</td>
              <td>
                {summary
                  ? <><b className={summary.green_count>0?'traffic-count-ok':''}>{summary.green_count||0}/{siteCount} grün</b>
                      {greenSites.length>0&&<small className="traffic-sites">{greenSites.join(', ')}</small>}
                      {(summary.yellow_count||0)>0&&<small className="traffic-sites warn">{summary.yellow_count} gelb</small>}</>
                  : <span>keine Teilnahmezeile</span>}
              </td>
              <td><span className="traffic-reason">{summary?.traffic_light_reason||'Keine zuordenbare Beitrittsinformation'}</span></td>
              <td>{contract.validity_mode==='SINGLE_SCOPE'?(contract.catalog_valid_to||contract.latest_valid_to||'—'):'PG-/Anlagen-spezifisch'}</td>
            </tr>
          })}
          {!rows.length&&<tr><td colSpan="7" className="empty">Keine Verträge für den aktuellen Suchfilter.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
}
