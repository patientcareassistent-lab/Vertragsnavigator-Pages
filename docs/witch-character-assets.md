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

## Bilddateien: noch einzupflegen

Die im Chat freigegebenen Illustrationen müssen als echte Binärdateien in das Repository übertragen werden. Bis dahin ist das Art-Upgrade unvollständig. Der Code erwartet folgende statische Assets (im Vite-Verzeichnis `public/witches/`):

| Quelldesign | Zieldatei |
| --- | --- |
| Caro einzeln, rothaarig | `caro.webp` |
| Julie einzeln, blond | `julie.webp` |
| Beide gemeinsam, stehend | `caro-julie.webp` |
| Beide gemeinsam auf Besen | `caro-julie-flug.webp` |

**Hinweis:** Die Quellbilder liegen aktuell als PNG im Chat vor. Für Browserdarstellung sollten sie auf den sichtbaren Figurenbereich zugeschnitten, mit transparentem Hintergrund versehen und verlustarm als WebP exportiert werden. Keine urheberrechtlich ungesicherte Fremdbildquelle oder private Chat-URL referenzieren. Dateinamen exakt wie angegeben verwenden.

### QA-Gates vor finaler Veröffentlichung

1. Alle vier Bilddateien im Repository vorhanden und lesbar.
2. Browserdarstellung Desktop/Mobil: keine weißen Rechteckflächen um Figuren.
3. Vier Szenen, Namenswechsel, Buttons, lokale Abschaltung, reduzierte Bewegung und Ausschluss von Überlagerungen geprüft.
4. GitHub-Build und UI-Smoke erfolgreich; danach erst Merge in `main`.
