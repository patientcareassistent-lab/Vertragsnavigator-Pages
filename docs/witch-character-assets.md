# Caro & Julie: Character Stage

Frontend-Integration des freigegebenen Charakterdesigns. Der humorvolle Layer ist vollständig von Vertragsdaten, PQ, Versorgungsentscheidung und Supabase getrennt.

## Technik

- React 19 mit der freien Motion-Bibliothek (`motion/react`, MIT-Lizenz).
- Dialogkarte aus echten HTML-Elementen/CSS, nicht aus einer gerasterten Textgrafik.
- Vier Auftritte im Kreislauf: **Caro solo**, **Julie solo**, **Duo stehend**, **Duo im Flug**.
- Automatischer erster Auftritt nach 12 Sekunden, danach zufällig nach 2–3 Minuten.
- Tagesweisheit / 150 Witze / nicht wiederholende Zufallsreihenfolge / lokaler Ein-Aus-Schalter unverändert.
- Dialog 17 Sekunden sichtbar; schließbar, mobil verkleinert, berücksichtigt `prefers-reduced-motion`.
- Bei fehlenden Bilddateien erscheinen **ersatzweise gezeichnete SVG-Figuren**. Dies ist keine Freigabe oder Verwendung der finalen Charakterillustrationen.

## Bilddateien: original freigegeben; binärer GitHub-Upload ausstehend

Die im Chat freigegebenen Illustrationen müssen als echte Binärdateien in das Repository übertragen werden. Bis dahin ist das Art-Upgrade unvollständig. Der Code erwartet folgende statische Assets (im Vite-Verzeichnis `public/witches/`):

| Quelldesign | Zieldatei |
| --- | --- |
| Caro einzeln, rothaarig | `caro.png` |
| Julie einzeln, blond | `julie.png` |
| Beide gemeinsam, stehend | `caro-julie.png` |
| Beide gemeinsam auf Besen | `caro-julie-flug.png` |

**Hinweis:** Die Quellbilder liegen aktuell als PNG im Chat vor. Für Browserdarstellung sollten sie auf den sichtbaren Figurenbereich zugeschnitten, mit transparentem Hintergrund versehen und verlustarm als WebP exportiert werden. Keine urheberrechtlich ungesicherte Fremdbildquelle oder private Chat-URL referenzieren. Dateinamen exakt wie angegeben verwenden.

### QA-Gates vor finaler Veröffentlichung

1. Alle vier Bilddateien im Repository vorhanden und lesbar.
2. Browserdarstellung Desktop/Mobil: keine weißen Rechteckflächen um Figuren.
3. Vier Szenen, Namenswechsel, Buttons, lokale Abschaltung, reduzierte Bewegung und Ausschluss von Überlagerungen geprüft.
4. GitHub-Build und UI-Smoke erfolgreich; danach erst Merge in `main`.

## Originaldateien und Integrität (Stand 12.10.2026)

Exakt die vier zuletzt freigegebenen transparenten Original-PNGs, ohne Neurendering, Skalierung oder Neukomprimierung. Die App ist bereits auf die PNG-Namen eingestellt und zeigt bis zum Upload die SVG-Ersatzgrafiken.

| Datei | SHA-256 |
|---|---|
| `public/witches/caro.png` | `e33df910e88abafb7129d58d073b18f9b51b286a1c01aec1ae39326315f82a77` |
| `public/witches/julie.png` | `11044631a04ce037efcb4beb4d7336ab4db62166381f86d1d9be6c16a8fe8583` |
| `public/witches/caro-julie.png` | `33d3535e52513f91083a9c0deff43df1b8a6f53048d78c1170e337b12c940b66` |
| `public/witches/caro-julie-flug.png` | `0f28fa85e485e05528d67d74cfdd8ede3bf034c9433fca57444314c0c5f7a311` |

Bitte nicht bloß die Dateiendung einer WebP ändern. Bilder als echte PNG-Binärdateien hochladen. Bei vorhandenem Binärdatei-Upload die vier Dateien gemeinsam in `public/witches/` hinzufügen.
