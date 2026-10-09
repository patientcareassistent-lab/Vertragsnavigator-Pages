import { test,expect } from '@playwright/test'

async function openMatrix(page){
  const errors=[]
  page.on('pageerror',e=>errors.push(String(e.message)))
  await page.goto('./')
  await page.getByRole('button',{name:'Vertragsmatrix'}).click()
  await expect(page.getByRole('heading',{name:'Kassenübergreifende Positionsmatrix'})).toBeVisible()
  await page.getByLabel('Produktgruppe').fill('18')
  await page.locator('.matrix-payer-row').nth(0).getByLabel('Kostenträger').selectOption('AOK')
  await page.locator('.matrix-payer-row').nth(1).getByLabel('Kostenträger').selectOption('BARMER')
  await page.getByRole('button',{name:'Matrix auswerten'}).click()
  await expect(page.locator('.matrix-table tbody .matrix-base-row')).toHaveCount(2)
  return errors
}

test('Matrix ordnet identische HMV-Klassifikationen zeilenweise und lässt andere Kassenfelder leer',async ({page})=>{
  const errors=await openMatrix(page)
  const head=page.locator('.matrix-table thead')
  await expect(head.locator('th')).toHaveCount(3)
  await expect(head).toContainText('AOK')
  await expect(head).toContainText('BARMER')
  const shared=page.locator('.matrix-base-row').filter({has:page.locator('th', {hasText:'18.50.03'})})
  await expect(shared).toHaveCount(1)
  await expect(shared.locator('td')).toHaveCount(2)
  await expect(shared.locator('td').nth(0)).toContainText('Aktivrollstuhl (Testposition)')
  await expect(shared.locator('td').nth(1)).toContainText('Vergleichsrollstuhl anderer Kasse')
  await expect(shared.locator('.matrix-status-free')).toBeVisible()
  await expect(shared.locator('.matrix-status-approval')).toBeVisible()
  await expect(shared.locator('th')).toContainText('Gleichwertigkeit nicht bestätigt')

  const unmatched=page.locator('.matrix-base-row').filter({has:page.locator('th',{hasText:'18.75.01.0'})})
  await expect(unmatched.locator('td').nth(0)).toBeEmpty()
  await expect(unmatched.locator('td').nth(1)).toContainText('Nicht zugeordnete Rollstuhlposition')
  expect(errors).toEqual([])
})

test('Quellengeprüfte Zusatzpositionen stehen mit HiMiNr nebeneinander; unbelegte Relationen werden ignoriert',async ({page})=>{
  await openMatrix(page)
  const row=page.locator('.matrix-addon-row')
  await expect(row).toHaveCount(1)
  await expect(row.locator('th')).toContainText('18.99.01.1')
  await expect(row.locator('td').nth(0)).toContainText('AO-01')
  await expect(row.locator('td').nth(1)).toContainText('BM-01')
  await expect(row.locator('.matrix-status-reason')).toContainText('Begründung')
  await expect(row.locator('.matrix-status-approval')).toContainText('Genehmigung')
  await expect(page.getByText('fixture-no-verification')).toHaveCount(0)
  await row.locator('td').nth(0).locator('summary').click()
  await expect(row.locator('td').nth(0)).toContainText('fixture-aok')
  await expect(row.locator('td').nth(0)).toContainText('Medizinische Begründung erforderlich')
})

test('Matrix bleibt bei vier Spalten mobil horizontal scrollbar und ohne ungesicherte Äquivalenzaussagen',async ({page})=>{
  await openMatrix(page)
  await page.setViewportSize({width:390,height:850})
  await expect(page.locator('.matrix-tablewrap')).toBeVisible()
  const state=await page.evaluate(()=>{
    const panel=document.querySelector('.matrix-tablewrap')
    const table=document.querySelector('.matrix-table')
    return {panelWidth:panel.clientWidth,tableWidth:table.scrollWidth,viewportWidth:window.innerWidth,documentWidth:document.documentElement.scrollWidth}
  })
  expect(state.tableWidth).toBeGreaterThan(state.panelWidth)
  expect(state.panelWidth).toBeLessThanOrEqual(state.viewportWidth)
  await expect(page.getByText('Gleicher Code bedeutet nicht automatisch gleiche Leistung.',{exact:false})).toBeVisible()
})
