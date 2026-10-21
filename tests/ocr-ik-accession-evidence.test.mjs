import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAccessionEvidence, pgMatch} from '../supabase/functions/vn2-contract-ocr-rules/accessionEvidence.mjs';

const site={site_id:'SITE-TEST',ik:'123456789',active:true};
const contract={record_status:'ACTIVE',archive_state:'NOT_ARCHIVED'};
const accession={
  accession_id:'ACC-1',status:'Beigetreten',active:true,
  prerequisites_met:'Ja',vtv_status:'Gemeldet',
  contract_match_status:'EXACT',review_required:false,
  valid_from:null,valid_to:null,source:'TEST'
};
const pgRow={accession_detail_id:'D1',accession_level:'PG 24 Beinprothesen - Leistungsbeschreibung',
  accession_type:'Beitritt',status:'Beigetreten',contract_match_status:'EXACT',
  accession_match_status:'UNIQUE_PAIR',review_required:false,source:'TEST'};

test('successful accession is evidence only, never automatic eligibility',()=>{
  const r=evaluateAccessionEvidence({site,contract,accessions:[accession],scopes:[pgRow],pg:'24'});
  assert.equal(r.indicator,'POSITIVE_ACCESSION_HINT');
  assert.equal(r.decision,'PRUEFUNG_ERFORDERLICH');
  assert.equal(r.stats.positive_accessions,1);
  assert(r.reasons.some(x=>x.includes('Gültigkeitszeitraum')));
});
test('archived contract or inactive site cannot be treated as positive',()=>{
  assert.equal(evaluateAccessionEvidence({site:{...site,active:false},contract,accessions:[accession]}).indicator,'SITE_INACTIVE');
  assert.equal(evaluateAccessionEvidence({site,contract:{...contract,archive_state:'ARCHIVED'},accessions:[accession]}).indicator,'CONTRACT_INACTIVE');
});
test('conflicting active and cancelled rows are not resolved by first match',()=>{
  const r=evaluateAccessionEvidence({site,contract,accessions:[accession,{...accession,accession_id:'ACC-2',active:false,status:'Gekündigt (automatisch)'}]});
  assert.equal(r.indicator,'CONFLICTING_ACCESSIONS');
});
test('only cancelled accession yields negative indicator, not supply possible',()=>{
  const r=evaluateAccessionEvidence({site,contract,accessions:[{...accession,status:'Widersprochen',active:false}]});
  assert.equal(r.indicator,'NEGATIVE_ACCESSION');
  assert.equal(r.decision,'PRUEFUNG_ERFORDERLICH');
});
test('PG-specific Widerspruch conflicts with otherwise positive accession',()=>{
  const r=evaluateAccessionEvidence({site,contract,pg:'24',accessions:[accession],scopes:[
    pgRow,{...pgRow,accession_detail_id:'D2',accession_type:'Widerspruch'}
  ]});
  assert.equal(r.indicator,'PG_COMPONENT_CONFLICT');
  assert.equal(r.stats.pg_warnings,1);
});
test('PG31 and PQ24 cannot be mistaken for PG24',()=>{
  assert.equal(pgMatch('PQ 24 - Preiskondition','24'),false);
  assert.equal(pgMatch('PG 240 - Sonstiges','24'),false);
  assert.equal(pgMatch('PG 24 Beinprothesen','24'),true);
  assert.equal(pgMatch('PG24','24'),true);
});
test('truncated evidence can never appear as positive',()=>{
  const r=evaluateAccessionEvidence({site,contract,accessions:[accession],truncatedScopes:true,pg:'24'});
  assert.equal(r.indicator,'EVIDENCE_INCOMPLETE');
});
test('unknown IK or absent accession is not silently positive',()=>{
  assert.equal(evaluateAccessionEvidence({site:null,contract}).indicator,'SITE_UNKNOWN');
  assert.equal(evaluateAccessionEvidence({site,contract}).indicator,'NO_ACCESSION');
});
test('missing PG keeps evidence provisional',()=>{
  const r=evaluateAccessionEvidence({site,contract,accessions:[accession]});
  assert(r.reasons.some(x=>x.includes('Keine PG ausgewählt')));
  assert.equal(r.decision,'PRUEFUNG_ERFORDERLICH');
});
