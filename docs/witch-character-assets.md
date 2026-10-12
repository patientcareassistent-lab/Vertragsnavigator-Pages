# Caro & Julie – freigegebene Originalgrafiken

**Status: integriert und live, 12.10.2026.** Vier freigegebene PNG-Dateien mit transparentem Hintergrund wurden bytegenau in die Repositories `Vertragsnavigator` und `Vertragsnavigator-Pages` übernommen. Die Anwendung lädt sie aus `public/witches/` ohne Neurendering, Skalierung der Quelldatei oder Neukomprimierung. Das Frontend skaliert die Anzeige responsiv.

## Technik

- React 19 mit Motion for React (`motion/react`, MIT-Lizenz).
- Neue HTML/CSS-Dialogkarte, getrennt von den statischen Bilddaten.
- Vier Szenen in fester Abfolge: Caro solo, Julie solo, Duo stehend und Duo im Flug.
- Sprüche: 300 Texte, davon 150 wechselnde Witze und 150 Weisheiten; Weisheit des Tages ist datumsstabil.
- Automatischer erster Auftritt nach 12 s, danach zufällig alle 2–3 Minuten.
- Anzeige ca. 17 s, schließbar, Mobilansicht, `prefers-reduced-motion`, lokaler Ein-/Ausschalter.
- Bei Netz-/Dateifehlern optionaler SVG-Fallback. Dieser sollte unter normalen Betriebsbedingungen **nicht** mehr angezeigt werden.
- Keine Verbindung zur Vertragsdatenbank, PQ oder fachlichen Freigabeentscheidungen.

## Freigegebene Dateien mit unveränderter SHA-256

| Originaldatei im Repository | Größe | SHA-256 |
| --- | ---: | --- |
| `public/witches/caro.png` | 1.331.624 Bytes | `e33df910e88abafb7129d58d073b18f9b51b286a1c01aec1ae39326315f82a77` |
| `public/witches/julie.png` | 1.335.006 Bytes | `11044631a04ce037efcb4beb4d7336ab4db62166381f86d1d9be6c16a8fe8583` |
| `public/witches/caro-julie.png` | 2.005.653 Bytes | `33d3535e52513f91083a9c0deff43df1b8a6f53048d78c1170e337b12c940b66` |
| `public/witches/caro-julie-flug.png` | 1.632.133 Bytes | `0f28fa85e485e05528d67d74cfdd8ede3bf034c9433fca57444314c0c5f7a311` |

Die GitHub-Blob-SHAs wurden mit `git hash-object` der lokalen Originaldateien abgeglichen.

## Veröffentlichung

- Frontend-Repo: `patientcareassistent-lab/Vertragsnavigator-Pages`
- URL: https://patientcareassistent-lab.github.io/Vertragsnavigator-Pages/
- GitHub-Pages-Workflow: https://github.com/patientcareassistent-lab/Vertragsnavigator-Pages/actions/runs/38227169565

Bei geänderter Grafik das Quelldesign freigeben und die Binärdatei ersetzen; keine Chat-Sandbox-URLs ins Frontend einbauen.
