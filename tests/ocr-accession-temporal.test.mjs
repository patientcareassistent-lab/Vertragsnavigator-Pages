import test from 'node:test'
import assert from 'node:assert/strict'
import {evaluateTemporalProofs} from '../supabase/functions/vn2-contract-ocr-rules/temporalEvidence.mjs'
const base={status:'VERIFIED',proof_kind:'BEITRITT',effective_from:'2026-01-01',effective_to:null,pg:''}
test('missing or merely drafted time proofs cannot establish source dates',()=>{
  assert.equal(evaluateTemporalProofs([],{onDate:'2026-10-21'}).status,'SOURCE_DATE_NOT_PROVEN')
  assert.equal(evaluateTemporalProofs([{...base,status:'DRAFT'}],{onDate:'2026-10-21'}).status,'SOURCE_DATE_NOT_PROVEN')
})
test('verified joining source establishes date evidence but not supply rights',()=>{
  const r=evaluateTemporalProofs([base],{onDate:'2026-10-21',pg:'24'})
  assert.equal(r.status,'SOURCE_DATE_DOCUMENTED')
  assert.equal(r.matching_join_proofs,1)
  assert.match(r.note,/unabhängig geprüft/)
})
test('termination evidence overrides otherwise positive source dates',()=>{
  const r=evaluateTemporalProofs([base,{...base,proof_kind:'KUENDIGUNG',effective_from:'2026-09-30'}],{onDate:'2026-10-21'})
  assert.equal(r.status,'SOURCE_CONFLICT')
  assert.equal(r.ending_proofs,1)
})
test('past or future proof does not validate as-of date',()=>{
  assert.equal(evaluateTemporalProofs([{...base,effective_from:'2027-01-01'}],{onDate:'2026-10-21'}).status,'SOURCE_DATE_NOT_PROVEN')
  assert.equal(evaluateTemporalProofs([{...base,effective_to:'2026-08-31'}],{onDate:'2026-10-21'}).status,'SOURCE_DATE_NOT_PROVEN')
})
test('PG-restricted proof must not leak to other product groups',()=>{
  const r=evaluateTemporalProofs([{...base,pg:'24'}],{onDate:'2026-10-21',pg:'23'})
  assert.equal(r.status,'SOURCE_DATE_NOT_PROVEN')
})
test('verified PG-specific restriction creates a conflict',()=>{
  const r=evaluateTemporalProofs([base,{...base,pg:'24',proof_kind:'EINSCHRAENKUNG'}],{onDate:'2026-10-21',pg:'24'})
  assert.equal(r.status,'SOURCE_CONFLICT')
})
