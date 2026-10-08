# ChatGPT-Projektchats → Entwicklungs-Backlog

Stand: 08.10.2026 · Vertragsmanager / Vertragsnavigator 2.1

## Zweck

Ein expliziter Fehler oder Änderungswunsch aus einem **gerade bearbeiteten** ChatGPT-Projektchat kann mit dem bereits verbundenen Supabase-Zugang direkt in den Entwicklungs-Backlog übernommen werden. Es gibt keinen allgemeinen ChatGPT-Project-Webhook und keine unbeaufsichtigte Einsicht in fremde oder geschlossene Gespräche.

Die Datenbank führt weiterhin eine getrennte automatische Laufzeitfehler-Übernahme.

## Datenfluss

`Projektchat → fachlich minimierte Meldung → Supabase-Connector (SQL) → private.vn_import_chat_backlog → vn_development_backlog / vn_backlog_chat_sources → Frontend`.

Die Datenbankfunktion befindet sich im nicht öffentlich exponierten Schema `private`. Sie ist weder für `anon` noch für `authenticated` ausführbar und wird nur über den berechtigten Supabase-Verwaltungszugang verwendet. Im Browser gibt es keinen administrativen Import-Endpunkt.

### Verhaltensregeln

1. Nur eindeutige Fehler, Korrekturen, Funktionsanforderungen oder explizite Backlog-Befehle übernehmen. Fragen, Hypothesen und allgemeine Diskussionen nicht ungefragt zu Tickets machen.
2. **Keine Patientendaten, Gesundheitsinformationen, personenbezogenen Geheimnisse, Zugangsdaten oder vollständigen Gesprächsverläufe** übertragen. Nur sachlichen Titel, fachlich minimierte Beschreibung und Abnahmekriterium erfassen.
3. Vor Erstellung im vorhandenen Backlog nach einer passenden Referenz suchen (z. B. B01, B02, F01). Vorhandenes Ticket über `p_reference_code` verknüpfen, statt eine Dublette anzulegen.
4. `p_source_key` als stabilen, technischen Schlüssel verwenden: kleingeschrieben `projekt:datum:kurzes-thema`. Dieselbe Chat-Anforderung verwendet bei wiederholtem Aufruf **denselben** Schlüssel. Schlüssel enthalten keine Personen- oder Patientennamen.
5. Quellenbezeichnung kurz und neutral halten. Einen Chat-Link nur verwenden, wenn der Nutzer ihn ausdrücklich bereitgestellt hat; keinen Link erfinden.
6. Niemals automatisch bestehende Prioritäten, Bearbeitungsstände, Freigaben, Verantwortliche oder Abschlüsse überschreiben. Bei widersprüchlichen Anforderungen zuerst Rücksprache halten.
7. Nach erfolgreichem Import Ticketreferenz, Aktion (`CREATED`, `LINKED_EXISTING` oder `EXISTING_SOURCE`) und Status im Chat nennen.
8. Fehlgeschlagene Imports nicht als erfolgreich darstellen. Berechtigungs- oder Validierungsfehler konkret melden.

### SQL-Aufruf über den verbundenen Supabase-Connector

Nur als Muster, nicht als öffentlicher HTTP-Aufruf:

```sql
SELECT *
FROM private.vn_import_chat_backlog(
  p_source_key => 'vertragsmanager:2026-10-08:pg-filter-region-reset',
  p_title => 'Kasse/Region bleibt beim PG-Wechsel erhalten',
  p_description => 'Beim Wechsel der Produktgruppe wird eine bereits ausgewählte Region unerwartet zurückgesetzt.',
  p_kind => 'FEHLER',
  p_priority => 'P1',
  p_area => 'Suche/Filter',
  p_acceptance_criteria => 'Die ausgewählte Kasse/Region bleibt beim Wechsel der PG bestehen.',
  p_reference_code => 'B02',
  p_source_label => 'Projektchat Vertragsmanager, 08.10.2026'
);
```

Bei einem **neuen** Thema `p_reference_code` weglassen. Es wird eine Referenz `CH-XXXXXXXXXXXX` erzeugt. Import und Quellenverweis erfolgen in derselben Datenbanktransaktion. Gleiche `p_source_key`-Werte werden idempotent zugeordnet. Die Quelle bleibt im Detailfenster des bestehenden Tickets sichtbar.

## Einmalige Projektanweisung in ChatGPT

Um die Übernahme im laufenden Projektchat standardmäßig auszulösen, muss die folgende Anweisung **einmal manuell in die Anweisungen des ChatGPT-Projekts „Vertragsmanager“** übernommen werden (dieses Repository kann Projektanweisungen nicht selbst ändern):

> Erfasse eindeutige Fehler, konkrete Korrekturen und Änderungswünsche aus diesem Projektchat im bestehenden Supabase-Entwicklungs-Backlog. Verwende nur den verbundenen Supabase-Connector und die private SQL-Funktion `private.vn_import_chat_backlog`. Suche vor dem Erstellen nach passenden vorhandenen Tickets; verknüpfe statt zu duplizieren. Verwende einen stabilen Quellschlüssel, übermittle nur fachlich notwendige, nicht personenbezogene Angaben und überschreibe nie bestehende Ticketstatus oder Freigaben. Nenne danach die gespeicherte Ticketreferenz. Bei fehlender Verbindung melde den Blocker; behaupte keine Speicherung. Andere Chatverläufe werden nicht im Hintergrund ausgelesen.

## Abnahme

- Bestehende Ticketzuordnung und Duplikatwiederholung mit B02 getestet: Ticketstatus bleibt `TESTEN`.
- Neuanlage innerhalb einer Rollback-Transaktion getestet: das neue Ticket wurde erstellt und zurückgerollt.
- Bereits verknüpfte Chatquellen: B01 und B02.
- Frontend: Quellenfilter `Aus Projektchats`, Quellenbezeichnung und Kurzbeschreibung am Ticket.
- Keine zusätzliche SaaS-Lizenz erforderlich, Nutzung unter den bestehenden Tariflimits.
