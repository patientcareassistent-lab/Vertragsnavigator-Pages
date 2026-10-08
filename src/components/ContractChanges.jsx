
import React,{useEffect,useMemo,useState} from 'react'
import { AlertTriangle,CheckCircle2,FileArchive,FileSpreadsheet,FileText,RefreshCw,ShieldCheck } from 'lucide-react'
import {
  acceptContractUpload,getContractUploadStatus,getCurrentUploadId,
  listContractUploads,saveCurrentUploadId,
} from '../lib/contractUpload.js'
import { ContractChangeList,formatUploadDate } from './ContractChangeList.jsx'

const TYPE_LABELS={CONTRACT:'Vertragskopf',VERSION:'Vertragsversionen',POSITION:'Preis-/Versorgungspositionen'}
const STATUS_LABELS={
  RECEIVED:'Datei hochgeladen',DUPLICATE:'Bereits vorhanden',PARSING:'Inhalt erkannt',
  READY:'Bereit zum Vergleich',REVIEW:'Änderungen prüfen',SOURCE_ONLY:'Originalquelle erfasst (Teilquelle)',ACCEPTED:'Veröffentlicht',
  REJECTED:'Abgelehnt',ERROR:'Fehler',
}
const STATUS_TONES={ACCEPTED:'ok',DUPLICATE:'info',REVIEW:'warn',SOURCE_ONLY:'info',ERROR:'bad',REJECTED:'bad',READY:'info',PARSING:'info'}

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function statusLabel(status){return STATUS_LABELS[status]||status||'—'}
function statusTone(status){return STATUS_TONES[status]||''}
function extIcon(name,size=19){
  const ext=String(name||'').split('.').pop()?.toLowerCase()
  if(['xlsx','xls','csv'].includes(ext))return <FileSpreadsheet size={size}/>
  if(ext==='zip')return <FileArchive size={size}/>
  return <FileText size={size}/>
}

export default function ContractChanges({canFach=false}){
  const [uploads,setUploads]=useState([])
  const [selectedId,setSelectedId]=useState(()=>getCurrentUploadId())
  const [detail,setDetail]=useState(null)
  const [query,setQuery]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    if(!q)return uploads
    return uploads.filter(u=>JSON.stringify([u.contract_name,u.filename,u.upload_status,u.contract_id]).toLowerCase().includes(q))
  },[uploads,query])

  async function refreshList(preferId=''){
    setBusy(true);setError('')
    try{
      const rows=await listContractUploads()
      setUploads(rows)
      const wanted=preferId||selectedId||getCurrentUploadId()||rows[0]?.upload_id||''
      if(wanted){
        setSelectedId(wanted)
        setDetail(await getContractUploadStatus(wanted))
      }else setDetail(null)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }

  useEffect(()=>{refreshList()},[])

  async function openUpload(id){
    setSelectedId(id);saveCurrentUploadId(id);setBusy(true);setError('')
    try{setDetail(await getContractUploadStatus(id))}
    catch(e){setError(e.message)}
    finally{setBusy(false)}
  }

  async function acceptSelected(){
    const count=Number(detail?.upload?.change_count||0)
    if(!count)return
    const prompt=count+' Änderung'+(count===1?'':'en')+' jetzt freigeben und veröffentlichen?'
    if(!window.confirm(prompt))return
    setBusy(true);setError('')
    try{
      await acceptContractUpload(selectedId,count,'Freigabe über Änderungsprotokoll VN 2.1')
      await refreshList(selectedId)
    }catch(e){setError(e.message)}
    finally{setBusy(false)}
  }

  return <div className="changes-workspace">
    <section className="panel upload-history">
      <div className="sectionbar">
        <div><h2>Uploadverlauf</h2><p>{canFach?'Alle aktuellen Vertragsuploads':'Eigene Vertragsuploads'}</p></div>
        <div className="history-actions">
          <input className="compact" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Vertrag oder Datei …"/>
          <button className="secondary icon-button" onClick={()=>refreshList()} title="Aktualisieren"><RefreshCw className={busy?'spin':''} size={16}/></button>
        </div>
      </div>
      {error&&<div className="alert error">{error}</div>}
      <div className="upload-history-list">
        {filtered.map(u=><button key={u.upload_id} className={'history-row '+(selectedId===u.upload_id?'selected':'')} onClick={()=>openUpload(u.upload_id)}>
          <span className="history-file">{extIcon(u.filename)}<span><b>{u.contract_name||u.contract_id}</b><small>{u.filename}</small></span></span>
          <span className="history-counts"><b>{u.change_count||0}</b><small>Änderungen</small></span>
          <span className="history-date">{formatUploadDate(u.received_at)}</span>
          <Badge tone={statusTone(u.upload_status)}>{statusLabel(u.upload_status)}</Badge>
        </button>)}
        {!filtered.length&&!busy&&<div className="empty-panel">Noch keine Vertragsuploads vorhanden.</div>}
      </div>
    </section>

    {detail?.upload?<section className="panel change-detail">
      <div className="sectionbar">
        <div><h2>{detail.upload.contract_name||detail.upload.contract_id}</h2><p>{detail.upload.filename} · {formatUploadDate(detail.upload.received_at)}</p></div>
        <Badge tone={statusTone(detail.upload.upload_status)}>{statusLabel(detail.upload.upload_status)}</Badge>
      </div>
      <div className="upload-kpis">
        <div><small>Elemente</small><strong>{Number(detail.upload.item_count||0).toLocaleString('de-DE')}</strong></div>
        <div><small>Änderungen</small><strong>{Number(detail.upload.change_count||0).toLocaleString('de-DE')}</strong></div>
        <div><small>Bereiche</small><strong className="small-value">{detail.upload.complete_entity_types?.map(t=>TYPE_LABELS[t]||t).join(' · ')||'—'}</strong></div>
        <div><small>Status</small><strong className="small-value">{statusLabel(detail.upload.upload_status)}</strong></div>
      </div>
      {detail.upload.upload_status==='REVIEW'&&<div className="review-callout">
        <div><AlertTriangle size={19}/><div><b>{detail.upload.change_count} fachliche Änderung{detail.upload.change_count===1?'':'en'}</b><p>Alt/Neu unten prüfen. Veröffentlichung erfolgt erst nach ausdrücklicher Freigabe.</p></div></div>
        {canFach?<button className="primary inline-button" disabled={busy} onClick={acceptSelected}><ShieldCheck size={16}/> Änderungen freigeben</button>:<Badge tone="warn">Fachprüfung erforderlich</Badge>}
      </div>}
      {detail.upload.upload_status==='ACCEPTED'&&<div className="alert success inline-alert"><CheckCircle2 size={17}/> Veröffentlicht am {formatUploadDate(detail.upload.accepted_at)}.</div>}
      <ContractChangeList changes={detail.changes||[]}/>
    </section>:<section className="panel change-detail"><div className="empty-panel">Links einen Upload auswählen, um das Änderungsprotokoll zu öffnen.</div></section>}
  </div>
}
