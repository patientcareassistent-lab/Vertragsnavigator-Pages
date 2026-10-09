import React,{useEffect,useMemo,useState} from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

const asArray=v=>Array.isArray(v)?v:(v?[v]:[])
const text=v=>v===null||v===undefined||v===''?'—':String(v)
const money=v=>{
  if(v===null||v===undefined||v==='')return '—'
  const n=Number(v)
  return Number.isFinite(n)?n.toLocaleString('de-DE',{style:'currency',currency:'EUR'}):String(v)
}
const yesNo=v=>v===true?'Ja':v===false?'Nein':'—'
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss')
const versionRelevant=(v,pg)=>{
  if(!pg)return true
  const hay=norm([v.version_name,v.original_name].filter(Boolean).join(' '))
  const p=String(pg).replace(/^0+/,'')
  return hay.includes('pg '+pg)||hay.includes('pq '+pg)||hay.includes('pg '+p)||hay.includes('pq '+p)
}
function sourceKeys(contract,position){
  const name=norm([contract?.contract_name,position?.contract,position?.family].filter(Boolean).join(' '))
  const keys=new Set(asArray(contract?.payer_families).map(v=>String(v).toUpperCase()))
  if(name.includes('aok baden-wurttemberg')||name.includes('aok baden württemberg')||name.includes('aok bw'))keys.add('AOKBW')
  if(name.includes('barmer'))keys.add('BARMER')
  if(name.includes('techniker')||name.includes(' tk '))keys.add('TK')
  if(name.includes('dak'))keys.add('DAK')
  if(name.includes('ikk'))keys.add('IKK')
  if(name.includes('kkh'))keys.add('KKH')
  if(name.includes('gwq'))keys.add('GWQ')
  return keys
}
function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function Field({label,value,wide=false}){
  return <div className={'position-field '+(wide?'wide':'')}><small>{label}</small><strong>{value??'—'}</strong></div>
}

export default function PositionDetail({position,contract,site,siteMatch,knowledge=[],canFach=false}){
  const [versions,setVersions]=useState([])
  const [documents,setDocuments]=useState([])
  const [validityScopes,setValidityScopes]=useState([])
  const [loading,setLoading]=useState(false)
  const [sourceBusy,setSourceBusy]=useState(false)
  const [sourceError,setSourceError]=useState('')

  useEffect(()=>{
    let cancelled=false
    async function load(){
      if(!position){setVersions([]);setDocuments([]);setValidityScopes([]);return}
      setLoading(true);setSourceError('')
      try{
        const jobs=[]
        if(position.contract_id){
          jobs.push(
            supabase.from('vn_contract_version_catalog')
              .select('*')
              .eq('contract_id',position.contract_id)
              .order('valid_from',{ascending:false})
              .limit(100)
          )
        }else jobs.push(Promise.resolve({data:[],error:null}))

        if(position.pg){
          jobs.push(
            supabase.from('vn_source_document_catalog')
              .select('*')
              .contains('product_groups_inferred',[String(position.pg)])
              .eq('extension','pdf')
              .limit(150)
          )
        }else jobs.push(Promise.resolve({data:[],error:null}))

        if(position.contract_id&&position.pg){
          jobs.push(
            supabase.from('vn_contract_validity_scope')
              .select('*')
              .eq('contract_id',position.contract_id)
              .eq('pg',String(position.pg))
              .order('authoritative',{ascending:false})
          )
        }else jobs.push(Promise.resolve({data:[],error:null}))

        const [vr,dr,sr]=await Promise.all(jobs)
        if(cancelled)return
        if(vr.error)throw vr.error
        if(dr.error)throw dr.error
        if(sr.error)throw sr.error

        setVersions(vr.data||[])
        setValidityScopes(sr.data||[])
        const keys=sourceKeys(contract,position)
        const seen=new Set()
        const docs=(dr.data||[])
          .filter(d=>!d.archived&&!d.is_duplicate)
          .filter(d=>!d.payer_family_inferred||keys.has(String(d.payer_family_inferred).toUpperCase()))
          .filter(d=>{
            const key=String(d.filename||d.relative_path||d.source_id)
            if(seen.has(key))return false
            seen.add(key);return true
          })
          .sort((a,b)=>String(a.filename||'').localeCompare(String(b.filename||''),'de'))
          .slice(0,8)
        setDocuments(docs)
      }catch(e){
        if(!cancelled)setSourceError(e.message||String(e))
      }finally{
        if(!cancelled)setLoading(false)
      }
    }
    load()
    return()=>{cancelled=true}
  },[position?.position_row_id,position?.contract_id,position?.pg,contract?.contract_id])

  const relevantVersions=useMemo(()=>{
    const matching=versions.filter(v=>versionRelevant(v,position?.pg))
    return (matching.length?matching:versions).slice(0,6)
  },[versions,position?.pg])

  const pgValidity=validityScopes.find(v=>v.authoritative)||validityScopes[0]||null
  const contractValidityText=pgValidity
    ? `${pgValidity.valid_from||'offen'} → ${pgValidity.valid_to||'offen'}`
    : contract?.validity_mode&&contract.validity_mode!=='SINGLE_SCOPE'
      ? 'PG-/Anlagen-spezifisch – keine globale Laufzeit verwenden'
      : `${contract?.first_valid_from||'—'} → ${contract?.catalog_valid_to||contract?.latest_valid_to||'offen'}`

  const canOpen=Boolean(
    /^https?:\/\//i.test(String(position?.source_doc||''))||
    position?.source_upload_id
  )

  async function openSource(){
    if(!position||sourceBusy)return
    setSourceBusy(true);setSourceError('')
    try{
      const direct=String(position.source_doc||'')
      if(/^https?:\/\//i.test(direct)){
        window.open(direct,'_blank','noopener,noreferrer')
        return
      }
      const {data,error}=await supabase.functions.invoke('vn2-source-link',{
        body:{position_row_id:position.position_row_id}
      })
      if(error)throw error
      if(!data?.available||!data?.url)throw new Error('Für diese Position ist aktuell kein Online-Dokument hinterlegt.')
      window.open(data.url,'_blank','noopener,noreferrer')
    }catch(e){
      setSourceError(e.message||String(e))
    }finally{setSourceBusy(false)}
  }

  if(!position)return null

  return <section className="position-detail">
    <div className="position-detail-head">
      <div>
        <small>Ausgewählte Vertragsposition</small>
        <h3>{position.bezeichnung||position.produktart_bezeichnung||position.code||position.pos}</h3>
        <p>{position.contract||contract?.contract_name||position.family||'Vertrag ohne Bezeichnung'}</p>
      </div>
      <div className="position-detail-actions">
        {canOpen&&<button type="button" className="primary inline-button" onClick={openSource} disabled={sourceBusy}>
          <ExternalLink size={15}/>{sourceBusy?'Link wird erstellt …':'Vertrag öffnen'}
        </button>}
      </div>
    </div>

    <div className="position-quickfacts" aria-label="Wesentliche Vertragsangaben">
      <Field label="Produktgruppe" value={text(position.pg)}/>
      <Field label="HMV-Nummer" value={text(position.code)}/>
      <Field label="Vertragsposition" value={text(position.pos)}/>
      <Field label="Preis" value={money(position.preis)}/>
      <Field label="Genehmigung" value={text(position.genehmigung||position.freigrenze)}/>
      <Field label="Verordnung" value={text(position.verordnung)}/>
    </div>
    <details className="position-more-details">
      <summary>Fachdetails, Originalquellen und Vertragsversionen anzeigen</summary>
    <div className="position-detail-grid">
      <div className="position-detail-group">
        <h4>Versorgung / Position</h4>
        <div className="position-field-grid">
          <Field label="Produktgruppe" value={text(position.pg)}/>
          <Field label="HMV / Produktartcode" value={text(position.code)}/>
          <Field label="Position / GPOS" value={text(position.pos)}/>
          <Field label="LKZ / VWKZ" value={text(position.lkz)}/>
          <Field label="Produktart" value={text(position.produktart_bezeichnung||position.bezeichnung)} wide/>
          <Field label="Leistung" value={text(position.leistung)} wide/>
          <Field label="Versorgungsform / -art" value={text(position.versorgungsform)}/>
          <Field label="Versorgungszeitraum" value={[position.versorgungszeitraum,position.versorgungszeitraum_einheit].filter(Boolean).join(' ')||'—'}/>
          <Field label="Gewährleistung" value={text(position.gewaehrleistung)}/>
          <Field label="Mengeneinheit" value={text(position.mengeneinheit)}/>
        </div>
      </div>

      <div className="position-detail-group">
        <h4>Vertrag / Konditionen</h4>
        <div className="position-field-grid">
          <Field label="Kanonischer Vertrag" value={text(contract?.contract_name||position.contract)} wide/>
          <Field label="Kostenträger" value={asArray(contract?.payer_families).join(', ')||text(position.family)}/>
          <Field label="LEGS" value={text(position.legs)}/>
          <Field label="Preis" value={money(position.preis)}/>
          <Field label="Rabatt" value={position.rabatt===null||position.rabatt===undefined?'—':text(position.rabatt)}/>
          <Field label="Genehmigung" value={text(position.genehmigung||position.freigrenze)} wide/>
          <Field label="Verordnung" value={text(position.verordnung)} wide/>
          <Field label="Positionsgültigkeit ab" value={text(position.gueltig_ab)}/>
          <Field label="Positionsgültigkeit bis" value={text(position.gueltig_bis||'offen')}/>
          <Field label={`Vertragsgeltung PG ${position.pg||'—'}`} value={contractValidityText} wide/>
        </div>
      </div>

      <div className="position-detail-group">
        <h4>Standort / Vertragsbeitritt</h4>
        <div className="position-field-grid">
          <Field label="Standort" value={text(site?.branch)}/>
          <Field label="IK" value={text(site?.ik)}/>
          <Field label="Beitritt" value={siteMatch?text(siteMatch.status||'aktiv'):(site?'nicht eindeutig':'Standort nicht gewählt')}/>
          <Field label="Voraussetzungen" value={siteMatch?text(siteMatch.prerequisites_met):'—'}/>
        </div>
      </div>

      <div className="position-detail-group">
        <h4>Dokumentation / Wissen</h4>
        <div className="position-field-grid">
          <Field label="Freigegebenes Vertragswissen" value={knowledge.length?knowledge.length+' Einträge':'kein freigegebener Eintrag'}/>
          <Field label="Autoritative Positionsquelle" value={yesNo(position.authoritative)}/>
          <Field label="Quellseite" value={text(position.source_page)}/>
          <Field label="Quellart" value={text(position.source_kind)}/>
        </div>
      </div>
    </div>

    <div className="position-detail-lower">
      <div className="position-documents">
        <div className="position-subhead"><div><h4>Originaldokumente / Quellen</h4><p>Direkt verknüpfte oder zum Vertrag passende registrierte Quellen.</p></div></div>
        {/^https?:\/\//i.test(String(position.source_doc||''))&&
          <a className="source-row source-link" href={position.source_doc} target="_blank" rel="noreferrer">
            <ExternalLink size={15}/><span><b>Direkte Vertragsquelle</b><small>{position.source_doc}</small></span>
          </a>}
        {documents.map(d=><div className="source-row" key={d.source_id}>
          <FileText size={15}/><span><b>{d.filename||'Originaldokument'}</b><small>{d.relative_path||d.origin||d.source_id}</small></span>
          <Badge tone="info">registriert</Badge>
        </div>)}
        {!documents.length&&!position.source_doc&&!position.source_upload_id&&!loading&&
          <div className="source-empty">Kein Originaldokument eindeutig zur Position verknüpft.</div>}
        {position.source_upload_id&&!/^https?:\/\//i.test(String(position.source_doc||''))&&
          <div className="source-row"><FileText size={15}/><span><b>Hochgeladene Originalquelle</b><small>Privater VN2-Storage · Link wird beim Öffnen signiert.</small></span></div>}
      </div>

      <div className="position-versions">
        <div className="position-subhead"><div><h4>Vertragsversionen</h4><p>{relevantVersions.length?'Passende bzw. aktuelle Versionen im Vertragsstamm.':'Keine Version im Vertragsstamm gefunden.'}</p></div></div>
        {relevantVersions.map(v=><div className="version-row" key={v.contract_version_id}>
          <div><b>{v.version_name||v.original_name||v.contract_version_id}</b><small>{[v.original_name,v.component_type].filter(Boolean).join(' · ')}</small></div>
          <span>{v.valid_from||'—'} → {v.valid_to||'offen'}</span>
        </div>)}
      </div>
    </div>

    {canFach&&<details className="technical-detail">
      <summary>Technische Zuordnung</summary>
      <div className="position-field-grid">
        <Field label="Position-ID" value={text(position.position_row_id)}/>
        <Field label="Vertrag-ID" value={text(position.contract_id)}/>
        <Field label="Match-Status" value={text(position.contract_match_status)}/>
        <Field label="Match-Basis" value={text(position.contract_match_basis)} wide/>
        <Field label="Kandidaten" value={text(position.contract_candidate_count)}/>
        <Field label="Review erforderlich" value={yesNo(position.review_required)}/>
        <Field label="Source Upload" value={text(position.source_upload_id)} wide/>
      </div>
    </details>}

    </details>
    {sourceError&&<div className="alert error position-source-error">{sourceError}</div>}
  </section>
}
