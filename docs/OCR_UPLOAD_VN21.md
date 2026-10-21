# Vertragsnavigator 2.1 – Automatischer OCR-Vertragsupload

Stand: 21.10.2026 · Implementierung im Repository \`Vertragsnavigator-Pages\`

## Ziel
**Einmal Original hochladen.** Die technische Harmonisierung und Texterkennung laufen automatisch. Der Anwender muss keine Zwischen-PDF herunterladen oder erneut hochladen.

## Verarbeitung
1. Original-PDF unverändert in privatem Supabase Storage (\`contract-sources\`) speichern; SHA-256/Dublettenprüfung.
2. Bei bereits bekannter Datei OCR überspringen (nur ausdrücklich geänderte IK-/ERP-Zuordnung prüfen).
3. Browser prüft jede PDF-Seite auf verlässliche Textebene (\`pdfjs-dist\`).
4. Scan-Seiten werden automatisch mit PDF.js gerendert; bei geringer Erkennungsqualität folgt ein weiterer Versuch mit Kontrastnormalisierung und höherer Auflösung.
5. Deutschsprachige Texterkennung mit \`tesseract.js\`; Fortschritt und unlesbare Seiten anzeigen.
6. Nur der Seiten-Text und die Seiten-/Qualitätsdaten werden an eine auth-geschützte Supabase Edge Function übertragen.
7. Edge Function prüft aktive EDITOR-/ADMIN-Rolle und Upload-Eigentümerschaft. Abgeleiteter Volltext wird als private \`derived-ocr/<upload-id>.json\`-Arbeitskopie gesichert; Original bleibt unverändert.
8. Aus OCR erkannte Dokumentdaten und nur **explizite EUR/€-Preis-Hinweise** werden als *nicht autoritativ* vorgemerkt.
9. Bestehende SQL-Abschlussfunktion schließt den PDF-Upload als \`SOURCE_ONLY\` ab. OCR-Ergebnisse ersetzen weder Vertragsversion noch Preisposition automatisch.

## Grenzen
- **OCR ist nicht Vertragsprüfung.** Der Volltext und einige extrahierte Hinweise werden gesichert; ein vollständiger Paragraphen-, Leistungs- und Positions-Diff aus unstrukturiertem PDF ist noch nicht produktiv nachgewiesen.
- Das PDF wird pro Seite erkannt. Das gesetzte Limit beträgt 250 Seiten und 2 Millionen Zeichen Gesamttext. Keine stillen Kürzungen.
- Schlechte, unlesbare oder leere Seiten werden gekennzeichnet; sie dürfen nicht als geprüfte Regeln übernommen werden.
- Der Browser lädt zur Erstinitialisierung die für Tesseract benötigte deutsche Spracherkennungsdatei. Vertragsseiten werden dafür nicht an einen externen OCR-Dienst übertragen.
- Die OCR kann auf schwachen Endgeräten längere Zeit benötigen. Browser-Tab während der Verarbeitung geöffnet lassen.
- Fehlerhafte Erkennung kann **ohne zweiten Upload** wiederholt werden: innerhalb der Sitzung aus der vorhandenen Datei, nach Neuladen über zeitlich begrenzten signierten Zugriff auf das Original.
- PDF-Versorgungspositionen dürfen bei unklaren Tabellenzuordnungen nicht automatisch als vollständiger Ersatzbestand bestätigt werden.

## Technische Komponenten
- \`src/lib/pdfAutoOcr.js\`
- \`src/lib/contractUpload.js\`
- \`src/components/ContractUpload.jsx\`
- \`supabase/functions/vn2-contract-parse-ocr/index.ts\`
- \`supabase/functions/vn2-contract-parse-ocr/positionHints.mjs\`
- \`supabase/functions/vn2-contract-upload-original/index.ts\`

## Regressionstests
- \`tests/pdf-auto-ocr.test.mjs\`: Textebenen-/Qualitätsgating und Zeilenfolge.
- \`tests/ocr-position-hints.test.mjs\`: Kein erfundener Preis aus HMV-Nummern oder Datumsangaben.
- \`tests/ocr-browser-smoke.spec.mjs\`: Browser-OCR mit synthetischem, bildbasiertem PDF (keine vertraulichen Dokumente im Test-Repository).
- \`.github/workflows/ocr-browser-smoke.yml\`: Browser-Test separat vom Pages-Deployment.

## Datenschutz und Freigabe
- Keine personenbezogenen Testdaten erforderlich.
- Privat gespeicherte Originale und OCR-Arbeitskopien; Zugriff auf signierte Originale nur mit Auth, Aktivrolle und Upload-Eigentümerschaft.
- Kein OCR-basierter automatischer Schreibzugriff auf freigegebene Vertragspositionen.
- Veröffentlichte Vertragsregeln sind nur aus vollständig bestätigten und fachlich freigegebenen strukturierten Quellen zulässig.

## Abnahmekriterien für den BARMER/TK-Scan (34 Seiten)
- 34/34 Seiten rasterbar und nachverfolgt.
- Mehrere Stichproben fachlich lesbar (Rahmenvertrag, Kündigungsklauseln, Vertragsparteien).
- Fehlgeschlagene Seiten mit Seitenzahl/Qualität sichtbar.
- Kein zweiter Upload notwendig.
- Parser-Status \`SOURCE_ONLY\` und Original-/OCR-Text getrennt nachweisbar.
- Keine Änderung am Live-Vertragsbestand.
