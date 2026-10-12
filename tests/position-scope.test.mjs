import test from 'node:test'
import assert from 'node:assert/strict'
import {resolvePositionScope} from '../src/lib/positionContractScope.js'
const base={position_row_id:'X',pg:'18',contract_id:'C',code:'18.50.02.2',contract:'Vergütungsvereinbarung PG 18/50 Neukauf',legs:'110118F, 150118F, 190118F',preis:123,gueltig_ab:'2024-06-01',authoritative:true}
const rule={rule_id:'r1',contract_id:'C',pg:'18',hmv_code:'18.50.02.2',supply_keyword:'Neukauf',effective_from:'2025-08-01',effective_to:'2026-10-31',effective_legs:['150118F'],provider_scope:'Sanitätshaus-Anlage',review_required:true,price_variants:[{variant_label:'Variante A',net_price_eur:100}]}
test('historische Preiszeilen werden nicht als gültig ausgegeben',()=>{let a=resolvePositionScope({...base,gueltig_bis:'2024-05-31'},[rule],'2026-10-12');assert.match(a.priceText,/Historisch/);assert.equal(a.priceConfirmed,false);assert.equal(a.variants.length,0)})
test('Quellen-Overlay begrenzt LEGS auf die geprüfte Anlage',()=>{let a=resolvePositionScope(base,[rule],'2026-10-12');assert.match(a.legsText,/150118F/);assert.doesNotMatch(a.legsText,/110118F|190118F/);assert.equal(a.priceConfirmed,false);assert.equal(a.variants.length,1)})
test('andere Verträge bleiben unverändert und mehrdeutig',()=>{let a=resolvePositionScope({...base,contract_id:'D'},[rule],'2026-10-12');assert.match(a.legsText,/Zuordnung prüfen/);assert.equal(a.priceConfirmed,false)})
test('zukünftige Anlage wird nicht vorzeitig angewendet',()=>{let a=resolvePositionScope(base,[rule],'2025-07-01');assert.match(a.legsText,/Zuordnung prüfen/);assert.equal(a.variants.length,0)})
test('abgelaufene Anlage wird nicht fortgeschrieben',()=>{let a=resolvePositionScope(base,[rule],'2026-11-01');assert.match(a.legsText,/Zuordnung prüfen/);assert.equal(a.variants.length,0)})
test('einzelner autoritativer LEGS bleibt erhalten',()=>{let a=resolvePositionScope({...base,legs:'150118F',contract_id:'D',preis:77},[rule],'2026-10-12');assert.equal(a.legsText,'150118F');assert.equal(a.priceConfirmed,true)})
test('keine Position ohne Daten wird vertrauenswürdig',()=>{let a=resolvePositionScope(null,[rule],'2026-10-12');assert.equal(a.priceConfirmed,false)})
