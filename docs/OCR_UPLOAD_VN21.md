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


## Ausbaustufe 2 – Klauselindex und OCR-Textvergleich (21.10.2026)

**Ergänzt und bereitgestellt.** Die im privaten Supabase Storage gespeicherten Originaldateien und OCR-Arbeitskopien werden ohne zweiten Upload für die versionsbezogene Prüfung genutzt.

### Fachlicher Ablauf

- §-/Artikel-/Abschnittsüberschriften werden konservativ erkannt, nummerierte Unterabsätze ihrem übergeordneten Paragraphen zugeordnet. Fehlt ein verlässlicher Anker, erfolgt für den Abschnitt **kein automatischer Klauselvergleich**.
- Thematische Filter: Genehmigung/KVA, Fristen, Abrechnung, Verordnung, Versorgung, Dokumentation.
- Vorversionen werden nur innerhalb desselben Vertrags angeboten. Eine automatische Zuordnung erfolgt ausschließlich bei übereinstimmender normalisierter Dokumentbezeichnung; sonst ist eine bewusste Auswahl nötig.
- Prüfkandidaten: GEÄNDERT, UNSICHER, NEU_ZU_PRUEFEN und NICHT_GEFUNDEN. NICHT_GEFUNDEN bedeutet **nicht**, dass die Regel gestrichen wurde.
- Numerische Änderungen (z. B. fünf vs. sechs Tage in Ziffern) werden als Änderungen gekennzeichnet, auch bei ansonsten hoher Textähnlichkeit.
- Ohne ausreichend erkennbare Struktur wird kein vermeintlicher Wegfall von Vertragsklauseln gemeldet.
- Die Anzeige enthält Alt/Neu-Ausschnitte, Originalseiten, einen Link zum jeweiligen PDF, Kategorien und Seiten-Navigation. Bei langen Klauseln wird eine gekürzte Anzeige ausdrücklich gekennzeichnet.
- Vergleichsberechnung erfolgt bei Bedarf und **ohne Schreibzugriff auf freigegebene Vertragsdaten**.
- EDITOR-Rolle: eigene Uploads. ADMIN-Rolle: im bestehenden Berechtigungsrahmen alle vorhandenen Uploads.

### Code und Tests

- supabase/functions/vn2-contract-parse-ocr/clauseDiff.mjs
- supabase/functions/vn2-contract-ocr-review/index.ts
- src/components/ContractOcrReview.jsx, ContractOcrReview.css
- tests/ocr-clause-diff.test.mjs
- tests/ocr-review-ui.spec.mjs
- CI-Workflow: .github/workflows/ocr-browser-smoke.yml

### Abgrenzung / Abnahme

Dies ist ein **unverbindlicher Text- und Klauselvergleich**, kein juristisch gesicherter Vertrags-Diff. Er setzt keine Genehmigungs-, Abrechnungs- oder Versorgungsregel automatisch in Kraft. Noch ausstehend ist der vollständig angemeldete End-to-End-Praxistest mit dem realen 34-seitigen BARMER/TK-Scan einschließlich privater Supabase-Speicherung.


## Ausbaustufe 3 – OCR-Regelkandidaten und Wissensentwürfe (21.10.2026)

Implementiert: Der OCR-Vertragsupload erzeugt nach der Texterkennung automatisch **Prüfkandidaten** für Vertragsregeln. Die Verarbeitung benötigt keinen erneuten Download/Upload.

**Regelkandidaten** werden ohne KI-API anhand eindeutiger Textindikatoren zugeordnet: Genehmigung/KVA, Fristen, LEGS, Abrechnung, Versorgung, Verordnung, Dokumentation. Erfasste HMV-Codes, ausdrücklich gekennzeichnete LEGS, Fristangaben und EUR-Beträge sind nur Fundstellen; es werden keine verbindlichen Genehmigungsentscheidungen, Abrechnungspositionen oder IK-/PG-Geltungsbereiche daraus abgeleitet. Unstrukturierte OCR-Seiten sind ausgeschlossen.

**Prüfung:** Aktive Bearbeiter können eigene Kandidaten sehen. Eine Entscheidung CONFIRMED oder REJECTED ist ausschließlich mit aktiver ADMIN-Rolle und mindestens zwölf Zeichen Prüfbegründung möglich. Entscheidungen bleiben bei erneuter identischer OCR-Erkennung erhalten; nicht mehr identische Kandidaten werden als SUPERSEDED gekennzeichnet. Die Originalseiten sind per kurzzeitigem signierten Link erreichbar.

**Wissensbasis:** Ein von einem Administrator bestätigter Kandidat kann nach zusätzlicher manueller Formulierung und Bestätigung ausschließlich als Datensatz vn_contract_knowledge.status=DRAFT überführt werden. revalidation_required=true ist zwingend. Die atomare Übernahme erfolgt über die PostgreSQL-Funktion vn_ocr_create_knowledge_draft mit erneut geprüfter ADMIN-Rolle und Zeilensperre gegen doppelte Übernahme. **OCR darf niemals APPROVED automatisch setzen.**

**Zugriffsgrenze:** public.vn_ocr_rule_candidates ist RLS-geschützt, anon und authenticated besitzen keine direkten Lese- oder Schreibrechte. Nur die authentifizierte Edge Function liest/schreibt mit serverseitiger Service-Rolle und dokumentierter Eigentümerschaft-/Rollenprüfung. Die Migration enthält explizite GRANTs, unabhängig von der geänderten Supabase Data-API-Vergabe für neue Tabellen ab 30.10.2026.

**Dateien:**
- supabase/migrations/20261021_vn21_ocr_rule_candidates.sql
- supabase/migrations/20261021_vn21_ocr_rule_draft_atomic.sql
- supabase/functions/vn2-contract-ocr-rules/index.ts
- supabase/functions/vn2-contract-ocr-rules/ruleHints.mjs
- src/components/ContractOcrRuleReview.jsx und .css
- tests/ocr-rule-hints.test.mjs und Browser-Prüfung tests/ocr-review-ui.spec.mjs

**Offene Abnahme:** Keine produktive OCR-Arbeitskopie eines echten Vertrags ist bislang in der Datenbank vorhanden. Auswertungen/Tabellen und UI-Tests wurden mit synthetischen Texten nachgewiesen. Der gesamte Ablauf mit realem Scan, Anmeldung, privaten OCR-Daten und manueller DRAFT-Übernahme muss gesondert getestet werden, ohne eine produktive Vertragsfreigabe auszulösen.


## Ausbaustufe 4 – Nachweisbarer Regelgeltungsbereich (21.10.2026)

**Umgesetzt:** OCR-Regelkandidaten erhalten eine separate, private Geltungsbereichsprüfung mit den Achsen Kostenträgerfamilie, PG, IK und LEGS. Für jede Achse sind drei Werte möglich: UNRESOLVED (nicht geklärt, Standard), EXACT (konkreter Wert) und ALL_IN_CONTRACT (im vorliegenden Vertrag innerhalb dieser Dimension nicht zusätzlich eingeschränkt). ALL_IN_CONTRACT bedeutet nicht, dass jeder Standort Vertragsbeitritt, PQ oder Versorgungsberechtigung besitzt.

Zur fachlichen Bestätigung sind erforderlich: gültige Vertragsversion aus demselben Vertrag, Beginn und gegebenenfalls Ende, 30 Zeichen Quellenbegründung sowie ausdrückliche Bestätigung der Originalquelle. Die Datenbank prüft bei konkreter Zuordnung vorhandene Vertrags-PG, Kostenträgerfamilien, LEGS aus dem vorhandenen (teilweise kommaseparierten) Vertragsstamm und die Standort-IK im aktiven Standortstamm. **Die fehlende Vertrag-IK-Beitrittsmatrix wird dadurch nicht ersetzt.** Besteht eine Vertragsversion mit Enddatum, muss auch der Regelzeitraum zeitlich begrenzt sein. Die PG- und LEGS-Fundstellen aus dem OCR-Text selbst werden nicht als geprüfte Geltung übernommen.

**Wissens-Übergabe:** Eine bestätigte OCR-Klausel wird erst dann als DRAFT in vn_contract_knowledge übernommen, wenn ihr Geltungsbereich in vn_ocr_rule_scopes den Zustand VERIFIED besitzt. Die Übernahme bleibt transaktional und ausdrücklich revalidierungsbedürftig. Der bestehende Status APPROVED wird dabei nicht gesetzt.

**Vorbereitung Versorgungsassistent:** vn_ocr_verified_evidence_v1 ist ein serverseitiger, lesender Quellennachweis für ausschließlich bereits unabhängig freigegebene und aktuelle Regeln mit verifiziertem Geltungsbereich; die Sicht gibt explizit SOURCE_REFERENCE_ONLY aus. Es werden **keine** Aussagen über Versorgungszulässigkeit getroffen. In der Versorgungsprüfung bleiben eigenständig notwendig: Standort, IK-Vertragsgeltung/-beitritt, PQ, konkrete Position/Genehmigung/KVA, Verordnung und Quellenprüfung. Die Sicht ist nicht direkt für anon oder authenticated lesbar, sondern nur mit serverseitiger Berechtigung.

### Neue Dateien

- supabase/migrations/20261021_vn21_ocr_rule_scope.sql
- supabase/migrations/20261021_vn21_ocr_scope_source_attestation.sql
- supabase/migrations/20261021_vn21_ocr_rule_draft_scope_gate.sql
- supabase/migrations/20261021_vn21_ocr_verified_evidence_view.sql
- src/components/OcrRuleScopeEditor.jsx / .css
- src/lib/ocrRuleScopePolicy.js
- tests/ocr-rule-scope.test.mjs

### Offene Punkte

Die datenbasierte automatische Prüfung konkreter IK-Vertragsbeitritte ist wegen fehlender belastbarer Vertrags-IK-Geltungsdaten noch nicht möglich. Keine OCR-Texte oder -Regelkandidaten aus einem echten Produktivupload liegen vor. Ein End-to-End-Vertragstest mit Login, Scope-Prüfung, Entwurfsübergabe und erneuter Quellenkontrolle steht aus.


## Ausbaustufe 5 – IK-Vertragsbeitritt aus Bestandsdaten abgleichen (21.10.2026)

Die Bestandsdaten enthalten bereits:
- 20.764 Komponenten-/Standortgeltungszeilen (site_contract_scope), davon 5.631 mit offenem Prüfhinweis.
- 4.967 Vertragsbeitrittszeilen (site_contract_eligibility) für 4.491 eindeutige Standort/Vertrag-Kombinationen.
- 362 Kombinationen mit mehreren Beitrittszeilen.
- 929 Beitrittszeilen mit streng positivem Statusfilter: EXACT, active, Beigetreten, Voraussetzungen Ja, VTV Gemeldet und kein review_required.
- 0/4.967 Beitrittszeilen mit strukturierten valid_from/valid_to-Daten. Positive Statusmeldungen erlauben damit keine zeitliche Vertragsfreigabe.

**Neu:** Authentifizierter, lesender Abgleich eines konkret gewählten Vertrags mit Standort-IK und optionaler PG.
Das Backend-Kommando vn2-contract-ocr-rules (action=evidence) beschränkt den Zugriff auf den OCR-Upload und einen zugeordneten Regelkandidaten (EDITOR: eigene Uploads, ADMIN: berechtigt).
Der Abgleich:
1. Prüft Upload- und Kandidatenzugehörigkeit sowie Standort-IK.
2. Liest ausschließlich Zeilen für die Standort/Vertrag-Paarung.
3. Erkennt positive Hinweise, gekündigte/negative Beitritte, widersprüchliche Mehrfachzuordnungen sowie PG-Komponentenwidersprüche.
4. Kontrolliert inaktive Standorte und archivierte Verträge.
5. Kennzeichnet fehlende Gültigkeitsdaten und nicht PG-spezifisch nachgewiesene Beitritte.
6. Liefert ausnahmslos decision=PRUEFUNG_ERFORDERLICH. Ein positiver Datensatz ist keine Versorgungsfreigabe.
7. Zeigt Datensatz- und Quellenreferenzen in einer lesenden Prüfansicht im OCR-Geltungsbereichseditor.
8. Ändert keine Stammdaten, Beitritte, OCR-Freigaben oder Versorgungsentscheidungen.

**Dateien:** supabase/functions/vn2-contract-ocr-rules/accessionEvidence.mjs, src/components/OcrIkAccessionEvidence.jsx und .css, tests/ocr-ik-accession-evidence.test.mjs, ergänzte Browser-UI-Tests.

**Weiter offen:** Strukturierte Zeiträume aus Beitrittsdokumenten, PG-/IK-Geltung aus originären Vertragsquellen, PQ und Positionsprüfung. Der echte OCR-End-to-End-Test mit Anmeldung bleibt offen.


## Ausbaustufe 6 – Zeitlicher Vertragsbeitrittsnachweis (21.10.2026)

Ausgangslage: Die 4.967 strukturierten Beitrittszeilen besitzen bislang keine auswertbaren Beginn-/Enddaten. Der positive Beitrittsstatus allein ist keine Freigabe.

**Implementierung:**
- Neue Tabelle vn_contract_accession_proofs mit RLS und expliziten Grants nur für service_role. Die zugehörige PostgreSQL-Funktion vn_save_accession_proof prüft die aktive ADMIN-Rolle zusätzlich serverseitig.
- Jeder Nachweis verweist auf eine vorhandene, eindeutig dem Vertrag zugeordnete Beitritts-ID und ein als Original gespeichertes PDF desselben Vertrags. Er enthält Fundseite, Originalauszug, Quellenprüfvermerk, Belegart (Beitritt, Kündigung, Einschränkung) sowie dokumentierten Wirksamkeitszeitraum und optional PG.
- Ein Nachweis kann als DRAFT erfasst werden. VERIFIED verlangt zusätzlich die ausdrückliche Bestätigung, dass die Originalquelle kontrolliert wurde. Bereits verifizierte Nachweise werden nicht stillschweigend überschrieben.
- Die neue, authentifizierte OCR-Backend-Aktion proof verwendet den aktuellen Originalupload und die zugehörige Kandidaten-ID. Die read-only Aktion evidence ergänzt zeitliche Quellennachweise und kennzeichnet Kündigungs-/Einschränkungskonflikte.
- Im UI kann der Anwender einen Prüftag festlegen. Fehlende Originalnachweise werden ausdrücklich als nicht belegt behandelt.
- Ein verifizierter Zeitnachweis wird **niemals** allein als positiver Vertragsbeitritt oder konkrete Versorgungsfreigabe gewertet. Alle bisher getrennt erforderlichen Prüfungen bleiben notwendig.
- Berechtigungstrennung: EDITOR sieht ausschließlich Quellenbelege aus seinem berechtigten Upload; ADMIN darf verifizieren.

**Code:** supabase/migrations/20261021_vn21_accession_proofs.sql, supabase/functions/vn2-contract-ocr-rules/temporalEvidence.mjs, src/components/OcrAccessionProofEditor.jsx, tests/ocr-accession-temporal.test.mjs sowie erweiterte OCR-Browser-Tests.

**Grenzen:** Die Quellenprüfung ist ein vorbereitetes Fachverfahren. Es wurden keine Beitrittsdaten automatisch mit erfundenen Zeiträumen angereichert. Eigene Beitrittsbestätigungen und Kündigungsschreiben können nur referenziert werden, wenn sie als gültiges PDF-Original zum betroffenen Vertrag im System vorliegen. Die Live-End-to-End-Abnahme mit einem echten OCR-Upload, nachgewiesenem Vertragsbeitritt und authentifizierter Fachprüfung bleibt offen.
