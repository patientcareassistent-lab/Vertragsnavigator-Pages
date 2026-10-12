import test from 'node:test'
import assert from 'node:assert/strict'
import {canonicalPayerDetail,payerDetailOptions} from '../src/lib/payerAliases.js'

test('BIG spelling variants normalize to one visible group, preserving raw variants',()=>{
  const contracts=[
    {payer_families:['IKK'],contract_name:'BIG direkt: PG24'},
    {payer_families:['IKK'],contract_name:'BIG Direkt Gesund: Versorgung'},
    {payer_families:['IKK'],contract_name:'BIG direkt gesund: Vertrag'},
  ]
  const options=payerDetailOptions(contracts,'IKK')
  assert.deepEqual(options,[{label:'BIG direkt gesund',raws:['BIG direkt','BIG direkt gesund','BIG Direkt Gesund'].sort((a,b)=>a.localeCompare(b,'de'))}])
})

test('IKK spelling variants merge but distinct payers stay separate',()=>{
  const contracts=[
    {payer_families:['IKK'],contract_name:'IKK classic: PG24'},
    {payer_families:['IKK'],contract_name:'IKK Classic: PG24'},
    {payer_families:['IKK'],contract_name:'IKK gesund plus: PG24'},
    {payer_families:['IKK'],contract_name:'IKK Berlin/Brandenburg: PG24'},
    {payer_families:['IKK'],contract_name:'IKK Brandenburg und Berlin: PG24'},
    {payer_families:['IKK'],contract_name:'IKK Nord: PG24'},
  ]
  const options=payerDetailOptions(contracts,'IKK')
  assert.equal(options.length,4)
  assert.deepEqual(options.find(o=>o.label==='IKK classic').raws,['IKK classic','IKK Classic'].sort((a,b)=>a.localeCompare(b,'de')))
  assert.deepEqual(options.find(o=>o.label==='IKK Brandenburg und Berlin').raws,['IKK Berlin/Brandenburg','IKK Brandenburg und Berlin'].sort((a,b)=>a.localeCompare(b,'de')))
  assert(options.some(o=>o.label==='IKK Nord'))
})

test('multi-payer contract remains independent of the single payer',()=>{
  assert.equal(canonicalPayerDetail('IKK Classic, IKK gesund plus'),'IKK classic + IKK gesund plus')
  const options=payerDetailOptions([
    {payer_families:['IKK'],contract_name:'IKK Classic: PG24'},
    {payer_families:['IKK'],contract_name:'IKK Classic, IKK gesund plus: PG24'},
  ],'IKK')
  assert.equal(options.length,2)
  assert.deepEqual(options.find(o=>o.label==='IKK classic + IKK gesund plus').raws,['IKK Classic, IKK gesund plus'])
})

test('AOK region aliases merge but separate regions do not',()=>{
  const options=payerDetailOptions([
    {payer_families:['AOK'],contract_name:'AOK BW: PG24'},
    {payer_families:['AOK'],contract_name:'AOK Baden-Württemberg: PG24'},
    {payer_families:['AOK'],contract_name:'AOK  BW: PG24'},
    {payer_families:['AOK'],contract_name:'AOK Nordwest: PG24'},
    {payer_families:['AOK'],contract_name:'AOK Nord West: PG24'},
    {payer_families:['AOK'],contract_name:'AOK Bayern: PG24'},
  ],'AOK')
  assert.equal(options.length,3)
  assert.equal(options.find(o=>o.label==='AOK Baden-Württemberg').raws.length,3)
  assert.equal(options.find(o=>o.label==='AOK Nordwest').raws.length,2)
})

test('unknown labels are not silently merged with another legal entity',()=>{
  const options=payerDetailOptions([
    {payer_families:['BKK'],contract_name:'BKK Alpha: Vertrag'},
    {payer_families:['BKK'],contract_name:'BKK Beta: Vertrag'},
    {payer_families:['IKK'],contract_name:'BKK Alpha: Falscher Bereich'},
  ],'BKK')
  assert.deepEqual(options.map(x=>x.label),['BKK Alpha','BKK Beta'])
})
