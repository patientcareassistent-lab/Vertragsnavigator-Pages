import test from 'node:test'
import assert from 'node:assert/strict'
import {ocrScopeIssues} from '../src/lib/ocrRuleScopePolicy.js'
const base={
  payer_mode:'EXACT',payer:'BARMER',
  pg_mode:'EXACT',pg:'24',
  ik_mode:'EXACT',ik:'123456789',
  legs_mode:'EXACT',legs:'159011A',
  contract_version_id:'VER-2026',valid_from:'2026-01-01',
  valid_to:'2026-12-31',evidence_note:'Prüfung anhand Originalseite 4 und Anlage 2; mit Beitrittsnachweis abgleichen.'
}
test('vollständig belegte, ausdrücklich geprüfte Quelle kann zur Serverprüfung gesendet werden',()=>{
  assert.deepEqual(ocrScopeIssues(base,true),[])
})
test('fehlende Angaben werden nicht als vertragsweite Geltung ausgelegt',()=>{
  const input={...base,pg_mode:'UNRESOLVED',pg:''}
  assert(ocrScopeIssues(input,true).some(s=>s.startsWith('pg:')))
})
test('alle Vertragsteile müssen explizit als solche markiert werden',()=>{
  const input={...base,pg_mode:'ALL_IN_CONTRACT',pg:'',ik_mode:'ALL_IN_CONTRACT',ik:'',
    legs_mode:'ALL_IN_CONTRACT',legs:'',payer_mode:'ALL_IN_CONTRACT',payer:''}
  assert.deepEqual(ocrScopeIssues(input,true),[])
  assert(ocrScopeIssues(input,false).includes('Quellenprüfung nicht bestätigt'))
})
test('nicht plausibler IK-, LEGS- oder PG-Code wird abgewiesen',()=>{
  const input={...base,ik:'12345',legs:'159011/14',pg:'24.71'}
  const issues=ocrScopeIssues(input,true)
  assert(issues.some(s=>s.startsWith('ik:')))
  assert(issues.some(s=>s.startsWith('legs:')))
  assert(issues.some(s=>s.startsWith('pg:')))
})
test('ungültige Kalendertage und rückwärts laufende Gültigkeit sind gesperrt',()=>{
  assert(ocrScopeIssues({...base,valid_from:'2026-02-31'},true).some(s=>s.includes('Gültig-ab')))
  assert(ocrScopeIssues({...base,valid_to:'2025-01-01'},true).some(s=>s.includes('Gültig-bis')))
})
test('keine Freigabe ohne konkrete Vertragsversion oder Quellenbegründung',()=>{
  const issues=ocrScopeIssues({...base,contract_version_id:'',evidence_note:'zu kurz'},true)
  assert(issues.includes('Vertragsversion fehlt'))
  assert(issues.includes('Quellenbegründung zu kurz'))
})
