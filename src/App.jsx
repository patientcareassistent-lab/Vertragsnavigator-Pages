import React, { useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, History, MessageSquareText, Upload } from 'lucide-react'
import { supabase, supabaseConfigured } from './lib/supabase.js'
import ContractUpload from './components/ContractUpload.jsx'
import ContractChanges from './components/ContractChanges.jsx'
import PositionDetail from './components/PositionDetail.jsx'

const NAV=[
  ['assistant','Versorgung prüfen'],
  ['contracts','Verträge'],
  ['data','Datenstand'],
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
  const [authReady,setAuthReady]=useState(false)
  const [authError,setAuthError]=useState('')
  const [username,setUsername]=useState('')
  const [password,setPassword]=useState('')
  const [active,setActive]=useState('assistant')
  const [mode,setMode]=useState('fach')
  const [error,setError]=useState('')
  const [contracts,setContracts]=useState([])
  const [knowledge,setKnowledge]=useState([])
  const [questions,setQuestions]=useState([])
  const [sites,setSites]=useState([])
  const [stats,setStats]=useState({contracts:0,positions:0,knowledge:0,questions:0})
  const [payer,setPayer]=useState('')
  const [payerDetail,setPayerDetail]=useState('')
  const [pg,setPg]=useState('')
  const [term,setTerm]=useState('')
  const [siteId,setSiteId]=useState('')
  const [advanced,setAdvanced]=useState({...EMPTY_ADVANCED})
  const [results,setResults]=useState([])
  const [selected,setSelected]=useState(null)
  const [supplyEval,setSupplyEval]=useState(null)
  const [supplyBusy,setSupplyBusy]=useState(false)
  const [contractQuery,setContractQuery]=useState('')
  const [knowledgeQuery,setKnowledgeQuery]=useState('')
  const [questionForm,setQuestionForm]=useState({question_text:'',payer:'',contract_id:'',pg:'',hmv_code:'',position_code:''})
  const [questionMessage,setQuestionMessage]=useState('')

  const role=session?.user?.app_metadata?.vn_role||'versorger'
  const canFach=['fach','admin'].includes(role)
  const payerOptions=useMemo(()=>uniq(contracts.flatMap(r=>escArray(r.payer_families))),[contracts])
  const payerDetailOptions=useMemo(()=>{
    if(!payer)return []
    return uniq(contracts
      .filter(r=>escArray(r.payer_families).includes(payer))
      .filter(r=>!pg||escArray(r.product_groups).includes(pg))
      .map(r=>payerDetailLabel(r,payer))
      .filter(v=>v&&normalizeSearch(v)!==normalizeSearch(payer))
    )
  },[contracts,payer,pg])
  const pgOptions=useMemo(()=>uniq(contracts.flatMap(r=>escArray(r.product_groups))),[contracts])
  const filteredContracts=useMemo(()=>{
    const q=contractQuery.trim().toLowerCase()
    return contracts.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q))
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

  useEffect(()=>{if(session) loadData()},[session])
  useEffect(()=>{if(payerDetail&&!payerDetailOptions.includes(payerDetail))setPayerDetail('')},[payerDetail,payerDetailOptions])
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
        const {data,error}=await supabase.rpc('evaluate_position_supply',args)
        if(error)throw error
        if(!cancelled)setSupplyEval(Array.isArray(data)?(data[0]||null):data||null)
      }catch(e){
        if(!cancelled){
          setSupplyEval(null)
          setError(e.message||String(e))
        }
      }finally{
        if(!cancelled)setSupplyBusy(false)
      }
    }
    evaluateSelected()
    return()=>{cancelled=true}
  },[selected?.position_row_id,siteId,advanced.validOn,advanced.hmv])

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
    setError('')
    const [cc,pc,kc,qr,kr,cr,sr]=await Promise.all([
      supabase.from('vn_contract_catalog').select('*',{count:'exact',head:true}),
      supabase.from('vn_position_catalog').select('*',{count:'exact',head:true}),
      supabase.from('vn_contract_knowledge_approved').select('*',{count:'exact',head:true}),
      supabase.from('vn_contract_questions').select('*').order('created_at',{ascending:false}).limit(100),
      supabase.from('vn_contract_knowledge_approved').select('*').order('updated_at',{ascending:false}).limit(500),
      supabase.from('vn_contract_catalog').select('*').order('contract_name').limit(700),
      supabase.from('vn_site_eligibility').select('*').limit(5000),
    ])
    const first=[cc,pc,kc,qr,kr,cr,sr].find(r=>r.error)?.error
    if(first){
      const raw=String(first.message||'')
      const recovering=/not accepting connections|starting up|hot standby|timeout/i.test(raw)
      setError(recovering
        ? 'Vertragsdatenbank befindet sich in Wiederherstellung. Bitte später erneut versuchen.'
        : raw)
      return
    }
    const siteMap=new Map()
    for(const e of sr.data||[]){
      if(!siteMap.has(e.site_id))siteMap.set(e.site_id,{site_id:e.site_id,ik:e.ik,branch:e.branch,eligibilities:[]})
      siteMap.get(e.site_id).eligibilities.push(e)
    }
    setContracts(cr.data||[])
    setKnowledge(kr.data||[])
    setQuestions(qr.data||[])
    setSites([...siteMap.values()].sort((a,b)=>String(a.branch||'').localeCompare(String(b.branch||''),'de')))
    setStats({contracts:cc.count||0,positions:pc.count||0,knowledge:kc.count||0,questions:qr.data?.length||0})
  }

  async function runAssistant(e){
    e.preventDefault();setSelected(null);setSupplyEval(null);setError('')

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

    if(!term.trim()&&!pg&&!payer&&!hasAdvanced){setResults([]);return}
    if((advanced.pq!=='all'||advanced.accession!=='all')&&!siteId){
      setError('Für PQ oder Vertragsbeitritt bitte zuerst einen Standort auswählen.')
      return
    }

    const toNumber=value=>String(value).trim()===''?null:Number(value)
    const rawTerm=term.trim()
    const termIsHmv=/^\d{2}(?:\.\d{2}){1,3}(?:\.\d{1,4})?$/.test(rawTerm)
    const termIsPosition=/^\d{6,12}$/.test(rawTerm)
    const {data,error}=await supabase.rpc('vn_search_positions_v2',{
      p_payer:payer||null,
      p_payer_detail:payerDetail||null,
      p_pg:pg||null,
      p_query:(!termIsHmv&&!termIsPosition&&rawTerm)?rawTerm:null,
      p_hmv:advanced.hmv.trim()||(termIsHmv?rawTerm:null),
      p_position:advanced.position.trim()||(termIsPosition?rawTerm:null),
      p_product_type:advanced.productType.trim()||null,
      p_contract:advanced.contract.trim()||null,
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
      p_limit:150,
    })
    if(error){setError(error.message);return}
    setResults(data||[])
  }

  function resetAssistantSearch(){
    setPayer('')
    setPayerDetail('')
    setPg('')
    setTerm('')
    setSiteId('')
    setAdvanced({...EMPTY_ADVANCED})
    setResults([])
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
    setQuestions(q=>[data,...q]);setStats(s=>({...s,questions:s.questions+1}))
    setQuestionForm({question_text:'',payer:'',contract_id:'',pg:'',hmv_code:'',position_code:''})
    setQuestionMessage('Vertragsfrage wurde in die Prüfqueue übernommen.')
  }

  function jump(view,focusId){
    setActive(view)
    if(focusId)setTimeout(()=>document.getElementById(focusId)?.focus(),120)
  }

  const selectedSite=sites.find(s=>String(s.site_id)===String(siteId))
  const siteMatch=selected&&selectedSite?.eligibilities?.find(e=>e.active&&(
    (selected.contract_id&&e.contract_id&&String(e.contract_id)===String(selected.contract_id))
    || String(e.contract||'').toLowerCase()===String(selected.contract||'').toLowerCase()
  ))
  const selectedContract=selected?contracts.find(c=>String(c.contract_id)===String(selected.contract_id)):null
  const relatedKnowledge=selected?knowledge.filter(k=>{
    if(k.contract_id&&String(k.contract_id)!==String(selected.contract_id||''))return false
    if(k.pg&&String(k.pg)!==String(selected.pg||''))return false
    if(k.hmv_code&&String(k.hmv_code)!==String(selected.code||''))return false
    if(k.position_code&&String(k.position_code)!==String(selected.pos||''))return false
    if(k.payer){
      const hay=normalizeSearch([selected.family,selected.contract,selectedContract?.contract_name,escArray(selectedContract?.payer_families).join(' ')].filter(Boolean).join(' '))
      if(!hay.includes(normalizeSearch(k.payer)))return false
    }
    return true
  }):[]
  const resultContractCount=new Set(results.map(r=>r.contract_id||r.contract||r.family).filter(Boolean)).size
  const supplyDecision=supplyEval?.decision||''
  const decisionLabel=supplyDecision==='GRUEN'?'GRÜN':supplyDecision==='ROT'?'ROT':'PRÜFEN'
  const decisionTone=supplyDecision==='GRUEN'?'ok':supplyDecision==='ROT'?'bad':'warn'
  const supplyPathOk=supplyEval?.pq_decision==='GRUEN'&&Number(supplyEval?.green_scope_count||0)>0
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

  return <div className={'app '+(mode==='fach'?'mode-fach':'')}>
    <header className="top">
      <div className="masthead">
        <div className="brand-small"><div className="brandmark">B</div><div><strong>Vertragsnavigator 2.1</strong><small>brillinger | ottobock.care · Vertragsassistent</small></div></div>
        <div className="userbar"><span>{session.user.email}</span><Badge>{mode==='fach'?'Innendienst':'Versorger'}</Badge><button className="secondary" onClick={()=>supabase.auth.signOut()}>Abmelden</button></div>
      </div>
      <div className="navwrap"><nav className="nav">
        {NAV.map(([id,label])=><button key={id} className={active===id?'active':''} onClick={()=>setActive(id)}>{label}</button>)}
        <div className="mode-toggle"><button className={mode==='versorger'?'active':''} onClick={()=>setMode('versorger')}>Versorger</button><button className={mode==='fach'?'active':''} onClick={()=>setMode('fach')}>Innendienst</button></div>
      </nav></div>
    </header>

    <aside className="quick-rail" aria-label="Schnellzugriff">
      <button className={active==='questions'?'active':''} onClick={()=>jump('questions','knowledgeSearch')} title="Vertragswissen" aria-label="Vertragswissen"><BookOpenCheck size={19}/></button>
      <button className={active==='upload'?'active':''} onClick={()=>jump('upload')} title="Vertrag hochladen" aria-label="Vertrag hochladen"><Upload size={19}/></button>
      <button className={active==='changes'?'active':''} onClick={()=>jump('changes')} title="Änderungen" aria-label="Änderungen"><History size={19}/></button>
      <button className={active==='questions'?'active':''} onClick={()=>jump('questions','qText')} title="Vertragsfrage" aria-label="Vertragsfrage"><MessageSquareText size={19}/></button>
    </aside>

    <main className="content">
      {error&&<div className="alert error">{error}</div>}

      {active==='assistant'&&<>
        <div className="page-head"><div><h1>Versorgung prüfen</h1><p>Die wesentlichen Vertragsinformationen in einer Arbeitsansicht.</p></div><Badge tone="info">Vertragswissen zuerst</Badge></div>
        <div className="grid">
          <section className="panel assistant-hero span2">
            <div className="assistant-top"><div className="assistant-title"><small>Vertragsassistent</small><h2>Darf ich versorgen?</h2><p>Position auswählen, Standort festlegen und die Prüfpunkte nacheinander bewerten.</p></div><div className={'decision '+decisionTone}><small>Ergebnis</small><strong>{decisionLabel}</strong></div></div>
            <form className="check-form" onSubmit={runAssistant}>
              <label>Kostenträger<select value={payer} onChange={e=>{setPayer(e.target.value);setPayerDetail('')}}><option value="">Alle Kassen</option>{payerOptions.map(v=><option key={v}>{v}</option>)}</select></label>
              <label>Kasse / Region<select value={payerDetail} onChange={e=>setPayerDetail(e.target.value)} disabled={!payer}>
                <option value="">{payer?('Alle '+payer+'-Kassen / Regionen'):'Zuerst Kostenträger wählen'}</option>
                {payerDetailOptions.map(v=><option key={v} value={v}>{v}</option>)}
              </select></label>
              <label>Produktgruppe<select value={pg} onChange={e=>setPg(e.target.value)}><option value="">Alle PG</option>{pgOptions.map(v=><option key={v}>{v}</option>)}</select></label>
              <label>HMV / Position / Begriff<input id="assistantTerm" value={term} onChange={e=>setTerm(e.target.value)} placeholder="z. B. leichtgewichts, Rolli, 18.50, AOK Bayern …"/></label>
              <label>Standort<select value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="">Standort wählen</option>{sites.map(s=><option key={s.site_id} value={s.site_id}>{s.branch||'Standort'}{s.ik?` · IK ${s.ik}`:''}</option>)}</select></label>
              <div className="search-actions"><button className="primary" type="submit">Prüfen</button><button className="secondary" type="button" onClick={resetAssistantSearch}>Zurücksetzen</button></div>

              <details className="advanced-search" open>
                <summary>Erweiterte Suche <span>HMV · Position · Produktart · Vertrag · LEGS · LKZ · Genehmigung · Versorgungsform · Gültigkeit · PQ</span></summary>
                <div className="advanced-grid">
                  <label>HMV-/Produktartcode<input value={advanced.hmv} onChange={e=>setA('hmv',e.target.value)} placeholder="z. B. 18.50.03"/></label>
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

                  <label>Gültig am<input type="date" value={advanced.validOn} onChange={e=>setA('validOn',e.target.value)}/></label>
                  <label>Preis<select value={advanced.priceMode} onChange={e=>setA('priceMode',e.target.value)}><option value="all">Alle</option><option value="vorhanden">Preis vorhanden</option><option value="ohne">ohne Preis</option></select></label>
                  <label>Preis von €<input type="number" step="0.01" min="0" value={advanced.minPrice} onChange={e=>setA('minPrice',e.target.value)}/></label>
                  <label>Preis bis €<input type="number" step="0.01" min="0" value={advanced.maxPrice} onChange={e=>setA('maxPrice',e.target.value)}/></label>
                  <label>PQ am Standort<select value={advanced.pq} onChange={e=>setA('pq',e.target.value)}><option value="all">Alle</option><option value="ja">nur PQ vorhanden</option><option value="nein">PQ fehlt</option></select></label>

                  <label>Vertragsbeitritt am Standort<select value={advanced.accession} onChange={e=>setA('accession',e.target.value)}><option value="all">Alle</option><option value="aktiv">nur aktiver Beitritt</option><option value="fehlt">kein aktiver Beitritt</option></select></label>
                  <label className="check-option"><input type="checkbox" checked={advanced.authoritative} onChange={e=>setA('authoritative',e.target.checked)}/><span>Nur autoritative Positionsdaten</span></label>
                </div>
              </details>
            </form>
            <div className="checks">
              <Check n="1" title="Vertrag"
                status={selected?'Vertrag gefunden':results.length?(resultContractCount===1?'1 Vertrag gefunden':`${resultContractCount} Vertragsvarianten gefunden`):'noch offen'}
                value={selected?(selected.contract||selected.family||'Vertrag vorhanden'):results.length?(siteId?'Passende Position auswählen':'Standort/Region wählen oder Position auswählen'):'Position suchen'}
                ok={!!selected}/>
              <Check n="2" title="PQ / IK / Beitritt"
                status={!siteId?'noch offen':supplyBusy?'prüfen':supplyPathOk?'PQ + Beitritt bestätigt':supplyEval?.decision==='ROT'?'nicht erfüllt':'prüfen'}
                value={supplyPathValue}
                ok={supplyPathOk}/>
              <Check n="3" title="Genehmigung" status={selected?.genehmigung?'Vertragsangabe':'noch offen'} value={selected?.genehmigung||selected?.freigrenze||'Vertragsangabe fehlt'} ok={!!selected?.genehmigung}/>
              <Check n="4" title="Verordnung" status={selected?.verordnung?'Vertragsangabe':'noch offen'} value={selected?.verordnung||'Vertragsangabe fehlt'} ok={!!selected?.verordnung}/>
              <Check n="5" title="Dokumentation" status={relatedKnowledge.length?'Wissen vorhanden':'prüfen'} value={relatedKnowledge.length?`${relatedKnowledge.length} freigegebene Wissenseinträge`:'Vertragswissen/Formularregeln'} ok={relatedKnowledge.length>0}/>
              <Check n="6" title="Abrechnung" status={selected?.preis!=null?'Preis vorhanden':'noch offen'} value={selected?.preis!=null?String(selected.preis):'Preis/Versorgungsform'} ok={selected?.preis!=null}/>
            </div>
            {selected&&<PositionDetail
              position={selected}
              contract={selectedContract}
              site={selectedSite}
              siteMatch={siteMatch}
              knowledge={relatedKnowledge}
              canFach={canFach}
            />}
          </section>
          <section className="panel span2"><div className="sectionbar"><div><h2>Treffer</h2><p>Eine Position anklicken, um sie zu übernehmen.</p></div><Badge>{results.length}</Badge></div>
            {results.length>0&&!selected&&<div className="result-hint"><b>{results.length} passende Positionen · {resultContractCount} Vertragsvarianten</b><span>{payer==='AOK'&&!payerDetail&&!siteId?'AOK-Verträge sind regional. Bitte konkrete AOK/Region, Standort oder unten den passenden Vertrag auswählen.':'Bitte den passenden Vertrag bzw. die Position auswählen.'}</span></div>}
            <div className="tablewrap"><table><thead><tr><th>PG</th><th>HMV/Code</th><th>Position</th><th>Bezeichnung</th><th>Vertrag</th><th>Preis</th><th>Genehmigung</th></tr></thead><tbody>
              {results.map(r=><tr key={r.position_row_id} className={'selectable '+(selected?.position_row_id===r.position_row_id?'selected':'')} onClick={()=>setSelected(r)}><td>{r.pg||'—'}</td><td>{r.code||'—'}</td><td>{r.pos||'—'}</td><td><b>{r.bezeichnung||r.produktart_bezeichnung||'—'}</b></td><td>{r.contract||r.family||'—'}</td><td>{r.preis??'—'}</td><td>{r.genehmigung||r.freigrenze||'—'}</td></tr>)}
              {!results.length&&<tr><td colSpan="7" className="empty">Kasse, PG, Suchbegriff oder erweiterte Kriterien wählen und auf „Prüfen“ klicken.</td></tr>}
            </tbody></table></div>
          </section>
        </div>
      </>}

      {active==='contracts'&&<>
        <div className="page-head"><div><h1>Verträge</h1><p>Vertragskatalog und zugehörige Positionen durchsuchen.</p></div><Badge>{filteredContracts.length} Verträge</Badge></div>
        <section className="panel"><div className="sectionbar"><div><h2>Vertragskatalog</h2><p>Kasse, Produktgruppe oder Vertragsname.</p></div><input className="compact" value={contractQuery} onChange={e=>setContractQuery(e.target.value)} placeholder="Vertrag durchsuchen …"/></div>
          <div className="tablewrap"><table><thead><tr><th>Vertrag</th><th>Kostenträger</th><th>PG</th><th>gültig ab</th><th>gültig bis</th><th className="detail-only">Qualität</th></tr></thead><tbody>{filteredContracts.map(r=><tr key={r.contract_id}><td><b>{r.contract_name||r.contract_id}</b><span className="detail-only tiny">{r.contract_id}</span></td><td>{escArray(r.payer_families).join(', ')||'—'}</td><td>{escArray(r.product_groups).join(', ')||'—'}</td><td>{r.latest_valid_from||'—'}</td><td>{r.validity_mode==='SINGLE_SCOPE'?(r.catalog_valid_to||r.latest_valid_to||'—'):'PG-/Anlagen-spezifisch'}</td><td className="detail-only">{r.quality||'—'}</td></tr>)}</tbody></table></div>
        </section>
      </>}

      {active==='upload'&&<>
        <div className="page-head"><div><h1>Vertrag hochladen</h1><p>Vertragsquelle sicher ablegen, automatisch erkennen und Änderungen kontrolliert veröffentlichen.</p></div><Badge tone="warn">Versioniert · kein Überschreiben</Badge></div>
        <ContractUpload contracts={contracts} sites={sites} canFach={canFach} onOpenChanges={()=>setActive('changes')}/>
      </>}

      {active==='changes'&&<>
        <div className="page-head"><div><h1>Änderungen</h1><p>Uploadverlauf, Alt/Neu-Vergleich und fachliche Freigabe in einer Ansicht.</p></div><Badge tone="info">Änderungsprotokoll</Badge></div>
        <ContractChanges canFach={canFach}/>
      </>}

      {active==='questions'&&<>
        <div className="page-head"><div><h1>Vertragsfragen</h1><p>Vertragswissen zuerst prüfen, nur ungeklärte Fälle neu anlegen.</p></div><Badge tone="ok">{knowledge.length} freigegeben</Badge></div>
        <div className="grid">
          <section className="panel span2 knowledge-gate"><div className="sectionbar"><div><h2>Vertragswissen zuerst</h2><p>Nur APPROVED, aktuell gültig und ohne Revalidierungsbedarf.</p></div><input id="knowledgeSearch" className="compact" value={knowledgeQuery} onChange={e=>setKnowledgeQuery(e.target.value)} placeholder="Wissen durchsuchen …"/></div><div className="chain"><span>Vertragswissen</span><i>→</i><span>Gültigkeit / Geltungsbereich</span><i>→</i><span>Originalvertrag</span><i>→</i><span>Frage klären</span><i>→</i><span>Freigeben</span><i>→</i><span>Wissen zurückführen</span></div></section>
          <section className="panel span2"><div className="knowledge-list">{filteredKnowledge.map(r=><article className="knowledge-card" key={r.knowledge_id}><div className="knowledge-head"><div><b>{r.title}</b><small>{[r.payer,r.pg&&`PG ${r.pg}`,r.hmv_code,r.position_code].filter(Boolean).join(' · ')||'Allgemeiner Geltungsbereich'}</small></div><Badge tone="ok">APPROVED</Badge></div>{r.question_text&&<p><i>{r.question_text}</i></p>}<p>{r.decision_text}</p><footer className="detail-only">Vertrag: {r.contract_id||'—'} · Version: {r.contract_version_id||'—'} · Quelle: {r.source_id||'—'}</footer></article>)}{!filteredKnowledge.length&&<div className="empty-panel">Noch kein freigegebenes Vertragswissen vorhanden.</div>}</div></section>
          <section className="panel"><h2>Neue Vertragsfrage</h2><form className="formstack" onSubmit={submitQuestion}><label>Vertragsfrage<textarea id="qText" rows="5" value={questionForm.question_text} onChange={e=>setQ('question_text',e.target.value)} required/></label><div className="formgrid"><label>Kostenträger<input value={questionForm.payer} onChange={e=>setQ('payer',e.target.value)}/></label><label>PG<input value={questionForm.pg} onChange={e=>setQ('pg',e.target.value)}/></label></div><label>Vertrag<select value={questionForm.contract_id} onChange={e=>setQ('contract_id',e.target.value)}><option value="">Nicht zugeordnet</option>{contracts.map(r=><option key={r.contract_id} value={r.contract_id}>{r.contract_name||r.contract_id}</option>)}</select></label><div className="formgrid"><label>HMV / Produktart<input value={questionForm.hmv_code} onChange={e=>setQ('hmv_code',e.target.value)}/></label><label>Position / GPOS<input value={questionForm.position_code} onChange={e=>setQ('position_code',e.target.value)}/></label></div>{questionMessage&&<div className={'alert '+(questionMessage.startsWith('Vertragsfrage wurde')?'success':'error')}>{questionMessage}</div>}<button className="primary" type="submit">Vertragsfrage anlegen</button></form></section>
          <section className="panel"><div className="sectionbar"><div><h2>Prüfqueue</h2><p>{canFach?'Fachlich sichtbare Fragen':'Eigene Vertragsfragen'}</p></div><Badge>{questions.length}</Badge></div><div className="question-list">{questions.map(r=><article className="question-row" key={r.question_id}><div><b>{r.question_text}</b><small>{[r.payer,r.pg&&`PG ${r.pg}`,r.hmv_code,r.position_code].filter(Boolean).join(' · ')||'ohne Zuordnung'}</small></div><Badge>{r.status}</Badge></article>)}{!questions.length&&<div className="empty-panel">Noch keine Vertragsfragen vorhanden.</div>}</div></section>
        </div>
      </>}

      {active==='data'&&<><div className="page-head"><div><h1>Datenstand</h1><p>Aktuell im Vertragsnavigator verfügbare strukturierte Daten.</p></div><Badge tone="info">VN 2.1</Badge></div><div className="metrics"><Metric label="Verträge" value={stats.contracts}/><Metric label="Positionen importiert" value={stats.positions}/><Metric label="Freigegebenes Wissen" value={stats.knowledge}/><Metric label="Sichtbare Vertragsfragen" value={stats.questions}/></div><section className="panel spaced"><h2>Prüflogik</h2><p>Produkt/Position → Vertrag → Standort/IK → PQ → Vertragsbeitritt → Genehmigung/eKVA → Verordnung → Dokumentation → Fristen → Abrechnung.</p><div className="note">Kein positiver Prüfschritt ersetzt einen anderen.</div></section></>}
    </main>
  </div>
}

function Check({n,title,status,value,ok}){return <article className="check"><small>{n} · {title}</small><strong className={ok?'oktext':''}>{status}</strong><div className="value">{value}</div></article>}
function Metric({label,value}){return <article className="metric"><span>{label}</span><strong>{Number(value||0).toLocaleString('de-DE')}</strong></article>}
