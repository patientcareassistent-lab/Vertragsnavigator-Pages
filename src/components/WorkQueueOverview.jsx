import React,{useEffect,useMemo,useState} from 'react'
import {ArrowRight,BookOpenCheck,Bug,ClipboardCheck,FileClock,FilePlus2,MessageSquareText,RefreshCw,ShieldCheck} from 'lucide-react'
import {supabase} from '../lib/supabase.js'

const OPEN_QUESTION_STATUSES=['OPEN','IN_REVIEW','ANSWERED']
const OPEN_PG_STATUSES=['NEW','READ','QUESTION_OPEN','ANSWER_RECEIVED','CLARIFIED']
const fmt=n=>n===null?'—':Number(n||0).toLocaleString('de-DE')

const cardDefinitions={
  questions:{label:'Vertragsfragen',description:'Offene Fragen, fachliche Antworten und Rückmeldungen bearbeiten.',route:'questions',Icon:MessageSquareText},
  pgReviews:{label:'PG-Änderungsprüfungen',description:'Vertragsänderungen je Produktgruppe beurteilen und dokumentieren.',route:'pgReviews',Icon:ClipboardCheck},
  addonReview:{label:'Zusatzpositionen prüfen',description:'Originalvertragsstellen mit Grund- und Zusatzpositionen abgleichen.',route:'addonReview',Icon:ShieldCheck},
  changes:{label:'Änderungsprotokoll',description:'Vertragsuploads und Änderungen kontrollieren.',route:'changes',Icon:FileClock},
  upload:{label:'Vertrag hochladen',description:'Neue Vertragsquellen erfassen und Änderungen anstoßen.',route:'upload',Icon:FilePlus2},
  backlog:{label:'Fehler / Änderungen melden',description:'Fehler und Verbesserungsvorschläge erfassen und nachverfolgen.',route:'backlog',Icon:Bug},
  knowledge:{label:'Vertragswissen',description:'Freigegebenes Wissen und Originalquellen gezielt durchsuchen.',route:'knowledge',Icon:BookOpenCheck},
  admin:{label:'Admin-Arbeitsvorrat',description:'Vorprüfungen, Veröffentlichungssperren und technische Blocker steuern.',route:'admin',Icon:ClipboardCheck},
}

export function workQueueCards({canFach=false,inFachMode=false,inAdminMode=false}={}){
  const common=['questions','changes','upload','backlog','knowledge']
  if(inAdminMode)return ['admin','pgReviews','addonReview',...common]
  if(canFach&&inFachMode)return ['pgReviews','addonReview',...common]
  return common
}

export default function WorkQueueOverview({canFach=false,inFachMode=false,inAdminMode=false,onNavigate}){
  const cards=useMemo(()=>workQueueCards({canFach,inFachMode,inAdminMode}),[canFach,inFachMode,inAdminMode])
  const [counts,setCounts]=useState({})
  const [errors,setErrors]=useState({})
  const [busy,setBusy]=useState(false)
  const [refreshed,setRefreshed]=useState(null)

  async function reload(){
    setBusy(true)
    const requests=[
      ['questions',()=>supabase.from('vn_contract_questions').select('question_id',{count:'exact',head:true}).in('status',OPEN_QUESTION_STATUSES)],
      ...(cards.includes('pgReviews')?[['pgReviews',()=>supabase.from('contract_change_reviews').select('review_id',{count:'exact',head:true}).in('status',OPEN_PG_STATUSES)]]:[]),
      ...(cards.includes('addonReview')?[['addonReview',()=>supabase.from('vn_position_addon_candidates').select('candidate_id',{count:'exact',head:true}).eq('review_status','PENDING')]]:[]),
    ]
    const results=await Promise.all(requests.map(async ([key,read])=>{
      try{
        const result=await read()
        if(result.error)throw result.error
        return {key,count:result.count??null,error:null}
      }catch(e){return {key,count:null,error:'Zähler nicht abrufbar'}}
    }))
    setCounts(Object.fromEntries(results.map(r=>[r.key,r.count])))
    setErrors(Object.fromEntries(results.filter(r=>r.error).map(r=>[r.key,r.error])))
    setRefreshed(new Date())
    setBusy(false)
  }

  useEffect(()=>{reload()},[canFach,inFachMode,inAdminMode])

  return <div className="work-queue-overview">
    <section className="panel work-queue-intro">
      <div className="sectionbar">
        <div><h2>Was steht an?</h2><p>Direkte Zugriffe auf Ihre Arbeitsbereiche. Zähler zeigen ausschließlich Datensätze, die Ihr Konto laut Datenbankberechtigungen lesen darf.</p></div>
        <button type="button" className="secondary" onClick={reload} disabled={busy}><RefreshCw className={busy?'spin':''} size={16}/> Aktualisieren</button>
      </div>
      <p className="work-queue-meta" role="status">{busy?'Arbeitsvorrat wird aktualisiert …':refreshed?'Stand der Zähler: '+refreshed.toLocaleTimeString('de-DE'):'Zähler werden geladen …'}</p>
    </section>
    <div className="work-queue-grid">
      {cards.map(key=>{
        const item=cardDefinitions[key]
        const Icon=item.Icon
        const hasCount=Object.hasOwn(counts,key)
        return <article className="panel work-queue-card" key={key}>
          <div className="work-queue-card-title"><Icon size={22} aria-hidden="true"/><h3>{item.label}</h3>
            {hasCount&&<span className="work-queue-number" aria-label={errors[key]?'Zähler nicht abrufbar':fmt(counts[key])+' offen'}>{errors[key]?'—':fmt(counts[key])}</span>}
          </div>
          <p>{item.description}</p>
          {errors[key]&&<small className="work-queue-count-warning">{errors[key]}; Arbeitsbereich weiterhin erreichbar.</small>}
          <button type="button" className="secondary" onClick={()=>onNavigate(item.route)}>
            {item.label} öffnen <ArrowRight size={16} aria-hidden="true"/>
          </button>
        </article>
      })}
    </div>
    <p className="work-queue-disclaimer">Die Übersicht erteilt keine Fachfreigabe. Vertragsprüfung, Veröffentlichung und Entscheidung erfolgen ausschließlich im jeweiligen berechtigten Arbeitsbereich.</p>
  </div>
}
