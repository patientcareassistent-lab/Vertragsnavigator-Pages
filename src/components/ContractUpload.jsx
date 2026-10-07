
import React,{useEffect,useMemo,useRef,useState} from 'react'
import {
  AlertTriangle,Check,CheckCircle2,CloudUpload,FileArchive,
  FileSpreadsheet,FileText,GitCompare,LoaderCircle,Search,
  ShieldCheck,UploadCloud,
} from 'lucide-react'
import {
  acceptContractUpload,getContractUploadStatus,getCurrentUploadId,
  markContractUploadReady,parseContractUpload,saveCurrentUploadId,
  uploadContractSource,validateContractFile,compareContractUpload,saveContractIkScopes,saveContractErpMapping,
} from '../lib/contractUpload.js'
import { ContractChangeList,formatUploadDate } from './ContractChangeList.jsx'
import { supabase } from '../lib/supabase.js'

const TYPE_LABELS={CONTRACT:'Vertragskopf',VERSION:'Vertragsversionen',POSITION:'Preis-/Versorgungspositionen'}
const STATUS_LABELS={
  RECEIVED:'Datei hochgeladen',DUPLICATE:'Bereits vorhanden',PARSING:'Inhalt erkannt',
  READY:'Bereit zum Vergleich',REVIEW:'Änderungen prüfen',ACCEPTED:'Veröffentlicht',
  REJECTED:'Abgelehnt',ERROR:'Fehler',
}
const STATUS_TONES={ACCEPTED:'ok',DUPLICATE:'info',REVIEW:'warn',ERROR:'bad',REJECTED:'bad',READY:'info',PARSING:'info'}

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}
function statusLabel(status){return STATUS_LABELS[status]||status||'—'}
function statusTone(status){return STATUS_TONES[status]||''}
function fmtBytes(value){
  const n=Number(value||0)
  if(n<1024)return n+' B'
  if(n<1024*1024)return (n/1024).toFixed(1)+' KB'
  return (n/1024/1024).toFixed(1)+' MB'
}
function extIcon(name,size=22){
  const ext=String(name||'').split('.').pop()?.toLowerCase()
  if(['xlsx','xls','csv'].includes(ext))return <FileSpreadsheet size={size}/>
  if(ext==='zip')return <FileArchive size={size}/>
  return <FileText size={size}/>
}
function Step({n,label,done,active}){
  return <div className={'flow-step '+(done?'done ':'')+(active?'active':'')}>
    <span>{done?<Check size={14}/>:n}</span><b>{label}</b>
  </div>
}

function contractOptionLabel(contract){
  const partner=contract?.partner_display_name||String(contract?.contract_name||contract?.contract_id||'').split(':')[0].trim()
  const raw=String(contract?.contract_name||'')
  const i=raw.indexOf(':')
  const suffix=i>=0?raw.slice(i+1).trim():''
  return suffix?partner+' — '+suffix:partner
}

function UploadStatusCard({detail,canFach,onAccept,busy,precheckMode=false}){
  if(!detail?.upload)return null
  const u=detail.upload
  return <section className="panel upload-result">
    <div className="sectionbar">
      <div><h2>Ergebnis</h2><p>{u.contract_name||u.contract_id} · {u.filename}</p></div>
      <Badge tone={statusTone(u.upload_status)}>{statusLabel(u.upload_status)}</Badge>
    </div>
    <div className="upload-kpis">
      <div><small>Strukturierte Elemente</small><strong>{Number(u.item_count||0).toLocaleString('de-DE')}</strong></div>
      <div><small>Änderungen</small><strong>{Number(u.change_count||0).toLocaleString('de-DE')}</strong></div>
      <div><small>Prüfvorgänge</small><strong>{Number(u.review_count||0).toLocaleString('de-DE')}</strong></div>
      <div><small>Verglichen</small><strong className="date-value">{formatUploadDate(u.compared_at)}</strong></div>
    </div>
    {u.upload_status==='DUPLICATE'&&<div className="alert success">Die Datei ist bereits vorhanden. Es wurde keine zweite Vertragsquelle angelegt.</div>}
    {u.upload_status==='ACCEPTED'&&!precheckMode&&<div className="alert success inline-alert"><CheckCircle2 size={17}/> Die Änderungen sind veröffentlicht. Der vorherige Stand bleibt historisch nachvollziehbar.</div>}
    {u.upload_status==='REVIEW'&&<div className="review-callout">
      <div><AlertTriangle size={19}/><div><b>{precheckMode?'Für Vertragsvorprüfung bereit':'Fachliche Freigabe erforderlich'}</b><p>{precheckMode?'Der Upload bleibt bis zur dokumentierten Unterschrift für die Veröffentlichung gesperrt.':'Das Änderungsprotokoll ist erzeugt. Erst die Freigabe verändert den Live-Vertragsbestand.'}</p></div></div>
      {!precheckMode&&(canFach
        ? <button className="primary inline-button" disabled={busy} onClick={onAccept}><ShieldCheck size={16}/> Änderungen freigeben</button>
        : <Badge tone="warn">Fachprüfung erforderlich</Badge>)}
      {precheckMode&&<Badge tone="warn">Publication Hold</Badge>}
    </div>}
    <ContractChangeList changes={detail.changes||[]}/>
  </section>
}

export default function ContractUpload({contracts=[],sites=[],canFach=false,onOpenChanges,initialContractId='',precheckMode=false,onPrecheckReady}){
  const inputRef=useRef(null)
  const [contractId,setContractId]=useState(initialContractId||'')
  const [file,setFile]=useState(null)
  const [dragging,setDragging]=useState(false)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [uploadId,setUploadId]=useState(()=>precheckMode?'':getCurrentUploadId())
  const [parser,setParser]=useState(null)
  const [completeTypes,setCompleteTypes]=useState([])
  const [detail,setDetail]=useState(null)
  const [ikScopes,setIkScopes]=useState({})
  const [existingIkScopes,setExistingIkScopes]=useState({})
  const [erpContractGroup,setErpContractGroup]=useState('')
  const [existingErpContractGroup,setExistingErpContractGroup]=useState('')

  useEffect(()=>{if(initialContractId&&!uploadId)setContractId(initialContractId)},[initialContractId,uploadId])

  const selectedContract=contracts.find(c=>c.contract_id===contractId)
  const sortedContracts=useMemo(()=>[...contracts].sort((a,b)=>contractOptionLabel(a).localeCompare(contractOptionLabel(b),'de')),[contracts])
  const sortedSites=useMemo(()=>[...sites].sort((a,b)=>{
    if(Boolean(a.active)!==Boolean(b.active))return a.active?-1:1
    return String(a.branch||a.ik||'').localeCompare(String(b.branch||b.ik||''),'de')
  }),[sites])
  const suggested=parser?.result?.suggested_complete_entity_types||[]
  const parserName=parser?.parser||''
  const isPdf=parserName.includes('pdf')
  const status=detail?.upload?.upload_status||''
  const step=status==='ACCEPTED'?5:status==='REVIEW'||status==='READY'?4:parser?3:uploadId?2:file?1:0

  useEffect(()=>{
    if(!uploadId)return
    getContractUploadStatus(uploadId).then(current=>{
      setDetail(current)
      if(current?.upload?.contract_id)setContractId(current.upload.contract_id)
      if(current?.ik_scopes?.length){
        setIkScopes(prev=>{
          const next={...prev}
          current.ik_scopes.forEach(s=>{
            next[s.ik]={
              selected:s.scope_action!=='REMOVE',
              validFrom:s.valid_from||'',
              validTo:s.valid_to||'',
            }
          })
          return next
        })
      }
      if(current?.erp_mapping){
        setErpContractGroup(current.erp_mapping.mapping_action==='REMOVE'?'':(current.erp_mapping.contract_group||''))
      }
    }).catch(()=>{})
  },[])

  useEffect(()=>{
    let cancelled=false
    async function loadIkValidity(){
      if(!contractId){setIkScopes({});setExistingIkScopes({});return}
      const {data,error}=await supabase.from('vn_contract_ik_validity')
        .select('ik,site_id,branch,valid_from,valid_to')
        .eq('contract_id',contractId)
      if(cancelled||error)return
      const existing={}
      const initial={}
      ;(data||[]).forEach(row=>{
        existing[row.ik]=row
        initial[row.ik]={
          selected:true,
          validFrom:row.valid_from||'',
          validTo:row.valid_to||'',
        }
      })
      setExistingIkScopes(existing)
      setIkScopes(current=>Object.keys(current).length&&uploadId?current:initial)
    }
    loadIkValidity()
    return()=>{cancelled=true}
  },[contractId])

  useEffect(()=>{
    let cancelled=false
    async function loadErpMapping(){
      if(!contractId){setErpContractGroup('');setExistingErpContractGroup('');return}
      const {data,error}=await supabase.from('vn_contract_erp_mapping')
        .select('contract_group')
        .eq('contract_id',contractId)
        .eq('erp_system','SaniVision')
        .maybeSingle()
      if(cancelled||error)return
      const existing=String(data?.contract_group||'')
      setExistingErpContractGroup(existing)
      setErpContractGroup(current=>uploadId&&current?current:existing)
    }
    loadErpMapping()
    return()=>{cancelled=true}
  },[contractId])

  function setIkScope(ik,patch){
    setIkScopes(current=>({
      ...current,
      [ik]:{selected:false,validFrom:'',validTo:'',...(current[ik]||{}),...patch},
    }))
  }

  function buildIkScopePayload(){
    const rows=[]
    for(const site of sortedSites){
      const current=ikScopes[site.ik]||{selected:false,validFrom:'',validTo:''}
      const existing=existingIkScopes[site.ik]
      if(current.selected){
        rows.push({
          ik:site.ik,
          valid_from:current.validFrom||null,
          valid_to:current.validTo||null,
          scope_action:'UPSERT',
        })
      }else if(existing){
        rows.push({
          ik:site.ik,
          valid_from:existing.valid_from||null,
          valid_to:existing.valid_to||null,
          scope_action:'REMOVE',
        })
      }
    }
    return rows
  }

  function ikScopeChanged(){
    for(const site of sortedSites){
      const current=ikScopes[site.ik]||{selected:false,validFrom:'',validTo:''}
      const existing=existingIkScopes[site.ik]
      if(Boolean(current.selected)!==Boolean(existing))return true
      if(current.selected&&existing&&(
        String(current.validFrom||'')!==String(existing.valid_from||'')
        ||String(current.validTo||'')!==String(existing.valid_to||'')
      ))return true
    }
    return false
  }

  function erpMappingChanged(){
    return String(erpContractGroup||'').trim()!==String(existingErpContractGroup||'').trim()
  }

  function erpMappingPayload(){
    const value=String(erpContractGroup||'').trim()
    if(value)return {value,action:'UPSERT'}
    if(existingErpContractGroup)return {value:'',action:'REMOVE'}
    return null
  }

  function selectFile(next){
    setError('');setMessage('')
    try{validateContractFile(next);setFile(next);setParser(null);setCompleteTypes([])}
    catch(e){setFile(null);setError(e.message)}
  }

  async function startUpload(){
    setError('');setMessage('')
    try{
      setBusy('upload')
      const completed=await uploadContractSource(contractId,file,selectedContract?.contract_name||'')
      setUploadId(completed.upload_id)
      if(precheckMode)saveCurrentUploadId('')

      if(precheckMode){
        const {error:holdError}=await supabase.rpc('vn_admin_hold_contract_upload',{p_upload_id:completed.upload_id})
        if(holdError)throw holdError
      }

      const scopeRows=buildIkScopePayload()
      if(scopeRows.length)await saveContractIkScopes(completed.upload_id,scopeRows)
      const erpPayload=erpMappingPayload()
      if(erpPayload)await saveContractErpMapping(completed.upload_id,erpPayload.value,erpPayload.action)

      if(completed.upload_status==='DUPLICATE'){
        if(ikScopeChanged()||erpMappingChanged()){
          setBusy('compare')
          await compareContractUpload(completed.upload_id)
          const current=await getContractUploadStatus(completed.upload_id)
          setDetail(current)
          setMessage('Vertragsdatei unverändert. IK-/ERP-Zuordnungsänderungen wurden zur Prüfung gestellt.')
        }else{
          setDetail(await getContractUploadStatus(completed.upload_id))
          setMessage('Diese Datei ist bereits im Vertragsbestand vorhanden. Keine IK-/ERP-Zuordnungsänderung erkannt.')
        }
        if(precheckMode&&onPrecheckReady)await onPrecheckReady(completed.upload_id)
        return
      }

      setBusy('parse')
      const parsed=await parseContractUpload(completed.upload_id)
      setParser(parsed)
      const nextTypes=parsed?.result?.suggested_complete_entity_types||[]
      setCompleteTypes(nextTypes)
      setDetail(await getContractUploadStatus(completed.upload_id))
      setMessage(nextTypes.length
        ? 'Inhalt erkannt. Bitte prüfen, welche Bereiche vollständig geliefert wurden.'
        : (precheckMode
          ? 'Quelle wurde sicher analysiert. Die Vertragsvorprüfung wird jetzt angelegt.'
          : 'Quelle wurde sicher abgelegt. Für diesen Dateityp ist keine automatische Vollständigkeitsannahme zulässig.'))
      if(precheckMode&&!nextTypes.length&&onPrecheckReady)await onPrecheckReady(completed.upload_id)
    }catch(e){setError(e.message)}
    finally{setBusy('')}
  }

  function toggleType(type){
    setCompleteTypes(current=>current.includes(type)?current.filter(x=>x!==type):[...current,type])
  }

  async function compareNow(){
    setError('');setMessage('')
    if(!completeTypes.length){setError('Bitte mindestens einen vollständig gelieferten Bereich bestätigen.');return}
    try{
      setBusy('compare')
      await markContractUploadReady(uploadId,completeTypes)
      await compareContractUpload(uploadId)
      const current=await getContractUploadStatus(uploadId)
      setDetail(current)
      setMessage(precheckMode
        ? 'Analyse abgeschlossen. Der Upload bleibt gesperrt und wird in die Vertragsvorprüfung übernommen.'
        : (current.upload?.upload_status==='ACCEPTED'
          ? 'Keine fachliche Änderung erkannt. Der Upload wurde automatisch abgeschlossen.'
          : 'Änderungsprotokoll erstellt. Änderungen bitte fachlich prüfen.'))
      if(precheckMode&&onPrecheckReady)await onPrecheckReady(uploadId)
    }catch(e){setError(e.message)}
    finally{setBusy('')}
  }

  async function acceptNow(){
    if(precheckMode)return
    const count=Number(detail?.upload?.change_count||0)
    if(!count)return
    const prompt=count+' Änderung'+(count===1?'':'en')+' jetzt in den Live-Vertragsbestand übernehmen?'
    if(!window.confirm(prompt))return
    try{
      setBusy('accept');setError('')
      await acceptContractUpload(uploadId,count,'Freigabe über Vertragsnavigator 2.1')
      setDetail(await getContractUploadStatus(uploadId))
      setMessage('Änderungen wurden atomar veröffentlicht.')
    }catch(e){setError(e.message)}
    finally{setBusy('')}
  }

  function reset(){
    setContractId('');setFile(null);setParser(null);setCompleteTypes([]);setDetail(null)
    setIkScopes({});setExistingIkScopes({})
    setErpContractGroup('');setExistingErpContractGroup('')
    setUploadId('');setError('');setMessage('');saveCurrentUploadId('')
  }

  return <div className="contract-workflow">
    <div className="workflow-steps" aria-label="Uploadschritte">
      <Step n="1" label="Vertrag" done={step>1} active={step===1}/>
      <Step n="2" label="Datei" done={step>2} active={step===2}/>
      <Step n="3" label="Erkennen" done={step>3} active={step===3}/>
      <Step n="4" label={precheckMode?'Vergleichen':'Prüfen'} done={step>4} active={step===4}/>
      <Step n="5" label={precheckMode?'Vorprüfung':'Freigeben'} done={step>=5} active={step===5}/>
    </div>

    <section className="panel upload-main">
      <div className="sectionbar">
        <div><h2>{precheckMode?'Vertrag für Vorprüfung hochladen':'Vertrag aktualisieren'}</h2><p>{precheckMode?'Originaldatei analysieren und gegen den Bestand vergleichen. Veröffentlichung bleibt bis nach der Unterschrift gesperrt.':'Originaldatei bleibt unverändert gespeichert. Erst eine geprüfte Freigabe aktualisiert den Livebestand.'}</p></div>
        {uploadId&&<button className="secondary compact-action" onClick={reset}>Neuer Upload</button>}
      </div>

      <div className="upload-grid">
        <label>Welcher Vertrag wird aktualisiert?
          <select value={contractId} onChange={e=>setContractId(e.target.value)} disabled={Boolean(uploadId)}>
            <option value="">Vertrag auswählen …</option>
            {sortedContracts.map(c=><option key={c.contract_id} value={c.contract_id}>{contractOptionLabel(c)}</option>)}
          </select>
        </label>
        <div className="upload-contract-hint">
          <small>Ausgewählter Vertragsstamm</small>
          <b>{selectedContract?contractOptionLabel(selectedContract):(detail?.upload?.contract_name||'Noch kein Vertrag ausgewählt')}</b>
          <span>{selectedContract?.product_groups?.length?'PG '+selectedContract.product_groups.join(', '):'Der bestehende Vertragsstand dient als Vergleichsbasis.'}</span>
        </div>
      </div>

      <div className={'contract-context-panel '+(!contractId?'disabled-context':'')}>
        <div className="contract-context-head">
          <div><h3>Vertragszuordnung</h3><p>ERP-Preispflege und IK-Gültigkeit gehören zum Vertragsstand und werden mitgeprüft.</p></div>
          {!contractId&&<Badge tone="info">Zuerst Vertragsstamm wählen</Badge>}
        </div>

        <div className="erp-mapping-row">
          <label>Vertragsgruppe SaniVision <span className="field-hint">(ERP · Preispflege)</span>
            <input
              value={erpContractGroup}
              onChange={e=>setErpContractGroup(e.target.value)}
              placeholder="z. B. XY"
              disabled={!contractId||Boolean(uploadId)}
            />
          </label>
          <div className="erp-mapping-hint">
            <small>ERP-System</small><b>SaniVision</b>
            <span>Manuelle Zuordnung für die Preispflege im ERP.</span>
          </div>
        </div>

        <div className="ik-validity-panel embedded">
          <div className="ik-validity-head">
            <div><h3>IK-Zugehörigkeit / Gültigkeit</h3><p>Für welche IK gilt dieser Vertragsstand – und in welchem Zeitraum?</p></div>
            <Badge tone="info">{Object.values(ikScopes).filter(x=>x?.selected).length} IK ausgewählt</Badge>
          </div>
          {contractId?<div className="ik-validity-table">
            <div className="ik-validity-row ik-validity-header">
              <span>Gilt</span><span>Standort / IK</span><span>Gültig ab</span><span>Gültig bis</span>
            </div>
            {sortedSites.map(site=>{
              const row=ikScopes[site.ik]||{selected:false,validFrom:'',validTo:''}
              return <div className={'ik-validity-row '+(!site.active?'inactive':'')} key={site.site_id||site.ik}>
                <label className="ik-check">
                  <input type="checkbox" checked={Boolean(row.selected)} disabled={Boolean(uploadId)}
                    onChange={e=>setIkScope(site.ik,{selected:e.target.checked})}/>
                </label>
                <div className="ik-site"><b>{site.branch||'Standort'}</b><small>IK {site.ik}{!site.active?' · inaktiv':''}</small></div>
                <input type="date" value={row.validFrom||''} disabled={!row.selected||Boolean(uploadId)}
                  onChange={e=>setIkScope(site.ik,{validFrom:e.target.value})}/>
                <input type="date" value={row.validTo||''} disabled={!row.selected||Boolean(uploadId)}
                  onChange={e=>setIkScope(site.ik,{validTo:e.target.value})}/>
              </div>
            })}
          </div>:<div className="context-placeholder">Nach Auswahl des Vertragsstamms werden die bekannten Standorte/IKs und bestehende Zuordnungen geladen.</div>}
          <div className="ik-validity-note">IK-Gültigkeit wird separat von PQ und Vertragsbeitritt geführt. Erst die fachliche Freigabe veröffentlicht Änderungen.</div>
        </div>
      </div>

      {!uploadId&&<div
        className={'dropzone '+(dragging?'dragging ':'')+(file?'has-file':'')}
        onDragOver={e=>{e.preventDefault();setDragging(true)}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);selectFile(e.dataTransfer.files?.[0])}}
        onClick={()=>inputRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')inputRef.current?.click()}}
      >
        <input ref={inputRef} type="file" hidden
          accept=".pdf,.xlsx,.xls,.csv,.txt,.doc,.docx,.zip,.msg"
          onChange={e=>selectFile(e.target.files?.[0])}/>
        <div className="drop-icon">{file?extIcon(file.name,27):<CloudUpload size={29}/>}</div>
        {file?<><strong>{file.name}</strong><span>{fmtBytes(file.size)} · Datei ändern</span></>:<>
          <strong>Vertragsdatei hier ablegen</strong>
          <span>oder klicken · PDF, Excel, CSV, Word, ZIP · maximal 50 MB</span>
        </>}
      </div>}

      {!uploadId&&<div className="upload-actions">
        <div className="upload-security"><ShieldCheck size={17}/><span>Privater Storage · serverseitiger SHA-256 · Dublettenprüfung</span></div>
        <button className="primary inline-button" disabled={!contractId||!file||Boolean(busy)} onClick={startUpload}>
          {busy?<LoaderCircle className="spin" size={17}/>:<UploadCloud size={17}/>} Hochladen & erkennen
        </button>
      </div>}

      {busy&&<div className="progress-line"><LoaderCircle className="spin" size={17}/><span>{
        busy==='upload'?'Originaldatei wird sicher abgelegt …':
        busy==='parse'?'Vertragsinhalt wird strukturiert erkannt …':
        busy==='compare'?'Änderungen werden mit dem aktuellen Vertrag verglichen …':
        'Änderungen werden veröffentlicht …'
      }</span></div>}
      {error&&<div className="alert error">{error}</div>}
      {message&&<div className="alert success">{message}</div>}
    </section>

    {parser&&status!=='REVIEW'&&status!=='ACCEPTED'&&<section className="panel parser-panel">
      <div className="sectionbar">
        <div><h2>Erkannter Inhalt</h2><p>Nur vollständig gelieferte Bereiche dürfen als Ersatzbestand verglichen werden.</p></div>
        <Badge tone={isPdf?'warn':'info'}>{isPdf?'PDF – Teilquelle':'Tabellenparser'}</Badge>
      </div>

      {parser.result?.detected?.length>0&&<div className="detected-sheets">
        {parser.result.detected.map((d,i)=><div key={d.sheet||i}>
          {d.type==='POSITION'?<FileSpreadsheet size={18}/>:d.type==='VERSION'?<FileText size={18}/>:<Search size={18}/>}
          <span><b>{d.sheet}</b><small>{d.type} · {Number(d.rows||0).toLocaleString('de-DE')} Zeilen</small></span>
        </div>)}
      </div>}

      {isPdf&&<div className="pdf-findings">
        <div><small>Dokumenttyp</small><b>{parser.result?.component_type||'Dokument'}</b></div>
        <div><small>Seiten</small><b>{parser.result?.pages??'—'}</b></div>
        <div><small>Produktgruppen</small><b>{parser.result?.product_groups?.join(', ')||'—'}</b></div>
        <div><small>LEGS</small><b>{parser.result?.legs?.join(', ')||'—'}</b></div>
        <div><small>Positionshinweise</small><b>{parser.result?.position_hints??0}</b></div>
      </div>}

      {suggested.length>0?<div className="complete-check">
        <h3>Welche Bereiche sind in dieser Datei vollständig?</h3>
        <p>Die Vorauswahl stammt aus dem Parser. Nur bestätigte Bereiche werden gegen den aktuellen Bestand verglichen.</p>
        <div className="type-options">{suggested.map(type=><label key={type}>
          <input type="checkbox" checked={completeTypes.includes(type)} onChange={()=>toggleType(type)}/>
          <span><b>{TYPE_LABELS[type]||type}</b><small>als vollständigen Lieferstand vergleichen</small></span>
        </label>)}</div>
        <div className="parser-actions">
          <button className="primary inline-button" disabled={!completeTypes.length||Boolean(busy)} onClick={compareNow}>
            <GitCompare size={17}/> Bestätigen & Änderungen ermitteln
          </button>
        </div>
      </div>:<div className="review-callout muted-callout">
        <div><AlertTriangle size={19}/><div><b>Keine automatische Vollständigkeit angenommen</b><p>Die Quelle ist gespeichert und analysiert. Ein einzelnes PDF oder eine unklare Tabelle wird nicht als vollständiger Ersatzvertrag behandelt und kann daher nichts aus dem Livebestand entfernen.</p></div></div>
      </div>}
    </section>}

    <UploadStatusCard detail={detail} canFach={canFach} onAccept={acceptNow} busy={Boolean(busy)} precheckMode={precheckMode}/>

    {uploadId&&<div className="workflow-footer">
      <span>Upload-ID <code>{uploadId}</code></span>
      {onOpenChanges&&<button className="secondary inline-button" onClick={onOpenChanges}><GitCompare size={16}/> Zum Änderungsprotokoll</button>}
    </div>}
  </div>
}
