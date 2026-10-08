import React,{useEffect,useState} from 'react'
import { BellRing, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

export default function ContractNoticeBanner(){
  const [notices,setNotices]=useState([])
  const [expanded,setExpanded]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    async function load(){
      try{
        const {data,error:e}=await supabase.from('contract_user_notifications')
          .select('notification_id,notification_type,title,summary,contract_id,published_at,notification_until')
          .eq('active',true)
          .gte('notification_until',new Date().toISOString())
          .order('published_at',{ascending:false}).limit(30)
        if(e)throw e
        if(active)setNotices(data||[])
      }catch(e){if(active)setError(e.message||String(e))}
    }
    load()
    return()=>{active=false}
  },[])
  if(!notices.length)return null
  const visible=expanded?notices:notices.slice(0,3)
  return <section className="contract-notice-banner" aria-label="Neue und geänderte Verträge">
    <div className="contract-notice-heading"><BellRing size={18}/><strong>Neue oder geänderte Verträge</strong><span className="badge">{notices.length}</span><small>14 Tage ab Veröffentlichung</small></div>
    {visible.map(n=><article className="contract-notice-item" key={n.notification_id}>
      <b>{n.title}</b><small>Veröffentlicht: {new Date(n.published_at).toLocaleDateString('de-DE')}</small>
      <p>{n.summary||'Vertragsänderung veröffentlicht. Bitte aktuellen Vertragsstand beachten.'}</p>
    </article>)}
    {notices.length>3&&<button type="button" className="secondary" onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>} {expanded?'Weniger':'Alle '+notices.length+' Hinweise'} anzeigen</button>}
  </section>
}
