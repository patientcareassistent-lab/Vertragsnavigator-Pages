// Shared HMV grouping is a classification aid, not a claim of clinical/contractual equivalence.
export const fmtMoney=value=>{
  if(value===null||value===undefined||value==='')return '—'
  const n=Number(value)
  return Number.isFinite(n)?n.toLocaleString('de-DE',{style:'currency',currency:'EUR'}):String(value)
}
export const hmvCode=value=>{
  const raw=String(value||'').trim().replace(/\s+/g,'')
  return /^\d{2}(?:\.\d{2})(?:\.\d{2})(?:\.\d{1,4})?$/.test(raw)?raw:''
}
export const pairKey=p=>String(p.family)+'::'+String(p.detail||'')
export const pairTitle=p=>p.detail?p.family+' · '+p.detail:p.family

export function approvalBadge(row){
  const value=[row?.genehmigung,row?.freigrenze].filter(Boolean).join(' · ').trim()
  if(!value)return {tone:'unknown',label:'Genehmigung prüfen',detail:'Genehmigung nicht eindeutig erfasst'}
  const lower=value.toLocaleLowerCase('de')
  if(/begründung|begruendung|medizinische notwendigkeit|rechtfertigung/.test(lower))
    return {tone:'reason',label:'Begründung prüfen',detail:value}
  if(/genehmigungsfrei|genehmigung nicht erforderlich|ohne genehmigung|keine genehmigung erforderlich/.test(lower))
    return {tone:'free',label:'Genehmigungsfrei',detail:value}
  if(/genehmigungspflicht|genehmigung erforderlich|genehmigung nötig|kostenvoranschlag|\bkva\b|anzeige/.test(lower))
    return {tone:'approval',label:'Genehmigung / KVA prüfen',detail:value}
  return {tone:'unknown',label:'Hinweise prüfen',detail:value}
}

export function addonNotice(rel){
  const text=[rel?.justification,rel?.conditions].filter(Boolean).join(' · ')
  if(/begründung|begruendung|medizinische notwendigkeit|rechtfertigung/.test(text.toLocaleLowerCase('de')))
    return {tone:'reason',label:'Begründung',detail:text}
  if(text)return {tone:'notice',label:'Hinweis',detail:text}
  return null
}

export function groupedMatrix(comparisons){
  const groups=new Map()
  for(const {pair,items=[]} of comparisons){
    const pKey=pairKey(pair)
    for(const item of items){
      const code=hmvCode(item.code)
      const id=String(item.position_row_id||item.pos||'').trim()
      // Never create cross-payer equivalence from text similarity or contract codes.
      const key=code?'hmv:'+String(item.pg||'')+':'+code:'unmapped:'+pKey+':'+id
      if(!groups.has(key))groups.set(key,{
        key,code,pg:item.pg||'',caption:code?'Gleicher HMV-Code':'Keine HMV-Zuordnung',
        cells:Object.create(null)
      })
      const group=groups.get(key)
      ;(group.cells[pKey] ||= []).push(item)
    }
  }
  return [...groups.values()].sort((a,b)=>{
    if(Boolean(a.code)!==Boolean(b.code))return a.code?-1:1
    return String(a.pg||'').localeCompare(String(b.pg||''),'de',{numeric:true})||
      String(a.code||a.key).localeCompare(String(b.code||b.key),'de',{numeric:true})
  })
}

export function addonMatrixRows(group,comparisons,addons,targets){
  const shared=new Map()
  for(const {pair} of comparisons){
    const pKey=pairKey(pair)
    for(const base of group.cells[pKey]||[]){
      for(const rel of addons[base.position_row_id]||[]){
        if(!rel?.verified_at)continue
        const position=targets[rel.addon_position_row_id]||{}
        const code=hmvCode(position.code)
        const key=code?'hmv:'+code:'source:'+pKey+':'+String(rel.addon_position_row_id)
        if(!shared.has(key))shared.set(key,{key,code,cells:Object.create(null)})
        ;(shared.get(key).cells[pKey] ||= []).push({rel,position,base})
      }
    }
  }
  return [...shared.values()].sort((a,b)=>String(a.code||a.key).localeCompare(String(b.code||b.key),'de',{numeric:true}))
}
