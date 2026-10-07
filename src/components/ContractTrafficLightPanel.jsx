import React,{useEffect,useMemo,useRef,useState} from 'react'
import { ChevronDown,ChevronLeft,ChevronRight,ChevronUp,LoaderCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const PAGE_SIZE=30
const META={
  GREEN:{symbol:'●',label:'Aktiv beigetreten',className:'green'},
  YELLOW:{symbol:'●',label:'Beigetreten / prüfen',className:'yellow'},
  RED:{symbol:'●',label:'Nicht aktiv',className:'red'},
  GRAY:{symbol:'●',label:'Unklar',className:'gray'},
}
const arr=value=>Array.isArray(value)?value:(value?[value]:[])

function TrafficBadge({status='GRAY',compact=false}){
  const meta=META[status]||META.GRAY
  return <span className={'traffic-badge '+meta.className+(compact?' compact':'')}>
    <span className="traffic-dot" aria-hidden="true">{meta.symbol}</span><span>{meta.label}</span>
  </span>
}
function suffix(value){
  const raw=String(value||'').trim()
  const i=raw.indexOf(':')
  return i>=0?raw.slice(i+1).trim():''
}

export default function ContractTrafficLightPanel({query='',contractIds=null}){
  const [rows,setRows]=useState([])
  const [page,setPage]=useState(0)
  const [total,setTotal]=useState(0)
  const [debouncedFilter,setDebouncedFilter]=useState({query:'',ids:null})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [expanded,setExpanded]=useState('')
  const [details,setDetails]=useState({})
  const [detailBusy,setDetailBusy]=useState('')
  const abortRef=useRef(null)

  const contractIdKey=Array.isArray(contractIds)?contractIds.join('|'):''

  useEffect(()=>{
    const ids=Array.isArray(contractIds)?contractIds:null
    const timer=setTimeout(()=>{
      setDebouncedFilter({query:query.trim(),ids})
      setPage(0)
    },350)
    return()=>clearTimeout(timer)
  },[query,contractIdKey])

  useEffect(()=>{
    abortRef.current?.abort()
    const controller=new AbortController()
    abortRef.current=controller
    async function load(){
      setLoading(true);setError('')
      if(debouncedFilter.query&&Array.isArray(debouncedFilter.ids)&&debouncedFilter.ids.length===0){
        setRows([]);setTotal(0);setLoading(false);return
      }
      const {data,error:e}=await supabase.rpc('vn_contract_read_page',{
        p_contract_ids:debouncedFilter.query?debouncedFilter.ids:null,
        p_offset:page*PAGE_SIZE,
        p_limit:PAGE_SIZE,
      }).abortSignal(controller.signal)
      if(e){
        if(e.name==='AbortError'||/abort/i.test(String(e.message||'')))return
        setError(e.message||String(e));setRows([])
      }else{
        const next=data||[]
        setRows(next)
        setTotal(Number(next[0]?.total_count||0))
      }
      setLoading(false)
    }
    load()
    return()=>controller.abort()
  },[page,debouncedFilter])

  async function toggleDetail(contractId){
    if(expanded===contractId){setExpanded('');return}
    setExpanded(contractId)
    if(details[contractId])return
    setDetailBusy(contractId)
    const {data,error:e}=await supabase.from('vn_site_contract_status')
      .select('site_id,ik,branch,source_status,prerequisites_met,vtv_status,valid_from,valid_to,legs,active,review_required,traffic_light,traffic_light_reason,usable_for_supply')
      .eq('contract_id',contractId)
      .order('branch')
      .limit(100)
    if(e)setError(e.message||String(e))
    else setDetails(current=>({...current,[contractId]:data||[]}))
    setDetailBusy('')
  }

  const counts=useMemo(()=>rows.reduce((acc,r)=>{
    const key=r.traffic_light||'GRAY';acc[key]=(acc[key]||0)+1;return acc
  },{GREEN:0,YELLOW:0,RED:0,GRAY:0}),[rows])
  const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE))

  return <div className="traffic-workspace">
    <div className="traffic-summary" aria-label="Vertragsampel Zusammenfassung">
      {['GREEN','YELLOW','RED','GRAY'].map(status=>{
        const meta=META[status]
        return <div className={'traffic-kpi '+meta.className} key={status}>
          <span className="traffic-kpi-dot">{meta.symbol}</span>
          <div><strong>{counts[status]||0}</strong><span>{meta.label} auf dieser Seite</span></div>
        </div>
      })}
    </div>

    <div className="traffic-legend">
      <b>Vertragsampel</b>
      <span><i className="legend-dot green"/>Grün: aktuell nutzbarer Beitritt an mindestens einem Standort</span>
      <span><i className="legend-dot yellow"/>Gelb: formal beigetreten, aber Voraussetzungen/Prüfung offen</span>
      <span><i className="legend-dot red"/>Rot: kein aktuell nutzbarer Beitritt</span>
      <span><i className="legend-dot gray"/>Grau: Status unklar</span>
      <small>{total.toLocaleString('de-DE')} Verträge · Details werden erst beim Öffnen geladen.</small>
    </div>

    {loading&&<div className="traffic-loading"><LoaderCircle className="spin" size={17}/> Vertragskatalog wird geladen …</div>}
    {error&&<div className="alert error">Vertragskatalog konnte nicht geladen werden: {error}</div>}

    {!loading&&!error&&<div className="tablewrap traffic-tablewrap">
      <table className="traffic-table">
        <thead><tr>
          <th>Ampel</th><th>Vertrag</th><th>Kostenträger</th><th>PG</th><th>Standorte</th><th>Status / Begründung</th><th>gültig bis</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map(row=>{
            const status=row.traffic_light||'GRAY'
            const greenSites=arr(row.green_sites)
            const open=expanded===row.contract_id
            return <React.Fragment key={row.contract_id}>
              <tr className={'traffic-row '+String(status).toLowerCase()}>
                <td><TrafficBadge status={status}/></td>
                <td><b>{row.partner_display_name||row.contract_name||row.contract_id}</b>{suffix(row.contract_name)&&<small className="traffic-contract-suffix">{suffix(row.contract_name)}</small>}<span className="detail-only tiny">{row.contract_id}</span></td>
                <td>{arr(row.payer_families).join(', ')||'—'}</td>
                <td>{arr(row.product_groups).join(', ')||'—'}</td>
                <td>
                  <b className={row.green_count>0?'traffic-count-ok':''}>{row.green_count||0}/{row.site_count||0} grün</b>
                  {greenSites.length>0&&<small className="traffic-sites">{greenSites.join(', ')}</small>}
                  {(row.yellow_count||0)>0&&<small className="traffic-sites warn">{row.yellow_count} gelb</small>}
                </td>
                <td><span className="traffic-reason">{row.traffic_light_reason}</span></td>
                <td>{row.validity_mode==='SINGLE_SCOPE'?(row.catalog_valid_to||row.latest_valid_to||'—'):'PG-/Anlagen-spezifisch'}</td>
                <td><button className="secondary icon-button" type="button" onClick={()=>toggleDetail(row.contract_id)} title={open?'Details schließen':'Standortdetails laden'}>{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button></td>
              </tr>
              {open&&<tr className="traffic-detail-row"><td colSpan="8">
                {detailBusy===row.contract_id?<div className="traffic-loading"><LoaderCircle className="spin" size={16}/> Standortdetails werden geladen …</div>:
                <div className="traffic-site-detail-grid">
                  {(details[row.contract_id]||[]).map(s=><article key={s.site_id+'-'+s.ik}>
                    <div><b>{s.branch||'Standort'}</b><small>IK {s.ik||'—'}</small></div>
                    <TrafficBadge status={s.traffic_light||'GRAY'} compact/>
                    <p>{s.traffic_light_reason||'Keine eindeutige Bewertung'}</p>
                    <small>{[s.source_status,s.prerequisites_met,s.vtv_status,s.legs&&'LEGS '+s.legs].filter(Boolean).join(' · ')||'Keine weiteren Angaben'}</small>
                  </article>)}
                  {!detailBusy&&!(details[row.contract_id]||[]).length&&<div className="empty-panel">Keine Standortdetails vorhanden.</div>}
                </div>}
              </td></tr>}
            </React.Fragment>
          })}
          {!rows.length&&<tr><td colSpan="8" className="empty">Keine Verträge für den aktuellen Suchfilter.</td></tr>}
        </tbody>
      </table>
    </div>}

    <div className="traffic-pagination">
      <button className="secondary icon-button" type="button" disabled={page===0||loading} onClick={()=>setPage(p=>Math.max(0,p-1))}><ChevronLeft size={17}/></button>
      <span>Seite {page+1} von {totalPages}</span>
      <button className="secondary icon-button" type="button" disabled={page+1>=totalPages||loading} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button>
    </div>
  </div>
}
