import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const selector = {
  search:'Positionen suchen',
  green:'Aktivrollstuhl (Testposition)',
  red:'Rollstuhl mit Ausschluss (Testposition)'
}

async function openAssistant(page){
  await page.goto('./')
  await expect(page.getByRole('heading',{name:'Versorgung prüfen'})).toBeVisible()
  await expect(page.getByRole('button',{name:selector.search})).toBeVisible()
}
async function search(page){
  await page.getByLabel('Standort / IK').selectOption('ux-fixture-site')
  await page.getByLabel('HMV / Position / Begriff').fill('Rollstuhl')
  await page.getByRole('button',{name:selector.search}).click()
  await expect(page.locator('tr.selectable')).toHaveCount(2)
}

test('Suche, Tastaturbedienung und Klartext der Versorgungsprüfung',async ({page})=>{
  const errors=[]
  page.on('pageerror',error=>errors.push(String(error.message)))
  await openAssistant(page)
  await expect(page.locator('.decision')).toContainText('Position auswählen')
  await search(page)

  const green=page.locator('tr.selectable').filter({hasText:selector.green})
  await green.focus()
  await expect(green).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(green).toHaveAttribute('aria-selected','true')
  await expect(page.locator('.decision')).toContainText('Versorgung möglich')
  await expect(page.locator('.decision.ok strong svg')).toBeVisible()
  await expect(page.locator('.check.state-ok').first()).toBeVisible()

  const red=page.locator('tr.selectable').filter({hasText:selector.red})
  await red.focus()
  await page.keyboard.press('Space')
  await expect(red).toHaveAttribute('aria-selected','true')
  await expect(page.locator('.decision')).toContainText('Versorgung nicht möglich')
  await expect(page.locator('.decision.bad strong svg')).toBeVisible()
  await expect(page.locator('.check.state-bad').first()).toBeVisible()

  await page.getByLabel('Standort / IK').selectOption('')
  await expect(page.locator('.decision')).toContainText('Standort auswählen')
  await expect(page.locator('.decision')).not.toContainText('Versorgung nicht möglich')
  expect(errors).toEqual([])
})

test('Lesbarkeit und Responsive-Ansicht der authentischen React-Komponenten',async ({page})=>{
  mkdirSync('test-artifacts',{recursive:true})
  await openAssistant(page)
  await search(page)
  const row=page.locator('tr.selectable').filter({hasText:selector.green})
  await row.click()
  await expect(page.locator('.decision')).toContainText('Versorgung möglich')

  for(const width of [1920,1440,1280,768,390]){
    await page.setViewportSize({width,height:960})
    await expect(page.locator('.decision strong')).toBeVisible()
    await expect(page.locator('.search-flow-hint')).toBeVisible()
    const metrics=await page.evaluate(()=>{
      const size=(css)=>{const el=document.querySelector(css);return el?parseFloat(getComputedStyle(el).fontSize):null}
      return {
        bodyWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,
        resultFont:size('.tablewrap tbody td'),
        detailLabelFont:size('.position-field small'),
        checkValueFont:size('.check .value'),
        decisionFont:size('.decision strong')
      }
    })
    expect(metrics.resultFont,JSON.stringify(metrics)).toBeGreaterThanOrEqual(14)
    expect(metrics.detailLabelFont,JSON.stringify(metrics)).toBeGreaterThanOrEqual(12)
    expect(metrics.checkValueFont,JSON.stringify(metrics)).toBeGreaterThanOrEqual(13)
    expect(metrics.decisionFont,JSON.stringify(metrics)).toBeGreaterThanOrEqual(19)
    if(width>=768)expect(metrics.bodyWidth,JSON.stringify(metrics)).toBeLessThanOrEqual(width+6)
    await page.screenshot({path:`test-artifacts/ux-phase1-${width}.png`,fullPage:true,animations:'disabled'})
  }
})
