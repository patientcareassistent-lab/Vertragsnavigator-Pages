// Vertrags-/Positionsanzeige: keine Vertragsstamm-LEGS als Positionsfreigabe interpretieren.
const isoToday=()=>new Date().toISOString().slice(0,10)
const money=value=>{
  if(value===null||value===undefined||value==='')return '—'
  const n=Number(value)
  return Number.isFinite(n)?n.toLocaleString('de-DE',{style:'currency',currency:'EUR'}):String(value)
}
const codes=value=>{
  const chunks=Array.isArray(value)?value:String(value??'').split(/[,;|]/)
  return [...new Set(chunks.map(v=>String(v??'').trim().toUpperCase()).filter(Boolean))]
}
export function resolvePositionScope(position, rules=[], onDate){
  if(!position)return {legsText:'—',priceText:'—',priceConfirmed:false,variants:[],notice:''}
  const day=/^\d{4}-\d{2}-\d{2}$/.test(String(onDate||''))?onDate:isoToday()
  const historical=Boolean(position.gueltig_bis&&String(position.gueltig_bis)<day)
  const future=Boolean(position.gueltig_ab&&String(position.gueltig_ab)>day)
  const original=codes(position.legs)
  const rule=(!historical&&!future?rules:[]).find(r=>
    r.contract_id===position.contract_id &&
    String(r.pg)===String(position.pg) &&
    (!r.hmv_code||String(r.hmv_code)===String(position.code)) &&
    (!r.supply_keyword||String(position.contract||'').toLowerCase().includes(String(r.supply_keyword).toLowerCase())) &&
    (!r.effective_from||String(r.effective_from)<=day) &&
    (!r.effective_to||String(r.effective_to)>=day)
  )
  if(historical)return {legsText:(original.join(', ')||'—')+' (historisch)',priceText:'Historisch: '+money(position.preis),priceConfirmed:false,variants:[],notice:'Diese Positionszeile ist seit '+position.gueltig_bis+' abgelaufen. Die angegebenen LEGS und Preise sind keine aktuellen Konditionen.'}
  if(future)return {legsText:(original.join(', ')||'—')+' (zukünftig)',priceText:'Noch nicht gültig',priceConfirmed:false,variants:[],notice:'Diese Position ist erst ab '+position.gueltig_ab+' gültig.'}
  if(rule){
    const variants=Array.isArray(rule.price_variants)?rule.price_variants:[]
    return {
      legsText:(codes(rule.effective_legs).join(', ')||'—')+' (nur '+(rule.provider_scope||'geprüfte Anlage')+')',
      priceText:'Ausführung / Preis prüfen',
      priceConfirmed:false,
      variants,
      notice:'Quellenbezogene Zuordnung: '+(rule.provider_scope||'Vertragsanlage')+'. Nicht auf andere LEGS oder Vertragsarten übertragbar. '+(rule.review_required?'Fachliche Freigabe steht noch aus.':''),
      ruleId:rule.rule_id
    }
  }
  if(original.length>1)return {legsText:original.join(', ')+' (Zuordnung prüfen)',priceText:money(position.preis)+' (prüfen)',priceConfirmed:false,variants:[],notice:'Mehrere LEGS im Export. Ohne eindeutige Zuordnung zu Vertragsanlage, Version und Leistungserbringer ist keine dieser Gruppen als gültig bestätigt.'}
  if(!original.length)return {legsText:'— (nicht belegt)',priceText:money(position.preis)+' (prüfen)',priceConfirmed:false,variants:[],notice:'Kein eindeutiger LEGS dokumentiert. Vertragsanlage prüfen.'}
  return {legsText:original[0],priceText:money(position.preis),priceConfirmed:Boolean(position.authoritative&&position.preis!==null&&position.preis!==undefined),variants:[],notice:position.authoritative?'Positionsquelle hinterlegt; Vertrags- und Standortgültigkeit zusätzlich prüfen.':'Positionsquelle nicht als autoritativ bestätigt. Vertragsanlage prüfen.'}
}