import test from "node:test";
import assert from "node:assert/strict";
import { extractHintsFromClause,extractOcrRuleCandidates } from "../supabase/functions/vn2-contract-ocr-rules/ruleHints.mjs";
import { extractOcrClauses } from "../supabase/functions/vn2-contract-parse-ocr/clauseDiff.mjs";

const clause=(text,heading="§ 8 Genehmigung")=>({
  key:"§8#1",section_id:"§8",heading,
  page:7,end_page:8,source_method:"ocr",text
});

test("KVA, Frist und LEGS werden getrennt als UNBESTÄTIGTE Merkmale erkannt",()=>{
  const x=extractHintsFromClause(clause("Für die Versorgung ist ein Kostenvoranschlag innerhalb 14 Werktagen mit LEGS 1234567 vorzulegen.", "§ 8 Genehmigungsverfahren"));
  assert(x.some(c=>c.rule_kind==="GENEHMIGUNG"));
  assert(x.some(c=>c.rule_kind==="FRIST"));
  assert(x.some(c=>c.rule_kind==="LEGS"));
  assert(x.some(c=>c.rule_kind==="VERSORGUNG")===false);
  const genehm=x.find(c=>c.rule_kind==="GENEHMIGUNG");
  assert.deepEqual(genehm.proposed_fields.legs_codes,["1234567"]);
  assert.deepEqual(genehm.proposed_fields.durations_literal,["14 werktagen"]);
  assert.equal(genehm.source_page,7);
  assert.equal(genehm.ocr_quality,"OCR");
  assert.equal(genehm.proposed_fields.source,"OCR_HINWEIS_NICHT_GEPRUEFT");
  assert.equal("approval_required" in genehm.proposed_fields,false);
});

test("HMV-Codes und Eurowerte bleiben reine Literaturhinweise",()=>{
  const r=extractHintsFromClause(clause("Reparatur für 24.71.02.0 wird mit 129,00 EUR vergütet.", "§ 12 Abrechnung"));
  const b=r.find(x=>x.rule_kind==="ABRECHNUNG");
  assert(b);
  assert.deepEqual(b.proposed_fields.hmv_codes,["24.71.02.0"]);
  assert.deepEqual(b.proposed_fields.amounts_literal_eur,["129,00"]);
  assert.equal("preis" in b.proposed_fields,false);
});

test("nicht strukturierte Texte erzeugen keinen Regelkandidaten",()=>{
  assert.deepEqual(extractHintsFromClause({...clause("Genehmigung benötigt."),section_id:"unstructured"}),[]);
  const p=extractOcrClauses([{page:1,method:"ocr",text:"Kein Abschnitt nur eine Vertragsbedingung zur Versorgung."}]);
  assert.equal(extractOcrRuleCandidates(p.clauses).length,0);
});

test("Abrechnung und Genehmigung nicht automatisch als genehmigungsfrei interpretieren",()=>{
  const r=extractHintsFromClause(clause("Genehmigung nicht erforderlich, sofern die vertraglichen Bedingungen erfüllt sind."));
  assert(r.some(x=>x.rule_kind==="GENEHMIGUNG"));
  assert.equal(r.some(x=>"approval_required" in x.proposed_fields),false);
});

test("freie Vertragsformulierungen ohne konkretes Fachsignal bleiben unbeachtet",()=>{
  assert.equal(extractOcrRuleCandidates([clause("Die Vertragspartner kommen ihrer Verpflichtung nach.","§ 1 Vertragspartner")]).length,0);
});

test("ein Kandidat mit Seiten-/Quellennachweis und begrenzter Textlänge",()=>{
  const x=extractHintsFromClause(clause("Verordnung laut Vertrag ".repeat(400),"§ 6 Rezept"))[0];
  assert.equal(x.source_excerpt.length<=1400,true);
  assert.equal(x.source_end_page,8);
});

test("Anzahl der Kandidaten ist begrenzt",()=>{
  const many=Array.from({length:1100},(_,i)=>({...clause("Eine Genehmigung ist erforderlich.","§ "+(i+1)+" Leistung"),key:"§"+(i+1)+"#1"}));
  assert.throws(()=>extractOcrRuleCandidates(many,{max:900}),/OCR_RULE_HINT_LIMIT/);
});


test("Eine unbeschriftete siebenstellige Nummer wird nicht als LEGS ausgegeben",()=>{
  const x=extractHintsFromClause(clause("Vertragsnummer 1234567 wurde im Dokument vermerkt.","§ 9 Verwaltungsregelung"));
  assert.equal(x.some(v=>v.rule_kind==="LEGS"),false);
  assert.equal(x.some(v=>v.proposed_fields.legs_codes.includes("1234567")),false);
});

test("Expliziter LEGS-Schlüssel wird als textgebundenes Merkmal erkannt",()=>{
  const x=extractHintsFromClause(clause("LEGS: 1234567, Leistungserbringergruppenschlüssel 12345678","§ 9 Leistungserbringer"));
  assert.deepEqual(x[0].proposed_fields.legs_codes,["1234567","12345678"]);
});
