import test from "node:test";
import assert from "node:assert/strict";
import { extractExplicitPositionHint, parseEuroWithCurrency } from "../supabase/functions/vn2-contract-parse-ocr/positionHints.mjs";

test("7-/10-Steller mit ausdrücklichem EUR-Betrag wird nur als Hinweis erkannt", () => {
  assert.deepEqual(extractExplicitPositionHint("24.71.02.0 Weichwandschaft 124,50 EUR"), {
    code:"24.71.02.0", price:124.5, name:"Weichwandschaft"
  });
});
test("deutsche Tausendertrennung und Währungszeichen", () => {
  assert.equal(parseEuroWithCurrency("Preis € 1.234,56").value, 1234.56);
  assert.equal(parseEuroWithCurrency("€ 999,00").value, 999);
});
test("Datumsangaben und HMV-Codes werden nicht als Preise erfunden", () => {
  assert.equal(extractExplicitPositionHint("24.71.02.0 Gültig ab 01.10.2026"),null);
  assert.equal(extractExplicitPositionHint("24.71.02.0 Musterversorgung Preis 180,50"),null);
  assert.equal(extractExplicitPositionHint("24.71.02.0 01234 Wuppertal"),null);
});
test("ein abweichender Codesuffix ohne Preis bleibt unstrukturiert", () => {
  assert.equal(extractExplicitPositionHint("24.71.04.1 Arretierungssystem laut Anlage"),null);
});
