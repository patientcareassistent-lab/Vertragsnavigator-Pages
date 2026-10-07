# Vertragsnavigator – Deployment

Öffentliches Deployment-Repository für den Vertragsnavigator 2.1.

Die Quellanwendung, Datenbankmigrationen und Fachlogik liegen in `patientcareassistent-lab/Vertragsnavigator`. Dieses Repository enthält ausschließlich die statische Weboberfläche.

Vertragsdaten werden nicht in GitHub Pages gespeichert. Nach Anmeldung liest die Oberfläche ausschließlich die freigegebenen Supabase-Views des separaten Projekts `Vertragsnavigator`.

Deployment: GitHub Pages (`main`, GitHub Actions).

## Stand 07.10.2026
- Admin-Vertragsvorprüfung als geführter P1-Workflow: integrierter Upload, Publication Hold bis zur Unterschrift, Autosave, Blockeranzeige und serverseitige Pagination.
