import React,{useEffect,useRef,useState} from 'react'
import { AlertTriangle,BookOpen,ChevronDown,ExternalLink,GitCompare,LoaderCircle,RefreshCw } from 'lucide-react'
import { getContractOcrReview,getContractUploadOriginalLink } from '../lib/contractUpload.js'
import './ContractOcrReview.css'

const CATEGORIES=[
  ['','Alle Themen'],['GENEHMIGUNG','Genehmigung/KVA'],['ABRECHNUNG','Abrechnung/Preise'],
  ['FRIST','Fristen/Gültigkeit'],['VERORDNUNG','Verordnung'],['VERSORGUNG','Versorgung'],
  ['DOKUMENTATION','Dokumentation'],['SONSTIGES','Weitere Klauseln']
]
const STATUS={
  GEÄNDERT:'Text geändert',GEAENDERT:'Änderung prüfen',
  UNSICHER:'OCR-Abweichung möglich',NEU_ZU_PRUEFEN:'Neu zu prüfen',
  NICHT_GEFUNDEN:'Nicht gefunden – keine Löschung'
}
function PageRef({uploadId,page,label='Originalseite'}){
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function openPage(){
    const tab=window.open('about:blank','_blank')
    setBusy(true);setError('')
    try{
      const result=await getContractUploadOriginalLink(uploadId)
      if(!result?.url)throw new Error('Kein Original verfügbar')
      const target=result.url+'#page='+encodeURIComponent(page)
      if(tab)tab.location.replace(target)
      else window.location.assign(target)
    }catch(e){
      if(tab)tab.close()
      setError(e?.message||'Original nicht erreichbar')
    }finally{setBusy(false)}
  }
  return <span className="ocr-source-link">
    <button type="button" className="secondary compact-action" onClick={openPage} disabled={busy} title={'Originalvertrag: Seite '+page}>
      {busy?<LoaderCircle className="spin" size={13}/>:<ExternalLink size={13}/>}
      {label} {page}
    </button>
    {error&&<small role="alert">{error}</small>}
  </span>
}
function SectionText({title,side,uploadId}){
  if(!side)return <div className="ocr-side empty"><small>{title}</small><span>Nicht zugeordnet – fachlich prüfen.</span></div>
  return <div className="ocr-side">
    <div className="ocr-side-header">
      <b>{title}</b>
      <PageRef uploadId={uploadId} page={side.page} label="Seite"/>
    </div>
    <p>{side.text||'Kein Text verfügbar'}</p>
    {side.text_truncated&&<small className="ocr-text-limit">Anzeige auf 2.400 Zeichen begrenzt. Volltext liegt in der geschützten OCR-Arbeitskopie.</small>}
    {side.end_page!==side.page&&<small>Erstreckt sich bis Seite {side.end_page}</small>}
  </div>
}
function ResultCard({item,sourceId,baselineId,mode}){
  const isComparison=mode==='COMPARISON'
  const kind=item.kind||'KLAUSEL'
  const isWarning=['NICHT_GEFUNDEN','UNSICHER'].includes(kind)
  return <article className={'ocr-review-card '+(isWarning?'ocr-review-warning':'')}>
    <div className="ocr-card-heading">
      <div><small>{item.category||'SONSTIGES'} · {item.key}</small><b>{item.section||'Klausel ohne Überschrift'}</b></div>
      <span className="ocr-status-label">{STATUS[kind]||kind}</span>
    </div>
    {isComparison?
      <div className="ocr-side-by-side">
        <SectionText title="BISHER" side={item.before} uploadId={baselineId}/>
        <SectionText title="NEU" side={item.after} uploadId={sourceId}/>
      </div>:
      <div className="ocr-only-text">
        <SectionText title="ERKANNTER TEXT" side={{page:item.page,end_page:item.end_page,text:item.text,text_truncated:item.text_truncated}} uploadId={sourceId}/>
      </div>}
    {isComparison&&item.similarity!==null&&<small className="ocr-similarity">Textähnlichkeit: {Math.round(item.similarity*100)} %. Das ist keine fachliche Qualitätsbewertung.</small>}
  </article>
}
export default function ContractOcrReview({upload}){
  const uploadId=upload?.upload_id
  const hasOcr=Boolean(upload?.summary?.ocr_text_storage_path)
  const generation=useRef(0)
  const [report,setReport]=useState(null)
  const [items,setItems]=useState([])
  const [baselineId,setBaselineId]=useState('NONE')
  const [category,setCategory]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function load({baseline='',filter='',offset=0,append=false}={}){
    if(!uploadId)return
    const gen=++generation.current
    setBusy(true);setError('')
    try{
      const result=await getContractOcrReview(uploadId,{
        baselineUploadId:baseline,offset,limit:20,category:filter
      })
      if(gen!==generation.current)return
      if(!result.available){
        setReport(result);setItems([])
        return
      }
      setReport(result)
      setBaselineId(result.baseline?.upload_id||'NONE')
      setItems(old=>append?[...old,...result.results]:result.results)
    }catch(e){
      if(gen===generation.current)setError(e?.message||'OCR-Vergleich konnte nicht geladen werden')
    }finally{if(gen===generation.current)setBusy(false)}
  }
  useEffect(()=>{
    setReport(null);setItems([]);setCategory('');setBaselineId('NONE')
    if(uploadId&&hasOcr)load()
    return()=>{generation.current++}
  },[uploadId,hasOcr])
  if(!uploadId||!hasOcr)return null
  const options=report?.baseline_options||[]
  const pagination=report?.pagination||{}
  const comparisons=report?.comparison
  const base=report?.baseline?.upload_id||''
  const quality=report?.quality
  function selectBaseline(next){
    setBaselineId(next)
    load({baseline:next,filter:category,offset:0})
  }
  function selectCategory(next){
    setCategory(next)
    load({baseline:baselineId,filter:next,offset:0})
  }
  function reload(){load({baseline:baselineId,filter:category,offset:0})}
  return <section className="panel ocr-review-panel">
    <div className="sectionbar">
      <div>
        <h2><BookOpen size={18}/> OCR-Vertragsprüfung</h2>
        <p>Automatisch erkannte Klauseln · Seitenbezug · unverbindlicher Textvergleich</p>
      </div>
      <button type="button" className="secondary compact-action" onClick={reload} disabled={busy} title="OCR-Auswertung aktualisieren">
        {busy?<LoaderCircle className="spin" size={15}/>:<RefreshCw size={15}/>} Aktualisieren
      </button>
    </div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {report?.available===false&&<div className="note">{report.message||'OCR-Arbeitskopie ist noch nicht verfügbar.'}</div>}
    {report?.available&&<>
      <div className="ocr-review-kpis">
        <div><small>Erkannte Abschnitte</small><b>{report.detected_clauses??0}</b></div>
        <div><small>Lesbare Seiten</small><b>{quality?.readable_pages??0} / {quality?.total_pages??'—'}</b></div>
        <div><small>Zu prüfende Textstellen</small><b>{comparisons?comparisons.added+comparisons.modified+comparisons.uncertain+comparisons.not_found:'—'}</b></div>
        <div><small>Unlesbare Seiten</small><b>{quality?.failed_pages?.length??0}</b></div>
      </div>
      <div className="ocr-selection">
        <label>Vergleichsfassung
          <select aria-label="OCR-Vergleichsfassung" value={baselineId} onChange={e=>selectBaseline(e.target.value)}>
            <option value="NONE">Keine – erkannte Klauseln anzeigen</option>
            {options.map(o=><option key={o.upload_id} value={o.upload_id}>
              {o.filename} · {new Date(o.received_at).toLocaleDateString('de-DE')}{o.same_document?' · automatisch zugeordnet':''}
            </option>)}
          </select>
        </label>
        <label>Vertragsthema
          <select aria-label="OCR-Klauselthema" value={category} onChange={e=>selectCategory(e.target.value)}>
            {CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {quality?.failed_pages?.length>0&&<div className="alert error"><AlertTriangle size={16}/> Nicht zuverlässig lesbar: Seite {quality.failed_pages.join(', ')}. Ein fehlender Textabschnitt ist kein Beleg für eine Vertragsänderung.</div>}
      {quality?.unstructured&&<div className="note">Keine hinreichend sicheren §-/Artikel-/Abschnittsüberschriften erkannt. Die Seiten sind als unstrukturierte Textstellen sichtbar, aber ein belastbarer Klauselabgleich ist damit nicht möglich.</div>}
      {comparisons&&<div className="ocr-comparison-summary">
        <span><b>{comparisons.modified}</b> verändert</span>
        <span><b>{comparisons.uncertain}</b> mögliche OCR-Abweichungen</span>
        <span><b>{comparisons.added}</b> neu zu prüfen</span>
        <span><b>{comparisons.not_found}</b> nicht gefunden</span>
        <span><b>{comparisons.unchanged}</b> unverändert</span>
      </div>}
      <div className="note"><AlertTriangle size={15}/> {report.warning} OCR-Kandidaten gehören nicht zum freigegebenen Vertragsbestand und können hier nicht direkt veröffentlicht werden.</div>
      {busy&&!items.length&&<div className="ocr-loading"><LoaderCircle className="spin" size={17}/> OCR-Klauseln werden geladen …</div>}
      <div className="ocr-review-results">
        {items.map((item,i)=><ResultCard key={item.key+'-'+i} item={item} sourceId={uploadId} baselineId={base} mode={report.mode}/>)}
        {!items.length&&!busy&&<div className="empty-panel">{report.mode==='COMPARISON'?'Keine Abweichung innerhalb der sicher erkannten Abschnitte.':'Keine erkannten Abschnitte in diesem Filter.'}</div>}
      </div>
      {pagination.has_more&&<button type="button" className="secondary inline-button" disabled={busy}
        onClick={()=>load({baseline:baselineId,filter:category,offset:pagination.offset+pagination.limit,append:true})}>
        {busy?<LoaderCircle className="spin" size={16}/>:<ChevronDown size={16}/>} Weitere Prüfstellen laden ({Math.min(pagination.total,items.length)}/{pagination.total})
      </button>}
    </>}
  </section>
}
