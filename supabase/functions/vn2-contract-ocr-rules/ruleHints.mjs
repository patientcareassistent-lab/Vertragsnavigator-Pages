/**
 * VN 2.1 – deterministische Hinweise aus OCR-Klauseln.
 * Liefert keine verbindliche Genehmigung/Regel; alle Merkmale sind UNBESTÄTIGT.
 * Keine LLM-Kosten, keine externe Textübermittlung.
 */
import { normalizeClauseText } from "./clauseDiff.mjs";
const PATTERNS = [
  ["GENEHMIGUNG", /\b(?:genehmigung|genehmigungsfrei|genehmigungspflicht|kostenvoranschlag|kva\b|versorgungsanzeige|freigrenze)/i],
  ["FRIST", /\b(?:frist|werktag(?:e|en)?|kalendertag(?:e|en)?|kündigung|kuendigung|laufzeit|gültig\s+ab|gueltig\s+ab)/i],
  ["LEGS", /\b(?:legs|leistungserbringergruppenschl(?:ü|ue)ssel)\b/i],
  ["ABRECHNUNG", /\b(?:abrechnung|abrechnen|vergütung|verguetung|rechnung|rechnungsstellung|preisvereinbarung|zahlung|zuzahlung|aufzahlung|erstattung)/i],
  ["VERSORGUNG", /\b(?:neuversorgung|folgeversorgung|ersatzversorgung|reparatur|wiedereinsatz|hilfsmittelversorgung|versorgungspauschale|wartung|servicevertrag|lieferung)/i],
  ["VERORDNUNG", /\b(?:verordnung|rezept|ärztliche\s+verordnung|verordnungsfähig|verordnungsfaehig)/i],
  ["DOKUMENTATION", /\b(?:dokumentation|nachweis|formblatt|unterschrift|behandlungsbericht|leistungsnachweis|empfangsbestätigung)/i]
];
// Ohne ausdrücklichen LEGS-Bezug keine numerischen IDs als LEGS ausgeben:
// sonst drohen Verwechslungen mit IK, internen IDs oder Vertragsnummern.
const LEGS_REGEX=/(?:\bLEGS\b|\bLeistungserbringergruppenschl(?:ü|ue)ssel\b)\s*(?:Nr\.?|Nummer|:|=|-)?\s*(1\d{6,7}|\d{4}[A-Z]\d{2,3})\b/gi;
const HMV_REGEX=/\b\d{2}\.\d{2}\.\d{2}\.\d{1,4}\b/g;
const DURATION_REGEX=/\b(\d{1,3})\s*(kalendertagen?|werktagen?|tagen?|wochen?|monaten?)\b/gi;
const AMOUNT_REGEX=/(?:\bEUR\s*|€\s*)(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)|(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})\s*(?:EUR\b|€)/gi;
const unique = (input,cap=12)=>[...new Set(input)].slice(0,cap);
const trim=(x,len)=>String(x??"").slice(0,len).trim();

export function extractHintsFromClause(clause){
  if(!clause || clause.section_id==="unstructured" || !String(clause.text||"").trim())return [];
  const heading=normalizeClauseText(clause.heading);
  const text=normalizeClauseText(clause.text);
  const combined=heading+" "+text;
  const legsCodes=unique([...combined.matchAll(LEGS_REGEX)].map(x=>x[1]),15);
  const hmvCodes=unique([...combined.matchAll(HMV_REGEX)].map(x=>x[0]),15);
  const durations=unique([...combined.matchAll(DURATION_REGEX)].map(x=>x[1]+" "+x[2].toLowerCase()),10);
  const amounts=unique([...combined.matchAll(AMOUNT_REGEX)].map(x=>x[1]||x[2]),10);
  const patterns=PATTERNS.filter(([,re])=>re.test(combined)).map(([kind])=>kind);
  if(legsCodes.length && !patterns.includes("LEGS"))patterns.push("LEGS");
  const shared={
    source:"OCR_HINWEIS_NICHT_GEPRUEFT",
    hmv_codes:hmvCodes,
    legs_codes:legsCodes,
    durations_literal:durations,
    amounts_literal_eur:amounts,
    requires_contract_scope_review:true,
    requires_source_review:true
  };
  return patterns.map(kind=>({
    clause_key:clause.key,
    rule_kind:kind,
    source_page:clause.page,
    source_end_page:clause.end_page||clause.page,
    display_title:trim(heading,200),
    source_excerpt:trim(text,1400),
    ocr_quality:clause.source_method==="ocr"?"OCR":"PDF_TEXT",
    proposed_fields:{...shared,category:kind},
    content_for_hash:normalizeClauseText(combined).toLocaleLowerCase("de-DE")
  }));
}

export function extractOcrRuleCandidates(clauses,{max=900}={}){
  const result=[];
  for(const clause of clauses||[]){
    for(const c of extractHintsFromClause(clause)){
      result.push(c);
      if(result.length>max)throw new Error("OCR_RULE_HINT_LIMIT: Mehr als "+max+" Hinweise");
    }
  }
  return result;
}
