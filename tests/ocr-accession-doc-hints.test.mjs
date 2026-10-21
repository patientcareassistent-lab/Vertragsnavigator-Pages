import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDates,extractAccessionDocumentHints} from '../supabase/functions/vn2-contract-ocr-rules/accessionDocHints.mjs';

const page=(text,n=1,method='ocr')=>({page:n,text,method,confidence:85});
test('German, ISO and spelled dates are normalized; invalid dates rejected',()=>{
  assert.deepEqual(extractDates('Zum 01.10.2026 oder 2026-12-31, aber nicht 31.02.2026; seit 3. März 2026.')
    .map(x=>x.date),['2026-10-01','2026-12-31','2026-03-03']);
});
test('accession confirmation yields unverified page-linked candidate',()=>{
  const d=extractAccessionDocumentHints([page('Beitrittsbestätigung – IK: 123456789 PG 24\nWir bestätigen den Beitritt mit Wirkung ab 01.10.2026 zum Rahmenvertrag.')]);
  assert(d.hints.some(x=>x.kind==='BEITRITT'));
  const x=d.hints.find(x=>x.kind==='BEITRITT'&&x.suggested_effective_from);
  assert(x);
  assert.equal(x.suggested_effective_from,'2026-10-01');
  assert.deepEqual(x.ik_candidates,['123456789']);
  assert.deepEqual(x.pg_candidates,['24']);
  assert.equal(x.page,1);
  assert.equal(x.manual_review_required,true);
  assert.equal(x.auto_verified,false);
});
test('formal written termination is a termination hint, not new accession',()=>{
  const d=extractAccessionDocumentHints([page('Hiermit kündigen wir den Vertragsbeitritt für IK: 123456789 mit Wirkung zum 31.12.2026.')]);
  const x=d.hints.find(x=>x.kind==='KUENDIGUNG');
  assert(x);
  assert.equal(x.suggested_effective_from,'2026-12-31');
  assert.equal(x.suggested_effective_to,null);
});
test('hypothetical legal wording must not become confirmed accession',()=>{
  const d=extractAccessionDocumentHints([page('Nach diesem Vertrag kann jeder Leistungserbringer dem Vertrag beitreten.')]);
  assert.equal(d.hints.length,0);
});
test('document issue alone without accession declaration is not matched',()=>{
  const d=extractAccessionDocumentHints([page('Vertragsbeginn: 01.10.2026\nStand: 30.09.2026')]);
  assert.equal(d.hints.length,0);
});
test('generic contract cancellation rights are not actual termination',()=>{
  const d=extractAccessionDocumentHints([page('§ 12 Kündigung des Vertrags\nDie Kündigung des Vertrags ist mit einer Frist von drei Monaten möglich.')]);
  assert.equal(d.hints.some(x=>x.kind==='KUENDIGUNG'),false);
});
test('PG-only restriction is a manual clue, not proof of scope or time',()=>{
  const d=extractAccessionDocumentHints([page('Für die PG 24 sind die Leistungen vom Beitritt ausgeschlossen. IK 123456789')]);
  const x=d.hints.find(x=>x.kind==='EINSCHRAENKUNG');
  assert(x);
  assert.deepEqual(x.pg_candidates,['24']);
  assert.equal(x.suggested_effective_from,null);
});
test('missing IK/PG and multiple dates flagged, never auto-resolved',()=>{
  const d=extractAccessionDocumentHints([page('Beitrittsbestätigung: wir bestätigen den Beitritt am 01.01.2026 zum Vertrag, gültig ab 01.10.2026.')]);
  assert(d.hints.length>0);
  assert(d.hints[0].issues.includes('IK nicht eindeutig'));
  assert(d.hints.every(x=>x.manual_review_required));
});
test('unreadable pages are reported but never parsed',()=>{
  const d=extractAccessionDocumentHints([page('',1,'failed'),page('Hiermit kündigen wir den Beitritt zum 31.12.2026.',2)]);
  assert.deepEqual(d.quality.unreadable_pages,[1]);
  assert(d.hints.every(x=>x.page===2));
});
