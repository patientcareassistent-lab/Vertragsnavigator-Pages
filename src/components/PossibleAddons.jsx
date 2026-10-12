import React,{useEffect,useMemo,useRef,useState} from 'react'
import { AlertTriangle,ArrowLeft,ChevronRight,LoaderCircle,X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { approvalBadge,fmtMoney } from '../lib/matrixComparison.js'
import './PossibleAddons.css'

const CATEGORIES=[
  {id:'VERIFIED',title:'Quellengeprüfte Beziehungen',subtitle:'Vertraglich zugeordnete Zusatzpositionen; die Versorgungsvoraussetzungen bleiben gesondert zu prüfen.'},
  {id:'REVIEW_CANDIDATE',title:'Konkrete Zuordnungsvorschläge',subtitle:'Haupt- und Zusatzposition bereits verknüpft, aber nicht fachlich freigegeben.'},
  {id:'REFERENCED_BY_ADDON',title:'Im Zusatz ausdrücklich genannte Hauptposition',subtitle:'Automatisch aus Positionsnummern und Vertragsbedingungen erkannt – noch nicht fachlich freigegeben.'},
  {id:'MENTIONED_IN_BASE',title:'In der Hauptposition genannte Zusatznummern',subtitle:'Die gewählte Position nennt diese Nummern. Ob sie zusätzlich abrechenbar oder im Preis enthalten sind, ist ungeklärt.'},
  {id:'SAME_CONTRACT_ONLY',title:'Weitere Positionen im selben Vertrag',subtitle:'Kein direkter Bezug zur gewählten Hauptposition nachgewiesen. Nur zur weiteren Recherche.'},
]
const RELATIONS={REQUIRED:'Erforderlicher Zusatz',OPTIONAL:'Möglicher Zusatz',EXCLUDED:'Nicht kombinierbar'}
const normalizeText=x=>String(x||'').trim()
function conditionMessage(item){
  const str=normalizeText(item.conditions)
  if(!str)return ''
  return str.length>700?str.slice(0,700)+' …':str
}
function ExtraRow({item,onExplore,canExplore}){
  const checked=item.match_basis==='VERIFIED'
  const approval=approvalBadge(item)
  const rawCondition=normalizeText(item.conditions).toLocaleLowerCase('de')
  const included=/(in (der|den) (jeweiligen )?grundposition enthalten|im preis (des zusatzes )?enthalten|bereits enthalten|nicht gesondert abrechenbar|nicht separat abrechenbar)/.test(rawCondition)
  const excluded=/(nicht zusammen mit|kann nicht in verbindung|nicht ansetzbar|nicht abrechenbar|nicht kombinierbar)/.test(rawCondition)
  const justification=/(begründung|medizinische notwendigkeit|zu begründen)/.test(rawCondition)
  const price=item.preis===null||item.preis===undefined?'Preis nicht erfasst':fmtMoney(item.preis)
  const source=normalizeText(item.source_doc)
  return <article className={'possible-addon-item '+(checked?'is-verified':'is-unverified')}>
    <div className="possible-addon-line">
      <div>
        <b>{item.bezeichnung||'Zusatzposition ohne Bezeichnung'}</b>
        <small>HiMiNr {item.code||'—'} · Vertragsposition {item.pos||'—'} · {price}</small>
      </div>
      <span className={'possible-addon-status '+(checked?'verified':'pending')}>{checked?'Quellengeprüft':'Nicht freigegeben'}</span>
    </div>
    <div className="possible-addon-tags">
      {included&&<span className="addon-tag-blocked" title="Mögliche Inklusivleistung – Originalvertrag prüfen">Im Grundpreis enthalten?</span>}
      {excluded&&<span className="addon-tag-blocked" title="Mögliche nicht zulässige Kombination – Originalvertrag prüfen">Kombination eingeschränkt?</span>}
      {justification&&<span className="addon-tag-note">Begründung prüfen</span>}
      {item.relation_type&&<span className={item.relation_type==='EXCLUDED'?'addon-tag-blocked':'addon-tag-note'}>{checked?(RELATIONS[item.relation_type]||item.relation_type):'Vorschlag: '+(RELATIONS[item.relation_type]||item.relation_type)}</span>}
      <span className={'possible-addon-approval '+approval.tone} title={approval.detail}>{approval.label}</span>
    </div>
    <p className="possible-addon-reason">{item.reason}</p>
    {conditionMessage(item)&&<details className="possible-addon-rule">
      <summary>Vertragsbedingung / Hinweis anzeigen</summary>
      <p>{conditionMessage(item)}</p>
    </details>}
    <div className="possible-addon-footer">
      <small>{source?(/^https?:\/\//i.test(source)?<a href={source} target="_blank" rel="noopener noreferrer">Quelle öffnen</a>:'Quelle: '+source):'Originaldokument nicht direkt verknüpft'}
        {item.source_page!=null?' · Seite '+item.source_page:''}</small>
      {canExplore&&<button type="button" className="secondary possible-addon-explore" onClick={()=>onExplore(item)}>
        Zusätze zu dieser Position <ChevronRight size={14} aria-hidden="true"/>
      </button>}
    </div>
  </article>
}

/** Explizit nur Rechercheanzeige; keine Versorgungs- oder Abrechnungsfreigabe. */
export default function PossibleAddons({position,onClose}){
  const [path,setPath]=useState([position])
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const dialogRef=useRef(null)
  const current=path[path.length-1]
  const rowId=current?.position_row_id

  useEffect(()=>{
    const keyHandler=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}}
    document.addEventListener('keydown',keyHandler)
    dialogRef.current?.focus()
    return()=>document.removeEventListener('keydown',keyHandler)
  },[onClose])

  useEffect(()=>{
    let currentRequest=true
    setData(null);setError('');setLoading(true)
    async function fetchAddons(){
      try{
        if(!rowId)throw new Error('Keine eindeutige Positions-ID vorhanden.')
        const {data:result,error:rpcError}=await supabase.rpc('vn_possible_position_extras_v1',{p_base_position_row_id:rowId})
        if(rpcError)throw rpcError
        if(!result?.position_found)throw new Error('Die gewählte Vertragsposition ist nicht mehr aktuell oder nicht verfügbar.')
        if(currentRequest)setData(result)
      }catch(e){
        if(currentRequest)setError(e?.message||String(e))
      }finally{if(currentRequest)setLoading(false)}
    }
    fetchAddons()
    return()=>{currentRequest=false}
  },[rowId])

  const groups=useMemo(()=>{
    const items=Array.isArray(data?.items)?data.items:[]
    return CATEGORIES.map(cat=>({...cat,items:items.filter(x=>x.match_basis===cat.id)}))
  },[data])
  const actionable=groups.filter(g=>g.id!=='SAME_CONTRACT_ONLY').reduce((n,g)=>n+g.items.length,0)
  function drill(item){
    if(path.some(p=>p.position_row_id===item.position_row_id))return
    setPath(list=>[...list,{...item,contract:current.contract,contract_id:current.contract_id}])
  }
  return <div className="possible-addons-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="possible-addons-dialog" role="dialog" aria-modal="true" aria-labelledby="possibleAddonsTitle" tabIndex={-1} ref={dialogRef}>
      <header className="possible-addons-header">
        <div className="possible-addons-header-title">
          <small>Vertragsnavigator · Zusatzpositions-Recherche</small>
          <h2 id="possibleAddonsTitle">Mögliche Zusätze zur ausgewählten Position</h2>
          <p><b>{current?.bezeichnung||current?.pos||'Unbekannte Position'}</b> · PG {current?.pg||position.pg||'—'} · {current?.pos||'—'}</p>
          <small>{current?.contract||position.contract||'Vertragszuordnung prüfen'}</small>
        </div>
        <button type="button" className="secondary possible-addons-close" aria-label="Zusatzpositionen schließen" onClick={onClose}><X size={20}/></button>
      </header>
      <div className="possible-addons-body">
        {path.length>1&&<button type="button" className="secondary possible-addons-back" onClick={()=>setPath(p=>p.slice(0,-1))}><ArrowLeft size={15}/> Zur vorherigen Position</button>}
        <div className="possible-addons-warning"><AlertTriangle size={18} aria-hidden="true"/>
          <p><b>Wichtig:</b> Ein angezeigter Vorschlag ist keine Abrechnungsfreigabe. Vertragsgeltung, Kombination, Inklusivleistungen, Indikation, Genehmigung, PQ und Beitritt müssen geprüft werden. Nur ausdrücklich als quellengeprüft markierte Beziehungen wurden fachlich zugeordnet.</p>
        </div>
        {loading&&<p className="possible-addons-loader" role="status"><LoaderCircle className="spin" size={17}/> Zusatzpositionen werden vertragsbezogen gesucht …</p>}
        {error&&<div className="alert error" role="alert">{error}</div>}
        {!loading&&!error&&data&&<>
          {!data.contract_id&&<p className="alert error">Keine eindeutige Vertragszuordnung. Eine vertragsbezogene Zusatzsuche ist derzeit nicht möglich.</p>}
          <p className="possible-addons-count">{actionable} Hinweise mit Positionsbezug oder bereits erfasstem Zuordnungsvorschlag
            {groups[4].items.length>0?' · '+groups[4].items.length+' weitere Vertragspositionen ohne Zuordnungsnachweis':''}
          </p>
          {!data.items?.length&&<p className="possible-addons-empty">Für diese Position wurden derzeit keine möglichen Zusatzpositionen erkannt. Das bedeutet nicht, dass vertraglich keine Zusätze möglich sind.</p>}
          {groups.map(group=>{
            if(!group.items.length)return null
            const content=<div className="possible-addons-items">
              {group.items.map((item,i)=><ExtraRow key={item.position_row_id+'-'+group.id+'-'+i}
                item={item} onExplore={drill}
                canExplore={Boolean(item.position_row_id)&&path.length<5&&!path.some(p=>p.position_row_id===item.position_row_id)}/>)}
            </div>
            return group.id==='SAME_CONTRACT_ONLY'?
              <details key={group.id} className="possible-addons-group possible-addons-unlinked">
                <summary>{group.title} ({group.items.length}) · ungeklärte Zuordnung</summary>
                <p>{group.subtitle}</p>{content}
              </details>
            :<section key={group.id} className="possible-addons-group">
              <h3>{group.title} ({group.items.length})</h3>
              <p>{group.subtitle}</p>{content}
            </section>
          })}
          {data.truncated&&<p className="possible-addons-empty">Es gibt weitere Ergebnisse. Bitte Vertrags- und Positionsangaben gezielt prüfen.</p>}
        </>}
      </div>
      <footer className="possible-addons-dialog-footer"><span>Nur Informationen aus demselben Vertrag und derselben Produktgruppe.</span>
        <button type="button" className="secondary" onClick={onClose}>Schließen</button>
      </footer>
    </section>
  </div>
}
