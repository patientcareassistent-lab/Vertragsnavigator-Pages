/**
 * VN2: no-cost, deterministic OCR hints for accession confirmations, terminations
 * and scope restrictions. Pure module: no database or side effects.
 *
 * A hint is NOT proof, not a verified effective date, and never eligibility.
 */
const nfc = s => String(s ?? "").normalize("NFKC");
const clean = s => nfc(s).replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
const MONTHS = ["januar", "februar", "märz", "maerz", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "dezember"];
const GERMAN_DATE = /\b([0-3]?\d)\.\s*([01]?\d)\.\s*((?:19|20)\d{2})\b/g;
const ISO_DATE = /\b((?:19|20)\d{2})-([01]\d)-([0-3]\d)\b/g;
const WRITTEN_DATE = /\b([0-3]?\d)\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+((?:19|20)\d{2})\b/gi;
const IK = /\b(?:IK|Institutionskennzeichen)\s*(?:-?\s*Nr\.?|nummer|:|=)?\s*(\d{9})(?!\d)/gi;
const PG = /\b(?:PG|Produktgruppe(?:n)?)\s*(?:-|:|Nr\.?)?\s*(\d{2})(?!\d)/gi;
const BEITRITT = /\b(?:Beitrittsbestätigung|Beitrittserklärung|Vertragsbeitritt\s+(?:erfolgt|bestätigt)|\b(?:ist|sind)\b.{0,75}\bbeigetreten\b|(?:bestätigen|bestätigt)\b.{0,90}\b(?:Beitritt|Vertragsbeitritt|Aufnahme)\b|\bBeitritt\b.{0,50}\b(?:bestätigt|erfolgt|wirksam)\b)/i;
const TERMINATION = /\b(?:Kündigungsbestätigung|(?:wir|hiermit)\s+kündigen|(?:Kündigung|gekündigt)\s+(?:des?\s+)?(?:Vertragsbeitritts|Beitritts)\s+(?:ist\s+)?(?:bestätigt|wirksam|erfolgt|zum\s+\d)|\b(?:Beitritt|Vertragsbeitritt)\b.{0,60}\b(?:gekündigt|beendet|endet)\b|(?:bestätigen|bestätigt)\b.{0,65}\bKündigung\b)/i;
const RESTRICTION = /\b(?:Widerspruch(?:serklärung)?\s+(?:zum|gegen|der)|(?:für|bei)\s+(?:die\s+)?(?:PG|Produktgruppe)\b.{0,65}\b(?:ausgenommen|ausgeschlossen|kein\s+Beitritt)|\b(?:PG|Produktgruppe)\b.{0,45}\b(?:ausgenommen|ausgeschlossen|nicht\s+(?:beigetreten|umfasst))\b|(?:Einschränkung|Beschränkung)\s+(?:des?\s+)?(?:Beitritts|Vertragsumfangs|Versorgungsumfangs))/i;
const HYPOTHETICAL = /\b(?:kann|können|könnte|dürfen|berechtigt|Möglichkeit|Muster|Beispiel)\b.{0,75}\b(?:beitreten|Beitrittserklärung|kündigen)\b/i;

const iso = (year, month, day) => {
  const y=Number(year), m=Number(month), d=Number(day);
  const obj=new Date(Date.UTC(y,m-1,d));
  return obj.getUTCFullYear()===y && obj.getUTCMonth()+1===m && obj.getUTCDate()===d
    ? String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0') : null;
};
export function extractDates(text) {
  const found=[];
  const collect=(regexp,fn) => {
    for(const m of String(text||"").matchAll(regexp)) {
      const date=fn(m);
      if(date && !found.some(x=>x.date===date && x.index===m.index))found.push({date,index:m.index,raw:m[0]});
    }
  };
  collect(GERMAN_DATE,m=>iso(m[3],m[2],m[1]));
  collect(ISO_DATE,m=>iso(m[1],m[2],m[3]));
  collect(WRITTEN_DATE,m=>{
    const month=MONTHS.indexOf(m[2].toLocaleLowerCase('de-DE'))+1;
    return month ? iso(m[3],month,m[1]) : null;
  });
  return found.sort((a,b)=>a.index-b.index);
}
const uniques=(arr,limit=8)=>[...new Set(arr)].slice(0,limit);
const associations = (piece,signalIndex) => {
  const dates=extractDates(piece);
  // Restrict to dates truly adjacent to the active sentence/heading rather than
  // letter date, header, unrelated footer, or dates elsewhere on a page.
  return dates.filter(d=>Math.abs(d.index-signalIndex)<=130);
};
const DATES_FROM = /\b(?:ab|seit|beginn(?:end)?|wirksam\s+ab|mit\s+wirkung\s+(?:vom|zum|ab)|tritt\s+in\s+kraft\s+(?:am|zum)|gültig\s+ab)\b/i;
const DATES_TO = /\b(?:bis(?:\s+zum)?|zum\s+ablauf|endet\s+(?:am|zum)|befristet\s+bis|endet\s+mit|kündigung\s+zum|gekündigt\s+zum)\b/i;
const docStopwords = /\b(?:allgemeine\s+vertragsbedingungen|musterformular|beispieltext)\b/i;
function classify(text){
  // A dated termination wins over a prior accession mention inside one segment.
  if(TERMINATION.test(text))return 'KUENDIGUNG';
  if(RESTRICTION.test(text))return 'EINSCHRAENKUNG';
  if(BEITRITT.test(text)&&!HYPOTHETICAL.test(text))return 'BEITRITT';
  return null;
}
function parseSegment(page, raw, serial){
  const text=clean(raw);
  if(text.length<25 || text.length>3500 || docStopwords.test(text))return null;
  const kind=classify(text);
  if(!kind)return null;
  const namedSignal=(kind==='KUENDIGUNG'?text.search(TERMINATION):
    kind==='EINSCHRAENKUNG'?text.search(RESTRICTION):text.search(BEITRITT));
  // Prefer the dated factual declaration over a long document heading.
  const actualDeclaration=kind==='BEITRITT'
    ?text.search(/(?:wir\s+bestätigen\s+(?:hiermit\s+)?(?:den\s+)?(?:Vertrags)?Beitritt|\bBeitritt\b\s+(?:ist\s+)?(?:erfolgt|bestätigt|wirksam))/i)
    :kind==='KUENDIGUNG'
      ?text.search(/(?:wir\s+kündigen|hiermit\s+kündigen|\bKündigung\b.{0,40}\bbestätigt\b)/i)
      :-1;
  const signal=actualDeclaration>=0?actualDeclaration:namedSignal;
  const dates=associations(text,signal);
  const iks=uniques([...text.matchAll(IK)].map(x=>x[1]));
  const pgs=uniques([...text.matchAll(PG)].map(x=>x[1]));
  const before=dates.filter(x=>x.index<=signal+120);
  const dated = before.length ? before : dates;
  const from = dated.find(x=>DATES_FROM.test(text.slice(Math.max(0,x.index-35),x.index)))?.date||null;
  const to = dated.find(x=>DATES_TO.test(text.slice(Math.max(0,x.index-40),x.index)))?.date||null;
  // A termination date is a termination-effective-from proposal, not an
  // accession valid_to. Never infer an accession expiry from a termination.
  const suggestedFrom=kind==='KUENDIGUNG'?(to||from):from;
  const firstDate=dated[0]?.date||null;
  const dateAmbiguous=(dated.length>1 && !suggestedFrom) ||
    (kind==='BEITRITT' && !suggestedFrom);
  const suggestedDate= suggestedFrom || (kind==='EINSCHRAENKUNG'?firstDate:null);
  const matching = [];
  if(iks.length!==1)matching.push('IK nicht eindeutig');
  if(pgs.length!==1)matching.push('PG nicht eindeutig');
  if(!suggestedDate)matching.push('Wirksamkeitsdatum ungeklärt');
  if(dates.length>2)matching.push('mehrere Datumsangaben');
  return {
    key:'seite-'+page+'-'+serial+'-'+kind,
    page,kind,excerpt:text.slice(0,1400),ik_candidates:iks,pg_candidates:pgs,
    date_candidates:uniques(dates.map(x=>x.date)),
    suggested_effective_from:suggestedDate,
    suggested_effective_to:null,
    date_is_tentative:true,
    manual_review_required:true,auto_verified:false,
    issues:matching,
    source_method:null
  };
}
export function extractAccessionDocumentHints(pages,{max=120}={}){
  if(!Array.isArray(pages))return {hints:[],quality:{pages:0,unreadable_pages:[]}};
  if(!Number.isInteger(max)||max<1||max>200)throw new Error('Ungültige Treffergrenze');
  const hints=[],unreadable=[];
  let analyzed=0;
  for(const page of pages){
    if(!Number.isInteger(page.page)||page.page<1||page.page>250)throw new Error('Ungültige OCR-Seitenreferenz');
    if(page.method==='failed'){unreadable.push(page.page);continue}
    const raw=String(page.text||'');
    if(raw.length>17000)throw new Error('OCR-Seitenlimit');
    analyzed++;
    // Adjacent lines only, not all content of the page: avoid scope/date bleed
    // between independent articles, headers and adjacent confirmation templates.
    const lines=raw.split(/\r?\n/).map(clean).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      for(const span of [1,2,3]){
        const segment=lines.slice(i,i+span).join(' ');
        if(segment.length>1000)continue;
        const item=parseSegment(page.page,segment,i);
        if(!item)continue;
        item.source_method=page.method;
        // Streaming de-dup: prefer the longest line context before counting
        // the bounded result, so a long heading cannot hide a date on line 2.
        const ix=hints.findIndex(x=>x.page===item.page && x.kind===item.kind &&
          (item.excerpt.startsWith(x.excerpt)||x.excerpt.startsWith(item.excerpt)));
        if(ix<0)hints.push(item);
        else if(item.excerpt.length>hints[ix].excerpt.length)hints[ix]=item;
        if(hints.length>max)throw new Error('OCR_ACCESSION_HINT_LIMIT');
      }
    }
  }
  // Remove overlapping consecutive snippets, retain the most complete one
  // and preserve exact page provenance.
  const result=[];
  for(const hint of hints){
    const ix=result.findIndex(x=>x.page===hint.page && x.kind===hint.kind &&
      (hint.excerpt.startsWith(x.excerpt)||x.excerpt.startsWith(hint.excerpt)));
    if(ix<0)result.push(hint);
    else if(hint.excerpt.length>result[ix].excerpt.length)result[ix]=hint;
  }
  return {hints:result,quality:{pages:pages.length,analyzed_pages:analyzed,
    unreadable_pages:unreadable,review_required:true}};
}
