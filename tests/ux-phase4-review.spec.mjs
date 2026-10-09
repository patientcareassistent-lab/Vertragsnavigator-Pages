import {test,expect} from '@playwright/test'

async function openReviewer(page){
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('./?uxReviewer=1')
  await expect(page.getByRole('button',{name:'Zusätze prüfen'})).toBeVisible()
  await page.getByRole('button',{name:'Zusätze prüfen'}).click()
  await expect(page.getByRole('heading',{name:'Zusatzpositionen und Kombinationsregeln'})).toBeVisible()
  await expect(page.locator('.addon-candidate-card')).toHaveCount(1)
  return errors
}

test('Freigabequeue zeigt Originalposition, Belegstelle und ungeprüfte Regeln verständlich an',async ({page})=>{
  const errors=await openReviewer(page)
  const card=page.locator('.addon-candidate-card')
  await expect(card).toContainText('AO-01')
  await expect(card).toContainText('1850032')
  await expect(card).toContainText('Seiten 4, 6')
  await expect(card).toContainText('vertraege/Test/Anlage 1.pdf')
  await expect(card).toContainText('Keine Freigabe')
  await expect(card).toContainText('inklusive')
  await expect(card.locator('.addon-review-note')).toContainText('Hinweis aus Datenvorbereitung')
  await expect(card.locator('.addon-candidate-ids')).not.toHaveAttribute('open','')
  await card.locator('.addon-candidate-ids summary').click()
  await expect(card.locator('.addon-candidate-ids')).toContainText('ux-fixture-green')
  expect(errors).toEqual([])
})

test('Ein fehlender Dokumentlink wird gemeldet; Freigabe erfordert eigene Begründung und Bestätigung',async ({page})=>{
  await openReviewer(page)
  await page.getByRole('button',{name:'Originalvertrag zu 1850032 öffnen'}).click()
  await expect(page.getByRole('alert')).toContainText('Originaldokument ist über den gesicherten Link noch nicht erreichbar')
  await page.getByRole('button',{name:'Nach Quellenprüfung freigeben'}).click()
  await expect(page.getByRole('alert')).toContainText('mindestens 12 Zeichen')
  await expect(page.locator('.addon-candidate-card')).toContainText('Zur Prüfung')
  await page.getByLabel('Eigenständiger fachlicher Prüfvermerk').fill('Ich habe den Originalvertrag persönlich geprüft.')
  page.once('dialog',d=>d.dismiss())
  await page.getByRole('button',{name:'Nach Quellenprüfung freigeben'}).click()
  await expect(page.locator('.addon-candidate-card')).toContainText('Zur Prüfung')
})
