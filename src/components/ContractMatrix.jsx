import React,{useMemo,useRef,useState} from 'react'
import { AlertCircle, ChevronDown,GitCompare,LoaderCircle,Plus,Search,Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { addonMatrixRows,addonNotice,approvalBadge,fmtMoney,groupedMatrix,pairKey,pairTitle } from '../lib/matrixComparison.js'

const MAX_PAYERS=4
const PAGE_LIMIT=75
const MAX_RELATIONS=1200
const relationTitle={REQUIRED:'Erforderlicher Zusatz',OPTIONAL:'Möglicher Zusatz',EXCLUDED:'Ausgeschlossener Zusatz'}

function StatusTag({tone,label,detail}){
  return <span className={'matrix-status matrix-status-'+tone} title={detail||label}>{label}</span>
}
function MatchedPosition({row}){
  const approval=approvalBadge(row)
  const source=String(row.source_doc||'').trim()
  const sourceUrl=/^https?:\/\//i.test(source)
  return <article className="matrix-contract-position">
    <strong>{row.bezeichnung||row.produktart_bezeichnung||'Position ohne Bezeichnung'}</strong>
    <div className="matrix-position-identifiers"><span>HiMiNr: {row.code||'nicht angegeben'}</span><span>Pos.: {row.pos||'—'}</span></div>
    <div className="matrix-position-price"><b>{fmtMoney(row.preis)}</b><StatusTag {...approval}/></div>
    <small className="matrix-contract-name">{row.contract||row.family||'Vertrag nicht zugeordnet'}</small>
    <details className="matrix-card-more">
      <summary>Besonderheiten und Quelle <ChevronDown size={15} aria-hidden="true"/></summary>
      <dl className="matrix-info-list">
        <div><dt>Genehmigung</dt><dd>{approval.detail}</dd></div>
        <div><dt>Verordnung</dt><dd>{row.verordnung||'Nicht eindeutig erfasst'}</dd></div>
        <div><dt>Leistung</dt><dd>{row.leistung||'Keine zusätzliche Leistungsbeschreibung erfasst'}</dd></div>
        <div><dt>Versorgungsform</dt><dd>{row.versorgungsform||'—'}</dd></div>
        {row.freigrenze&&<div><dt>Freigrenze / Hinweis</dt><dd>{row.freigrenze}</dd></div>}
        {row.source_page!=null&&<div><dt>Quellseite</dt><dd>{row.source_page}</dd></div>}
        <div><dt>Originalquelle</dt><dd>{source?(sourceUrl?<a href={source} target="_blank" rel="noopener noreferrer">Vertragsquelle öffnen</a>:source):'Quellenverknüpfung prüfen'}</dd></div>
      </dl>
    </details>
  </article>
}
function AddonItem({addon}){
  const {rel,position}=addon
  const note=addonNotice(rel)
  const approval=approvalBadge(position)
  return <article className="matrix-addon-item">
    <strong>{position.bezeichnung||'Zusatzposition (Bezeichnung nicht hinterlegt)'}</strong>
    <div className="matrix-position-identifiers"><span>HiMiNr: {position.code||'nicht angegeben'}</span><span>Pos.: {position.pos||'—'}</span></div>
    <div className="matrix-addon-tags">
      <StatusTag tone={rel.relation_type==='EXCLUDED'?'reason':'notice'} label={relationTitle[rel.relation_type]||'Geprüfter Zusatz'} detail={relationTitle[rel.relation_type]}/>
      <StatusTag {...approval}/>
      {note&&<StatusTag {...note}/>}
    </div>
    <details className="matrix-card-more">
      <summary>Zusatzvorgaben und Beleg <ChevronDown size={15} aria-hidden="true"/></summary>
      <dl className="matrix-info-list">
        <div><dt>Zuordnung</dt><dd>{relationTitle[rel.relation_type]||rel.relation_type||'Verifizierte Relation'}</dd></div>
        {rel.justification&&<div><dt>Begründung / Regel</dt><dd>{rel.justification}</dd></div>}
        {rel.conditions&&<div><dt>Bedingungen</dt><dd>{rel.conditions}</dd></div>}
        <div><dt>Genehmigung</dt><dd>{approval.detail}</dd></div>
        <div><dt>Originalquelle</dt><dd>{rel.source_id||'Quellen-ID nicht übermittelt'}{rel.source_page?' · S. '+rel.source_page:''}</dd></div>
      </dl>
    </details>
  </article>
}

export default function ContractMatrix({contracts=[]}){
  const families=useMemo(()=>[...new Set(contracts.flatMap(c=>Array.isArray(c.payer_families)?c.payer_families:[]))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'de')),[contracts])
  const [payerRows,setPayerRows]=useState([{family:'',detail:''},{family:'',detail:''}])
  const [pg,setPg]=useState('24')
  const [query,setQuery]=useState('')
  const [comparisons,setComparisons]=useState([])
  const [addons,setAddons]=useState({})
  const [addonPositions,setAddonPositions]=useState({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [addonWarning,setAddonWarning]=useState('')
  const [searched,setSearched]=useState(false)
  const serial=useRef(0)
  function updatePair(index,part,value){setPayerRows(v=>v.map((row,i)=>i===index?{...row,[part]:value,...(part==='family'?{detail:''}:{})}:row))}
  const optionsFor=family=>{
    if(!family)return []
    return [...new Set(contracts.filter(c=>(c.payer_families||[]).includes(family))
      .map(c=>String(c.contract_name||'').split(':')[0].trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'de')).slice(0,250)
  }

  async function search(e){
    e.preventDefault()
    const requestId=++serial.current
    setError('');setAddonWarning('');setSearched(false);setComparisons([]);setAddons({});setAddonPositions({})
    const pairs=payerRows.filter(x=>x.family)
    if(!pairs.length){setError('Mindestens einen Kostenträger auswählen.');return}
    if(!pg.trim()&&!query.trim()){setError('Produktgruppe, Hilfsmittelnummer oder Suchbegriff eingeben.');return}
    if(new Set(pairs.map(pairKey)).size!==pairs.length){setError('Identische Kassenauswahlen bitte entfernen.');return}
    setBusy(true)
    try{
      const term=query.trim()
      const looksLikeHmv=/^\d{2}\.\d{2}/.test(term)
      const groups=await Promise.all(pairs.map(async(pair)=>{
        const {data,error:dbError}=await supabase.rpc('vn_search_positions_v13',{
          p_payer:pair.family,
          p_payer_detail:pair.detail||null,
          p_pg:pg.trim()||null,
          p_query:!looksLikeHmv&&term?term:null,
          p_hmv:looksLikeHmv?term:null,
          p_limit:PAGE_LIMIT
        })
        if(dbError)throw new Error(pairTitle(pair)+': '+dbError.message)
        return {pair,items:data||[]}
      }))
      if(requestId!==serial.current)return
      setComparisons(groups)
      setSearched(true)
      const ids=[...new Set(groups.flatMap(g=>g.items.map(row=>row.position_row_id).filter(Boolean)))]
      if(!ids.length)return
      try{
        const {data:relations,error:relError}=await supabase.from('vn_position_addons')
          .select('base_position_row_id,addon_position_row_id,relation_type,justification,conditions,source_id,source_page,verified_at')
          .in('base_position_row_id',ids)
          .not('verified_at','is',null)
          .limit(MAX_RELATIONS)
        if(relError)throw relError
        if(requestId!==serial.current)return
        const baseMap={}
        for(const rel of relations||[])(baseMap[rel.base_position_row_id] ||= []).push(rel)
        const targetIds=[...new Set((relations||[]).map(x=>x.addon_position_row_id).filter(Boolean))]
        let targetMap={}
        if(targetIds.length){
          const {data:targets,error:targetsError}=await supabase.from('vn_position_catalog')
            .select('position_row_id,code,pos,bezeichnung,preis,genehmigung,freigrenze,source_doc')
            .in('position_row_id',targetIds).limit(targetIds.length)
          if(targetsError)throw targetsError
          targetMap=Object.fromEntries((targets||[]).map(t=>[t.position_row_id,t]))
          if((targets||[]).length<targetIds.length)setAddonWarning('Einige Zusatzpositionsstammdaten fehlen. Bitte die Quellenzuordnung prüfen.')
        }
        if(requestId!==serial.current)return
        setAddons(baseMap)
        setAddonPositions(targetMap)
        if((relations||[]).length===MAX_RELATIONS)setAddonWarning('Zusatzrelationen möglicherweise unvollständig. Suche bitte einschränken.')
      }catch(relError){
        if(requestId===serial.current)setAddonWarning('Geprüfte Zusatzpositionen konnten nicht vollständig geladen werden: '+(relError.message||String(relError)))
      }
    }catch(e){
      if(requestId===serial.current){setSearched(false);setError(e.message||String(e))}
    }finally{
      if(requestId===serial.current)setBusy(false)
    }
  }

  const comparisonRows=useMemo(()=>groupedMatrix(comparisons),[comparisons])
  const total=comparisons.reduce((sum,c)=>sum+c.items.length,0)
  const verifiedAddons=Object.values(addons).reduce((n,items)=>n+items.length,0)

  return <div className="matrix-workspace">
    <section className="panel">
      <div className="sectionbar"><div><h2>Kassenübergreifende Positionsmatrix</h2><p>Grund- und Vertragspositionen je HMV-Code nebeneinander. Gleicher Code bedeutet nicht automatisch gleiche Leistung.</p></div><span className="badge">Quellenbewusster Vergleich</span></div>
      <form onSubmit={search} className="formstack">
        <div className="formgrid">
          <label>Produktgruppe<input value={pg} onChange={e=>setPg(e.target.value)} maxLength={2} placeholder="z. B. 24"/></label>
          <label>Hilfsmittelnummer / Freitext<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="z. B. 24.00 / Unterschenkelschaft / Interim"/></label>
        </div>
        <h3 className="matrix-compare-label">Kassen / Regionen vergleichen</h3>
        {payerRows.map((row,i)=><div key={i} className="matrix-payer-row">
          <label>Kostenträger<select value={row.family} onChange={e=>updatePair(i,'family',e.target.value)}><option value="">Kasse auswählen</option>{families.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
          <label>Kasse / Region (optional)<select value={row.detail} disabled={!row.family} onChange={e=>updatePair(i,'detail',e.target.value)}><option value="">Alle dieser Familie</option>{optionsFor(row.family).map(x=><option key={x} value={x}>{x}</option>)}</select></label>
          <button type="button" className="secondary" aria-label={'Kassenauswahl '+(i+1)+' entfernen'} title="Auswahl entfernen" disabled={payerRows.length<2} onClick={()=>setPayerRows(rows=>rows.filter((_,j)=>i!==j))}><Trash2 size={16}/></button>
        </div>)}
        <div className="matrix-actions">
          <button type="button" className="secondary" disabled={payerRows.length>=MAX_PAYERS} onClick={()=>setPayerRows(rows=>[...rows,{family:'',detail:''}])}><Plus size={16}/> Weitere Kasse</button>
          <button type="submit" className="primary" disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Search size={16}/>} Matrix auswerten</button>
        </div>
      </form>
      {error&&<div className="alert error" role="alert">{error}</div>}
      <p className="matrix-scope-note"><AlertCircle size={17} aria-hidden="true"/> Positionen stehen nur bei übereinstimmender Produktgruppe und HMV-Klassifikation in einer gemeinsamen Zeile. Andere HMV-Nummern werden ohne bestätigte Äquivalenz nicht gleichgesetzt. Zusatzrelationen erscheinen nur nach Quellenprüfung.</p>
    </section>
    {searched&&!busy&&<section className="panel spaced matrix-results">
      <div className="sectionbar"><div><h2>Grund- und Vertragspositionen</h2><p>Die Kassen stehen in festen Spalten. Unbelegte Zuordnungen bleiben leer; innerhalb einer Zelle können mehrere Vertragspositionen vorkommen.</p></div><span className="badge">{total} Positionen · {comparisonRows.length} HMV-/Einzelzeilen</span></div>
      {comparisons.some(g=>g.items.length===PAGE_LIMIT)&&<p className="result-limit-note">Bei mindestens einer Kasse wurden 75 Treffer geladen. Der Vergleich kann unvollständig sein. Bitte Suche weiter eingrenzen.</p>}
      {addonWarning&&<div className="alert error" role="status">{addonWarning}</div>}
      <div className="matrix-legend" aria-label="Bedeutung der Farbcodes">
        <StatusTag tone="free" label="Genehmigungsfrei"/>
        <StatusTag tone="approval" label="Genehmigung / KVA"/>
        <StatusTag tone="notice" label="Hinweise"/>
        <StatusTag tone="reason" label="Begründung / Ausschluss"/>
        <StatusTag tone="unknown" label="Ungeklärt"/>
      </div>
      <div className="matrix-tablewrap" role="region" tabIndex={0} aria-label="Positionsvergleich, horizontal scrollbar">
        <table className="matrix-table">
          <thead><tr><th scope="col" className="matrix-axis">HMV / Zuordnung</th>{comparisons.map(g=><th scope="col" key={pairKey(g.pair)}><strong>{pairTitle(g.pair)}</strong><small>{g.items.length} Suchtreffer</small></th>)}</tr></thead>
          <tbody>
            {comparisonRows.map(group=>{
              const verifiedRows=addonMatrixRows(group,comparisons,addons,addonPositions)
              return <React.Fragment key={group.key}>
                <tr className="matrix-base-row">
                  <th scope="row" className="matrix-axis">
                    <span className="matrix-axis-type">{group.code?'HMV-Klassifikation':'Einzelposition'}</span>
                    <strong>{group.code||'Keine gemeinsame HMV-Nummer'}</strong>
                    {group.pg&&<small>PG {group.pg}</small>}
                    {group.code&&<small>Gleicher Code, Gleichwertigkeit nicht bestätigt</small>}
                  </th>
                  {comparisons.map(g=><td key={pairKey(g.pair)} className={!group.cells[pairKey(g.pair)]?'matrix-empty':''}>
                    {(group.cells[pairKey(g.pair)]||[]).map((row,i)=><MatchedPosition key={row.position_row_id||i} row={row}/>)}
                  </td>)}
                </tr>
                {verifiedRows.map((addonRow,i)=><tr className="matrix-addon-row" key={addonRow.key+'-'+i}>
                  <th scope="row" className="matrix-axis"><span className="matrix-axis-type">Quellengeprüfter Zusatz</span><strong>{addonRow.code||'Zusatz ohne gemeinsamen HMV-Code'}</strong></th>
                  {comparisons.map(g=><td key={pairKey(g.pair)} className={!addonRow.cells[pairKey(g.pair)]?'matrix-empty':''}>
                    {(addonRow.cells[pairKey(g.pair)]||[]).map((item,k)=><AddonItem key={item.rel.relation_id||item.rel.addon_position_row_id+'-'+k} addon={item}/>)}
                  </td>)}
                </tr>)}
              </React.Fragment>
            })}
            {!comparisonRows.length&&<tr><td colSpan={comparisons.length+1} className="empty">Keine Vertragspositionen gefunden. Weitere Suchkriterien prüfen.</td></tr>}
          </tbody>
        </table>
      </div>
      <details className="matrix-info-panel"><summary>Zusatzpositionen, Begründungen und Datenqualität</summary>
        <p>{verifiedAddons?verifiedAddons+' quellengeprüfte Zusatzrelationen in dieser Auswahl.':'Für diese Auswahl sind keine quellengeprüften Zusatzrelationen vorhanden. Dies bedeutet nicht, dass keine Zusätze erforderlich oder zulässig sind.'}</p>
        <p>Grün = ausdrücklich genehmigungsfrei; Gelb = Genehmigung/KVA laut Vertragsangabe; Orange = Hinweis/unklare Angabe; Rot = ausdrückliche Begründung bzw. Ausschluss. Die Farbkodierung ersetzt keine Versorgungsprüfung.</p>
        <p>Unterschiedliche HMV- oder kasseninterne Nummern werden erst nach dokumentierter Äquivalenzprüfung zusammengeführt. Eine passende Freitextbezeichnung ist kein Gleichwertigkeitsnachweis.</p>
      </details>
    </section>}
  </div>
}
