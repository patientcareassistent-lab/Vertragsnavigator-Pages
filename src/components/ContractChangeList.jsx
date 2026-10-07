
import React from 'react'
import { ChevronRight } from 'lucide-react'

const ENTITY_LABELS={CONTRACT:'Vertrag',CONTRACT_VERSION:'Vertragsversion',CONTRACT_POSITION:'Position',CONTRACT_SCOPE:'Geltungsbereich',OTHER:'Sonstiges'}
const FIELD_LABELS={
  contract_name:'Vertragsname',normalized_contract_name:'Normalisierter Name',
  payer_families:'Kostenträger',product_groups:'Produktgruppen',legs:'LEGS',
  status:'Status',valid_from:'Gültig ab',valid_to:'Gültig bis',last_published:'Veröffentlicht am',
  preis:'Preis',rabatt:'Rabatt',genehmigung:'Genehmigung',freigrenze:'Freigrenze',
  gueltig_ab:'Gültig ab',gueltig_bis:'Gültig bis',versorgungsform:'Versorgungsform',
  verordnung:'Verordnung',code:'HMV-Code',pos:'Position',lkz:'LKZ',leistung:'Leistung',
  bezeichnung:'Bezeichnung',produktart_bezeichnung:'Produktart',ik:'IK',site_id:'Standort',erp_system:'ERP-System',contract_group:'SaniVision Vertragsgruppe',
}

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}

export function formatUploadDate(value){
  if(!value)return '—'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return String(value)
  return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:String(value).includes('T')?'short':undefined}).format(d)
}

export function formatUploadValue(value){
  if(value===null||value===undefined||value==='')return '—'
  if(Array.isArray(value))return value.join(', ')||'—'
  if(typeof value==='object')return JSON.stringify(value)
  if(typeof value==='number')return new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(value)
  return String(value)
}

function ChangeValue({change}){
  if(!change||typeof change!=='object')return <span>{formatUploadValue(change)}</span>
  return <div className="change-value">
    <div><small>ALT</small><span>{formatUploadValue(change.old)}</span></div>
    <ChevronRight size={15}/>
    <div><small>NEU</small><span>{formatUploadValue(change.new)}</span></div>
  </div>
}

export function ContractChangeList({changes=[]}){
  if(!changes.length)return <div className="empty-panel">Keine fachlichen Änderungen erkannt.</div>
  return <div className="change-list">
    {changes.map(change=>{
      const fields=change.change_kind==='UPDATE'?Object.entries(change.changes||{}):[]
      const snapshot=change.change_kind==='INSERT'?change.changes?.new:change.change_kind==='DELETE'?change.changes?.old:null
      const label=change.change_kind==='INSERT'?'Hinzugefügt':change.change_kind==='DELETE'?'Entfernt':'Geändert'
      const tone=change.change_kind==='DELETE'?'warn':change.change_kind==='INSERT'?'ok':'info'
      return <article className={'change-card '+String(change.change_kind||'').toLowerCase()} key={change.change_id}>
        <div className="change-card-head">
          <div className="change-symbol">{change.change_kind==='INSERT'?'+':change.change_kind==='DELETE'?'−':'↔'}</div>
          <div className="change-title">
            <small>{ENTITY_LABELS[change.entity_type]||change.entity_type}</small>
            <b>{change.note||change.entity_id}</b>
          </div>
          <Badge tone={tone}>{label}</Badge>
        </div>
        {fields.length>0&&<div className="change-fields">
          {fields.map(([field,value])=><div className="change-field" key={field}>
            <b>{FIELD_LABELS[field]||field}</b><ChangeValue change={value}/>
          </div>)}
        </div>}
        {snapshot&&<div className="change-snapshot">
          {Object.entries(snapshot).filter(([,v])=>v!==null&&v!==''&&v!==undefined).slice(0,8).map(([k,v])=>
            <span key={k}><b>{FIELD_LABELS[k]||k}:</b> {formatUploadValue(v)}</span>
          )}
        </div>}
      </article>
    })}
  </div>
}
