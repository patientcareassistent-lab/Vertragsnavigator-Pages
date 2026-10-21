import test from 'node:test'
import assert from 'node:assert/strict'
import { pageText, usefulText } from '../src/lib/pdfAutoOcr.js'

test('vorhandene Textebene wird nicht unnötig OCR-behandelt', () => {
  const value = 'Rahmenvertrag über die Versorgung mit Hilfsmitteln der Produktgruppe 24. Gültig ab 01.01.2026. Krankenkasse BARMER.'
  assert.equal(usefulText(value), true)
})
test('unlesbare Bildmasken-Textebene löst OCR aus', () => {
  assert.equal(usefulText('\uFFFD\uFFFD\uFFFD\uE011\uE012'), false)
  assert.equal(usefulText(''), false)
})
test('Textelemente ergeben lesbare Seitenzeilen', () => {
  const text = pageText([
    {str:'120,00 €',transform:[1,0,0,1,180,720]},
    {str:'24.71.02.0',transform:[1,0,0,1,40,720]},
    {str:'Gültig ab 01.01.2026',transform:[1,0,0,1,40,700]}
  ])
  assert.equal(text,'24.71.02.0 120,00 €\nGültig ab 01.01.2026')
})
