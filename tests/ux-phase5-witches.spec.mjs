import { test, expect } from '@playwright/test'

async function openNavigator(page) {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Versorgung prüfen' })).toBeVisible()
}

test('Caro, Julie und das Duo wechseln mit der neuen Dialogkarte', async ({page}) => {
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await openNavigator(page)
  await expect(page.getByRole('button',{name:'Caro & Julie: an'})).toBeVisible()
  await page.getByRole('button',{name:'Caro und Julie öffnen'}).click()
  await expect(page.locator('.vn-hx-card')).toBeVisible()
  await expect(page.locator('.vn-hx-name-pill')).toContainText('Caro')
  await expect(page.locator('.vn-hx-message')).not.toBeEmpty()
  await expect(page.locator('.vn-hx-disclaimer')).toContainText('keine Vertragsauskunft')
  await page.getByRole('button',{name:'Nächster Witz'}).click()
  await expect(page.locator('.vn-hx-name-pill')).toContainText('Julie')
  await page.getByRole('button',{name:'Nächster Witz'}).click()
  await expect(page.locator('.vn-hx-name-pill')).toContainText('Caro & Julie')
  await expect(page.locator('.vn-hx-mode-duo')).toBeVisible()
  await page.getByRole('button',{name:'Nächster Witz'}).click()
  await expect(page.locator('.vn-hx-mode-flight')).toBeVisible()
  await page.getByRole('button',{name:'Vertragshexen ausblenden'}).click()
  await expect(page.locator('.vn-hx-card')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Schalter bleibt nach Neuladen erhalten und Mobilansicht passt', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await openNavigator(page)
  await page.getByRole('button',{name:'Caro & Julie: an'}).click()
  await expect(page.getByRole('button',{name:'Caro & Julie: aus'})).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading',{name:'Versorgung prüfen'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Caro & Julie: aus'})).toBeVisible()
  await expect(page.locator('.vn-hx-panel')).toHaveCount(0)
  await page.getByRole('button',{name:'Caro & Julie: aus'}).click()
  await page.getByRole('button',{name:'Caro und Julie öffnen'}).click()
  await expect(page.locator('.vn-hx-card')).toBeVisible()
  const bounds = await page.locator('.vn-hx-widget').boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391)
})

test('Reduzierte Bewegung funktioniert ohne Hover-Animation', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'})
  await openNavigator(page)
  await page.getByRole('button',{name:'Caro und Julie öffnen'}).click()
  await expect(page.locator('.vn-hx-card')).toBeVisible()
  const animationName = await page.locator('.vn-hx-character-float').evaluate(el=>getComputedStyle(el).animationName)
  expect(animationName).toBe('none')
  await page.getByRole('button',{name:'Tagesweisheit'}).click()
  await expect(page.locator('.vn-hx-subtitle')).toHaveText('Weisheit des Tages')
})


test('Freigegebenes Design: Figur links, breite Karte rechts, Namenschip überlappt', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900})
  await openNavigator(page)
  await page.getByRole('button',{name:'Caro und Julie öffnen'}).click()
  const stage = await page.locator('.vn-hx-character-stage').boundingBox()
  const card = await page.locator('.vn-hx-card').boundingBox()
  const pill = await page.locator('.vn-hx-name-pill').boundingBox()
  expect(stage).not.toBeNull()
  expect(card).not.toBeNull()
  expect(pill).not.toBeNull()
  expect(stage.x).toBeLessThan(card.x)
  expect(Math.abs((stage.y + stage.height/2) - (card.y + card.height/2))).toBeLessThan(85)
  expect(card.width).toBeGreaterThan(450)
  expect(pill.y).toBeLessThan(card.y)
  const design = await page.locator('.vn-hx-card').evaluate(el => ({
    radius: parseFloat(getComputedStyle(el).borderTopLeftRadius),
    grid: getComputedStyle(el.querySelector('.vn-hx-card-actions')).gridTemplateColumns,
    primary: getComputedStyle(el.querySelector('.vn-hx-action-primary')).backgroundImage,
  }))
  expect(design.radius).toBeGreaterThanOrEqual(30)
  expect(design.grid.trim().split(/\s+/).length).toBe(2)
  expect(design.primary).toContain('linear-gradient')
  await expect(page.locator('.vn-hx-card-decor .vn-hx-card-heart')).toBeAttached()
  await expect(page.locator('.vn-hx-card .vn-hx-disclaimer')).toContainText('keine Vertragsauskunft')
})

test('Freigegebene Dialogkarte: mobile Figur über Karte und Buttons im Viewport', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await openNavigator(page)
  await page.getByRole('button',{name:'Caro und Julie öffnen'}).click()
  const stage = await page.locator('.vn-hx-character-stage').boundingBox()
  const card = await page.locator('.vn-hx-card').boundingBox()
  expect(stage.y).toBeLessThan(card.y)
  expect(card.x).toBeGreaterThanOrEqual(-1)
  expect(card.x + card.width).toBeLessThanOrEqual(391)
  for (const name of ['Tagesweisheit','Nächster Witz']) {
    const button = page.getByRole('button',{name})
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width).toBeLessThanOrEqual(391)
  }
})
