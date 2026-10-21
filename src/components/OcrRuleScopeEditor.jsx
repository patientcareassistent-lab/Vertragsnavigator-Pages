import React,{useEffect,useState} from 'react'
import {AlertTriangle,CheckCircle2,LoaderCircle,ShieldCheck,Save,ChevronDown} from 'lucide-react'
import {getOcrRuleScopeOptions,saveOcrRuleScope} from '../lib/contractUpload.js'
import {ocrScopeIssues} from '../lib/ocrRuleScopePolicy.js'
import OcrIkAccessionEvidence from './OcrIkAccessionEvidence.jsx'
import './OcrRuleScopeEditor.css'

const EMPTY={
  payer_mode:'UNRESOLVED',payer:'',
  pg_mode:'UNRESOLVED',pg:'',
  ik_mode:'UNRESOLVED',ik:'',
  legs_mode:'UNRESOLVED',legs:'',
  contract_version_id:'',valid_from:'',valid_to:'',evidence_note:''
}
const DIMENSIONS=[
  ['payer','Kostenträgerfamilie','payer_families'],
  ['pg','Produktgruppe (PG)','product_groups'],
  ['ik','Standort-IK','active_sites'],
  ['legs','LEGS','legs']
]
function normalizedInitial(scope){
  if(!scope)return {...EMPTY}
  const next={...EMPTY,...scope}
  for(const [key] of DIMENSIONS)if(next[key+'_mode']!=='EXACT')next[key]=''
  return Object.fromEntries(Object.entries(next).map(([key,value])=>[key,value??'']))
}
export default function OcrRuleScopeEditor({uploadId,item,onUpdated=()=>{}}){
  const [expanded,setExpanded]=useState(false)
  const [scope,setScope]=useState(()=>normalizedInitial(item.scope))
  const [options,setOptions]=useState(null)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [sourceConfirmed,setSourceConfirmed]=useState(false)
  useEffect(()=>{
    setScope(normalizedInitial(item.scope))
    setSourceConfirmed(false)
  },[item.candidate_id,item.scope?.updated_at,item.scope?.scope_status])
  function update(field,value){setScope(p=>({...p,[field]:value}))}
  async function toggle(){
    if(expanded){setExpanded(false);return}
    setExpanded(true)
    if(options)return
    setBusy('options')
    setError('')
    try{
      setOptions(await getOcrRuleScopeOptions(uploadId))
    }catch(e){setError(e?.message||'Vertragsmetadaten nicht verfügbar')}
    finally{setBusy('')}
  }
  function valuesFor(kind){
    if(!options)return []
    if(kind==='ik')return (options.active_sites||[]).map(x=>({value:x.ik,label:x.ik+' · '+(x.branch||x.site_id||'Standort')}))
    return (options[DIMENSIONS.find(([k])=>k===kind)?.[2]]||[]).map(x=>({value:String(x),label:String(x)}))
  }
  const verified=item.scope?.scope_status==='VERIFIED'
  const issues=ocrScopeIssues(scope,sourceConfirmed)
  const complete=issues.length===0
  async function save(verify){
    setBusy('save');setError('');setMessage('')
    try{
      const result=await saveOcrRuleScope(uploadId,item.candidate_id,{
        ...scope,source_confirmed:sourceConfirmed
      },verify)
      setMessage(result.message||'Geltungsbereich gespeichert.')
      if(verify)setSourceConfirmed(false)
      await onUpdated()
    }catch(e){setError(e?.message||'Geltungsbereich konnte nicht gespeichert werden')}
    finally{setBusy('')}
  }
  return <div className="ocr-scope-editor">
    <div className="ocr-scope-header">
      <div>
        <b>Geltungsbereich</b>
        <small>{verified?'Fachlich dokumentiert – Vertragsbeitritt und Versorgung weiterhin separat prüfen':
          item.scope?'Arbeitsstand, nicht bestätigt':'Noch nicht geklärt – keine automatische Vertragsgeltung'}</small>
      </div>
      <button type="button" className="secondary inline-button" onClick={toggle}>
        <ChevronDown size={15} className={expanded?'ocr-scope-open':''}/>
        {expanded?'Eingabe schließen':'Geltung festlegen'}
      </button>
    </div>
    {expanded&&<>
      <div className="ocr-scope-notice"><AlertTriangle size={16}/>
        „Für gesamten Vertragsumfang“ bedeutet nur, dass die Klausel innerhalb dieser Dimension keine zusätzliche Einschränkung enthält.
        Es ist <b>kein Nachweis</b> für einen Vertragsbeitritt, eine gültige PQ oder die Versorgung eines konkreten Standorts.
      </div>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {message&&<div className="alert success">{message}</div>}
      {busy==='options'&&<div className="ocr-scope-loading"><LoaderCircle className="spin" size={15}/> Vertragsstamm wird geladen …</div>}
      {options&&<>
        <div className="ocr-scope-grid">
          {DIMENSIONS.map(([key,label])=><div className="ocr-scope-dimension" key={key}>
            <label>{label}
              <select aria-label={label+' Geltungsart'} value={scope[key+'_mode']} onChange={e=>{
                update(key+'_mode',e.target.value)
                if(e.target.value!=='EXACT')update(key,'')
              }}>
                <option value="UNRESOLVED">Nicht geklärt</option>
                <option value="EXACT">Konkreter Wert</option>
                <option value="ALL_IN_CONTRACT">Für gesamten Vertragsumfang (Quellenbeleg erforderlich)</option>
              </select>
            </label>
            {scope[key+'_mode']==='EXACT'&&<label>{label} – Wert
              <input aria-label={label+' Wert'} value={scope[key]} maxLength={key==='payer'?120:12}
                list={'ocr-scope-'+key+'-'+item.candidate_id}
                placeholder={key==='pg'?'z. B. 24':key==='ik'?'9 Ziffern':key==='legs'?'z. B. 1593114':'Kostenträger'}
                onChange={e=>update(key,e.target.value)}/>
              <datalist id={'ocr-scope-'+key+'-'+item.candidate_id}>
                {valuesFor(key).map(v=><option key={v.value} value={v.value} label={v.label}/>)}
              </datalist>
            </label>}
          </div>)}
          <label>Vertragsfassung
            <select aria-label="Geltungsbereich Vertragsversion" value={scope.contract_version_id} onChange={e=>{
              const id=e.target.value
              const current=(options.versions||[]).find(v=>v.contract_version_id===id)
              setScope(p=>({...p,contract_version_id:id,
                valid_from:p.valid_from||current?.valid_from||'',valid_to:p.valid_to||current?.valid_to||''}))
            }}>
              <option value="">Bitte Vertragsversion belegen</option>
              {(options.versions||[]).map(v=><option value={v.contract_version_id} key={v.contract_version_id}>
                {(v.version_name||v.contract_version_id).slice(0,90)} {v.valid_from?' · ab '+v.valid_from:''}
              </option>)}
            </select>
          </label>
          <label>Gültig ab
            <input aria-label="Geltungsbereich gültig ab" type="date" value={scope.valid_from}
              onChange={e=>update('valid_from',e.target.value)}/>
          </label>
          <label>Gültig bis (falls begrenzt)
            <input aria-label="Geltungsbereich gültig bis" type="date" value={scope.valid_to}
              onChange={e=>update('valid_to',e.target.value)}/>
          </label>
        </div>
        <OcrIkAccessionEvidence uploadId={uploadId} candidateId={item.candidate_id}
          selectedIk={scope.ik_mode==='EXACT'?scope.ik:''}
          selectedPg={scope.pg_mode==='EXACT'?scope.pg:''}
          siteOptions={options.active_sites||[]} pgOptions={options.product_groups||[]}/>
        <label className="ocr-scope-evidence">Quellennachweis und Begründung
          <textarea aria-label="Geltungsbereich Quellennachweis" maxLength={2000} value={scope.evidence_note}
            placeholder="Welche Vertragsstelle belegt PG, Kostenträger, IK-Umfang, LEGS und den Gültigkeitszeitraum? Wo ist ggf. ein gesonderter Vertragsbeitritt zu prüfen?"
            onChange={e=>update('evidence_note',e.target.value)}/>
        </label>
        <label className="ocr-scope-attest">
          <input type="checkbox" checked={sourceConfirmed} onChange={e=>setSourceConfirmed(e.target.checked)}/>
          Ich habe die Geltung dieser Klausel anhand des Originalvertrags geprüft. Das ersetzt keine Einzelfallprüfung von Vertragsbeitritt, PQ und Standort.
        </label>
        {options.warning&&<small className="ocr-scope-warning">{options.warning}</small>}
        {!complete&&<small className="ocr-scope-warning" aria-live="polite">Offen: {issues.slice(0,4).join(' · ')}{issues.length>4?' · …':''}</small>}
        <div className="ocr-scope-actions">
          <button type="button" className="secondary inline-button" onClick={()=>save(false)} disabled={Boolean(busy)}>
            <Save size={15}/> Arbeitsstand speichern
          </button>
          <button type="button" className="primary inline-button" onClick={()=>save(true)} disabled={Boolean(busy)||!complete}>
            {busy==='save'?<LoaderCircle className="spin" size={15}/>:<ShieldCheck size={15}/>}
            Geltung anhand Quelle bestätigen
          </button>
        </div>
      </>}
    </>}
  </div>
}
