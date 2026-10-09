import {test,expect} from '@playwright/test'

async function loadWork(page,url='./'){
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url)
  await page.getByRole('button',{name:'Arbeitsvorrat',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Arbeitsvorrat',exact:true})).toBeVisible()
  await expect(page.locator('.work-queue-card')).not.toHaveCount(0)
  return errors
}

test('Versorger-Arbeitsvorrat zeigt nur zulässige Bereiche mit abrufbaren Zählern',async ({page})=>{
  const errors=await loadWork(page)
  await expect(page.getByRole('button',{name:'Vertragsfragen öffnen'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Fehler / Änderungen melden öffnen'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Admin-Arbeitsvorrat öffnen'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'PG-Änderungsprüfungen öffnen'})).toHaveCount(0)
  await expect(page.locator('.work-queue-card').first()).not.toContainText('Zähler nicht abrufbar')
  await page.getByRole('button',{name:'Vertragsfragen öffnen'}).click()
  await expect(page.getByRole('heading',{name:'Vertragsfragen',exact:true})).toBeVisible()
  await page.getByLabel('Fragen durchsuchen').fill('Begründung')
  await expect(page.locator('.question-row')).toHaveCount(1)
  await page.getByLabel('Fragenstatus').selectOption('CLOSED')
  await expect(page.getByText('Keine Fragen entsprechen der aktuellen Filterung.')).toBeVisible()
  await page.getByLabel('Fragen durchsuchen').fill('')
  await expect(page.locator('.question-row')).toHaveCount(1)
  await page.getByRole('button',{name:'Aktualisieren'}).click()
  await expect(page.getByText('1 von 2 geladenen Fragen angezeigt')).toBeVisible()
  expect(errors).toEqual([])
})

test('PG-Administration findet Prüfqueues; Wechsel in Versorgermodus entfernt Bearbeitungszugänge',async ({page})=>{
  const errors=await loadWork(page,'./?uxRole=PG_ADMIN')
  await expect(page.getByRole('button',{name:'PG-Änderungsprüfungen öffnen'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Zusatzpositionen prüfen öffnen'})).toBeVisible()
  await expect(page.locator('.work-queue-number')).toHaveCount(3)
  await page.getByRole('button',{name:'Versorger',exact:true}).click()
  await expect(page.getByRole('button',{name:'PG-Änderungsprüfungen öffnen'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Zusatzpositionen prüfen öffnen'})).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Admin-Modus erreicht Steuerungsaufgaben; sekundäres Menü nutzt aktive Route',async ({page})=>{
  await loadWork(page,'./?uxRole=ADMIN')
  await expect(page.getByRole('button',{name:'Admin-Arbeitsvorrat öffnen'})).toBeVisible()
  await page.locator('.nav-more > summary').click()
  const menu=page.locator('.nav-more-list')
  await expect(menu.getByRole('button',{name:'Vertragsfragen'})).toBeVisible()
  await menu.getByRole('button',{name:'Vertragsfragen'}).click()
  await expect(page.getByRole('heading',{name:'Vertragsfragen',exact:true})).toBeVisible()
  await expect(page.locator('.nav-more summary')).toContainText('Vertragsfragen')
  await expect(page.locator('.nav-more')).not.toHaveAttribute('open','')
})

for(const width of [390,768,1440]){
  test('Navigation und Arbeitsvorrat bleiben bei '+width+' px bedienbar',async ({page})=>{
    await page.setViewportSize({width,height:900})
    await loadWork(page,'./?uxRole=PG_ADMIN')
    await expect(page.getByRole('button',{name:'Arbeitsvorrat',exact:true})).toHaveAttribute('aria-current','page')
    const dimensions=await page.evaluate(()=>({
      viewport:window.innerWidth,
      document:document.documentElement.scrollWidth,
      gridColumns:getComputedStyle(document.querySelector('.work-queue-grid')).gridTemplateColumns.split(' ').length
    }))
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport+3)
    expect(dimensions.gridColumns).toBe(width<=720?1:width<=1200?2:3)
    await page.locator('.nav-more > summary').click()
    await expect(page.locator('.nav-more-list').getByRole('button',{name:'Zusätze prüfen'})).toBeVisible()
    await page.locator('.nav-more-list').getByRole('button',{name:'Zusätze prüfen'}).click()
    await expect(page.getByRole('heading',{name:'Zusatzpositionen prüfen'})).toBeVisible()
  })
}
