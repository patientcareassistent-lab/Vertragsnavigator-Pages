import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractOcrClauses,compareOcrClauses,headingInfo,
  normalizeClauseText,normalizedDocumentKey,clauseCategory
} from '../supabase/functions/vn2-contract-parse-ocr/clauseDiff.mjs'

const page=(n,text,method='ocr')=>({page:n,text,method,confidence:89})

test('§- und Artikelgliederung mit Seitenreferenz, Frist/Genehmigung/Abrechnung',()=>{
  const p=extractOcrClauses([
    page(1,'Rahmenvertrag\n§ 1 Leistungsgegenstand\nDieser Vertrag regelt die Versorgung mit Hilfsmitteln.\n§ 2 Genehmigung\nEin Kostenvoranschlag wird vor Versorgung eingereicht.'),
    page(2,'Die Kasse antwortet innerhalb von fünf Werktagen.\n§ 3 Abrechnung\nDie Abrechnung erfolgt mit LEGS über das ERP-System.')
  ])
  assert.equal(p.quality.readable_pages,2)
  assert.equal(p.quality.structured_clauses,3)
  assert.deepEqual(p.clauses.map(x=>[x.section_id,x.page,x.end_page,x.category]),[
    ['§1',1,1,'VERSORGUNG'],['§2',1,2,'GENEHMIGUNG'],['§3',2,2,'ABRECHNUNG']
  ])
})

test('sachlich abweichende Zahlen führen zu GEÄNDERT auch bei fast gleichem Wortlaut',()=>{
  const before=extractOcrClauses([page(1,'§ 7 Antragsfrist\nAntrag innerhalb von 5 Werktagen einzureichen. Die weiteren Leistungen bleiben unverändert.')])
  const after=extractOcrClauses([page(1,'§ 7 Antragsfrist\nAntrag innerhalb von 6 Werktagen einzureichen. Die weiteren Leistungen bleiben unverändert.')])
  const diff=compareOcrClauses(after,before)
  assert.equal(diff.summary.modified,1)
  assert.equal(diff.changes[0].kind,'GEAENDERT')
  assert.equal(diff.changes[0].before.page,1)
})

test('fehlender Absatz wird niemals als sichere Löschung gewertet',()=>{
  const before=extractOcrClauses([page(1,'§ 1 Leistungsumfang\nVersorgung mit Hilfsmitteln laut dieser Anlage.'),page(2,'§ 2 Lieferung\nLieferung innerhalb der vereinbarten Fristen.')])
  const after=extractOcrClauses([page(1,'§ 1 Leistungsumfang\nVersorgung mit Hilfsmitteln laut dieser Anlage.')])
  const diff=compareOcrClauses(after,before)
  assert.equal(diff.summary.not_found,1)
  assert.equal(diff.changes[0].kind,'NICHT_GEFUNDEN')
  assert.equal(diff.changes[0].after,null)
})

test('Textabweichung bei ähnlichen OCR-Formulierungen wird zur Prüfung markiert',()=>{
  const a=extractOcrClauses([page(1,'§ 1 Vertragsgegenstand\nDie Versorgung erfolgt nach den Vertragsbedingungen der gesetzlichen Krankenversicherung.')])
  const b=extractOcrClauses([page(1,'§ 1 Vertragsgegenstand\nDie Versorgung erfolgt nach den Vertragsbedingungen der gesetzlichen Krankenversicherung.')])
  assert.equal(compareOcrClauses(a,b).summary.unchanged,1)
  const c=extractOcrClauses([page(1,'§ 1 Vertragsgegenstand\nDie Versorgung erfolgt nach den Vertragsbedingngen der gesetzlichen Krankenversicherung.')])
  assert.equal(compareOcrClauses(c,b).changes.length,1)
})

test('ohne Gliederung bleibt der Text ein unstrukturierter Seitenhinweis',()=>{
  const result=extractOcrClauses([page(1,'Dieser Vertrag wurde nur als Scan erkannt. Es liegt keine verlässliche Abschnittsgliederung vor.')])
  assert.equal(result.quality.unstructured,true)
  assert.equal(result.clauses[0].section_id,'unstructured')
  assert.equal(compareOcrClauses(result,result).changes.length,0)
})

test('kritisch schlecht erkannte Seiten werden als Lücke ausgewiesen',()=>{
  const result=extractOcrClauses([page(1,'§ 1 Versorgungsumfang\nDie Hilfsmittelversorgung wird für die Krankenkasse durchgeführt.'),page(2,'', 'failed')])
  assert.deepEqual(result.quality.failed_pages,[2])
  assert.equal(result.quality.readable_pages,1)
})

test('Datei-Harmonisierung entfernt Stand/Jahr, ohne unterschiedliche Dokumente zu vermengen',()=>{
  assert.equal(normalizedDocumentKey('BARMER_TK_Rahmenvertrag_2019.pdf'),normalizedDocumentKey('BARMER-TK-Rahmenvertrag-2026.pdf'))
  assert.notEqual(normalizedDocumentKey('BARMER-TK-Preisvereinbarung-2026.pdf'),normalizedDocumentKey('BARMER-TK-Rahmenvertrag-2026.pdf'))
})

test('Pseudo-Überschrift wie Betrag wird verworfen',()=>{
  assert.equal(headingInfo('1.234,56 EUR'),null)
  assert.equal(normalizeClauseText('Versor-\ngung'),'Versorgung')
  assert.equal(clauseCategory('Genehmigungsfreigrenze des Kostenträgers'),'GENEHMIGUNG')
})
