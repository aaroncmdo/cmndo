# Claimondo Text-Audit — Master-Befund (2026-05-27)

**Scope:** Public-Marketing-Seiten (keine Portale, keine Rechtstexte). **Brillen:** Rechtschreibung/Umlaute · Tone-of-Voice · Fakten/Zahlen · Cross-Page-Wording.
**Methodik:** 7 parallele Audit-Subagents je Seiten-Cluster + zentrale Cross-Page-Konsolidierung gegen die Kanon-Fakten (`src/lib/seo/brand-fakten-library.ts`, `service-pitch.ts`, Brand-Identity).
**Cluster-Detaildateien:** `cluster-A-hauptseite.md` … `cluster-G-kfz-gutachter-subtree.md` (selbes Verzeichnis) — dort jede Fundstelle mit Datei+String+Vorschlag.

> **Kernbotschaft:** Keine Umlaut-Fehler, ToV grundsätzlich solide, BGH-Az. überwiegend korrekt. Das eigentliche Problem ist **Zahlen-/Claim-Drift über Seiten hinweg** — dieselbe Aussage hat je nach Seite unterschiedliche Werte. Diese systemischen Punkte (Abschnitt A) brauchen je EINE Kanon-Entscheidung von dir, danach einen Sweep. Die Recht/Az.-Punkte (Abschnitt B) brauchen juristische Verifikation, nicht unilaterales Fixen.

---

## A. SYSTEMISCHE CROSS-PAGE-INKONSISTENZEN — brauchen je 1 Kanon-Entscheid, dann Sweep

### A1 · Form-/Melde-Dauer: **30 Sekunden vs 60 Sekunden vs 5 Minuten** (dreifach!)
Dieselbe Handlung („Schaden melden") mit drei verschiedenen Dauern:
- **„30 Sekunden":** `schaden-melden/page.tsx:25`, `kfz-gutachter/[stadt]/StadtLeadFormClient.tsx:60`, `kfzgutachter-lp/LeadFormClient.tsx:113`
- **„60 Sekunden":** `faq/FaqClient.tsx:78`, `kfz-gutachter/[stadt]/page.tsx:659`, `llms-full.txt/route.ts:259`
- **„5 Minuten":** `vorteile/page.tsx:114`, `wie-es-funktioniert/page.tsx:57`, `kfz-gutachter/[stadt]/page.tsx:696`
- **Empfehlung:** Zwei *verschiedene* Claims sauber trennen: **„Lead-Formular (3 Felder) in ~30 Sekunden"** vs **„kompletter Meldevorgang inkl. Fotos in ~5 Minuten"**. „60 Sekunden" eliminieren. Dann Sweep.

### A2 · Rückruf-Zeit: **„in 5 Min" vs „unter 15 Minuten"**
- **„Rückruf in 5 Min(uten)" (Outlier):** `kfz-gutachter/[stadt]/page.tsx:286`, `kfz-gutachter/[stadt]/StadtLeadFormClient.tsx:56`, `HomeLeadFormClient.tsx:98`, `HauptseitePremium.tsx:273`, `llms-full.txt/route.ts:216`
- **„(Erster) Rückruf unter 15 Minuten" (dominant, ~42 Stellen nennen „15 Min"):** KPI-Strip, Success-State, StickyCallBar, `vorteile/page.tsx:114`, `llms-full.txt:329`
- **Empfehlung:** Kanon = **„unter 15 Minuten"** (häufigste + im Service-Pitch). Die ~5 „5-Min"-Outlier angleichen. (Falls bewusst „5 Min" gewollt → umgekehrt; aber EINE Zahl.)

### A3 · Auszahlungs-Dauer: **„Ø 32 Tage" vs „6–8 Wochen"** (Widerspruch, ~4,6 Wo ≠ 6–8 Wo)
- **„Ø 32 Tage":** `kfz-gutachter/[stadt]/page.tsx:53` (KPI „Ø bis zur Auszahlung")
- **„6–8 Wochen":** `kfz-gutachter/ablauf/page.tsx` (mehrfach: 16/32/62/72/105/140/148), `kfz-gutachter/page.tsx:228`, `faq/faqs.ts:138`, `ueber-uns/page.tsx:97`
- **Zusatz-Bug:** `faq/faqs.ts:138` nennt im selben Absatz BEIDES — „4–8 Wochen" UND „6–8 Wochen".
- **Empfehlung:** Dringend EINE Kanon-Zahl festlegen (32 Tage ist marketing-stärker, 6–8 Wochen ist konservativ/realistisch). Danach projektweiter Sweep — das ist der auffälligste Widerspruch im Audit.

### A4 · du/Sie — ZWEI Stimm-Regime kollidieren (verifiziert; größter ToV-Befund)
Es gibt im Public-Marketing **zwei Anrede-Regime**, die an einer Stelle kollidieren:
- **du-Regime:** der **gesamte `/haftpflicht/*`-Ratgeber-Korpus** = **57 Markdown-Dateien** in `src/content/claimondo/haftpflicht/*.md`, durchgängig „du/dein/dir" (Stichprobe: `4-wochen-frist.md` du=14/Sie=3) — **+** die geteilte CTA-Komponente `src/components/content/SpokeCtaBand.tsx` (Default-Headline „Unverschuldeter Unfall? **Hol dir, was dir zusteht**.") **+** `schadensreport-2026`-CTA (Z. 578/591).
- **Sie-Regime:** der Rest der Marketing-Seiten (Hauptseite, vorteile, faq, kfz-haftpflicht-schaden, e-auto/lkw/motorrad-gutachter, kosten, decoder, ratgeber-Hub …).
- **Kollision:** Sie-Seiten (z.B. `kfz-haftpflicht-schaden`, `e-auto-gutachter`, `kosten-kfz-gutachten`, `unfallskizze`, `ratgeber`) binden die **du**-`SpokeCtaBand` ein → sichtbarer Bruch am Seitenende. Auf den `/haftpflicht/[slug]`-Spokes ist es konsistent (Body du + CTA du).
- **Entscheidung nötig (strategisch, NICHT von mir):** Ist der du-Ratgeber-Korpus **bewusst** (eigene SEO-/Zielgruppe)? Dann: `SpokeCtaBand` **kontext-abhängig** machen (du auf du-Spokes, Sie-Override auf Sie-Seiten — die Headline ist bereits ein Prop) → kleiner, chirurgischer Fix. Falls alles **Sie** sein soll: 57 MD-Dateien + SpokeCtaBand-Default auf Sie umschreiben → großer Sweep. **Bitte Regime festlegen.**

### A5 · „Gutachten in 48 Stunden" vs „Termin <48h / Gutachten in 5 Werktagen"
`ueber-uns/page.tsx` (Werte-Karte) sagt **„Gutachten in 48 Stunden"** — Kanon ist aber: **Termin vor Ort** in <48 h, **Gutachten/Bericht** in ~5 Werktagen (so auf den meisten anderen Seiten). Begriffs-Konflation. → „Termin in 48 Stunden, Gutachten in 5 Werktagen".

### A6 · Bagatellgrenze dreifach: **750 € / 1.000 € / 715,81 €**
LP (`750 €`), Köln-FAQ (`1.000 €`), Düsseldorf-FAQ (`715,81 €`). → Eine Variante (juristisch ist die Bagatellgrenze ~750 € / Einzelfall) festlegen + vereinheitlichen.

---

## B. FAKTEN / BGH-AKTENZEICHEN — juristische Verifikation nötig (NICHT unilateral fixen)

| # | Befund | Fundstelle | Kanon/Hinweis |
|---|---|---|---|
| B1 | `VI ZR 53/09` als Beleg für „freie Werkstatt-/Gutachterwahl" | `HauptseitePremium.tsx:87`, `kfz-haftpflicht-schaden:395` | Per Kanon ist 53/09 = günstigste Reparaturart / Markenwerkstatt-Stundensätze (F3/F7/F30). Freie Werkstattwahl = **VI ZR 65/18** (F32). Verifizieren + vermutlich auf 65/18 korrigieren. **Recurring (2 Seiten).** |
| B2 | 130%-Regel mit `VI ZR 70/04` belegt | `kfz-haftpflicht-schaden:350,394` | Kanon + alle anderen Seiten (Hauptseite, BghAuthorityGrid, Stadt-Template) = **VI ZR 67/91** (F33). 70/04 ist Folgeurteil. Auf 67/91 angleichen. |
| B3 | `VI ZR 67/06` (SV-Kosten) | `e-auto`/`lkw`/`motorrad-gutachter` (je 2×) | Sachlich plausibel (F8 listet 67/06), aber gegen juris verifizieren + ggf. in Kanon aufnehmen. |
| B4 | `VI ZR 119/04` als Beleg für 750-€-Bagatellgrenze | `kfzgutachter-lp/page.tsx:356` | 119/04 = Restwert-Wahlrecht/regionaler Markt (F34/F35), NICHT Bagatellgrenze. Az. streichen → „nach aktueller Rechtsprechung". |
| B5 | Hinterbliebenengeld „5.000–15.000 €" | `ratgeber/page.tsx` | `brand-fakten-library.ts` F44 = „10.000–15.000 €". Unterwert weicht ab (5k könnte mit HWS-Schmerzensgeld F43 verwechselt sein). Einen Wert wählen. |
| B6 | Wertminderungs-Methoden uneinheitlich benannt (Cluster G) | `kfz-gutachter/wertminderung/page.tsx:57` („Sanden/Danner-Formel") vs `content/claimondo/haftpflicht/wertminderung.md` (Ruhkopf-Sahm, Halbgewachs-Höning, MFM, Berens-Hettberg-Strunk) | F-Library F10/F11 = Sanden/Danner + MFM. Drei verschiedene Methoden-Sets auf derselben Domain → Terminologie vereinheitlichen. |

---

## C. UNBELEGTE / HARDCODED ZAHLEN + UWG-Risiken

| # | Befund | Fundstelle | Empfehlung |
|---|---|---|---|
| C1 | „72 deutsche Großstädte" — nur hier, nicht in `brand-constants.ts` belegt | `wie-es-funktioniert/page.tsx:115` | Belegen (Quelle/Konstante) ODER durch Kanon „alle 16 Bundesländer / hunderte SV" ersetzen. |
| C2 | „Über 89 DAT-Experten bundesweit" im JSON-LD (KI-Crawler indexieren das als Fakt) | `gutachter-partner/page.tsx:76` | Vs Kanon „hunderte" + DB-Fallback 62. Auf Kanon-Claim umstellen oder dynamisch. |
| C3 | Hardcoded Stand-Datum „13.05.2026" in Warteliste-Prosa | `gutachter-partner/PartnerContent.tsx:158–159` | Dynamisch machen oder Datum entfernen (veraltet sonst still). |
| C4 | BVSK-Untergrenze „550 €" (Trust-Strip) vs „~580 €" (eigene Tabelle) auf derselben Seite | `schadensreport-2026` | Eine Zahl. |
| C5 | „5,0 ★ Google" ohne Basiszahl/Datum | `kfzgutachter-lp` TrustBar | UWG: Bewertungs-Schnitt braucht Anzahl/Stand. Basis ergänzen oder Aussage entschärfen. |

---

## D. KLARE FIXES — sofort machbar, kein Entscheid nötig

- **D1 [Critical] Grammatik:** „ich nehme **meinen** Recht" → „mein Recht" — `faq/faqs.ts:108` (wörtliches Nutzer-Skript, besonders sichtbar).
- D2 ff.: die Outlier aus A1–A3 + die du/Sie-Vereinheitlichung A4 werden zu „klaren Fixes", sobald die jeweilige Kanon-Zahl/-Anrede in A entschieden ist.

---

## E. Cluster-Übersicht (Detail in den Einzeldateien)

| Cluster | Seiten | Findings (grob) | Datei |
|---|---|---|---|
| A | Hauptseite, schaden-melden | Rückruf-5min, 53/09, 60s-vs-30s | `cluster-A-hauptseite.md` |
| B | vorteile, wie-es-funktioniert, ueber-uns, faq | 2 Critical (Grammatik, 72 Städte), 6–8 Wo vs 32 Tage, 48h-vs-5-Werktage | `cluster-B-kern-marketing.md` |
| C | gutachter-finden/-partner, beratung, e-auto/lkw/motorrad | 89 DAT-Experten, hardcoded Datum, VI ZR 67/06 | `cluster-C-gutachter-fahrzeugtypen.md` |
| D | haftpflicht, kfz-haftpflicht-schaden, unverschuldeter…, unfall-was-tun, versicherung-schickt…, gegnerische-vs… | 130% 70/04, 53/09-Label, SpokeCtaBand du/dir | `cluster-D-recht-schaden.md` |
| E | kosten-kfz-gutachten, schadensreport-2026, decoder, ersteinschaetzung, unfallskizze, ratgeber | BVSK 550/580, du/Sie, Hinterbliebenengeld | `cluster-E-kosten-tools-report.md` |
| F | kfzgutachter-lp, kfz-gutachter/[stadt], kfz-gutachter-koeln | 119/04, Rückruf-5min, Kürzungsquote verdreht, 5★, Bagatellgrenze | `cluster-F-lp-stadt.md` |
| G | kfz-gutachter/{hub,ablauf,kosten,online,vergleich,wertminderung}, haftpflicht/[slug] (57 MD-Spokes) | du-Korpus (→A4), 130%-Az 70/04 auch in `reparaturkosten.md` (→B2), Wertminderungs-Methoden-Terminologie (→B6); ablauf nutzt durchgängig „6–8 Wochen" (→A3) | `cluster-G-kfz-gutachter-subtree.md` |

---

## F. Hinweis Kürzungsquote (Important, aus Cluster F)
`kfzgutachter-lp/warum-cards-data.ts:69` formuliert „30–40 % davon holt unsere Partnerkanzlei zurück" — der Kanon-Wert 30–40 % ist die **Kürzungs**quote durch Prüfdienste, nicht die Rückhol-Quote. Die aktuelle Formulierung suggeriert einen stärkeren (ungedeckten) Claim → umformulieren.

---

*Erstellt 2026-05-27. Nächster Schritt: Aaron entscheidet die Kanon-Werte (A1–A6) + ob BGH-Az. (B) juristisch geprüft werden; danach Fix-Sweep (klare Fixes D sofort).*
