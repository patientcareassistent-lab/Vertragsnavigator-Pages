import React,{useEffect,useState} from 'react'
import {FileSearch,ChevronDown,ShieldAlert} from 'lucide-react'
import OcrAccessionDocHints from './OcrAccessionDocHints.jsx'
import OcrAccessionProofEditor from './OcrAccessionProofEditor.jsx'
import './ContractAccessionDocumentReview.css'

/**
 * Separate review entry point for accession confirmations and termination letters.
 * Such PDFs often have no §-headings and therefore NO OCR rule candidates.
 */
export default function ContractAccessionDocumentReview({upload}){
  const uploadId=upload?.upload_id
  const available=Boolean(upload?.summary?.ocr_text_storage_path)
  const [expanded,setExpanded]=useState(false)
  const [report,setReport]=useState(null)
  const [selected,setSelected]=useState(null)
  useEffect(()=>{
    setExpanded(false);setReport(null);setSelected(null)
  },[uploadId])
  if(!uploadId||!available)return null
  return <section className="panel vn-accession-doc-review">
    <div className="sectionbar">
      <div>
        <h2><FileSearch size={18}/> Beitritts- und Kündigungsdokumente</h2>
        <p>Eigenständige PDF-Nachweise aus dem OCR-Text auswerten – auch ohne Vertragsregelkandidaten</p>
      </div>
      <button className="secondary inline-button" type="button" onClick={()=>setExpanded(x=>!x)}>
        <ChevronDown size={15}/>{expanded?'Ansicht schließen':'OCR-Dokumente prüfen'}
      </button>
    </div>
    {expanded&&<>
      <div className="vn-accession-doc-note">
        <ShieldAlert size={17}/>
        Vertragsbeitrittsnachweise dürfen nur nach Abgleich der Originalseite und der richtigen IK-/Vertragsreferenz verifiziert werden.
        Eine automatische Übernahme von Zeiträumen oder eine Versorgungsfreigabe findet nicht statt.
      </div>
      <OcrAccessionDocHints uploadId={uploadId}
        onReport={current=>{setReport(current);setSelected(null)}}
        onSelect={setSelected}/>
      {selected&&report?.can_edit_proofs&&<div className="vn-accession-doc-selection">
        <b>Prüfvorschlag: {selected.kind} · Originalseite {selected.page}</b>
        <small>{selected.matches?.length===1
          ?'Vorgeschlagene Beitrittsreferenz bitte am Original prüfen.'
          :selected.matches?.length
            ?'Mehrere Beitrittsreferenzen – richtige Zuordnung manuell auswählen.'
            :'Keine zugeordnete Beitrittsreferenz. Zuerst IK und Beitritt im Vertragsstamm klären.'}</small>
        <OcrAccessionProofEditor
          key={selected.key} suggestion={selected}
          uploadId={uploadId} candidateId={null}
          pg={selected.pg_candidates?.length===1?selected.pg_candidates[0]:''}
          accessions={selected.matches||[]}/>
      </div>}
      {selected&&!report?.can_edit_proofs&&<div className="note">
        Der Quellennachweis kann nur durch einen berechtigten Administrator geprüft und verifiziert werden.
      </div>}
    </>}
  </section>
}
