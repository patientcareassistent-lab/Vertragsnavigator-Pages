import React,{useEffect,useState} from 'react'
import {AlertTriangle,Search,LoaderCircle} from 'lucide-react'
import {getOcrIkAccessionEvidence} from '../lib/contractUpload.js'
import './OcrIkAccessionEvidence.css'
import OcrAccessionProofEditor from './OcrAccessionProofEditor.jsx'

const LABEL={
  POSITIVE_ACCESSION_HINT:'Positiver Beitrittshinweis – keine Versorgungsfreigabe',
  NEGATIVE_ACCESSION:'Negativer / beendeter Vertragsbeitritt',
  CONFLICTING_ACCESSIONS:'Widersprüchliche Beitrittsinformationen',
  ACCESSION_REVIEW:'Ungeklärter Beitrittsstatus',
  NO_ACCESSION:'Kein Vertragsbeitritt zugeordnet',
  SITE_UNKNOWN:'Standort-IK nicht eindeutig zugeordnet',
  SITE_INACTIVE:'Standort inaktiv',
  CONTRACT_INACTIVE:'Vertrag archiviert oder inaktiv',
  PG_COMPONENT_CONFLICT:'PG-spezifischer Widerspruch / Konflikt',
  EVIDENCE_INCOMPLETE:'Datenmenge unvollständig',
  DATE_CONFLICT:'Gültigkeitskonflikt',
  UNRESOLVED:'Manuelle Klärung erforderlich'
}
export default function OcrIkAccessionEvidence({
  uploadId,candidateId,selectedIk='',selectedPg='',siteOptions=[],pgOptions=[]
}){
  const [checkIk,setCheckIk]=useState(selectedIk)
  const [checkPg,setCheckPg]=useState(selectedPg)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [result,setResult]=useState(null)
  useEffect(()=>{
    setCheckIk(selectedIk);setCheckPg(selectedPg)
    setResult(null);setError('')
  },[uploadId,candidateId,selectedIk,selectedPg])
  async function check(){
    setBusy(true);setError('');setResult(null)
    try{
      const response=await getOcrIkAccessionEvidence(uploadId,candidateId,checkIk.trim(),checkPg.trim())
      setResult(response)
    }catch(e){setError(e?.message||'Prüfung nicht verfügbar')}
    finally{setBusy(false)}
  }
  const evidence=result?.evidence
  return <section className="ocr-accession-panel">
    <h3><Search size={15}/> Vertragsbeitritt je IK prüfen</h3>
    <p>Quellenabgleich mit Beitritts- und Komponentenstamm, ohne Änderung an Vertrags- oder Versorgungsdaten.</p>
    <div className="ocr-accession-inputs">
      <label>Standort-IK
        <input aria-label="Beitrittsprüfung Standort-IK" list={'ocr-accession-sites-'+candidateId}
          inputMode="numeric" maxLength={9} placeholder="9-stellige IK"
          value={checkIk} onChange={e=>setCheckIk(e.target.value.replace(/\D/g,''))}/>
        <datalist id={'ocr-accession-sites-'+candidateId}>
          {siteOptions.map(x=><option key={x.ik} value={x.ik} label={x.branch||x.site_id}/>)}
        </datalist>
      </label>
      <label>Produktgruppe (optional)
        <input aria-label="Beitrittsprüfung Produktgruppe" list={'ocr-accession-pgs-'+candidateId}
          inputMode="numeric" maxLength={2} placeholder="z. B. 24"
          value={checkPg} onChange={e=>setCheckPg(e.target.value.replace(/\D/g,''))}/>
        <datalist id={'ocr-accession-pgs-'+candidateId}>
          {pgOptions.map(pg=><option value={String(pg).padStart(2,'0')} key={pg}/>)}
        </datalist>
      </label>
      <button type="button" className="secondary inline-button" disabled={busy||!/^\d{9}$/.test(checkIk)||Boolean(checkPg&&!/^\d{2}$/.test(checkPg))}
        onClick={check}>{busy?<LoaderCircle className="spin" size={15}/>:<Search size={15}/>} Beitrittsdaten prüfen</button>
    </div>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {evidence&&<div className="ocr-accession-results" role="status">
      <div className="ocr-accession-heading">
        <strong>{LABEL[evidence.indicator]||'Klärung erforderlich'}</strong>
        <span>{evidence.decision==='PRUEFUNG_ERFORDERLICH'?'Prüfung erforderlich':evidence.decision}</span>
      </div>
      <small>{result.site?.branch||'Standort nicht eindeutig'} · IK {result.ik} · Vertragsbezug {result.contract_id}</small>
      <div className="ocr-temporal-evidence">
        <b>Zeitliche Vertragsgeltung:</b> {result.temporal?.status==='SOURCE_DATE_DOCUMENTED'
          ?'Original-Zeitnachweis dokumentiert, Einzelfallprüfung offen'
          :result.temporal?.status==='SOURCE_CONFLICT'
          ?'Zeitlicher Kündigungs- oder Einschränkungshinweis'
          :'Nicht durch Originalnachweis belegt'}
        <small>Prüftag: {result.temporal?.on_date||'—'} · Verifizierte Quellenbelege: {result.temporal?.verified_proofs??0}</small>
      </div>
      <div className="ocr-accession-counts">
        <span><b>{evidence.stats.accession_rows}</b> Beitrittszeilen</span>
        <span><b>{evidence.stats.positive_accessions}</b> positive Hinweise</span>
        <span><b>{evidence.stats.negative_accessions}</b> negative Hinweise</span>
        <span><b>{evidence.stats.pg_scoped_rows}</b> PG-Komponenten</span>
      </div>
      <div className="ocr-accession-reasons">
        {evidence.reasons?.map((r,i)=><p key={i}><AlertTriangle size={13}/>{r}</p>)}
      </div>
      {evidence.accessions?.length>0&&<details>
        <summary>Beitrittsnachweise und Herkunft anzeigen</summary>
        <div className="ocr-accession-scroll">
          <table><thead><tr><th>Beitritt</th><th>Status</th><th>Voraussetzungen</th><th>VTV</th><th>Quellhinweis</th></tr></thead>
            <tbody>{evidence.accessions.map((r,i)=><tr key={r.accession_id||i}>
              <td>{r.accession_id||'—'}</td><td>{r.status||'—'}</td>
              <td>{r.prerequisites_met||'—'}</td><td>{r.vtv_status||'—'}</td>
              <td>{r.source||'—'}{r.review_required?' · Prüfung offen':''}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
      {evidence.pg_evidence?.length>0&&<details>
        <summary>PG-bezogene Beitritte und Widersprüche anzeigen</summary>
        {evidence.pg_evidence.map((r,i)=><p key={r.accession_detail_id||i}>
          {r.accession_level||'Komponente'} · {r.accession_type||r.status||'Status ungeklärt'}
          {r.review_required?' · Prüfung offen':''}
        </p>)}
      </details>}
      {(result.proofs||[]).length>0&&<details>
        <summary>Dokumentierte Originalnachweise ({result.proofs.length})</summary>
        <div className="ocr-accession-scroll"><table><thead><tr>
          <th>Status</th><th>Belegart</th><th>Zeitraum</th><th>PG</th><th>Seite</th>
        </tr></thead><tbody>{result.proofs.map(x=><tr key={x.proof_id}>
          <td>{x.status}</td><td>{x.proof_kind}</td>
          <td>{x.effective_from||'—'} bis {x.effective_to||'offen'}</td>
          <td>{x.pg||'nicht eingegrenzt'}</td><td>{x.source_page}</td>
        </tr>)}</tbody></table></div>
      </details>}
      {result.can_edit_proofs&&<OcrAccessionProofEditor
        uploadId={uploadId} candidateId={candidateId} pg={checkPg}
        accessions={evidence.accessions||[]} onSaved={check}/>}
      <div className="ocr-accession-warning">Dieser Befund ist kein Versorgungsentscheid. Positive Beitrittszeilen ersetzen weder den Nachweis des zeitlichen und sachlichen Vertragsumfangs noch PQ, Positions-/Genehmigungsprüfung oder Verordnung.</div>
    </div>}
  </section>
}
