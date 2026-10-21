/*
 * Vertragsnavigator 2.1: konservativer OCR-Klauselvergleich.
 * Nur Recherche-/Prüfkandidaten, niemals automatische verbindliche Vertragsänderungen.
 * Modul ist Deno-Edge- und Node-test-kompatibel.
 */
const headingPattern=/^\s*(§\s*\d+[a-z]?|(?:Artikel|Art\.?)\s*\d+[a-z]?|(?:[1-9]\d?)(?:\.\d{1,2}){0,3}\.?)\s*(?:[:.)–-]\s*|\s+)(.{2,145})$/i;
const MAX_CLAUSES=1200;
const MAX_TEXT=2000000;
const LIMIT_CHARS=16000;
const sections=[
  ["GENEHMIGUNG",/\b(genehmig|kostenvoranschlag|ekva|e-kva|versorgungsanzeige|freigrenze)/i],
  ["ABRECHNUNG",/\b(abrechn|vergütung|verguet|preis|erstattung|mwst|umsatzsteuer|lkz|legs)/i],
  ["FRIST",/\b(frist|innerhalb|werktag|kalendertag|kündig|kuendig|laufzeit|gültig|gueltig)/i],
  ["VERORDNUNG",/\b(verordnung|rezept|arzt|ärztlich)/i],
  ["VERSORGUNG",/\b(versorgung|hilfsmittel|reparatur|wartung|service|wiedereinsatz|leistungsumfang|pq|präqualif)/i],
  ["DOKUMENTATION",/\b(nachweis|dokumentation|formular|unterschrift|bericht|pflicht|unterlagen)/i]
];
export function normalizeClauseText(input){
  return String(input??"")
    .normalize("NFKC")
    .replace(/\u00ad/g,"")
    .replace(/([A-Za-zÄÖÜäöüß])-\s*\n\s*([A-Za-zÄÖÜäöüß])/g,"$1$2")
    .replace(/[„“”]/g,'"').replace(/[’‚]/g,"'")
    .replace(/[–—]/g,"-")
    .replace(/\s+/g," ")
    .trim();
}
export function headingInfo(line){
  const src=normalizeClauseText(line);
  if(src.length>180 || src.length<5) return null;
  const match=src.match(headingPattern);
  if(!match) return null;
  // Bloße Zahlen plus Text (z. B. "15 Tage") sind keine Überschriften.
  if(/^\d+$/.test(match[1]))return null;
  const mark=match[1].replace(/\s+/g,"").replace(/\.+$/g,"").toLowerCase();
  // §-Nummern, Artikel und Abschnittsnummern gelten nur mit Bezeichnung.
  if(match[2].length<3 || /^[\d\s.,;:\-]+$/.test(match[2]) || /^\d{1,3},\d{2}\b/.test(match[2]))return null;
  return {key:mark,heading:src};
}
export function clauseCategory(text){
  const normalized=normalizeClauseText(text);
  return sections.find(([,pattern])=>pattern.test(normalized))?.[0]??"SONSTIGES";
}
export function extractOcrClauses(pages){
  if(!Array.isArray(pages)||pages.length<1) return {clauses:[],quality:{readable_pages:0,failed_pages:[],unstructured:true}};
  const failures=pages.filter(p=>p.method==="failed").map(p=>p.page);
  const readable=pages.filter(p=>p.method!=="failed"&&String(p.text||"").trim()).length;
  const candidates=[];
  let current=null;
  let parentSection=null;
  let total=0;
  const counts=new Map();
  function finish(){
    if(!current)return;
    const content=normalizeClauseText(current.parts.join("\n"));
    if(content.length>=25){
      const number=(counts.get(current.key)||0)+1;
      counts.set(current.key,number);
      const sectionKey=current.key+"#"+number;
      candidates.push({
        key:sectionKey, section_id:current.comparable?current.key:"unstructured", heading:current.heading,
        page:current.page, end_page:current.end_page,
        text:content, category:clauseCategory(current.heading+" "+content),
        source_method:current.methods.includes("ocr")?"ocr":"text"
      });
      if(candidates.length>MAX_CLAUSES)throw new Error("OCR_CLAUSE_LIMIT: zu viele Vertragsklauseln");
    }
    current=null;
  }
  for(const page of pages){
    if(page.method==="failed")continue;
    const raw=String(page.text||"");
    if(raw.length>LIMIT_CHARS)throw new Error("OCR_PAGE_LIMIT: Seite über Textlimit");
    total+=raw.length;
    if(total>MAX_TEXT)throw new Error("OCR_TEXT_LIMIT");
    const lines=raw.split(/\r?\n/);
    let foundHeading=false;
    for(const line of lines){
      const title=headingInfo(line);
      if(title){
        finish();
        foundHeading=true;
        const primary=/^(?:§|artikel|art)/i.test(title.key)
        if(primary)parentSection=title.key
        // Unterziffern dürfen nur innerhalb desselben Paragraphen verglichen werden.
        // Ohne sicheren Paragraphenanker bleiben sie im Klauselindex, nicht im automatischen Diff.
        const anchoredKey=primary?title.key:(parentSection?parentSection+"/"+title.key:"unanchored:"+title.key+"@"+page.page)
        current={key:anchoredKey,comparable:Boolean(primary||parentSection),heading:title.heading,page:page.page,end_page:page.page,parts:[],methods:[page.method]};
      }else if(current){
        current.parts.push(line);
        current.end_page=page.page;
        if(!current.methods.includes(page.method))current.methods.push(page.method);
      }
    }
    if(!foundHeading && !current && normalizeClauseText(raw).length>=25){
      // Kein §/Artikel erkennbar: nur als unstrukturierter Seitenhinweis, niemals als entfallene Klausel.
      candidates.push({
        key:"seite-"+page.page,section_id:"unstructured",heading:"Text ohne sicher erkannte Gliederung",
        page:page.page,end_page:page.page,text:normalizeClauseText(raw),
        category:clauseCategory(raw),source_method:page.method
      });
    }
  }
  finish();
  const structured=candidates.filter(c=>c.section_id!=="unstructured").length;
  return {
    clauses:candidates,
    quality:{
      readable_pages:readable,failed_pages:failures,
      structured_clauses:structured,unstructured:structured===0,
      total_pages:pages.length
    }
  };
}
const tokens=str=>new Set(normalizeClauseText(str).toLocaleLowerCase("de-DE").split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>2));
export function similarity(a,b){
  const x=normalizeClauseText(a).toLocaleLowerCase("de-DE");
  const y=normalizeClauseText(b).toLocaleLowerCase("de-DE");
  if(x===y)return 1;
  const aa=tokens(x),bb=tokens(y);
  if(!aa.size||!bb.size)return 0;
  let shared=0;
  for(const t of aa)if(bb.has(t))shared++;
  return (2*shared)/(aa.size+bb.size);
}
function materialNumbers(s){
  return normalizeClauseText(s).match(/\b\d+(?:[.,]\d+)*\b/g)?.join("|")??"";
}
export function compactClauses(list){
  return list.map(c=>({
    key:c.key,section_id:c.section_id,heading:c.heading,
    page:c.page,end_page:c.end_page,category:c.category,
    source_method:c.source_method,text:c.text
  }));
}
export function compareOcrClauses(newParsed,oldParsed,{maxResults=800}={}){
  const old=(oldParsed?.clauses||[]).filter(x=>x.section_id!=="unstructured");
  const current=(newParsed?.clauses||[]).filter(x=>x.section_id!=="unstructured");
  if(!old.length||!current.length){
    return {changes:[],summary:{old_count:old.length,new_count:current.length,
      added:0,modified:0,uncertain:0,not_found:0,unchanged:0,
      review_required:false,document_comparable:false}};
  }
  const oldByKey=new Map(old.map((c,i)=>[c.key,{c,i}]));
  const seen=new Set();
  const changes=[];
  let unchanged=0;
  for(const next of current){
    const existing=oldByKey.get(next.key);
    if(existing){
      seen.add(existing.i);
      const score=similarity(existing.c.heading+" "+existing.c.text,next.heading+" "+next.text);
      if(normalizeClauseText(existing.c.heading+" "+existing.c.text).toLocaleLowerCase("de-DE")===normalizeClauseText(next.heading+" "+next.text).toLocaleLowerCase("de-DE")){
        unchanged++;continue;
      }
      changes.push({
        kind:score>=0.94 && materialNumbers(existing.c.heading+" "+existing.c.text)===materialNumbers(next.heading+" "+next.text)?"UNSICHER":"GEAENDERT",section:next.heading,section_key:next.key,
        category:next.category,similarity:Math.round(score*100)/100,
        before:{page:existing.c.page,end_page:existing.c.end_page,text:existing.c.text},
        after:{page:next.page,end_page:next.end_page,text:next.text},
        review_required:true
      });
    }else{
      changes.push({
        kind:"NEU_ZU_PRUEFEN",section:next.heading,section_key:next.key,
        category:next.category,similarity:null,before:null,
        after:{page:next.page,end_page:next.end_page,text:next.text},
        review_required:true
      });
    }
    if(changes.length>maxResults)throw new Error("OCR_CHANGE_LIMIT: mehr als "+maxResults+" Prüfkandidaten");
  }
  // Nie DELETE behaupten: fehlende Überschriften können Scan-/OCR-Unterschiede sein.
  for(let i=0;i<old.length;i++){
    if(!seen.has(i)){
      const prev=old[i];
      changes.push({
        kind:"NICHT_GEFUNDEN",section:prev.heading,section_key:prev.key,
        category:prev.category,similarity:null,
        before:{page:prev.page,end_page:prev.end_page,text:prev.text},
        after:null,review_required:true
      });
      if(changes.length>maxResults)throw new Error("OCR_CHANGE_LIMIT: mehr als "+maxResults+" Prüfkandidaten");
    }
  }
  const count=kind=>changes.filter(c=>c.kind===kind).length;
  return {changes,summary:{
    old_count:old.length,new_count:current.length,
    added:count("NEU_ZU_PRUEFEN"),modified:count("GEAENDERT"),
    uncertain:count("UNSICHER"),not_found:count("NICHT_GEFUNDEN"),unchanged,
    review_required:changes.length>0,
    document_comparable:old.length>0&&current.length>0&&!newParsed.quality?.failed_pages?.length&&!oldParsed.quality?.failed_pages?.length
  }};
}
export function normalizedDocumentKey(filename){
  return String(filename||"").toLocaleLowerCase("de-DE")
    .replace(/\.[^.]+$/,"")
    .replace(/[^a-zäöüß0-9]+/g," ")
    .replace(/\b(?:19|20)\d{2}\b/g," ")
    .replace(/\b(?:v|version|stand)\s*\d+(?:\s+\d+)*\b/g," ")
    .trim().replace(/\s+/g," ");
}
