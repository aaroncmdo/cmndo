# Text-Audit Cluster C — Gutachter-Services + Fahrzeugtypen
Datum: 27.05.2026 · Auditor: Claude Code (read-only)

---

## /gutachter-finden

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| [Critical] | Fakten/Zahlen | `BghAuthorityGrid.tsx` Z. 16 — BGH-Karte `BGH VI ZR 67/91` (Titel: 130%-Regel) | Az. `VI ZR 67/91` ist **nicht** im Kanon. Kanon-Az. für die 130%-Regel ist nicht explizit gelistet; das Urteil stammt von 1991 und ist bekannt, aber das abweichende Az. von `VI ZR 67/06` (SV-Honorar), das in Fahrzeugtyp-Pages als Beleg für „SV-Kosten trägt Gegenseite" verwendet wird (korrekt), ist ein anderes Verfahren. `VI ZR 67/91` selbst ist faktisch das 130%-Urteil — Az. scheint korrekt für dieses Urteil. **Kein Fehler**, aber da das Az. nicht im Kanon steht, zur Verifikation markiert. | Intern gegen Primärquelle (juris.bundesgerichtshof.de) verifizieren; wenn korrekt, in Kanon aufnehmen. |
| [Important] | Fakten/Zahlen | `BghAuthorityGrid.tsx` Z. 16 — BGH-Karte `BGH VI ZR 67/91` Titel: `130%-Regel`, Text: „Reparatur bis 130 % des Wiederbeschaffungswertes **zulässig**." | Der Text sagt „zulässig" allgemein, ohne Kondition. BGH-Linie verlangt, dass der Geschädigte das Fahrzeug mindestens 6 Monate weiternutzt (Integritätsinteresse). Ohne Bedingung ist die Aussage unvollständig und kann irreführen. | Text ergänzen: „… zulässig, wenn der Geschädigte das Fahrzeug weiter nutzt (Integritätsinteresse)." |
| [Minor] | ToV | `page.tsx` Z. 211 — `BghAuthorityGrid`-Aufruf, `subline`-Prop: „Egal ob Sie den Gutachter über die Karte buchen oder direkt anrufen — alle Partner-SVs arbeiten BGH-konform." | Interne Abkürzung „SVs" (statt „Sachverständigen") in einer Satz-Prosa auf der öffentlichen Seite; passt nicht zum faktengetriebenen ToV. | „… alle Partner-Sachverständigen arbeiten BGH-konform." |
| [Minor] | ToV | `GutachterFinderMapClient.tsx` Z. 141 — Popup-HTML: `zertifiziert · BVSK` | „BVSK" als alleiniges Zertifizierungsmerkmal kann irreführen: DAT-Zertifizierung ist das primäre Kriterium laut Kanon. BVSK ist eine Mitgliedschaft, keine Zertifizierung. | „zertifiziert (DAT · BVSK)" oder genauer: „DAT-zertifiziert · BVSK-Mitglied" |
| [Minor] | Tone-of-Voice | `page.tsx` FAQ Z. 87 — „… Dispatch koordiniert den nächstgelegenen freien SV **in unter 15 Minuten**." | Interne Terminologie „Dispatch" ist für Endkunden unverständlich. | „Unser Team koordiniert den nächstgelegenen freien Sachverständigen in unter 15 Minuten." |

---

## /gutachter-partner

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| [Critical] | Fakten/Zahlen | `page.tsx` Z. 76 — JSON-LD `serviceSchema` description: **„Über 89 DAT-Experten bundesweit"** | Zahl „89" steht im maschinenlesbaren Structured-Data-Block, wird von KI-Crawlern als Fakt indiziert. Der Kanon nennt „hunderte zertifizierte Sachverständige". Fallback-Wert in `getWartelisteAnzahl()` (Z. 57–61) ist `62` (Warteliste 13.05.2026). Weder 89 noch 62 entspricht dem Kanon-Claim „hunderte". Zudem ist die Warteliste ≠ aktives Netzwerk. | Den hardgecodeten „89"-String aus dem JSON-LD entfernen oder durch eine dynamische und kanon-konforme Formulierung ersetzen: z. B. `Über ${warteliste} Sachverständige auf der Warteliste — bundesweit aktives Netzwerk.` Die „hunderte"-Aussage nur dort verwenden, wo sie tatsächlich belegt ist. |
| [Critical] | Fakten/Zahlen | `PartnerContent.tsx` Z. 158–159 — Warteliste-Framing: **„Stand 13.05.2026"** (hardcoded Datum) | Das Stand-Datum ist fast zwei Wochen vor dem aktuellen Audit-Datum (27.05.2026) und wird nie aktualisiert. Für Besucher ist unklar, ob die Zahl noch aktuell ist; für KI-Crawler wirkt der Text als veralteter Fakt. | Entweder dynamisch aus DB rendern oder Stand-Datum entfernen und durch allgemein gehaltene Prosa ersetzen. |
| [Important] | Tone-of-Voice (Adressat) | `GutachterPartnerClient.tsx` Z. 202 — Erfolgs-Screen: **„Du stehst auf der Liste."** | Konsistent mit dem Du-Anredekonzept dieser B2B-Seite (Sachverständige = Du). Kein Fehler an sich, aber die Prosa **wechselt im selben Screen** zwischen Du und dritter Person: „Sobald **deine** Region verfügbar ist, melden **wir** uns persönlich." — Das ist korrekt und konsistent. **Kein Finding.** | — |
| [Important] | Tone-of-Voice (Adressat) | `GutachterPartnerClient.tsx` Z. 219 — Hero-H1: **„Werde Claimondo-Partner in deiner Region"** vs. `layout.tsx` Z. 7 — Metadata title: **„Gutachter werden — Claimondo Partner-Netzwerk"** vs. `page.tsx` Z. 14 — Metadata title: **„Als Kfz-Sachverständiger Partner werden — Warteliste"** | Drei unterschiedliche Formulierungen für denselben Seiteninhalt in Metadata (zwei Ebenen: layout + page — page überschreibt layout) und im H1. **Layout-Metadata wird von Page-Metadata überschrieben** (Next.js Verhalten), also kein technisches Problem. Aber die `layout.tsx`-Description enthält noch „führenden KFZ-Gutachter-Netzwerks" — das ist eine nicht belegte Superlativ-Aussage (Kanon: „bundesweit größte digitale Plattform für Kfz-Haftpflichtschäden", nicht „führendes Gutachter-Netzwerk"). | Layout-Metadata bereinigen oder entfernen, da sie durch Page-Metadata überschrieben wird. `layout.tsx` description „führenden KFZ-Gutachter-Netzwerks" durch kanon-konforme Formulierung ersetzen. |
| [Important] | Fakten/Zahlen | `layout.tsx` Z. 8–9 — Description: **„Werden Sie Teil des führenden KFZ-Gutachter-Netzwerks Deutschlands."** | Superlativ „führenden … Deutschlands" ist nicht im Kanon belegt. Kanon-Claim gilt für „vollständige Regulierung von Kfz-Haftpflichtschäden" — nicht für ein Gutachter-Netzwerk-Ranking. | „Werden Sie Teil des Claimondo Sachverständigen-Netzwerks — bundesweit aktiv." |
| [Important] | ToV | `layout.tsx` Z. 11 — OG-description: **„Mehr Aufträge. Weniger Verwaltung. Volle Kontrolle."** | Drei aufeinanderfolgende Ein-Wort-Satz-Fragmente. Nicht falsch, aber auf dem Niveau eines Werbe-Slogans ohne Substanz. ToV-Guide sagt: „Fakten/Zahlen/Daten Pflicht", keine Floskeln. | „Aufträge aus der Plattform, kein Akquise-Aufwand — transparent abgerechnet nach BVSK-Honorartabelle." |
| [Minor] | Rechtschreibung/Grammatik | `PartnerContent.tsx` Z. 83 — Sektion 1: **„Claimondo ist ein Schadensregulierungs-Plattform"** | Grammatikfehler: Artikel falsch. „Plattform" ist feminin → „**eine** Schadensregulierungs-Plattform". | „Claimondo ist **eine** Schadensregulierungs-Plattform …" |
| [Minor] | Fakten/Zahlen | `PartnerContent.tsx` Z. 63 — Schritt 3 Region-Freischaltung: **„≥ 8 Aufträge / Monat"** als Schwellenwert | Interne Kennzahl, die öffentlich kommuniziert wird. Nicht im Kanon aufgeführt. Kein Fehler per se, aber wenn sich der Schwellenwert ändert, entsteht eine interne Inkonsistenz (selbe Zahl auch im FAQ Z. 162: „≥ 8 Aufträge / Monat"). Beide Stellen stimmen überein — **kein Widerspruch**, aber als Fakt markiert. | Wenn Schwellenwert sich ändert, beide Stellen synchron aktualisieren. |

---

## /beratung-anfragen

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| keine Findings | — | — | Seite ist klar, faktengetrieben, korrekte §249-BGB-Vorbehalt-Formulierung, ToV konsistent (Sie-Anrede), Umlaute korrekt, Zahlen belegt (< 15 Min, 0 €). | — |

---

## /e-auto-gutachter

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/Az. | `page.tsx` Z. 67 + Z. 150 — FAQ + Antwort-Block: **„BGH VI ZR 67/06"** als Beleg für „SV-Kosten trägt gegnerischer Haftpflichtversicherer" | `VI ZR 67/06` ist **nicht** im Kanon. Der Kanon-Az.-Set lautet: `VI ZR 38/22 ff.` (Werkstattrisiko), `VI ZR 65/18` (UPE), `VI ZR 357/03` (Wertminderung). Der BGH-Beschluss, der SV-Honorar als eigenständige Schadensposition begründet, ist üblicherweise **VI ZR 67/06** (Urt. v. 23.01.2007) — das Aktenzeichen selbst ist sachlich korrekt und weitläufig zitiert, aber es fehlt im Kanon. Drei Seiten (`/e-auto-gutachter`, `/lkw-gutachter`, `/motorrad-gutachter`) nutzen es übereinstimmend, was für bewusste Wahl spricht. | Az. `VI ZR 67/06` gegen juris.bundesgerichtshof.de verifizieren und in Kanon aufnehmen. Wenn korrekt, kein Änderungsbedarf an den Seiten. |
| [Minor] | Fakten/Az. | `page.tsx` Z. 67 — FAQ „Wer zahlt den E-Auto-Gutachter?": **„(§ 249 BGB, BGH VI ZR 67/06)"** — Klammer-Kombination vermengt Norm + Az. | Stilistisch uneinheitlich: andere Seiten schreiben entweder `§ 249 BGB` oder `BGH VI ZR …` separat. Hier stehen beide in einer Klammer, was leicht verwirrend ist. | „… bei unverschuldetem Unfall trägt die Kosten der gegnerische Haftpflichtversicherer nach §249 BGB (BGH VI ZR 67/06)." — Komma vor BGH. |

---

## /lkw-gutachter

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/Az. | `page.tsx` Z. 61 + Z. 148 — FAQ + Antwort-Block: **„BGH VI ZR 67/06"** | Identisches Finding wie bei `/e-auto-gutachter`. Az. im Kanon nicht gelistet; sachlich plausibel. | Kanon-Aufnahme nach Verifikation. |
| keine weiteren Findings | — | — | Fakten korrekt, ToV konsistent (Sie), Umlaute korrekt, Vergleichstabelle sachlich. | — |

---

## /motorrad-gutachter

| Severity | Brille | Fundstelle | Befund | Vorschlag |
|---|---|---|---|---|
| [Important] | Fakten/Az. | `page.tsx` Z. 78 + Z. 159 — FAQ + Antwort-Block: **„BGH VI ZR 67/06"** | Identisches Finding wie bei `/e-auto-gutachter`. | Kanon-Aufnahme nach Verifikation. |
| [Minor] | Fakten | `page.tsx` Z. 68 — FAQ „Brauche ich … ein eigenes Gutachten?": **„Bagatellgrenze von etwa 750 €"** | Der Betrag „750 €" ist nicht im Kanon explizit hinterlegt. In der Rechtsprechung ist die Bagatellgrenze für ein Gutachten allgemein anerkannt (Teils 750 €, teils differierend nach Schaden-Art). Keine falsche Zahl, aber nicht kanon-verifiziert. Gutachter-Finden-FAQ (page.tsx Z. 82) nennt denselben Wert „Schaden über 750 €" — **beide Stellen konsistent**. | Intern verifizieren und ggf. in Kanon aufnehmen. |
| keine weiteren Findings | — | — | Seite inhaltlich korrekt, ToV konsistent (Sie), Umlaute korrekt, Schutzkleidungs-Positionen sachlich zutreffend. | — |

---

## Extrahierte Fakten/Zahlen/Claims

| Seite | Wert | Quelle im Code |
|---|---|---|
| `/gutachter-finden` | „< 48 h bis zum Termin vor Ort" | KPIS-Array `page.tsx` Z. 58 |
| `/gutachter-finden` | „0 € nach §249 BGB" | KPIS-Array `page.tsx` Z. 59 |
| `/gutachter-finden` | „30–40 % Versicherer-Kürzung zurückgeholt" | KPIS-Array `page.tsx` Z. 60 |
| `/gutachter-finden` | Methodikfußnote: Quelle NDR 2022 + Verbraucherzentrale + BGH VI ZR 38/22 ff. / 65/18 / 174/24 | `page.tsx` Z. 65–66 |
| `/gutachter-finden` | „in unter 15 Minuten" (Dispatch-Versprechen) | `page.tsx` Z. 87 + Z. 256 |
| `/gutachter-finden` | Popup: „zertifiziert · BVSK" | `GutachterFinderMapClient.tsx` Z. 141 |
| `/gutachter-partner` | „Über 89 DAT-Experten bundesweit" | `page.tsx` JSON-LD Z. 76 |
| `/gutachter-partner` | Fallback Warteliste: 62 (Stand 13.05.2026) | `page.tsx` Z. 57–61 |
| `/gutachter-partner` | Onboarding-Dauer: 7–14 Werktage | `PartnerContent.tsx` Z. 24, Z. 131 |
| `/gutachter-partner` | Mindest-Auftragsvolumen für Freischaltung: ≥ 8 / Monat | `PartnerContent.tsx` Z. 63, Z. 162 |
| `/gutachter-partner` | Berufshaftpflicht-Mindestdeckung: mind. 2 Mio. € | `PartnerContent.tsx` Z. 138 |
| `/gutachter-partner` | Zahlungsziel: 14 Tage nach Gutachten-Eingang | `PartnerContent.tsx` FAQ Z. 35 |
| `/beratung-anfragen` | Antwortzeit: < 15 Min (Werktag) | `page.tsx` Z. 55, Z. 69 |
| `/beratung-anfragen` | Öffnungszeiten: Mo–Fr 8–18 Uhr | `page.tsx` Z. 48 |
| `/e-auto-gutachter` | BGH VI ZR 67/06 (SV-Kosten) | `page.tsx` Z. 67, Z. 150 |
| `/e-auto-gutachter` | BGH VI ZR 357/03 (Wertminderung) | `page.tsx` Z. 72 |
| `/lkw-gutachter` | BGH VI ZR 67/06 (SV-Kosten) | `page.tsx` Z. 61, Z. 148 |
| `/motorrad-gutachter` | BGH VI ZR 67/06 (SV-Kosten) | `page.tsx` Z. 78, Z. 159 |
| `/motorrad-gutachter` | BGH VI ZR 357/03 (Wertminderung) | `page.tsx` Z. 68 |
| `/motorrad-gutachter` | Bagatellgrenze: ca. 750 € | `page.tsx` Z. 68 |
| `BghAuthorityGrid` (auf `/gutachter-finden`) | BGH VI ZR 67/91 (130%-Regel) | `BghAuthorityGrid.tsx` Z. 16 |
| `BghAuthorityGrid` | BGH VI ZR 53/09 (Markenwerkstatt) | Z. 13 |
| `BghAuthorityGrid` | BGH VI ZR 119/04 (Restwert regional) | Z. 14 |
| `BghAuthorityGrid` | BGH VI ZR 280/22 (SV-Honorar-Risiko) | Z. 17 |
