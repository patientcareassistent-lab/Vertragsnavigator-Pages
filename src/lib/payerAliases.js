// V4.3: Display-only aliases. Contract source names and server-side payer scope stay unchanged.
// Do not turn multi-payer contracts into a single payer. Keep all original query values.
const DEFINITIONS=[
  ['BIG direkt gesund',['BIG direkt','BIG Direkt Gesund']],
  ['IKK classic',['IKK Classic']],
  ['IKK gesund plus',['IKK Gesund Plus','IKK gesundplus']],
  ['IKK Brandenburg und Berlin',['IKK Berlin/Brandenburg','IKK Brandenburg/Berlin','IKK Berlin Brandenburg']],
  ['IKK – Die Innovationskasse',['IKK - Die Innovationskasse','IKK Die Innovationskasse']],
  ['IKK Südwest',['IKK Suedwest']],
  ['AOK Baden-Württemberg',['AOK BW','AOK  BW','AOK BaWü']],
  ['AOK Nordwest',['AOK NordWest','AOK Nord West']],
  ['AOK Nordost',['AOK Nord Ost']],
  ['AOK PLUS',['AOK Plus']],
  ['AOK Rheinland/Hamburg',['AOK Rheinland / Hamburg']],
  ['AOK Sachsen-Anhalt',['AOK Sachsen Anhalt']],
  ['AOK Rheinland-Pfalz/Saarland',['AOK Rheinland Pfalz Saarland']],
  ['AOK Bremen/Bremerhaven',['AOK Bremen Bremerhaven']],
  ['BARMER',['Barmer']],
  ['Techniker Krankenkasse (TK)',['TK','Techniker Krankenkasse']],
  ['hkk',['HKK']],
  ['DAK-Gesundheit',['DAK','DAK Gesundheit']],
  ['GWQ Service Plus AG',['GWQ','GWQ Serviceplus AG']],
  ['spectrumK GmbH',['spectrumK','spectrum K','Spectrum K']],
  ['vdek',['VDEK']],
  ['Novitas BKK',['BKK Novitas']],
  ['pronova BKK',['Pronova BKK','BKK Pronova']],
  ['mhplus BKK',['Mhplus BKK','mhplus Krankenkasse']],
  ['mkk – meine krankenkasse',['Mkk- meine Krankenkasse','mkk meine krankenkasse']],
  ['BKK Landesverband Bayern',['BKK LV Bayern']],
  ['BKK Landesverband Süd',['BKK LV Süd']],
  ['BKK Landesverband Mitte',['BKK LV Mitte']],
  ['BKK Landesverband Bayern + BKK Landesverband Süd',['BKK LV Bayern und BKK LV Süd','BKK Landesverband Bayern und BKK Landesverband Süd']],
  ['BKK Landesverband Bayern + BKK Landesverband Mitte',['BKK LV Mitte BKK LV Bayern','BKK LV Mitte und BKK LV Bayern']],
  ['VIACTIV Krankenkasse',['VIACTIV Krankenkasse (ehemals BKK vor Ort)']],
  ['DGUV',['DGUV- Deutschen Gesetzlichen Unfallversicherung e.V.']],
  ['Knappschaft',['KNAPPSCHAFT']],
  ['Knappschaft + SVLFG',['Knappschaft/SVLFG']],
]
export const payerDetailKey=value=>String(value??'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE')
  .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
const ALIASES=new Map()
for(const [canonical,variants] of DEFINITIONS)
  for(const variant of [canonical,...variants])ALIASES.set(payerDetailKey(variant),canonical)

export function canonicalPayerDetail(value){
  const raw=String(value??'').trim().replace(/\s+/g,' ')
  if(!raw)return ''
  // Exact composite aliases can carry a genuine joint contract, not several independent contracts.
  const exact=ALIASES.get(payerDetailKey(raw))
  if(exact)return exact
  const members=raw.split(/\s*[,;]\s*/).filter(Boolean)
  if(members.length>1 && members.every(p=>ALIASES.has(payerDetailKey(p)))){
    return [...new Set(members.map(p=>ALIASES.get(payerDetailKey(p))))]
      .sort((a,b)=>a.localeCompare(b,'de')).join(' + ')
  }
  return raw
}
export function payerDetailOptions(contracts,family){
  if(!family)return []
  const relevant=contracts
    .filter(c=>Array.isArray(c.payer_families)&&c.payer_families.includes(family))
    .map(c=>String(c.contract_name||'').split(':')[0].trim())
    .filter(Boolean)
    .sort((a,b)=>a.localeCompare(b,'de'))
  const groups=new Map()
  for(const raw of relevant){
    const label=canonicalPayerDetail(raw)
    const key=payerDetailKey(label)
    if(!groups.has(key))groups.set(key,{label,raws:new Set()})
    groups.get(key).raws.add(raw)
  }
  return [...groups.values()]
    .map(g=>({label:g.label,raws:[...g.raws].sort((a,b)=>a.localeCompare(b,'de'))}))
    .sort((a,b)=>a.label.localeCompare(b.label,'de'))
    .slice(0,250)
}
