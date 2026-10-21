import {test,expect} from '@playwright/test'
test('OCR-Vergleich: Alt/Neu, Seitenbezug, Themenfilter und Klauselindex',async ({page})=>{
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('./ocr-review-smoke.html')
  await expect(page.getByRole('heading',{name:'OCR-Vertragsprüfung'})).toBeVisible()
  await expect(page.locator('.ocr-review-card')).toHaveCount(2)
  await expect(page.locator('.ocr-review-card').first()).toContainText('fünf Werktagen')
  await expect(page.locator('.ocr-review-card').first()).toContainText('sechs Werktagen')
  await expect(page.locator('.ocr-review-card').first()).toContainText('Seite 5')
  await expect(page.locator('.ocr-review-card').first()).toContainText('Seite 6')
  await expect(page.locator('.ocr-review-card').nth(1)).toContainText('keine Löschung')
  await page.getByLabel('OCR-Klauselthema').selectOption('GENEHMIGUNG')
  await expect(page.locator('.ocr-review-card')).toHaveCount(1)
  await page.getByLabel('OCR-Vergleichsfassung').selectOption('NONE')
  await expect(page.locator('.ocr-review-card')).toHaveCount(1)
  await expect(page.locator('.ocr-review-card').first()).toContainText('ERKANNTER TEXT')
  await expect(page.getByText('kein rechtsverbindlich',{exact:false})).toHaveCount(0)
  expect(errors).toEqual([])
})


test('OCR-Regelhinweise: ausschließlich bestätigter Kandidat darf als DRAFT übernommen werden',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.goto('./ocr-review-smoke.html');
  await page.getByRole('button',{name:'Regelhinweise prüfen'}).click();
  await expect(page.locator('.ocr-rule-item')).toHaveCount(1);
  const card=page.locator('.ocr-rule-item').first();
  await expect(card).toContainText('Genehmigung / KVA');
  await expect(card).toContainText('Erkannte LEGS');
  await expect(card).toContainText('1234567');
  await expect(card.getByRole('button',{name:/Als Prüfkandidat bestätigen/})).toBeDisabled();
  await card.getByPlaceholder('Quellenprüfung, Geltungsbereich und Entscheidung dokumentieren …')
    .fill('Quellenlage geprüft; Regel mit nachgewiesenem Fristbezug in der Originalseite.');
  await card.getByRole('button',{name:/Als Prüfkandidat bestätigen/}).click();
  await expect(card).toContainText('Fachlich bestätigt');
  await expect(card).not.toContainText('Wissensentwurf angelegt');
  await expect(card.getByRole('button',{name:/Fachlich formulierten Wissensentwurf anlegen/})).toHaveCount(0);
  await card.getByRole('button',{name:/Geltung festlegen/}).click();
  await expect(card.getByLabel('Geltungsbereich Vertragsversion')).toBeVisible();
  for (const label of ['Kostenträgerfamilie','Produktgruppe (PG)','Standort-IK','LEGS']){
    await card.getByLabel(label+' Geltungsart').selectOption('ALL_IN_CONTRACT');
  }
  await card.getByLabel('Beitrittsprüfung Standort-IK').fill('123456789');
  await card.getByLabel('Beitrittsprüfung Produktgruppe').fill('24');
  await card.getByRole('button',{name:'Beitrittsdaten prüfen'}).click();
  await expect(card).toContainText('Widersprüchliche Beitrittsinformationen');
  await expect(card).toContainText('Prüfung erforderlich');
  await expect(card).toContainText('PG 24: Widerspruch');
  await expect(card.getByRole('button',{name:/Fachlich formulierten Wissensentwurf anlegen/})).toHaveCount(0);
  await card.getByLabel('Geltungsbereich Vertragsversion').selectOption('VER-TEST');
  await card.getByLabel('Geltungsbereich gültig ab').fill('2026-01-01');
  await card.getByLabel('Geltungsbereich Quellennachweis').fill(
    'TEST: Originalseite 6 geprüft; Rahmenvertrag ohne weitere PG-, LEGS- oder IK-Einschränkung.'
  );
  await expect(card.getByRole('button',{name:/Geltung anhand Quelle bestätigen/})).toBeDisabled();
  await card.locator('.ocr-scope-attest input[type=checkbox]').check();
  await card.getByRole('button',{name:/Geltung anhand Quelle bestätigen/}).click();
  await expect(card).toContainText('Geltungsbereich bestätigt');
  await card.getByRole('button',{name:/Fachlich formulierten Wissensentwurf anlegen/}).click();
  await expect(card.getByRole('button',{name:/Als DRAFT speichern/})).toBeDisabled();
  await card.getByPlaceholder('Vertraglich gesicherte Aussage mit allen relevanten Einschränkungen formulieren …')
    .fill('Fachlich geprüfte Genehmigungsfrist gemäß Originalseite; gilt nur bei eindeutigem Vertragsumfang.');
  await card.getByRole('button',{name:/Als DRAFT speichern/}).click();
  await expect(card).toContainText('Wissensentwurf angelegt');
  await expect(card).toContainText('noch nicht freigegeben');
  await expect(card.getByRole('button',{name:/Fachlich formulierten Wissensentwurf anlegen/})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Vertragsbeitritt: Zeitnachweis bleibt gesperrt bis die Originalquelle geprüft ist',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./ocr-review-smoke.html');
  await page.getByRole('button',{name:'Regelhinweise prüfen'}).click();
  const card=page.locator('.ocr-rule-item').first();
  await card.getByRole('button',{name:/Geltung festlegen/}).click();
  await card.getByLabel('Beitrittsprüfung Standort-IK').fill('123456789');
  await card.getByLabel('Beitrittsprüfung Produktgruppe').fill('24');
  await card.getByRole('button',{name:'Beitrittsdaten prüfen'}).click();
  await expect(card).toContainText('Nicht durch Originalnachweis belegt');
  await card.getByText('Beitrittszeitraum aus Original belegen').click();
  await card.getByLabel('Nachweis Beitritts-ID').selectOption('A1');
  await card.getByLabel('Nachweis Beginn').fill('2026-01-01');
  await card.getByLabel('Nachweis Seite').fill('6');
  await card.getByLabel('Nachweis Auszug').fill('Die Vertragsparteien bestätigen den Beitritt zum 1. Januar 2026.');
  await card.getByLabel('Nachweis Prüfnotiz').fill(
    'Testnachweis: Ursprungsausfertigung, Standort-IK und Vertrag wurden fachlich abgeglichen.'
  );
  await expect(card.getByRole('button',{name:'Quellennachweis bestätigen'})).toBeDisabled();
  await card.getByLabel('Originalbeleg kontrolliert').check();
  await card.getByRole('button',{name:'Quellennachweis bestätigen'}).click();
  await expect(card).toContainText('Original-Zeitnachweis dokumentiert');
  await expect(card).toContainText('Prüfung erforderlich');
  expect(errors).toEqual([]);
});
