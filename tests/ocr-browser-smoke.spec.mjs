import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("ein bildbasiertes Scan-PDF wird im Browser automatisch harmonisiert und OCR-gelesen", async ({ page }) => {
  test.setTimeout(180_000);
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  await page.goto("./ocr-smoke.html");
  await expect.poll(() => page.evaluate(() => window.__ocrSmokeReady)).toBe(true);

  const pngData = await page.evaluate(() => {
    const canvas=document.createElement("canvas");
    canvas.width=1000;canvas.height=1300;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#000000";ctx.textAlign="center";
    ctx.font="bold 70px Arial";ctx.fillText("RAHMENVERTRAG",500,270);
    ctx.font="bold 55px Arial";ctx.fillText("BARMER",500,520);
    ctx.font="bold 44px Arial";ctx.fillText("Techniker Krankenkasse",500,700);
    ctx.font="32px Arial";ctx.fillText("Produktgruppe 24 Hilfsmittel",500,910);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const pdf=await PDFDocument.create();
  const image=await pdf.embedPng(Buffer.from(pngData,"base64"));
  const sheet=pdf.addPage([595,842]);
  sheet.drawImage(image,{x:0,y:0,width:595,height:842});
  const bytes=await pdf.save();

  await page.locator("#test-pdf").setInputFiles({
    name:"synthetischer_scan.pdf",
    mimeType:"application/pdf",
    buffer:Buffer.from(bytes)
  });
  await expect.poll(() => page.evaluate(() => Boolean(window.__ocrSmokeResult)), {timeout:165_000}).toBe(true);
  const outcome=await page.evaluate(() => window.__ocrSmokeResult);
  expect(outcome.ok, outcome.error).toBe(true);
  expect(outcome.result.summary.pages).toBe(1);
  expect(outcome.result.summary.ocr_pages).toBe(1);
  expect(outcome.result.pages[0].method).toBe("ocr");
  expect(outcome.result.pages[0].text).toMatch(/RAHMENVERTRAG/i);
  expect(outcome.result.pages[0].text).toMatch(/BARMER/i);
  expect(runtimeErrors).toEqual([]);
});
