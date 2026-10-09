import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BookOpenCheck, Bug, CheckCircle2, CircleHelp, History, LayoutDashboard, LoaderCircle, MessageSquareText, ShieldCheck, Upload, XCircle } from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase.js'
import { recordRuntimeEvent } from './lib/runtimeTelemetry.js'
import ContractWitches from './components/ContractWitches.jsx'
import ContractUpload from './components/ContractUpload.jsx'
import ContractChanges from './components/ContractChanges.jsx'
import PositionDetail from './components/PositionDetail.jsx'
import MissingSources from './components/MissingSources.jsx'
import ContractTrafficLightPanel from './components/ContractTrafficLightPanel.jsx'
import ContractPrecheck from './components/ContractPrecheck.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import PayerFamilyReview from './components/PayerFamilyReview.jsx'
import DevelopmentBacklog from './components/DevelopmentBacklog.jsx'
import PGReviewQueue from './components/PGReviewQueue.jsx'
import QuestionsQueue from './components/QuestionsQueue.jsx'
import ContractExclusions from './components/ContractExclusions.jsx'
import ContractNoticeBanner from './components/ContractNoticeBanner.jsx'
import ContractMatrix from './components/ContractMatrix.jsx'
import AddonCandidateReview from './components/AddonCandidateReview.jsx'
import WorkQueueOverview from './components/WorkQueueOverview.jsx'
import './components/VNFeatures.css'

const NAV=[
  ['assistant','Versorgung prüfen'],
  ['contracts','Verträge'],
  ['matrix','Vertragsmatrix'],
  ['work','Arbeitsvorrat'],
]

const EMPTY_ADVANCED={
  hmv:'',position:'',productType:'',contract:'',legs:'',lkz:'',
  approval:'all',supplyForm:'all',prescription:'all',validOn:'',
  priceMode:'all',minPrice:'',maxPrice:'',pq:'all',accession:'all',authoritative:false,
}

const escArray=v=>Array.isArray(v)?v:(v?[v]:[])
const uniq=v=>[...new Set(v.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'))

const normalizeSearch=value=>String(value||'')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/ß/g,'ss')
  .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
  .replace(/[^a-z0-9]+/g,' ')
  .trim()

const searchTokens=value=>normalizeSearch(value).split(/\s+/).filter(Boolean)

const COMPANY_ALIAS_TEXT='VALUNY GmbH spectrumK Spectrum K ITSC GmbH'
const COMPANY_NOTICE_VISIBLE_UNTIL='2026-10-21T23:59:59+02:00'
const companyRelated=value=>{
  const n=normalizeSearch(value)
  return n.includes('valuny')||n.includes('spectrumk')||n.includes('spectrum k')||n.includes('itsc')
}
const companySearchText=value=>normalizeSearch(`${value||''} ${companyRelated(value)?COMPANY_ALIAS_TEXT:''}`)
function displayCompanyName(value){
  const name=String(value||'')
  const n=normalizeSearch(name)
  if((n.includes('spectrumk')||n.includes('spectrum k'))&&!n.includes('valuny')){
    return name.replace(/^spectrum\s*k/i,'VALUNY GmbH (ehemals spectrumK)')
  }
  return name
}
function canonicalCompanyQuery(value){
  const raw=String(value||'').trim()
  const n=normalizeSearch(raw)
  if(['valuny','valuny gmbh','spectrumk','spectrum k','spectrum k gmbh','itsc','itsc gmbh'].includes(n))return 'valuny'
  return raw
}

function tokenVariants(token){
  const out=new Set([token])
  for(const suffix of ['ern','en','er','es','e','s','n']){
    if(token.length>=6&&token.endsWith(suffix)&&token.length-suffix.length>=5)out.add(token.slice(0,-suffix.length))
  }
  const aliases={
    rolli:['rollstuhl','rollstuehl','rollstuhle'],
    rollstuhl:['rolli'],
    rollstuehle:['rollstuhl','rolli'],
    rollstuhle:['rollstuhl','rolli'],
    leichtgewichts:['leichtgewicht'],
    aktivrollstuhl:['aktiv','aktive nutzung','aktiven nutzung','spezialrollstuhl'],
    aktivrollstuhle:['aktiv','aktive nutzung','aktiven nutzung','spezialrollstuhl'],
    aktivrollstuehle:['aktiv','aktive nutzung','aktiven nutzung','spezialrollstuhl'],
    aktivstuhl:['aktiv','aktive nutzung','spezialrollstuhl'],
    valuny:['spectrumk','spectrum','itsc'],
    spectrumk:['valuny','spectrum','itsc'],
    spectrum:['spectrumk','valuny','itsc'],
    itsc:['valuny','spectrumk','spectrum'],
  }
  for(const alias of aliases[token]||[])out.add(normalizeSearch(alias))
  return [...out]
}

const rowSearchText=row=>normalizeSearch([
  row.pg,row.code,row.pos,row.bezeichnung,row.produktart_bezeichnung,
  row.contract,row.family,row.genehmigung,row.versorgungsform,
].filter(Boolean).join(' '))

function payerMatches(row,payer){
  if(!payer)return true
  const p=normalizeSearch(payer)
  const hay=normalizeSearch([row.family,row.contract].filter(Boolean).join(' '))
  const aliases={tk:['tk','techniker'],aok:['aok'],barmer:['barmer'],dak:['dak'],ikk:['ikk'],bkk:['bkk']}
  return (aliases[p]||[p]).some(x=>hay.includes(x))
}

function relevance(row,tokens){
  if(!tokens.length)return 1
  const hay=rowSearchText(row)
  let score=0
  for(const token of tokens){
    const variants=tokenVariants(token)
    const hit=variants.find(v=>hay.includes(v))
    if(!hit)return 0
    score+=hit===token?4:3
  }
  const name=normalizeSearch([row.bezeichnung,row.produktart_bezeichnung].join(' '))
  for(const token of tokens)if(tokenVariants(token).some(v=>name.includes(v)))score+=2
  return score
}


function payerDetailLabel(contract,family){
  const name=String(contract?.contract_name||'').trim()
  if(!name)return ''
  const prefix=name.split(':')[0].trim()
  const n=normalizeSearch(prefix)
  if(family==='AOK'){
    const rules=[
      [/^aok (bw|baden wurttemberg)/,'AOK Baden-Württemberg'],
      [/^aok bayern/,'AOK Bayern'],
      [/^aok bremen bremerhaven/,'AOK Bremen/Bremerhaven'],
      [/^aok bundesverband/,'AOK Bundesverband'],
      [/^aok hessen/,'AOK Hessen'],
      [/^aok niedersachsen/,'AOK Niedersachsen'],
      [/^aok nord ?ost/,'AOK Nordost'],
      [/^aok nord ?west/,'AOK Nordwest'],
      [/^aok plus/,'AOK Plus'],
      [/^aok rheinland pfalz saarland/,'AOK Rheinland-Pfalz/Saarland'],
      [/^aok rheinland hamburg/,'AOK Rheinland/Hamburg'],
      [/^aok sachsen anhalt/,'AOK Sachsen-Anhalt'],
    ]
    const hit=rules.find(([re])=>re.test(n))
    if(hit)return hit[1]
  }
  const cleaned=prefix.replace(/\s+[–-]\s+.*$/,'').trim()
  return cleaned||family||prefix
}

function Badge({children,tone=''}){return <span className={'badge '+tone}>{children}</span>}

export default function App(){
  const [session,setSession]=useState(null)
  const [userProfile,setUserProfile]=useState(null)
  const [authReady,setAuthReady]=useState(false)
  const [authError,setAuthError]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [active,setActive]=useState('assistant')
  const [mode,setMode]=useState('versorger')
  const [error,setError]=useState('')
  const [contracts,setContracts]=useState([])
  const [knowledge,setKnowledge]=useState([])
  const [knowledgeLoaded,setKnowledgeLoaded]=useState(false)
  const [questions,setQuestions]=useState([])
  const [questionsLoaded,setQuestionsLoaded]=useState(false)
  const [questionCount,setQuestionCount]=useState(0)
  const [relatedKnowledge,setRelatedKnowledge]=useState([])
  const [relatedKnowledgeBusy,setRelatedKnowledgeBusy]=useState(false)
  const [selectedSiteEligibilities,setSelectedSiteEligibilities]=useState([])
  const [sites,setSites]=useState([])
  const [stats,setStats]=useState({contracts:0,positions:0,knowledge:0,questions:0})
  const [payer,setPayer]=useState('')
  const [payerDetail,setPayerDetail]=useState('')
  const [pg,setPg]=useState('')
  const [term,setTerm]=useState('')
  const [siteId,setSiteId]=useState('')
  const [advanced,setAdvanced]=useState({...EMPTY_ADVANCED})
  const [results,setResults]=useState([])
  const [visibleResults,setVisibleResults]=useState(12)
  const [hasSearched,setHasSearched]=useState(false)
  const [selected,setSelected]=useState(null)
  const [supplyEval,setSupplyEval]=useState(null)
  const [supplyBusy,setSupplyBusy]=useState(false)
  const [searchBusy,setSearchBusy]=useState(false)
  const [contractQuery,setContractQuery]=useState('')
  const [knowledgeQuery,setKnowledgeQuery]=useState('')
  const [questionForm,setQuestionForm]=useState({question_text:'',payer:'',contract_id:'',pg:'',hmv_code:'',position_code:''})
  const [questionMessage,setQuestionMessage]=useState('')
  const [maintenanceContractId,setMaintenanceContractId]=useState('')

  // Die serverseitig gepflegte VN-Rolle ist maßgeblich, nicht veränderbare User-Metadaten.
  const databaseRole=String(userProfile?.role||'').toUpperCase()
  const role=databaseRole==='ADMIN'?'admin':databaseRole==='PG_ADMIN'?'fach':'versorger'
  const canFach=['fach','admin'].includes(role)
  const isAdmin=role==='admin'
  const modeLabel=mode==='admin'?'Administrator':mode==='fach'?'Innendienst':'Versorger'
  const candidateDisplayName=String(userProfile?.display_name||session?.user?.user_metadata?.display_name||session?.user?.user_metadata?.full_name||session?.user?.user_metadata?.username||'').trim()
  const displayName=candidateDisplayName&&!candidateDisplayName.includes('@')?candidateDisplayName:'Vertragsmanager'
  const inAdminMode=isAdmin&&mode==='admin'
  const inFachMode=canFach&&mode!=='versorger'
  const backlogNav=['backlog',inAdminMode?'Tickets & Entwicklungs-Backlog':'Fehler / Änderung melden']
  const navItems=NAV
  const secondaryNav=[['knowledge','Vertragswissen'],['upload','Vertrag hochladen'],['changes','Änderungen'],['questions','Vertragsfragen'],backlogNav,['data','Datenstand'],...(inFachMode?[['pgReviews','PG-Prüfungen'],['addonReview','Zusätze prüfen']]:[]),...(inAdminMode?[['admin','Admin-Cockpit'],['payerReview','Kassenfamilien'],['precheck','Vertragsvorprüfung'],['contractExclusions','Verträge ausschließen'],['missingSources','Fehlende Quellen']]:[])]
  const activeSecondary=secondaryNav.find(([id])=>active===id)?.[1]||''
  const payerOptions=useMemo(()=>uniq(contracts.flatMap(r=>escArray(r.payer_families))),[contracts])
  const payerDetailOptions=useMemo(()=>{
    if(!payer)return []
    // Keine globalen Namensalias-Einträge: nur Verträge der gewählten Kassenfamilie.
    const scoped=contracts
      .filter(r=>escArray(r.payer_families).includes(payer))
      .map(r=>payerDetailLabel(r,payer))
      .filter(v=>v&&normalizeSearch(v)!==normalizeSearch(payer))
    // Firmenumbenennungen als ein Eintrag statt drei scheinbar unterschiedlicher Kassen.
    return uniq(scoped.map(v=>companyRelated(v)?'VALUNY GmbH (ehemals spectrumK / ITSC)':v))
  },[contracts,payer])
  const pgOptions=useMemo(()=>uniq(contracts.flatMap(r=>escArray(r.product_groups))),[contracts])
  const filteredContracts=useMemo(()=>{
    const q=normalizeSearch(contractQuery)
    return contracts.filter(r=>!q||companySearchText(JSON.stringify(r)).includes(q))
  },[contracts,contractQuery])
  const filteredKnowledge=useMemo(()=>{
    const q=knowledgeQuery.trim().toLowerCase()
    return knowledge.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q))
  },[knowledge,knowledgeQuery])

  useEffect(()=>{
    if(!supabase){setAuthReady(true);return}
    supabase.auth.getSession().then(({data})=>{setSession(data.session||null);setAuthReady(true)})
    const {data:listener}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);setAuthReady(true)})
    return ()=>listener.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    const onError=()=>recordRuntimeEvent({severity:'ERROR',area:'FRONTEND',code:'WINDOW_ERROR',route:'app'})
    const onReject=()=>recordRuntimeEvent({severity:'ERROR',area:'FRONTEND',code:'UNHANDLED_REJECTION',route:'app'})
    window.addEventListener('error',onError)
    window.addEventListener('unhandledrejection',onReject)
    return()=>{
      window.removeEventListener('error',onError)
      window.removeEventListener('unhandledrejection',onReject)
    }
  },[])

  useEffect(()=>{
    let cancelled=false
    async function bootstrapSession(){
      if(session){
        const {data,error}=await supabase
          .from('vn_users')
          .select('active,role,display_name')
          .eq('auth_user_id',session.user.id)
          .eq('active',true)
          .maybeSingle()
        if(cancelled)return
        if(error){
          setUserProfile(null)
          recordRuntimeEvent({severity:'ERROR',area:'AUTH_BOOTSTRAP',code:error.code||'PROFILE_LOAD_FAILED',route:'login'})
          setError('Benutzerstatus konnte nicht geprüft werden: '+error.message)
          return
        }
        if(!data){
          setUserProfile(null)
          setAuthError('Der Zugang zum Vertragsnavigator ist nicht freigeschaltet.')
          await supabase.auth.signOut()
          return
        }
        setUserProfile(data)
        const profileRole=String(data.role||'').toUpperCase()
        setMode(profileRole==='ADMIN'?'admin':profileRole==='PG_ADMIN'?'fach':'versorger')
        setActive(profileRole==='ADMIN'?'admin':'assistant')
        await loadData()
        return
      }
      setUserProfile(null)
      setKnowledge([]);setKnowledgeLoaded(false)
      setQuestions([]);setQuestionsLoaded(false);setQuestionCount(0)
      setRelatedKnowledge([]);setSelectedSiteEligibilities([])
    }
    bootstrapSession()
    return()=>{cancelled=true}
  },[session?.user?.id])
  useEffect(()=>{
    let cancelled=false
    async function evaluateSelected(){
      if(!selected||!siteId){setSupplyEval(null);setSupplyBusy(false);return}
      setSupplyBusy(true)
      try{
        const args={
          p_site_id:siteId,
          p_position_row_id:selected.position_row_id,
          p_hmv_code_override:selected.code||advanced.hmv||null,
        }
        if(advanced.validOn)args.p_as_of=advanced.validOn
        const {data,error}=await supabase.rpc('evaluate_position_supply_v3',args)
        if(error)throw error
        if(!cancelled)setSupplyEval(Array.isArray(data)?(data[0]||null):data||null)
      }catch(e){
        if(!cancelled){
          setSupplyEval(null)
          setError(e.message||String(e))
          recordRuntimeEvent({severity:'ERROR',area:'SUPPLY_EVAL',code:e?.code||'EVALUATION_FAILED',route:'assistant'})
        }
      }finally{
        if(!cancelled)setSupplyBusy(false)
      }
    }
    evaluateSelected()
    return()=>{cancelled=true}
  },[selected?.position_row_id,siteId,advanced.validOn,advanced.hmv])

  useEffect(()=>{
    if(!selected)return
    const timer=window.setTimeout(()=>{
      const heading=document.getElementById('assistantDecisionHeading')
      if(!heading)return
      heading.focus({preventScroll:true})
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
      heading.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'})
    },60)
    return()=>window.clearTimeout(timer)
  },[selected?.position_row_id])

  async function login(e){
    e.preventDefault();setAuthError('')
    const login=username.trim()
    if(!login||!password){setAuthError('Benutzername und Passwort erforderlich.');return}

    const {data,error}=await supabase.functions.invoke('vn2-auth-login',{
      body:{username:login,password},
    })

    if(error){
      let message=error.message||'Anmeldung fehlgeschlagen.'
      try{
        const payload=await error.context?.json?.()
        if(payload?.error)message=payload.error
      }catch{}
      setAuthError(message)
      return
    }
    if(data?.error){setAuthError(data.error);return}
    if(!data?.session?.access_token||!data?.session?.refresh_token){
      setAuthError('Neue Sitzung konnte nicht erstellt werden.')
      return
    }

    const {error:setError}=await supabase.auth.setSession({
      access_token:data.session.access_token,
      refresh_token:data.session.refresh_token,
    })
    if(setError)setAuthError(setError.message)
  }

  async function loadData(){
    const started=performance.now()
    setError('')
    const [cc,pc,kc,qr,cr,sr]=await Promise.all([
      supabase.from('vn_contract_read_model_p2').select('contract_id',{count:'planned',head:true}),
      supabase.from('vn_position_catalog').select('position_row_id',{count:'planned',head:true}),
      supabase.from('vn_contract_knowledge_approved').select('knowledge_id',{count:'planned',head:true}),
      supabase.from('vn_contract_questions_open_p2').select('question_id',{count:'exact',head:true}),
      supabase.from('vn_contract_read_model_p2').select('*').order('contract_name').limit(700),
      supabase.from('vn_site_directory').select('*').order('branch').limit(100),
    ])
    const first=[cc,pc,kc,qr,cr,sr].find(r=>r.error)?.error
    if(first){
      const raw=String(first.message||'')
      const recovering=/not accepting connections|starting up|hot standby|timeout/i.test(raw)
      recordRuntimeEvent({
        severity:recovering?'WARN':'ERROR',
        area:'APP_LOAD_DATA',
        code:recovering?'DATABASE_RECOVERING':(first.code||'LOAD_FAILED'),
        route:'bootstrap',
        durationMs:performance.now()-started,
      })
      setError(recovering
        ? 'Vertragsdatenbank befindet sich in Wiederherstellung. Bitte später erneut versuchen.'
        : raw)
      return
    }
    const loadDuration=performance.now()-started
    if(loadDuration>=5000)recordRuntimeEvent({severity:'WARN',area:'APP_LOAD_DATA',code:'SLOW_LOAD',route:'bootstrap',durationMs:loadDuration})
    setContracts(cr.data||[])
    setSites((sr.data||[]).map(s=>({...s,eligibilities:[]})))
    setQuestionCount(qr.count||0)
    setStats({contracts:cc.count||0,positions:pc.count||0,knowledge:kc.count||0,questions:qr.count||0})
  }

  async function loadKnowledge(){
    if(knowledgeLoaded)return
    const {data,error:e}=await supabase.from('vn_contract_knowledge_approved')
      .select('*')
      .order('updated_at',{ascending:false})
      .limit(500)
    if(e){
      recordRuntimeEvent({severity:'ERROR',area:'KNOWLEDGE_LOAD',code:e.code||'LOAD_FAILED',route:'knowledge'})
      setError(e.message||String(e));return
    }
    setKnowledge(data||[])
    setKnowledgeLoaded(true)
  }

  async function loadQuestions(force=false){
    if(questionsLoaded&&!force)return
    const {data,error:e}=await supabase.from('vn_contract_questions')
      .select('*')
      .order('created_at',{ascending:false})
      .limit(100)
    if(e){
      recordRuntimeEvent({severity:'ERROR',area:'QUESTIONS_LOAD',code:e.code||'LOAD_FAILED',route:'questions'})
      setError(e.message||String(e));return
    }
    setQuestions(data||[])
    setQuestionsLoaded(true)
    setQuestionCount((data||[]).filter(q=>!['CLOSED','RESOLVED','ANSWERED'].includes(String(q.status||'').toUpperCase())).length)
  }

  useEffect(()=>{
    if(session&&active==='knowledge')loadKnowledge()
  },[active,session,knowledgeLoaded])

  useEffect(()=>{
    if(session&&active==='questions')loadQuestions()
  },[active,session,questionsLoaded])

  useEffect(()=>{
    let cancelled=false
    async function loadRelatedKnowledge(){
      if(!selected){setRelatedKnowledge([]);setRelatedKnowledgeBusy(false);return}
      setRelatedKnowledgeBusy(true)
      try{
        let request=supabase.from('vn_contract_knowledge_approved')
          .select('*')
          .order('updated_at',{ascending:false})
          .limit(100)
        if(selected.contract_id)request=request.or('contract_id.is.null,contract_id.eq.'+selected.contract_id)
        const {data,error:e}=await request
        if(e)throw e
        if(cancelled)return
        const contract=contracts.find(c=>String(c.contract_id)===String(selected.contract_id))
        const rows=(data||[]).filter(k=>{
          if(k.contract_id&&String(k.contract_id)!==String(selected.contract_id||''))return false
          if(k.pg&&String(k.pg)!==String(selected.pg||''))return false
          if(k.hmv_code&&String(k.hmv_code)!==String(selected.code||''))return false
          if(k.position_code&&String(k.position_code)!==String(selected.pos||''))return false
          if(k.payer){
            const hay=normalizeSearch([selected.family,selected.contract,contract?.contract_name,escArray(contract?.payer_families).join(' ')].filter(Boolean).join(' '))
            if(!hay.includes(normalizeSearch(k.payer)))return false
          }
          return true
        })
        setRelatedKnowledge(rows)
      }catch(e){
        if(!cancelled){setRelatedKnowledge([]);setError(e.message||String(e))}
      }finally{
        if(!cancelled)setRelatedKnowledgeBusy(false)
      }
    }
    loadRelatedKnowledge()
    return()=>{cancelled=true}
  },[selected?.position_row_id,selected?.contract_id,selected?.pg,selected?.code,selected?.pos,contracts])

  useEffect(()=>{
    let cancelled=false
    async function loadSelectedSiteEligibility(){
      if(!selected||!siteId||!selected.contract_id){setSelectedSiteEligibilities([]);return}
      const {data,error:e}=await supabase.from('vn_site_eligibility')
        .select('site_id,contract_id,contract,status,prerequisites_met,vtv_status,valid_from,valid_to,active,review_required,contract_match_status')
        .eq('site_id',siteId)
        .eq('contract_id',selected.contract_id)
        .limit(20)
      if(cancelled)return
      if(e){setSelectedSiteEligibilities([]);return}
      setSelectedSiteEligibilities(data||[])
    }
    loadSelectedSiteEligibility()
    return()=>{cancelled=true}
  },[selected?.position_row_id,selected?.contract_id,siteId])

  function choosePosition(row){
    setSupplyEval(null)
    setError('')
    setSelected(row)
  }

  async function runAssistant(e){
    e.preventDefault();setSelected(null);setSupplyEval(null);setError('');setVisibleResults(12);setHasSearched(false)

    if(payerDetail&&(!payer||!payerDetailOptions.includes(payerDetail))){setError('Bitte eine zum Kostenträger passende Kasse / Region auswählen.');setResults([]);return}

    const hasAdvanced=[
      advanced.hmv,advanced.position,advanced.productType,advanced.contract,advanced.legs,advanced.lkz,
      advanced.approval!=='all'?'x':'',
      advanced.supplyForm!=='all'?'x':'',
      advanced.prescription!=='all'?'x':'',
      advanced.validOn,
      advanced.priceMode!=='all'?'x':'',
      advanced.minPrice,advanced.maxPrice,
      advanced.pq!=='all'?'x':'',
      advanced.accession!=='all'?'x':'',
      advanced.authoritative?'x':'',
    ].some(Boolean)

    if(!term.trim()&&!pg&&!payer&&!payerDetail.trim()&&!hasAdvanced){setResults([]);return}
    if((advanced.pq!=='all'||advanced.accession!=='all')&&!siteId){
      setError('Für PQ oder Vertragsbeitritt bitte zuerst einen Standort auswählen.')
      return
    }

    const toNumber=value=>String(value).trim()===''?null:Number(value)
    const rawTerm=canonicalCompanyQuery(term)
    const termIsHmv=/^\d{2}(?:\.\d{2}){1,3}(?:\.\d{1,4})?$/.test(rawTerm)
    const termIsPosition=/^\d{6,12}$/.test(rawTerm)
    const companyContractQuery=canonicalCompanyQuery(advanced.contract)
    const contractAliasQuery=companyContractQuery.toLowerCase()==='valuny'&&!term.trim()?companyContractQuery:null
    const freeTextQuery=(!termIsHmv&&!termIsPosition&&rawTerm)?rawTerm:contractAliasQuery
    const rpcName='vn_search_positions_v14'
    setSearchBusy(true)
    setHasSearched(true)
    try{
      const {data,error}=await supabase.rpc(rpcName,{
        p_payer:payer||null,
        p_payer_detail:payerDetail.trim()?(companyRelated(payerDetail)?'spectrumK':payerDetail.trim()):null,
        p_pg:pg||null,
        p_query:freeTextQuery,
        p_hmv:advanced.hmv.trim()||(termIsHmv?rawTerm:null),
        p_position:advanced.position.trim()||(termIsPosition?rawTerm:null),
        p_identifier:null,
        p_product_type:advanced.productType.trim()||null,
        p_contract:canonicalCompanyQuery(advanced.contract).toLowerCase()==='valuny'?null:(advanced.contract.trim()||null),
        p_legs:advanced.legs.trim()||null,
        p_lkz:advanced.lkz.trim()||null,
        p_approval:advanced.approval,
        p_supply_form:advanced.supplyForm,
        p_prescription:advanced.prescription,
        p_valid_on:advanced.validOn||null,
        p_price_mode:advanced.priceMode,
        p_min_price:toNumber(advanced.minPrice),
        p_max_price:toNumber(advanced.maxPrice),
        p_authoritative_only:advanced.authoritative,
        p_site_id:siteId||null,
        p_pq:advanced.pq,
        p_accession:advanced.accession,
        p_fuzzy:false,
        p_limit:150,
      })
      if(error){
        setResults([])
        const timeout=error.code==='57014'||/statement timeout|canceling statement due to statement timeout/i.test(error.message||'')
        recordRuntimeEvent({severity:'ERROR',area:'SEARCH',code:timeout?'57014':(error.code||'SEARCH_FAILED'),route:'assistant'})
        setError(timeout?'Die Suche hat das Datenbank-Zeitlimit erreicht. Bitte Suche durch eine Kasse/Region, Produktgruppe oder einen Suchbegriff eingrenzen.':error.message)
        return
      }
      setResults(data||[])
    }catch(e){
      setResults([])
      recordRuntimeEvent({severity:'ERROR',area:'SEARCH',code:e?.code||'SEARCH_FAILED',route:'assistant'})
      setError('Suchanfrage fehlgeschlagen: '+(e?.message||'Verbindung zur Datenbank prüfen.'))
    }finally{
      setSearchBusy(false)
    }
  }

  function resetAssistantSearch(){
    setPayer('')
    setPayerDetail('')
    setPg('')
    setTerm('')
    setSiteId('')
    setAdvanced({...EMPTY_ADVANCED})
    setResults([])
    setVisibleResults(12)
    setHasSearched(false)
    setSelected(null)
    setSupplyEval(null)
    setError('')
    setTimeout(()=>document.getElementById('assistantTerm')?.focus(),80)
  }

  function setA(key,value){setAdvanced(current=>({...current,[key]:value}))}

  function setQ(k,v){setQuestionForm(f=>({...f,[k]:v}))}
  async function submitQuestion(e){
    e.preventDefault();setQuestionMessage('')
    if(questionForm.question_text.trim().length<5){setQuestionMessage('Bitte eine konkrete Vertragsfrage eingeben.');return}
    const payload={created_by:session.user.id,question_text:questionForm.question_text.trim(),status:'OPEN',payer:questionForm.payer.trim()||null,contract_id:questionForm.contract_id||null,pg:questionForm.pg.trim()||null,hmv_code:questionForm.hmv_code.trim()||null,position_code:questionForm.position_code.trim()||null}
    const {data,error}=await supabase.from('vn_contract_questions').insert(payload).select('*').single()
    if(error){setQuestionMessage(error.message);return}
    if(questionsLoaded)setQuestions(q=>[data,...q])
    setQuestionCount(count=>count+1)
    setStats(s=>({...s,questions:s.questions+1}))
    setQuestionForm({question_text:'',payer:'',contract_id:'',pg:'',hmv_code:'',position_code:''})
    setQuestionMessage('Vertragsfrage wurde in die Prüfqueue übernommen.')
  }

  function jump(view,focusId){
    setActive(view)
    if(focusId)setTimeout(()=>document.getElementById(focusId)?.focus(),120)
  }

  function switchMode(next){
    if(next==='admin'&&!isAdmin)return
    if(next==='fach'&&!canFach)return
    setMode(next)
    const adminPages=['admin','payerReview','precheck','missingSources','pgReviews','addonReview','contractExclusions']
    if(next==='admin')setActive('admin')
    else if(adminPages.includes(active))setActive('assistant')
  }

  const selectedSite=sites.find(s=>String(s.site_id)===String(siteId))
  const siteMatch=selectedSiteEligibilities.find(e=>e.active)||selectedSiteEligibilities[0]||null
  const selectedContract=selected?contracts.find(c=>String(c.contract_id)===String(selected.contract_id)):null
  const resultContractCount=new Set(results.map(r=>r.contract_id||r.contract||r.family).filter(Boolean)).size
  const supplyDecision=supplyEval?.decision||''
  const decisionTone=!selected||!siteId||supplyBusy||!supplyEval?'idle':supplyDecision==='GRUEN'?'ok':supplyDecision==='ROT'?'bad':'warn'
  const decisionLabel=!selected?'Position auswählen':!siteId?'Standort auswählen':supplyBusy?'Prüfung läuft':supplyDecision==='GRUEN'?'Versorgung möglich':supplyDecision==='ROT'?'Versorgung nicht möglich':supplyEval?'Prüfung erforderlich':'Prüfung steht aus'
  const DecisionIcon=decisionTone==='ok'?CheckCircle2:decisionTone==='bad'?XCircle:decisionTone==='warn'?AlertTriangle:CircleHelp
  const supplyPathOk=supplyEval?.pq_decision==='GRUEN'&&supplyEval?.accession_decision==='GRUEN'&&Number(supplyEval?.green_scope_count||0)>0
  const supplyV3Actions=Array.isArray(supplyEval?.action_items)?supplyEval.action_items:[]
  const supplyV3Blockers=Array.isArray(supplyEval?.hard_blockers)?supplyEval.hard_blockers:[]
  const supplyV3Checks=Array.isArray(supplyEval?.manual_checks)?supplyEval.manual_checks:[]
  const supplyPathValue=!siteId?'Standort auswählen':
    supplyBusy?'PQ und Vertragsbeitritt werden geprüft …':
    supplyEval?
      `PQ: ${supplyEval.pq_decision==='GRUEN'?'vorhanden':supplyEval.pq_decision==='ROT'?'nicht vorhanden':'prüfen'} · Vertragsweg: ${Number(supplyEval.green_scope_count||0)>0?Number(supplyEval.green_scope_count)+' aktiv':Number(supplyEval.matching_scope_count||0)>0?'prüfen':'kein passender Umfang'}`
      :(siteMatch?([siteMatch.status,siteMatch.prerequisites_met].filter(Boolean).join(' · ')||'aktiv'):'Kein eindeutiger Vertragsbeitritt')

  if(!supabaseConfigured)return <main className="center"><section className="auth-card"><h1>Vertragsnavigator 2.1</h1><p>Supabase ist noch nicht konfiguriert.</p></section></main>
  if(!authReady)return <main className="center"><section className="auth-card"><p>Anmeldung wird geprüft …</p></section></main>
  if(!session)return <main className="center"><form className="auth-card" onSubmit={login}>
    <div className="brandline"><div className="brandmark">B</div><div className="brandcopy"><b>Vertragsnavigator 2.1</b><small>brillinger | ottobock.care · Vertragsassistent</small></div></div>
    <h1>Vertragsassistent öffnen</h1><p className="lead">Geschützter Zugriff auf Vertragsprüfung, Vertragswissen und Vertragsfragen.</p>
    <label>Benutzername<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Mitarbeiter1" required/></label>
    <label>Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
    {authError&&<div className="alert error">{authError}</div>}<button className="primary" type="submit">Anmelden</button>
  </form></main>

  return <div className={'app '+(['fach','admin'].includes(mode)?'mode-fach':'')}>
    <header className="top">
      <div className="masthead">
        <div className="brand-small"><div className="brandmark">B</div><div><strong>Vertragsnavigator 2.1</strong><small>brillinger | ottobock.care · Vertragsassistent</small></div></div>
        <div className="userbar"><span>{displayName}</span>{displayName.trim().toLocaleLowerCase()!=='sachbearbeiter'&&<Badge>{modeLabel}</Badge>}<button className="secondary" onClick={()=>supabase.auth.signOut()}>Abmelden</button></div>
      </div>
      <div className="navwrap"><nav className="nav">
        {navItems.map(([id,label])=><button key={id} type="button" aria-current={active===id?'page':undefined} className={active===id?'active':''} onClick={()=>setActive(id)}>{label}</button>)}
        <details className={'nav-more '+(activeSecondary?'nav-more-active':'')} key={mode}>
          <summary>Weitere Bereiche{activeSecondary&&<span className="nav-more-current"> · {activeSecondary}</span>}</summary>
          <div className="nav-more-list" aria-label="Weitere Arbeitsbereiche">
            {secondaryNav.map(([id,label])=><button key={id} type="button" aria-current={active===id?'page':undefined} className={active===id?'active':''} onClick={e=>{setActive(id);e.currentTarget.closest('details').open=false}}>{label}</button>)}
          </div>
        </details>
        <div className="mode-toggle"><button className={mode==='versorger'?'active':''} onClick={()=>switchMode('versorger')}>Versorger</button>{canFach&&<button className={mode==='fach'?'active':''} onClick={()=>switchMode('fach')}>Innendienst</button>}{isAdmin&&<button className={mode==='admin'?'active':''} onClick={()=>switchMode('admin')}>Administrator</button>}</div>
      </nav></div>
    </header>

    <aside className="quick-rail" aria-label="Schnellzugriff">
      <button className={active==='knowledge'?'active':''} onClick={()=>jump('knowledge','knowledgeSearch')} title="Vertragswissen" aria-label="Vertragswissen"><BookOpenCheck size={19}/></button>
      {inAdminMode&&<button className={active==='admin'?'active':''} onClick={()=>jump('admin')} title="Admin-Cockpit" aria-label="Admin-Cockpit"><LayoutDashboard size={19}/></button>}
      {inAdminMode&&<button className={active==='precheck'?'active':''} onClick={()=>jump('precheck')} title="Vertragsvorprüfung" aria-label="Vertragsvorprüfung"><ShieldCheck size={19}/></button>}
      <button className={active==='upload'?'active':''} onClick={()=>jump('upload')} title="Vertrag hochladen" aria-label="Vertrag hochladen"><Upload size={19}/></button>
      <button className={active==='backlog'?'active':''} onClick={()=>jump('backlog')} title={inAdminMode?'Tickets und Entwicklungs-Backlog':'Fehler melden'} aria-label="Änderungs- und Fehlerbacklog"><Bug size={19}/></button>
      <button className={active==='changes'?'active':''} onClick={()=>jump('changes')} title="Änderungen" aria-label="Änderungen"><History size={19}/></button>
      <button className={active==='questions'?'active':''} onClick={()=>jump('questions','qText')} title="Vertragsfrage" aria-label="Vertragsfrage"><MessageSquareText size={19}/></button>
    </aside>

    <main className="content">
      <ContractNoticeBanner/>
      {error&&<div className="alert error">{error}</div>}

      {active==='assistant'&&<>
        <div className="page-head"><div><h1>Versorgung prüfen</h1><p>Positionssuche, Trefferwahl und Versorgungsprüfung in drei übersichtlichen Schritten.</p></div><Badge tone="info">Vertragswissen zuerst</Badge></div>
        <div className="grid assistant-flow">
          <section className="panel assistant-hero span2">
            <div className="assistant-top"><div className="assistant-title"><small>Schritt 1 · Positionssuche</small><h2>Passende Vertragsposition finden</h2><p>Kostenträger, Produktgruppe oder Hilfsmittel eingeben, dann die passende Position auswählen.</p></div></div>
            <form className="check-form" onSubmit={runAssistant} aria-busy={searchBusy}>
              <label>Kostenträger<select value={payer} onChange={e=>{setPayer(e.target.value);setPayerDetail('');setError('')}}><option value="">Alle Kassen</option>{payerOptions.map(v=><option key={v}>{v}</option>)}</select></label>
              <label>Kasse / Region<select value={payerDetailOptions.includes(payerDetail)?payerDetail:''} onChange={e=>{setPayerDetail(e.target.value);setError('')}} disabled={!payer} aria-label="Kasse und Region des gewählten Kostenträgers"><option value="">{payer?'Alle Kassen / Regionen der Auswahl':'Zuerst Kostenträger wählen'}</option>{payerDetailOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
              <label>Produktgruppe<select value={pg} onChange={e=>{setPg(e.target.value);setError('')}}><option value="">Alle PG</option>{pgOptions.map(v=><option key={v}>{v}</option>)}</select></label>
              <label>Standort / IK<select value={siteId} onChange={e=>{setSupplyEval(null);setSiteId(e.target.value);setError('')}}><option value="">Standort wählen</option>{sites.map(s=><option key={s.site_id} value={s.site_id}>{s.branch||'Standort'}{s.ik?` · IK ${s.ik}`:''}</option>)}</select></label>
              <label>HMV / Position / Begriff<input id="assistantTerm" value={term} onChange={e=>{setTerm(e.target.value);setError('')}} placeholder="z. B. leichtgewichts, Rolli, 18.50, AOK Bayern …"/></label>
              <div className="search-actions">
                <button className="primary" type="submit" disabled={searchBusy}>
                  {searchBusy?<><LoaderCircle className="spin" size={16}/> Suche …</>:'Positionen suchen'}
                </button>
                <button className="secondary" type="button" onClick={resetAssistantSearch} disabled={searchBusy}>Zurücksetzen</button>
              </div>
              {searchBusy&&<div className="search-running" role="status" aria-live="polite">
                <LoaderCircle className="spin" size={17}/><span>Vertragsdaten werden durchsucht …</span>
              </div>}

              <details className="advanced-search">
                <summary>Erweiterte Suche <span>HMV · Position · Produktart · Vertrag · LEGS · LKZ · Genehmigung · Versorgungsform · Gültigkeit · PQ · Standort</span></summary>
                <div className="advanced-grid">
                  <label>HMV-/Produktartcode<input value={advanced.hmv} onChange={e=>{setSupplyEval(null);setA('hmv',e.target.value)}} placeholder="z. B. 18.50.03"/></label>
                  <label>Position / GPOS<input value={advanced.position} onChange={e=>setA('position',e.target.value)} placeholder="z. B. 1850032"/></label>
                  <label>Produktart<input value={advanced.productType} onChange={e=>setA('productType',e.target.value)} placeholder="z. B. Spezialrollstuhl"/></label>
                  <label className="wide2">Vertrag<input value={advanced.contract} onChange={e=>setA('contract',e.target.value)} placeholder="Vertragsname / Region"/></label>

                  <label>LEGS<input value={advanced.legs} onChange={e=>setA('legs',e.target.value)} placeholder="z. B. 1999…"/></label>
                  <label>LKZ / VWKZ<select value={advanced.lkz} onChange={e=>setA('lkz',e.target.value)}><option value="">Alle</option><option value="0">0 – Neulieferung</option><option value="1">1 – Reparatur</option><option value="2">2 – Wiedereinsatz</option><option value="3">3 – Miete</option><option value="4">4 – Nachlieferung</option><option value="5">5 – Zurichtung</option><option value="6">6 – höherwertige Versorgung</option><option value="7">7 – unbesetzt / vertragsspezifisch</option><option value="8">8 – Vergütungspauschale</option><option value="9">9 – Folgevergütungspauschale</option><option value="10">10 – Folgeversorgung</option><option value="11">11 – Erstbeschaffung</option><option value="12">12 – Zubehör</option><option value="13">13 – Reparaturpauschale</option><option value="14">14 – Wartung</option><option value="15">15 – Wartungspauschale</option><option value="16">16 – Auslieferung</option><option value="17">17 – Aussonderung</option><option value="18">18 – Rückholung</option><option value="19">19 – Abbruch</option><option value="20">20 – Erprobung</option></select></label>
                  <label>Genehmigung<select value={advanced.approval} onChange={e=>setA('approval',e.target.value)}>
                    <option value="all">Alle</option><option value="kva">Kostenvoranschlag</option><option value="pflicht">Genehmigung erforderlich</option><option value="frei">Genehmigungsfrei</option><option value="anzeige">Versorgungsanzeige</option><option value="vorhanden">Angabe vorhanden</option><option value="ohne">ohne Angabe</option>
                  </select></label>
                  <label>Versorgungsform / -art<select value={advanced.supplyForm} onChange={e=>setA('supplyForm',e.target.value)}>
                    <option value="all">Alle</option><option>Kauf / Neulieferung</option><option>Neukauf</option><option>Kauf</option><option>Wiedereinsatz</option><option>Reparatur/Instandsetzung</option><option>Rückholung</option><option>Vergütungspauschale</option><option>Folgevergütungspauschale</option><option>Erstversorgungspauschale</option><option>Folgeversorgungspauschale</option><option>Zubehör/Zusatz</option><option>Zubehör</option><option>Versorgung</option>
                  </select></label>
                  <label>Verordnungsangabe<select value={advanced.prescription} onChange={e=>setA('prescription',e.target.value)}><option value="all">Alle</option><option value="vorhanden">vorhanden</option><option value="ohne">ohne Angabe</option></select></label>

                  <label>Vertragsstand am <span title="Stichtagsprüfung: Zeigt, welche Vertrags- und Positionsregelungen an diesem Datum gültig waren bzw. sind. Dies ist kein Zeitraumfilter von/bis." aria-label="Information zur Stichtagsprüfung">ⓘ</span><input type="date" value={advanced.validOn} onChange={e=>{setSupplyEval(null);setA('validOn',e.target.value)}}/><small style={{display:'block',fontWeight:400,color:'#52677e',marginTop:4}}>Vertragszustand zu einem bestimmten Stichtag prüfen.</small></label>
                  <label>Preis<select value={advanced.priceMode} onChange={e=>setA('priceMode',e.target.value)}><option value="all">Alle</option><option value="vorhanden">Preis vorhanden</option><option value="ohne">ohne Preis</option></select></label>
                  <label>Preis von €<input type="number" step="0.01" min="0" value={advanced.minPrice} onChange={e=>setA('minPrice',e.target.value)}/></label>
                  <label>Preis bis €<input type="number" step="0.01" min="0" value={advanced.maxPrice} onChange={e=>setA('maxPrice',e.target.value)}/></label>
                  <label>PQ am Standort<select value={advanced.pq} onChange={e=>setA('pq',e.target.value)}><option value="all">Alle</option><option value="ja">nur PQ vorhanden</option><option value="nein">PQ fehlt</option></select></label>

                  <label>Vertragsbeitritt am Standort<select value={advanced.accession} onChange={e=>setA('accession',e.target.value)}><option value="all">Alle</option><option value="aktiv">nur aktiver Beitritt</option><option value="fehlt">kein aktiver Beitritt</option></select></label>
                  <label className="check-option"><input type="checkbox" checked={advanced.authoritative} onChange={e=>setA('authoritative',e.target.checked)}/><span>Nur autoritative Positionsdaten</span></label>
                </div>
              </details>
            </form>
            <div className="search-flow-hint" aria-label="Ablauf der Versorgungsprüfung"><span><b>1</b> Positionen suchen</span><span aria-hidden="true">→</span><span><b>2</b> Treffer auswählen</span><span aria-hidden="true">→</span><span><b>3</b> Versorgung automatisch prüfen</span></div>
          </section>
          <section className="panel span2 assistant-results" id="assistantResults" aria-labelledby="assistantResultsHeading">
            <div className="sectionbar"><div><h2 id="assistantResultsHeading">Schritt 2 · Treffer auswählen</h2><p>Passende Vertragsposition per Klick oder mit Tab und Enter auswählen. Das Prüfergebnis erscheint unter der Liste.</p></div><Badge>{hasSearched&&error?'Suche fehlgeschlagen':`${results.length} Treffer`}</Badge></div>
            {results.length>0&&!selected&&<div className="result-hint"><b>{results.length} passende Positionen · {resultContractCount} Vertragsvarianten</b><span>{payer==='AOK'&&!payerDetail&&!siteId?'AOK-Verträge sind regional. Bitte konkrete AOK/Region, Standort oder unten den passenden Vertrag auswählen.':'Bitte den passenden Vertrag bzw. die Position auswählen.'}</span></div>}
            {results.length>=150&&<p className="result-limit-note" role="note">Maximal 150 Treffer geladen. Falls die gesuchte Position fehlt, bitte Kasse, Produktgruppe oder Suchbegriff eingrenzen.</p>}
            <div className="tablewrap"><table><thead><tr><th>PG</th><th>HMV/Code</th><th>Position</th><th>Bezeichnung</th><th>Vertrag</th><th>Preis</th><th>Genehmigung</th></tr></thead><tbody>
              {results.slice(0,visibleResults).map(r=><tr key={r.position_row_id} className={'selectable '+(selected?.position_row_id===r.position_row_id?'selected':'')} tabIndex={0} aria-selected={selected?.position_row_id===r.position_row_id} aria-label={'Position auswählen: '+(r.bezeichnung||r.produktart_bezeichnung||r.code||r.pos||'Unbekannte Position')} onClick={()=>choosePosition(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choosePosition(r)}}}><td>{r.pg||'—'}</td><td>{r.code||'—'}</td><td>{r.pos||'—'}</td><td><b>{r.bezeichnung||r.produktart_bezeichnung||'—'}</b></td><td>{displayCompanyName(r.contract||r.family||'—')}</td><td>{r.preis??'—'}</td><td>{r.genehmigung||r.freigrenze||'—'}</td></tr>)}
              {!results.length&&<tr><td colSpan="7" className="empty">{hasSearched&&!searchBusy?(error?'Die Suche wurde nicht abgeschlossen. Es liegt kein gültiges Suchergebnis vor.':'Keine passenden Positionen gefunden. Bitte die Suchkriterien anpassen.'):'Kasse, PG, Suchbegriff oder erweiterte Kriterien wählen und auf „Positionen suchen“ klicken.'}</td></tr>}
            </tbody></table></div>
            {results.length>0&&<div className="assistant-result-footer"><span>{Math.min(visibleResults,results.length)} von {results.length} Treffern angezeigt</span>{visibleResults<results.length&&<button className="secondary" type="button" onClick={()=>setVisibleResults(v=>v+12)}>Weitere 12 Treffer anzeigen</button>}</div>}
          </section>
          {selected&&<section className="panel span2 assistant-evaluation" id="assistantEvaluation" aria-labelledby="assistantDecisionHeading">
            <div className="assistant-evaluation-top"><div><small>Schritt 3 · Versorgungsprüfung</small><h2 id="assistantDecisionHeading" tabIndex={-1}>Ergebnis zur ausgewählten Position</h2><p><b>{selected.bezeichnung||selected.produktart_bezeichnung||selected.code||selected.pos||'Ausgewählte Position'}</b> · {displayCompanyName(selected.contract||selected.family||'Vertrag nicht benannt')}</p></div><div className={'decision '+decisionTone} role="status" aria-live="polite" aria-atomic="true"><small>Versorgungsprüfung</small><strong><DecisionIcon size={22} aria-hidden="true"/>{decisionLabel}</strong></div></div>
            <div className="supply-status-strip" aria-label="Kurzübersicht der sechs Prüfbereiche">
              {[['Vertrag','Position zugeordnet',true],['PQ / IK / Beitritt',!siteId?'Standort fehlt':supplyBusy?'Prüfung läuft':supplyPathOk?'Bestätigt':supplyEval?.pq_decision==='ROT'||supplyEval?.accession_decision==='ROT'?'Nicht erfüllt':'Zu prüfen',supplyPathOk],['Genehmigung',supplyEval?.authorization_decision==='GRUEN'?'Bestätigt':supplyEval?.authorization_decision==='ROT'?'Nicht erfüllt':'Zu prüfen',supplyEval?.authorization_decision==='GRUEN'],['Verordnung',supplyEval?.prescription_decision==='GRUEN'?'Bestätigt':supplyEval?.prescription_decision==='ROT'?'Nicht erfüllt':'Zu prüfen',supplyEval?.prescription_decision==='GRUEN'],['Quellen',supplyEval?.source_decision==='GRUEN'?'Bestätigt':supplyEval?.source_decision==='ROT'?'Quellenmangel':'Zu prüfen',supplyEval?.source_decision==='GRUEN'],['Abrechnung',selected?.preis!=null?'Preis dokumentiert':'Preis offen',false]].map(([name,status,ok])=><span className={'supply-mini '+(ok?'ok':/nicht erfüllt|quellenmangel/i.test(status)?'bad':'neutral')} key={name}><small>{name}</small><strong>{status}</strong></span>)}
            </div>
            <details className="supply-checks-details">
              <summary>Alle sechs Prüfschritte und Vertragsangaben anzeigen</summary>
            <div className="checks" aria-label="Prüfschritte">
              <Check n="1" title="Vertrag"
                status={selected?'Vertrag gefunden':results.length?(resultContractCount===1?'1 Vertrag gefunden':`${resultContractCount} Vertragsvarianten gefunden`):'noch offen'}
                value={selected?(selected.contract||selected.family||'Vertrag vorhanden'):results.length?(siteId?'Passende Position auswählen':'Standort/Region wählen oder Position auswählen'):'Position suchen'}
                ok={!!selected}/>
              <Check n="2" title="PQ / IK / Beitritt"
                status={!siteId?'noch offen':supplyBusy?'prüfen':supplyPathOk?'PQ + Beitritt bestätigt':supplyEval?.decision==='ROT'?'nicht erfüllt':'prüfen'}
                value={supplyPathValue}
                ok={supplyPathOk}/>
              <Check n="3" title="Genehmigung" status={supplyEval?.authorization_decision==='GRUEN'?'geprüft':supplyEval?.authorization_decision==='ROT'?'nicht erfüllt':supplyEval?'prüfen':'noch offen'} value={supplyEval?.authorization_text||selected?.genehmigung||selected?.freigrenze||'Vertragsangabe fehlt'} ok={supplyEval?.authorization_decision==='GRUEN'}/>
              <Check n="4" title="Verordnung" status={supplyEval?.prescription_decision==='GRUEN'?'geprüft':supplyEval?.prescription_decision==='ROT'?'nicht erfüllt':supplyEval?'prüfen':'noch offen'} value={supplyEval?.prescription_text||selected?.verordnung||'Vertragsangabe fehlt'} ok={supplyEval?.prescription_decision==='GRUEN'}/>
              <Check n="5" title="Dokumentation / Quelle" status={supplyEval?.source_decision==='GRUEN'?'Quelle bestätigt':supplyEval?.source_decision==='ROT'?'Quellenmangel':supplyEval?'prüfen':'noch offen'} value={supplyEval?.source_text||(relatedKnowledgeBusy?'Vertragswissen wird geladen':relatedKnowledge.length?`${relatedKnowledge.length} Wissenseinträge`:'Quellennachweis prüfen')} ok={supplyEval?.source_decision==='GRUEN'}/>
              <Check n="6" title="Abrechnung" status={selected?.preis!=null?'Preis vorhanden':'noch offen'} value={selected?.preis!=null?String(selected.preis):'Preis/Versorgungsform'} ok={selected?.preis!=null}/>
            </div>

            </details>
            {selected&&siteId&&supplyEval&&<section className="supply-v3-audit" aria-label="Fachliche Begründung der Versorgungsentscheidung"><strong>{supplyEval.decision_label||'Prüfergebnis'} · V3-Versorgungsprüfung</strong>{supplyEval.decision_basis&&<p>{supplyEval.decision_basis}</p>}{supplyV3Blockers.length>0&&<p><b>Ausschlussgründe:</b> {supplyV3Blockers.join(' · ')}</p>}{supplyV3Checks.length>0&&<p><b>Manuell prüfen:</b> {supplyV3Checks.join(' · ')}</p>}{supplyV3Actions.length>0&&<p><b>Nächste Schritte:</b> {supplyV3Actions.join(' · ')}</p>}{supplyEval.validity_text&&<p><b>Vertrags-/PG-/IK-Gültigkeit:</b> {supplyEval.validity_text}</p>}</section>}

            {selected&&<PositionDetail
              position={selected}
              contract={selectedContract}
              site={selectedSite}
              siteMatch={siteMatch}
              knowledge={relatedKnowledge}
              canFach={inFachMode}
            />}

          </section>}
        </div>
      </>}

      {active==='work'&&<>
        <div className="page-head"><div><h1>Arbeitsvorrat</h1><p>Aufgaben und Prüflisten für den aktuellen Zugriffsmodus: {modeLabel}.</p></div><Badge tone="info">Rollenbezogen</Badge></div>
        <WorkQueueOverview canFach={canFach} inFachMode={inFachMode} inAdminMode={inAdminMode} onNavigate={view=>setActive(view)}/>
      </>}

      {active==='contracts'&&<>
        <div className="page-head"><div><h1>Verträge</h1><p>Vertragskatalog und zugehörige Positionen durchsuchen.</p></div><Badge>{filteredContracts.length} Verträge</Badge></div>
        {Date.now()<=new Date(COMPANY_NOTICE_VISIBLE_UNTIL).getTime()&&<section className="company-change-notice">
          <div className="company-change-mark">i</div>
          <div><div className="company-change-title"><strong>spectrumK / ITSC → VALUNY GmbH</strong><Badge tone="info">seit 01.09.2026</Badge></div>
          <p><b>Neue Unternehmensbezeichnung: VALUNY GmbH.</b> Laut Mitteilung von spectrumK an rehaVital war der technische Go-live für den 01.09.2026 terminiert. VALUNY GmbH ist Rechtsnachfolgerin von spectrumK und ITSC; bestehende Verträge gelten ohne formale Änderungen weiter.</p>
          <small>Bekannte Ansprechpartner:innen, IK und Status als Arbeitsgemeinschaft bleiben laut Mitteilung unverändert. Zusätzlich kann die E-Mail-Domain <b>@valuny.de</b> verwendet werden. Suche funktioniert mit VALUNY, spectrumK und ITSC.</small></div>
        </section>}
        <section className="panel"><div className="sectionbar"><div><h2>Vertragskatalog mit Beitrittsampel</h2><p>Beitritt, Gültigkeit und Voraussetzungen je Vertrag auf einen Blick.</p></div><input className="compact" value={contractQuery} onChange={e=>setContractQuery(e.target.value)} placeholder="Vertrag durchsuchen …"/></div>
          <ContractTrafficLightPanel contracts={filteredContracts}/>
        </section>
      </>}

      {inFachMode&&active==='pgReviews'&&<>
        <div className="page-head"><div><h1>PG-Änderungsprüfungen</h1><p>Alle geänderten Vertragsbestände fachlich je PG und Geschäftsbereich bewerten.</p></div><Badge tone="warn">Fachprüfung · dokumentiert</Badge></div>
        <PGReviewQueue canReview={role==='fach'}/>
      </>}

      {inFachMode&&active==='addonReview'&&<>
        <div className="page-head"><div><h1>Zusatzpositionen prüfen</h1><p>Quellenbasierte Zuordnungen und Ausschlüsse vor der fachlichen Nutzung bestätigen.</p></div><Badge tone="warn">Originalvertragsprüfung</Badge></div>
        <AddonCandidateReview canReview={true}/>
      </>}

      {active==='matrix'&&<>
        <div className="page-head"><div><h1>Vertragsmatrix</h1><p>Vertragspositionen und verifizierte Zusatzpositionen ausgewählter Kostenträger vergleichen.</p></div><Badge tone="info">Kassenvergleich</Badge></div>
        <ContractMatrix contracts={contracts}/>
      </>}

      {inAdminMode&&active==='contractExclusions'&&<>
        <div className="page-head"><div><h1>Verträge ausschließen / reaktivieren</h1><p>Falsche Vertragszuordnungen nachvollziehbar aus dem aktiven Vertragsbestand ausschließen.</p></div><Badge tone="warn">Administrator · Auditpflicht</Badge></div>
        <ContractExclusions onChanged={loadData}/>
      </>}

      {inAdminMode&&active==='admin'&&<>
        <div className="page-head"><div><h1>Admin-Cockpit</h1><p>Arbeitsvorrat, Blocker und nächste Schritte im Vertragsmanagement.</p></div><Badge tone="info">P2 · Steuerungsansicht</Badge></div>
        <AdminDashboard onNavigate={route=>setActive(route)}/>
      </>}

      {inAdminMode&&active==='payerReview'&&<>
        <div className="page-head"><div><h1>Kassenfamilien prüfen</h1><p>Fehlende Kostenträger-Zuordnungen nachvollziehbar prüfen, freigeben und protokollieren.</p></div><Badge tone="warn">P5 · Datenqualität</Badge></div>
        <PayerFamilyReview onBack={()=>setActive('admin')} onDataChanged={()=>loadData(role)}/>
      </>}

      {inAdminMode&&active==='precheck'&&<>
        <div className="page-head"><div><h1>Vertragsvorprüfung</h1><p>Neue und geänderte Verträge vor der Unterschrift strukturiert prüfen, Risiken dokumentieren und fachlich freigeben.</p></div><Badge tone="warn">Admin · vor Unterschrift</Badge></div>
        <ContractPrecheck userId={session.user.id} contracts={contracts} sites={sites} onOpenChanges={()=>setActive('changes')}/>
      </>}

      {active==='upload'&&<>
        <div className="page-head"><div><h1>Vertrag hochladen</h1><p>Vertragsquelle sicher ablegen, automatisch erkennen und Änderungen kontrolliert veröffentlichen.</p></div><Badge tone="warn">Versioniert · kein Überschreiben</Badge></div>
        <ContractUpload contracts={contracts} sites={sites} canFach={inFachMode} initialContractId={maintenanceContractId} onOpenChanges={()=>setActive('changes')}/>
      </>}

      {active==='changes'&&<>
        <div className="page-head"><div><h1>Änderungen</h1><p>Uploadverlauf, Alt/Neu-Vergleich und fachliche Freigabe in einer Ansicht.</p></div><Badge tone="info">Änderungsprotokoll</Badge></div>
        <ContractChanges canFach={inFachMode}/>
      </>}

      {active==='backlog'&&<>
        <div className="page-head"><div><h1>{inAdminMode?'Tickets und Entwicklungs-Backlog':'Fehler oder Änderungswunsch melden'}</h1><p>{inAdminMode?'Alle Anwender-Meldungen und interne Entwicklungsaufgaben an einem Ort.':'Eigene Meldungen erfassen und deren Bearbeitungsstand verfolgen.'}</p></div><Badge tone="info">Entwicklungs-Backlog</Badge></div>
        <DevelopmentBacklog userId={session.user.id} canManage={inAdminMode} reportOnly={!inAdminMode}/>
      </>}

      {active==='knowledge'&&<>
        <div className="page-head"><div><h1>Vertragswissen</h1><p>Freigegebenes Vertragswissen gezielt durchsuchen und prüfen.</p></div><Badge tone="ok">{knowledgeLoaded?knowledge.length:'…'} freigegeben</Badge></div>
        <div className="grid">
          <section className="panel span2 knowledge-gate"><div className="sectionbar"><div><h2>Vertragswissen</h2><p>Nur APPROVED, aktuell gültig und ohne Revalidierungsbedarf.</p></div><input id="knowledgeSearch" className="compact" value={knowledgeQuery} onChange={e=>setKnowledgeQuery(e.target.value)} placeholder="Wissen durchsuchen …"/></div><div className="chain"><span>Vertragswissen</span><i>→</i><span>Gültigkeit / Geltungsbereich</span><i>→</i><span>Originalvertrag</span><i>→</i><span>Frage klären</span><i>→</i><span>Freigeben</span><i>→</i><span>Wissen zurückführen</span></div></section>
          <section className="panel span2">{!knowledgeLoaded?<div className="precheck-loading"><LoaderCircle className="spin" size={17}/> Vertragswissen wird geladen …</div>:<div className="knowledge-list">{filteredKnowledge.map(r=><div className="knowledge-item" key={r.knowledge_id}><div className="knowledge-type">Info</div><article className="knowledge-card"><div className="knowledge-head"><div><b>{r.title}</b><small>{[r.payer,r.pg&&`PG ${r.pg}`,r.hmv_code,r.position_code].filter(Boolean).join(' · ')||'Allgemeiner Geltungsbereich'}</small></div><Badge tone="ok">APPROVED</Badge></div>{r.question_text&&<p><i>{r.question_text}</i></p>}<p>{r.decision_text}</p><footer className="detail-only">Vertrag: {r.contract_id||'—'} · Version: {r.contract_version_id||'—'} · Quelle: {r.source_id||'—'}</footer></article></div>)}{!filteredKnowledge.length&&<div className="empty-panel">Noch kein freigegebenes Vertragswissen vorhanden.</div>}</div>}</section>
        </div>
      </>}

      {active==='questions'&&<>
        <div className="page-head"><div><h1>Vertragsfragen</h1><p>Nur ungeklärte Vertragsfälle als neue Frage anlegen und in der Prüfqueue verfolgen.</p></div><Badge>{questionsLoaded?questions.length:questionCount} sichtbar</Badge></div>
        <div className="grid">
          <section className="panel"><h2>Neue Vertragsfrage</h2><form className="formstack" onSubmit={submitQuestion}><label>Vertragsfrage<textarea id="qText" rows="5" value={questionForm.question_text} onChange={e=>setQ('question_text',e.target.value)} required/></label><div className="formgrid"><label>Kostenträger<input value={questionForm.payer} onChange={e=>setQ('payer',e.target.value)}/></label><label>PG<input value={questionForm.pg} onChange={e=>setQ('pg',e.target.value)}/></label></div><label>Vertrag<select value={questionForm.contract_id} onChange={e=>setQ('contract_id',e.target.value)}><option value="">Nicht zugeordnet</option>{contracts.map(r=><option key={r.contract_id} value={r.contract_id}>{r.contract_name||r.contract_id}</option>)}</select></label><div className="formgrid"><label>HMV / Produktart<input value={questionForm.hmv_code} onChange={e=>setQ('hmv_code',e.target.value)}/></label><label>Position / GPOS<input value={questionForm.position_code} onChange={e=>setQ('position_code',e.target.value)}/></label></div>{questionMessage&&<div className={'alert '+(questionMessage.startsWith('Vertragsfrage wurde')?'success':'error')}>{questionMessage}</div>}<button className="primary" type="submit">Vertragsfrage anlegen</button></form></section>
          <QuestionsQueue questions={questions} loaded={questionsLoaded} onRefresh={()=>loadQuestions(true)} canAnswer={inAdminMode} canAcknowledge={role==='fach'&&inFachMode} onChanged={updated=>{if(updated?.question_id){setQuestions(items=>items.map(q=>q.question_id===updated.question_id?updated:q));setQuestionCount(count=>count+(updated.status==='CLOSED'?-1:0))}}}/>
        </div>
      </>}

      {inAdminMode&&active==='missingSources'&&<>
        <div className="page-head"><div><h1>Fehlende Quellen</h1><p>Admin-Datenpflege für aktive Verträge ohne belastbare Originalquelle oder Vertragsinhalt.</p></div><Badge tone="warn">Admin</Badge></div>
        <MissingSources onMaintain={contractId=>{setMaintenanceContractId(contractId);setActive('upload')}}/>
      </>}

      {active==='data'&&<><div className="page-head"><div><h1>Datenstand</h1><p>Aktuell im Vertragsnavigator verfügbare strukturierte Daten.</p></div><Badge tone="info">VN 2.1</Badge></div><div className="metrics"><Metric label="Verträge" value={stats.contracts}/><Metric label="Positionen importiert" value={stats.positions}/><Metric label="Freigegebenes Wissen" value={stats.knowledge}/><Metric label="Sichtbare Vertragsfragen" value={stats.questions}/></div><section className="panel spaced"><h2>Prüflogik</h2><p>Produkt/Position → Vertrag → Standort/IK → PQ → Vertragsbeitritt → Genehmigung/eKVA → Verordnung → Dokumentation → Fristen → Abrechnung.</p><div className="note">Kein positiver Prüfschritt ersetzt einen anderen.</div></section></>}
    </main>
    <ContractWitches />
  </div>
}

function Check({n,title,status,value,ok}){
  const failed=/nicht erfüllt|nicht vorhanden|Quellenmangel/i.test(String(status))
  const needsReview=/prüfen/i.test(String(status))
  const tone=ok?'ok':failed?'bad':needsReview?'warn':'idle'
  const Icon=ok?CheckCircle2:failed?XCircle:needsReview?AlertTriangle:CircleHelp
  return <article className={'check state-'+tone}><small>{n} · {title}</small><strong><Icon size={16} aria-hidden="true"/>{status}</strong><div className="value">{value}</div></article>
}
function Metric({label,value}){return <article className="metric"><span>{label}</span><strong>{Number(value||0).toLocaleString('de-DE')}</strong></article>}
