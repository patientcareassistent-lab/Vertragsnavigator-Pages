/**
 * VN 2.1 PDF-Vorverarbeitung: rendern, Texterschließung und OCR im Browser.
 * Die Originaldatei wird nicht verändert und bleibt der einzige Upload.
 * Kein Dokument wird an einen externen OCR-Dienst gesendet.
 */
const MAX_PAGES = 250;
const MAX_PAGE_TEXT = 16000;
const MAX_TOTAL_TEXT = 2000000;

export function usefulText(text) {
  const value = String(text || "").trim();
  const letters = (value.match(/[\p{L}]/gu) || []).length;
  const junk = (value.match(/[\uFFFD\uE000-\uF8FF]/g) || []).length;
  return value.length >= 70 && letters >= 32 && junk / Math.max(1, value.length) < 0.03;
}

export function pageText(items = []) {
  const rows = [];
  for (const entry of items) {
    if (!entry || typeof entry.str !== "string" || !entry.str.trim()) continue;
    const x = Number(entry.transform?.[4] ?? 0);
    const y = Number(entry.transform?.[5] ?? 0);
    let row = rows.find(r => Math.abs(r.y - y) < 2.7);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, str: entry.str.trim() });
  }
  return rows.sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(x => x.str).join(" "))
    .join("\n").trim();
}

function sizeLimitedViewport(page, preferredScale) {
  const base = page.getViewport({ scale: 1 });
  const maxScale = Math.min(4400 / base.width, 4400 / base.height,
    Math.sqrt(13000000 / Math.max(1, base.width * base.height)));
  return page.getViewport({ scale: Math.min(preferredScale, maxScale) });
}

async function rasterize(page, scale, enhanced = false) {
  const viewport = sizeLimitedViewport(page, scale);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: enhanced });
  if (!context) throw new Error("Canvas für PDF-Seite nicht verfügbar.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: context,
    viewport,
    background: "rgb(255,255,255)"
  }).promise;
  if (enhanced) enhanceContrast(context, canvas.width, canvas.height);
  return canvas;
}

function enhanceContrast(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    min = Math.min(min, brightness); max = Math.max(max, brightness);
  }
  if (max - min < 14) return; // Vollständig ausgebleichte Seiten markieren, nicht verschlimmbessern.
  const span = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    // Kontrastspreizung, kein hartes Binarisieren: dünne Schrift bleibt erhalten.
    const value = Math.max(0, Math.min(255, Math.round((brightness - min) * 255 / span)));
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  ctx.putImageData(image, 0, 0);
}

function rankRecognition(result) {
  const text = String(result?.data?.text || "").trim();
  const confidence = Number(result?.data?.confidence || 0);
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  return {
    text, confidence,
    score: Math.min(letters, 250) * 0.35 + confidence * 0.65
  };
}

export async function preparePdfForContractUpload(file, onProgress = () => {}) {
  if (!file?.name?.toLowerCase().endsWith(".pdf")) return null;
  // Dynamische Imports: OCR-Bibliothek und WASM erst laden, wenn eine PDF eingereicht wird.
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loading = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    stopAtErrors: false
  });
  let pdf;
  let tessWorker = null;
  const pages = [];
  const warnings = [];
  let totalText = 0;
  let ocrCount = 0;
  try {
    pdf = await loading.promise;
    if (pdf.numPages > MAX_PAGES)
      throw new Error("Das PDF enthält mehr als 250 Seiten. Bitte den Vertrag administrativ aufteilen.");
    for (let index = 1; index <= pdf.numPages; index++) {
      onProgress({ page: index, total: pdf.numPages, mode: "Text prüfen" });
      const page = await pdf.getPage(index);
      let text = "";
      let method = "text";
      let confidence = null;
      try {
        const content = await page.getTextContent();
        text = pageText(content.items);
      } catch (error) {
        warnings.push("Seite " + index + ": Textebene nicht auslesbar.");
      }
      if (!usefulText(text)) {
        method = "ocr";
        onProgress({ page: index, total: pdf.numPages, mode: "Bild harmonisieren / OCR" });
        try {
          if (!tessWorker) {
            const { createWorker } = await import("tesseract.js");
            tessWorker = await createWorker("deu", 1);
          }
          let canvas = await rasterize(page, 2.25);
          let recognized = rankRecognition(await tessWorker.recognize(canvas));
          canvas.width = canvas.height = 0;
          if (recognized.confidence < 55 || recognized.text.length < 55) {
            canvas = await rasterize(page, 3, true);
            const candidate = rankRecognition(await tessWorker.recognize(canvas));
            if (candidate.score > recognized.score) recognized = candidate;
            canvas.width = canvas.height = 0;
          }
          text = recognized.text;
          confidence = Number(recognized.confidence.toFixed(1));
          ocrCount++;
        } catch (error) {
          method = "failed";
          text = "";
          warnings.push("Seite " + index + ": OCR fehlgeschlagen (" + String(error?.message || error) + ").");
        }
        if (text.length < 15) {
          method = "failed";
          warnings.push("Seite " + index + ": Keine verlässliche Texterkennung möglich – fachlich prüfen.");
        }
      }
      text = text.slice(0, MAX_PAGE_TEXT);
      if (totalText + text.length > MAX_TOTAL_TEXT)
        throw new Error("OCR-Textmenge zu groß. Das Dokument erfordert eine gestaffelte Verarbeitung.");
      totalText += text.length;
      pages.push({ page: index, method, text, confidence });
      page.cleanup();
      onProgress({ page: index, total: pdf.numPages, mode: "Fertig" });
    }
    return {
      pages, warnings,
      summary: {
        pages: pages.length, ocr_pages: ocrCount,
        failed_pages: pages.filter(p => p.method === "failed").map(p => p.page),
        chars: totalText
      }
    };
  } finally {
    if (tessWorker) await tessWorker.terminate().catch(() => {});
    if (pdf) await pdf.destroy().catch(() => {});
    else await loading.destroy().catch(() => {});
  }
}
