import React,{useMemo,useState} from 'react'
import { GitCompare,LoaderCircle,Plus,Search,Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const MAX_PAYERS=4
const fmtMoney=n=>n===null||n===undefined||n===''?'—':Number(n).toLocaleString('de-DE',{style:'currency',currency:'EUR'})
const formatAddonType={REQUIRED:'Erforderlicher Zusatz',OPTIONAL:'Möglicher Zusatz',EXCLUDED:'Ausgeschlossener Zusatz'}
function groupName(family,detail){return detail?family+' · '+detail:family}
function pairKey(pair){return pair.family+'::'+pair.detail}

export default function ContractMatrix({contracts=[]}){
  const families=useMemo(()=>[...new Set(contracts.flatMap(c=>Array.isArray(c.payer_families)?c.payer_families:[]))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'de')),[contracts])
  const [payerRows,setPayerRows]=useState([{family:'',detail:''},{family:'',detail:''}])
  const [pg,setPg]=useState('24')
  const [query,setQuery]=useState('')
  const [rows,setRows]=useState([])
  const [addons,setAddons]=useState({})
  const [addonPositions,setAddonPositions]=useState({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [searched,setSearched]=useState(false)
  const [expanded,setExpanded]=useState({})
  function updatePair(index,part,value){setPayerRows(v=>v.map((row,i)=>i===index?{...row,[part]:value,...(part==='family'?{detail:''}:{})}:row))}
  const optionsFor=(family)=>{
    if(!family)return []
    return [...new Set(contracts.filter(c=>(c.payer_families||[]).includes(family))
      .map(c=>String(c.contract_name||'').split(':')[0].trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'de')).slice(0,250)
  }
  async function search(e){
    e.preventDefault();setError('');setSearched(true);setRows([]);setAddons({});setAddonPositions({})
    const pairs=payerRows.filter(x=>x.family)
    if(!pairs.length){setError('Mindestens einen Kostenträger auswählen.');return}
    if(!pg.trim()&&!query.trim()){setError('Produktgruppe, Hilfsmittelnummer oder Suchbegriff eingeben.');return}
    if(new Set(pairs.map(pairKey)).size!==pairs.length){setError('Identische Kassenauswahlen bitte entfernen.');return}
    setBusy(true)
    try{
      const raw=query.trim()
      const looksLikeHmv=/^[0-9]{2}\.[0-9]{2}/.test(raw)
      const promises=pairs.map(async(pair)=>{
        const {data,error:dbError}=await supabase.rpc('vn_search_positions_v13',{
          p_payer:pair.family,
          p_payer_detail:pair.detail||null,
          p_pg:pg.trim()||null,
          p_query:!looksLikeHmv&&raw?raw:null,
          p_hmv:looksLikeHmv?raw:null,
          p_limit:75,
        })
        if(dbError)throw new Error(groupName(pair.family,pair.detail)+': '+dbError.message)
        return {pair,items:data||[]}
      })
      const groups=await Promise.all(promises)
      const grouped=groups.flatMap(({pair,items})=>items.map(x=>({...x,comparison_label:groupName(pair.family,pair.detail)})))
      setRows(grouped)
      const ids=[...new Set(grouped.map(x=>x.position_row_id).filter(Boolean))]
      if(ids.length){
        const {data:relations,error:relationError}=await supabase.from('vn_position_addons')
          .select('base_position_row_id,addon_position_row_id,relation_type,justification,conditions,source_id,source_page,verified_at')
          .in('base_position_row_id',ids.slice(0,320))
          .not('verified_at','is',null)
          .limit(500)
        if(relationError)throw relationError
        const byBase={}
        for(const rel of relations||[])(byBase[rel.base_position_row_id] ||= []).push(rel)
        setAddons(byBase)
        const targetIds=[...new Set((relations||[]).map(x=>x.addon_position_row_id))]
        if(targetIds.length){
          const {data:targetData,error:targetError}=await supabase.from('vn_position_catalog')
            .select('position_row_id,code,pos,bezeichnung,preis,source_doc')
            .in('position_row_id',targetIds.slice(0,250)).limit(250)
          if(targetError)throw targetError
          setAddonPositions(Object.fromEntries((targetData||[]).map(x=>[x.position_row_id,x])))
        }
      }
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }
  const byPayer=useMemo(()=>payerRows.filter(x=>x.family).map(p=>({
    pair:p,items:rows.filter(r=>r.comparison_label===groupName(p.family,p.detail))
  })),[payerRows,rows])
  return <div className="matrix-workspace">
    <section className="panel">
      <div className="sectionbar"><div><h2>Kassenübergreifende Positionsmatrix</h2><p>Freitext- und Hilfsmittelnummernsuche mit ausgewählten Kostenträgern, Preisen, Genehmigung und verifizierten Zusätzen.</p></div><span className="badge">Quellengebundene Zusätze</span></div>
      <form onSubmit={search} className="formstack">
        <div className="formgrid">
          <label>Produktgruppe<input value={pg} onChange={e=>setPg(e.target.value)} maxLength={2} placeholder="z. B. 24"/></label>
          <label>Hilfsmittelnummer / Freitext<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="z. B. 24.00 / Unterschenkelschaft / Interim"/></label>
        </div>
        <h3 style={{margin:'9px 0 0',fontSize:14}}>Kassen / Regionen vergleichen</h3>
        {payerRows.map((row,i)=><div key={i} className="matrix-payer-row">
          <label>Kostenträger<select value={row.family} onChange={e=>updatePair(i,'family',e.target.value)}><option value="">Kasse auswählen</option>{families.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
          <label>Kasse / Region (optional)<select value={row.detail} disabled={!row.family} onChange={e=>updatePair(i,'detail',e.target.value)}><option value="">Alle dieser Familie</option>{optionsFor(row.family).map(x=><option key={x} value={x}>{x}</option>)}</select></label>
          <button type="button" className="secondary" title="Auswahl entfernen" disabled={payerRows.length<2} onClick={()=>setPayerRows(rows=>rows.filter((_,j)=>i!==j))}><Trash2 size={16}/></button>
        </div>)}
        <div className="matrix-actions">
          <button type="button" className="secondary" disabled={payerRows.length>=MAX_PAYERS} onClick={()=>setPayerRows(rows=>[...rows,{family:'',detail:''}])}><Plus size={16}/> Weitere Kasse</button>
          <button type="submit" className="primary" disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Search size={16}/>} Matrix auswerten</button>
        </div>
      </form>
      {error&&<div className="alert error" role="alert">{error}</div>}
      <div className="note" style={{marginTop:12}}>Nur mit Vertragsquelle bestätigte Zusatzrelationen gelten als erforderlich, möglich oder ausgeschlossen. „Keine geprüfte Zusatzzuordnung“ bedeutet nicht, dass keine Zusätze zulässig oder notwendig sind. Treffer gleicher Suchbegriffe sind nicht automatisch medizinisch oder vertraglich identisch.</div>
    </section>
    {searched&&!busy&&<section className="panel spaced">
      <div className="sectionbar"><div><h2>Vergleichsergebnisse</h2><p>Die Ergebnisse sind nach Kostenträger getrennt und zeigen den jeweiligen Vertrag.</p></div><span className="badge">{rows.length} Positionen</span></div>
      <div className="matrix-comparison">
        {byPayer.map(g=><div className="matrix-payer-column" key={pairKey(g.pair)}>
          <h3>{groupName(g.pair.family,g.pair.detail)}</h3>
          <small>{g.items.length} Suchtreffer{g.items.length===75?' · möglicherweise weitere Treffer':''}</small>
          {g.items.map(row=>{
            const rels=addons[row.position_row_id]||[]
            const open=Boolean(expanded[row.comparison_label+'|'+row.position_row_id])
            return <article className="matrix-position" key={row.comparison_label+'|'+row.position_row_id}>
              <div className="matrix-position-main"><b>{row.bezeichnung||row.produktart_bezeichnung||'Position ohne Bezeichnung'}</b><small>{row.code||'HMV offen'} · Position {row.pos||'—'} · PG {row.pg||'—'}</small><strong>{fmtMoney(row.preis)}</strong></div>
              <small className="matrix-contract-name">{row.contract||row.family||'Vertrag nicht zugeordnet'}</small>
              <button type="button" className="secondary" onClick={()=>setExpanded(x=>({...x,[row.comparison_label+'|'+row.position_row_id]:!open}))}>{open?'Details schließen':'Vorgaben und Zusätze anzeigen'}</button>
              {open&&<div className="matrix-extra">
                <div><b>Genehmigung:</b> {row.genehmigung||row.freigrenze||'Nicht eindeutig erfasst'}</div>
                <div><b>Verordnung:</b> {row.verordnung||'Nicht eindeutig erfasst'}</div>
                <div><b>Versorgungsform:</b> {row.versorgungsform||'—'}</div>
                <div><b>Originalquelle:</b> {row.source_doc||'Quellenverknüpfung prüfen'}</div>
                <b>Geprüfte Zusätze</b>
                {rels.map(r=><div className="matrix-addon" key={r.addon_position_row_id}><b>{formatAddonType[r.relation_type]}</b> · {addonPositions[r.addon_position_row_id]?.bezeichnung||r.addon_position_row_id}<p>{r.justification}{r.conditions?' · '+r.conditions:''} · Quelle: {r.source_id||'—'}{r.source_page?' S. '+r.source_page:''}</p></div>)}
                {!rels.length&&<small>Keine quellengeprüfte Zusatzzuordnung hinterlegt – fachliche Prüfung erforderlich.</small>}
              </div>}
            </article>
          })}
          {!g.items.length&&<div className="empty-panel">Keine zu diesem Filter ermittelten Vertragspositionen.</div>}
        </div>)}
      </div>
    </section>}
  </div>
}
