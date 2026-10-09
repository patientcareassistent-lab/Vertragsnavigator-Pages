import { test, expect } from '@playwright/test'

async function open(page){
  await page.goto('./')
  await expect(page.getByRole('heading',{name:'Versorgung prüfen'})).toBeVisible()
}
async function runSearch(page,text='Rollstuhl'){
  await page.getByLabel('Standort / IK').selectOption('ux-fixture-site')
  await page.getByLabel('HMV / Position / Begriff').fill(text)
  await page.getByRole('button',{name:'Positionen suchen'}).click()
}

test('Suche → Treffer → Ergebnis: sichtbare Reihenfolge und kompakter Fachstatus',async ({page})=>{
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await open(page)
  await expect(page.locator('#assistantResults')).toBeVisible()
  await expect(page.locator('#assistantEvaluation')).toHaveCount(0)
  await runSearch(page)
  await expect(page.locator('tr.selectable')).toHaveCount(2)

  const green=page.locator('tr.selectable').filter({hasText:'Aktivrollstuhl (Testposition)'})
  await green.click()
  await expect(page.locator('#assistantEvaluation')).toBeVisible()
  await expect(page.locator('.decision')).toContainText('Versorgung möglich')
  await expect(page.locator('#assistantDecisionHeading')).toBeFocused()
  const order=await page.evaluate(()=>{
    const search=document.querySelector('.assistant-hero')
    const hits=document.querySelector('.assistant-results')
    const evaluation=document.querySelector('.assistant-evaluation')
    return search.compareDocumentPosition(hits)&Node.DOCUMENT_POSITION_FOLLOWING &&
      hits.compareDocumentPosition(evaluation)&Node.DOCUMENT_POSITION_FOLLOWING
  })
  expect(Boolean(order)).toBe(true)
  await expect(page.locator('.supply-mini')).toHaveCount(6)
  await expect(page.locator('.supply-mini').filter({hasText:'Abrechnung'})).toContainText('Preis dokumentiert')
  await expect(page.locator('.supply-checks-details')).not.toHaveAttribute('open','')
  await expect(page.locator('.position-quickfacts .position-field')).toHaveCount(6)
  await expect(page.locator('.position-more-details')).not.toHaveAttribute('open','')
  await page.locator('.position-more-details summary').click()
  await expect(page.locator('.position-detail-group')).toHaveCount(4)
  await page.locator('.supply-checks-details summary').click()
  await expect(page.locator('.check')).toHaveCount(6)
  expect(errors).toEqual([])
})

test('Treffer sind in 12er Schritten darstellbar; neue Suche setzt die Ansicht zurück',async ({page})=>{
  await open(page)
  await runSearch(page,'UX-LIMIT')
  await expect(page.locator('.assistant-result-footer')).toContainText('12 von 17')
  await expect(page.locator('tr.selectable')).toHaveCount(12)
  await page.getByRole('button',{name:'Weitere 12 Treffer anzeigen'}).click()
  await expect(page.locator('tr.selectable')).toHaveCount(17)
  await expect(page.locator('.assistant-result-footer')).toContainText('17 von 17')
  await page.locator('tr.selectable').last().click()
  await expect(page.locator('.decision')).toBeVisible()
  await page.getByLabel('HMV / Position / Begriff').fill('Rollstuhl')
  await page.getByRole('button',{name:'Positionen suchen'}).click()
  await expect(page.locator('tr.selectable')).toHaveCount(2)
  await expect(page.locator('#assistantEvaluation')).toHaveCount(0)
})

test('Die kompakte Ergebnisansicht bleibt auf mobilen Viewports nutzbar',async ({page})=>{
  await open(page)
  await runSearch(page)
  await page.locator('tr.selectable').first().click()
  for(const width of [1440,1280,768,390]){
    await page.setViewportSize({width,height:900})
    await expect(page.locator('.supply-status-strip')).toBeVisible()
    await expect(page.locator('.position-quickfacts')).toBeVisible()
    const values=await page.evaluate(()=>({
      width:document.documentElement.scrollWidth,
      viewport:window.innerWidth,
      statusWidth:document.querySelector('.supply-mini').getBoundingClientRect().width,
      summaryFont:parseFloat(getComputedStyle(document.querySelector('.supply-checks-details>summary')).fontSize)
    }))
    expect(values.statusWidth).toBeGreaterThan(80)
    expect(values.summaryFont).toBeGreaterThanOrEqual(14)
    if(width>=768)expect(values.width).toBeLessThanOrEqual(width+6)
  }
})
