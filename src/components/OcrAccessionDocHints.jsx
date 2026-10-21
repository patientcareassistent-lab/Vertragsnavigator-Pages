import React,{useState} from 'react'
import {AlertTriangle,ChevronDown,FileSearch,LoaderCircle} from 'lucide-react'
import {scanAccessionDocumentHints} from '../lib/contractUpload.js'
import './OcrAccessionDocHints.css'

const TYPES={BEITRITT:'Mögliche Beitrittsbestätigung',
  KUENDIGUNG:'Möglicher Kündigungsnachweis',
  EINSCHRAENKUNG:'Mögliche Geltungseinschränkung'}
const MATCH={
  SINGLE_ACCESSION_HINT:'Eine mögliche Beitrittsreferenz – bitte fachlich zuordnen',
  AMBIGUOUS_ACCESSIONS:'Mehrere Beitritte für die IK – manuelle Auswahl erforderlich',
  IK_UNRESOLVED:'IK unklar – keine automatische Zuordnung',
  IK_LOOKUP_SKIPPED:'IK konnte wegen der Treffergrenze nicht zugeordnet werden',
  TOO_MANY_ACCESSIONS:'Zu viele Beitritte für eine sichere Zuordnung',
  NO_ACCESSION:'Keine passende Beitrittsreferenz gefunden'
}
export default function OcrAccessionDocHints({uploadId,candidateId=null,onSelect=()=>{},onReport=()=>{}}){
  const [expanded,setExpanded]=useState(false)
  const [report,setReport]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function load(){
    setExpanded(true);setBusy(true);setError('')
    try{
      const current=await scanAccessionDocumentHints(uploadId,candidateId)
      setReport(current)
      onReport(current)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }
  return <div className="ocr-doc-hints">
    <button className="secondary inline-button" type="button" onClick={()=>{
      if(expanded){setExpanded(false);return}
      if(report)setExpanded(true);else load()
    }} disabled={busy}>
      {busy?<LoaderCircle className="spin" size={15}/>:<FileSearch size={15}/>}
      Beitrittsbestätigungen/Kündigungen im OCR-Text vorschlagen
      <ChevronDown size={13}/>
    </button>
    {expanded&&<>
      <div className="ocr-doc-hints-note">
        <AlertTriangle size={15}/>
        Automatisch erkannte Textstellen sind keine gültigen Beitrittsnachweise.
        Datum, Zuordnung, Einschränkungen und Originalseite müssen bestätigt werden.
      </div>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {report&&<>
        <p>{report.hints?.length||0} mögliche Textstellen auf {report.quality?.analyzed_pages||0} lesbaren Seiten.
          {report.quality?.unreadable_pages?.length>0&&
            <> Unlesbare Seiten: {report.quality.unreadable_pages.join(', ')}.</>}
        </p>
        {(!report.hints||!report.hints.length)&&<p>Keine eindeutig formulierten Beitritts-/Kündigungsbelege im gespeicherten OCR-Text erkannt.</p>}
        <div className="ocr-doc-hint-list">
          {(report.hints||[]).map(h=><article className="ocr-doc-hint" key={h.key}>
            <div className="ocr-doc-hint-title">
              <b>{TYPES[h.kind]||h.kind}</b><small>Originalseite {h.page} · {h.source_method==='ocr'?'Scan-OCR':'PDF-Text'}</small>
            </div>
            <p>{h.excerpt}</p>
            <div className="ocr-doc-hint-fields">
              <span>IK: {h.ik_candidates?.join(', ')||'unbekannt'}</span>
              <span>PG: {h.pg_candidates?.join(', ')||'ungeklärt'}</span>
              <span>Datum: {h.suggested_effective_from||'nicht eindeutig'}</span>
            </div>
            <small>{MATCH[h.match_status]||h.match_status}</small>
            {h.issues?.length>0&&<small>Offen: {h.issues.join('; ')}</small>}
            {h.matches?.length>0&&<small>Beitrittsreferenzen: {h.matches.map(x=>x.accession_id).join(', ')}</small>}
            <button className="secondary inline-button" type="button"
              onClick={()=>onSelect(h)}>
              In Quellenprüfformular übernehmen – ungeprüft
            </button>
          </article>)}
        </div>
        <button type="button" className="secondary inline-button" disabled={busy} onClick={load}>Erkennung erneut ausführen</button>
      </>}
    </>}
  </div>
}
