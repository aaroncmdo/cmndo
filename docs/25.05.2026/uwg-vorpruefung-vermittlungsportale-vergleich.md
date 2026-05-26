# UWG-§6-Vorprüfung — Vergleichs-Page `/kfz-gutachter/vermittlungsportale-vergleich`

**Ticket:** AAR-938 (GEO-Sprint **Tag 8**) · **Erstellt:** 26.05.2026 (Arbeitstag) · co-located mit den Sprint-Artefakten in `docs/25.05.2026/`
**Branch:** `kitta/aar-938-geo-sprint-vergleich-wissen` (Origin-HEAD `b281454b`)
**Geprüfte Datei:** `src/app/kfz-gutachter/vermittlungsportale-vergleich/page.tsx`
**Belege:** [`docs/25.05.2026/vergleich-belege/`](./vergleich-belege/) — [`faktencheck-vergleichstabelle.md`](./vergleich-belege/faktencheck-vergleichstabelle.md) + 8 datierte Screenshots (alle in diesem Audit visuell ausgewertet)
**Vorgänger:** [`handoff-aar938-geo-sprint-tag2-5.md`](./handoff-aar938-geo-sprint-tag2-5.md) (Tag 8 = offener Punkt)

---

## TL;DR — Verdikt

**Engineering-seitig publish-fähig, mit 1 Pflicht-Fix vor Veröffentlichung + 5 Empfehlungen. Finale anwaltliche Freigabe bleibt menschliche Aufgabe (NICHT durch diesen Audit ersetzt).**

- ✅ **Alle 10 Tabellen-Zeilen × 4 Spalten** stimmen 1:1 mit dem verifizierten Faktencheck überein — keine Zelle widerspricht den Belegen. Alle 5 Plan-Korrekturen des Faktenchecks (DACH→bundesweit, kein „60-Min", Neo „rund um die Uhr" statt „2 Std", Giganten „Über 250"/329, Giganten-Anwalt „ja") sind in der Page umgesetzt.
- ✅ **UWG-Hygiene-Mechanik vorhanden:** Stand-Disclaimer (25.05.2026), Quellenangabe, Konkurrenz-Domains `rel="nofollow"`, konservative Sprache, jede Wettbewerber-Angabe attribuiert.
- ⚠️ **1 Pflicht-Fix:** „Webwiki 3,7" (Unfallpaten, Zeile Trustpilot) ist eine **stale, nicht frisch verifizierte** Fremdbewertungs-Zahl (Stand 10.05., am 25.05. NICHT erneut abgerufen). → Vor Publish entweder frisch belegen oder die Zahl streichen (nur „kein Trustpilot-Profil" lassen).
- 🔎 **5 Empfehlungen** (Trustpilot-Dezimalwerte manuell bestätigen, §-Zitat prüfen, „einzige"-Alleinstellung dokumentieren, „Premium Member" belegen, FAQ-Wording zu Neogutachter glätten) — Details unten.

---

## Prüfmethodik

UWG-§6-Vorprüfung = jede **vergleichende** Aussage über einen Wettbewerber muss objektiv, nachprüfbar und belegt sein. Geprüft wurde:

1. **Tabellen-Zellen** (10 Kriterien × Claimondo/Neogutachter/Unfallpaten/Unfallgiganten) → 1:1 gegen `faktencheck-vergleichstabelle.md` UND gegen die archivierten Screenshots (nicht nur gegen die Transkription).
2. **Prosa-Vergleichsaussagen** (Hero, Einordnungs-Box, Entscheidungshilfe, Fazit, FAQ) — alle Stellen, die einen Wettbewerber benennen oder ein Alleinstellungsmerkmal behaupten.
3. **Eigen-Aussagen (§5 UWG, Irreführung über sich selbst)** — Claimondo-Claims, die operativ wahr sein müssen.
4. **Rechtszitate** (BGB-§§, BGH-/LG-Aktenzeichen).
5. **Engineering-Hygiene** (Disclaimer, `nofollow`, Quellen-Attribution, Zeitvariabilität).

**Screenshot-Auswertung (alle 8 visuell geöffnet, 26.05.):** Befund je Beleg in der Matrix unten. Legende: ✓ = im Screenshot wörtlich/eindeutig sichtbar · ◐ = teils sichtbar / Rest aus Faktencheck-Textextraktion · ▢ = nur Faktencheck-Textextraktion (im archivierten Screenshot nicht sichtbar, z. B. weil Cookie-Banner überlagert oder anderer Seitenabschnitt).

---

## §6 Abs. 2 UWG — Subsumtion (Kurz-Assessment)

| Unlauterkeits-Tatbestand §6 II UWG | Befund auf der Page |
|---|---|
| Nr. 1 — Vergleich nicht für gleichen Bedarf/Zweck | **Unkritisch.** Alle vier sind Kfz-Gutachter-Vermittlungsplattformen für denselben Adressaten (unverschuldet Geschädigte). Gleicher Bedarf. |
| Nr. 2 — nicht objektiv auf wesentliche, relevante, **nachprüfbare**, typische Eigenschaften | **Im Kern erfüllt** (Erreichbarkeit, Kosten, Netz, Anwalt, Servicegebiet je mit Quelle). **Schwachstelle = Nachprüfbarkeit** bei stale/unscharfen Zellen → siehe Befund F1 (Webwiki) + F2 (Trustpilot-Dezimalwerte). |
| Nr. 3 — Verwechslungsgefahr | **Unkritisch.** Eigenständige Markennamen, klar zugeordnete Spalten, keine Logo-Imitation. |
| Nr. 4 — Herabsetzung/Verunglimpfung | **Unkritisch, aber Tonalität beobachten.** Framing „Verzeichnis vs. gemanagtes Netz" ist sachlich. Grenznächste Stellen: „329 = Verzeichnis-Einträge, keine gemanagten Fälle" und FAQ „Neogutachter … endet im Wesentlichen mit dieser Vermittlung" → F5/F6, bleiben aber Tatsachen-/Modellbeschreibung, keine pauschale Abwertung. |
| Nr. 5 — unlautere Rufausnutzung | **Unkritisch.** Keine Anlehnung an fremden Ruf zum eigenen Vorteil. |
| Nr. 6 — Darstellung als Imitation | **Nicht einschlägig.** |

Zusätzlich **§5 UWG (Irreführung)** für die Eigen-Aussagen → siehe Abschnitt „Eigen-Claims".

---

## Cell-by-Cell — Tabelle (page.tsx `ROWS`) vs. Belege

| # | Kriterium | Spalte | Aussage auf der Page | Beleg | Screenshot | Verdikt |
|---|---|---|---|---|---|---|
| 1 | Geschäftsmodell | Neo | „Gutachter-Vermittlung (Online-Anfrage → passender SV)" | FC | ◐ (Modell aus Home + FC) | ✅ |
| 1 | | Paten | „Schadenabwicklung ‚aus einer Hand'" | FC + Home | ✓ „Schadensabwicklung aus einer Hand" | ✅ |
| 1 | | Giganten | „Verzeichnis mit Umkreis-Suche (SV/Werkstatt/Anwalt/Abschleppdienst) + Profil-Listings" | FC + Home/kfz-gutachter | ✓ Umkreis-Suche, Kategorien (KFZ-Gutachter/Abschleppdienst sichtbar), Map | ✅ |
| 2 | Erreichbarkeit | Neo | „rund um die Uhr", „in 30 Sekunden"; Tel. 0160/4873888 | FC + Home | ✓ „rund um die Uhr und deutschlandweit" + „In 30 Sekunden" · ▢ Tel.-Nr. (nur FC-Text) | ✅ (Tel.-Nr. nicht im Screenshot) |
| 2 | | Paten | „24h Soforthilfe", Hotline 0800 505 50 50 | FC + Home | ✓ „24h … Soforthilfe" + „0800 505 50 50" (Button) | ✅ |
| 2 | | Giganten | „Sofort-Vermittlung" + Umkreis-Suche (25–300 km) | FC + Home/kfz-gutachter | ✓ Umkreis-Suche + Distanz-Dropdown · ◐ „Sofort-Vermittlung" (FC-Text) | ✅ |
| 3 | SV-Netz | Claimondo | „Live aus unserem Netz: {svNetz} … identisch zu /gutachter-finden" | Repo (live, nicht hardcoded) | — | ✅ live-gerendert (Smoke zeigte 67; FC nannte 69 — Drift gewollt, daher live) |
| 3 | | Neo | „nicht öffentlich beziffert" | FC | ▢ (Negativ-Befund) | ✅ |
| 3 | | Paten | „bundesweites Netzwerk" (keine Zahl) | FC + Home | ◐ | ✅ |
| 3 | | Giganten | „Über 250 geprüfte" (Such-Counter 329; kostenpflichtige Premium-Listings) | FC + kfz-gutachter | ✓ **„329 … gefunden"** + „Über 2[50]" (teils hinter Cookie-Banner) · ▢ „Premium"-Listing | ✅ (Premium → F4) |
| 4 | Vor-Ort | Neo | „Standard" | FC („Vor Ort Schadensaufnahme", Schritt 3) | ▢ | ✅ |
| 4 | | Paten | „direkt vor Ort" | FC + Home | ✓ „direkt vor Ort" | ✅ |
| 4 | | Giganten | „vermittelt Vor-Ort-Sachverständige" | FC (Modell-Inferenz) | ◐ | ✅ |
| 5 | Online-only | Neo | „nein" | FC | ▢ | ✅ |
| 5 | | Paten/Giganten | „nein" | FC („nicht beworben") | ▢ | ✅* (*Basis = „nicht beworben", nicht positiv bestätigte Abwesenheit — unkritisch, da keine herabsetzende Aussage) |
| 6 | Anwalt | Neo | „ja (Gutachter + Anwalt)" | FC (Trustpilot-Reviews) | ▢ | ✅ (Basis = Review-Text; positive Aussage über Wettbewerber → geringes Risiko; vgl. F6) |
| 6 | | Paten | „ja — ‚fachkundiger Rechtsbeistand'" | FC | ▢ | ✅ |
| 6 | | Giganten | „ja — Rechtsanwalt als Partnerkategorie" | FC + Home (Kategorien) | ◐ Kategorie-Logik sichtbar | ✅ |
| 7 | Kosten | Neo | „unverbindlich & kostenlos" | FC + Home | ✓ „Unverbindlich & kostenlos" | ✅ |
| 7 | | Paten | „0 € (haftende Versicherung zahlt)" | FC (Zitat) | ▢ | ✅ |
| 7 | | Giganten | „Kostenlos für Geschädigte" | FC | ◐ | ✅ |
| 8 | Whitelabel | Claimondo | „ja (einzige der vier)" | FC + AGENTS §branding | — | ✅ **stärkste Alleinstellungsbehauptung → F3** (Basis: kein Whitelabel-Angebot auf den 3 Wettbewerber-Sites auffindbar) |
| 8 | | Neo/Paten | „nein" | FC (nicht auffindbar) | ▢ | ✅ |
| 8 | | Giganten | „nein (kostenpflichtige ‚Premium Member'-Listings)" | FC | ▢ | ✅ (Premium → F4) |
| 9 | Trustpilot | Neo | „4,6 · 133 Bewertungen" | FC + TP-Screenshot | ◐ „Bewertungen 13[3]" + Feb-2026-Reviews; exakte 4,6 nicht scharf lesbar (403-Quirk) | ⚠️ → F2 |
| 9 | | Giganten | „4,5 · 14 Bewertungen" | FC + TP-Screenshot | ◐ „14" + „Profil beansprucht"; exakte 4,5 hinter Cookie-Modal | ⚠️ → F2 |
| 9 | | Paten | „kein Profil (extern: Webwiki 3,7)" | FC + TP-Screenshot | ✓ „kein Profil" (404) · ▢ Webwiki 3,7 (stale 10.05, NICHT verifiziert) | ⚠️ **→ F1 (Pflicht-Fix)** |
| 9 | | Claimondo | „kein Profil" | TP-Screenshot | ✓ 404/leeres Profil | ✅ |
| 10 | Servicegebiet | Claimondo | „bundesweit (DE), Schwerpunkt NRW" | FC (korrigiert von „DACH") | — | ✅ |
| 10 | | Neo/Paten/Giganten | „deutschlandweit (DE)" | FC + Home (je „deutschlandweit") | ◐/✓ | ✅ |

**Fazit Tabelle:** keine Zelle widerspricht den Belegen. Verbleibende Schwächen sind **Nachprüfbarkeit/Frische** (F1, F2) bzw. **Belegtiefe** (F4), keine Falschaussagen.

---

## Prosa-Vergleichsaussagen (außerhalb der Tabelle)

| Stelle | Aussage | Bewertung |
|---|---|---|
| Einordnungs-Box (`page.tsx` ~333) | „die Zahl 329 zählt Verzeichnis-Einträge, keine gemanagten Fälle" | Sachlich vertretbar — 329 ist nachweislich ein Verzeichnis-Such-Counter (Screenshot). Kontrast „Verzeichnis vs. gemanagt" ist Modellbeschreibung, keine Herabsetzung. ✅ |
| Entscheidungshilfe (~381) | „Hier liegt Claimondo vorne … Unfallpaten bietet ebenfalls Rechtsbeistand … Neogutachter bindet Anwälte optional ein" | Ausgewogen, nennt Wettbewerber-Stärken. ✅ |
| Entscheidungshilfe (~397) | „Nur Claimondo bietet echtes Whitelabel-Branding" | = Tabellen-Alleinstellung Zeile 8 → **F3**. |
| Fazit (~530) | „Wer nur einen unabhängigen SV sucht, ist bei Neogutachter oder Unfallgiganten richtig …" | Differenzierung nach Modelltiefe, fair. ✅ |
| FAQ #6 (~76) | „Neogutachter … endet im Wesentlichen mit dieser Vermittlung" | **→ F6** — leichte Untertreibung ggü. Tabellen-Zeile 6 (Neo-Anwalt „ja"). |

---

## Eigen-Claims (§5 UWG — müssen operativ wahr sein)

| Claim | Quelle/Basis | Hinweis |
|---|---|---|
| „Reaktion unter 15 Minuten" | Repo-belegt (`page.tsx`, FC Z. 108) | ✅ |
| „telefonisch **rund um die Uhr**" | Aaron-Aussage 25.05. (FC Z. 119), NICHT unabhängig verifiziert | ⚠️ **F7** — muss operativ stimmen (24/7-Telefon tatsächlich besetzt/erreichbar), sonst §5-Eigen-Irreführung. |
| „integrierte feste Partnerkanzlei" | Repo + AGENTS | ✅ |
| „einzige der vier" Whitelabel | Negativ-Recherche der 3 Wettbewerber-Sites | ⚠️ **F3** (Alleinstellung — höchste §6-Sorgfalt). |
| „0 € (§249 BGB, vorbehaltlich Anerkenntnis)" | korrekt gehedged | ✅ |

---

## Rechtszitate

| Zitat | Wo | Bewertung |
|---|---|---|
| LG Bremen **9 O 1720/24**, 16.01.2026, „noch nicht rechtskräftig", Klage Wettbewerbszentrale | Prosa + JSON-LD `citation` | Mit Wettbewerbszentrale-Quelle verlinkt; Detail-Heimat = Wissens-Page. Vor Publish gegen die verlinkte Wettbewerbszentrale-Meldung gegenprüfen (Datum/Az/Rechtskraft). Außerhalb der Wettbewerber-Belege. |
| BGH **VI ZR 67/06** (§249, SV-Kosten) | FAQ + JSON-LD | Etablierte SV-Kosten-Rechtsprechung; plausibel. Legal bestätigen. |
| BGH **VI ZR 65/18**, **VI ZR 174/24** (Kürzungen UPE/Wertminderung) | FAQ #3 | Nicht aus den Belegen verifizierbar → **Legal-Review**. |
| „Sicherungsabtretung (**§164 BGB**)" | FAQ #1 + JSON-LD `citation` | ⚠️ **F8 — wahrscheinlich falsches §-Zitat.** §164 BGB = Stellvertretung (Wirkung der Vertretererklärung). Eine (Sicherungs-)Abtretung ist in **§398 BGB** geregelt. Vor Publish prüfen/korrigieren (an 2 Stellen: FAQ-Text + `articleSchema.citation`). |

---

## Engineering-UWG-Hygiene (Mechanik)

- ✅ **Stand-Disclaimer:** „Stand der vergleichenden Angaben: 25.05.2026" + „Trustpilot-Werte sind zeitvariabel" (Footer der Tabellen-Section).
- ✅ **Quellen-Attribution:** „Alle Wettbewerber-Angaben stammen von den jeweiligen Anbieter-Websites (Stand 25.05.2026)" + benannte Quell-Links.
- ✅ **`rel="nofollow noopener"`** auf neogutachter.de / unfallpaten.de / unfallgiganten.de. (Wettbewerbszentrale-Link ohne `nofollow` — korrekt, neutrale Autoritätsquelle.)
- ✅ **Konservative Sprache:** Anführungszeichen bei Wettbewerber-Zitaten, „vorbehaltlich Anerkenntnis", keine unhaltbaren Minuten-/Superlativ-Versprechen über Wettbewerber.
- ✅ **Belege archiviert** (8 datierte Screenshots + Faktencheck + Probe-Scripts) — Nachweisbarkeit gegeben.

---

## Befunde nach Risiko (Handlungsempfehlung)

| ID | Risiko | Befund | Empfehlung vor Publish |
|---|---|---|---|
| **F1** | **Pflicht** | „Webwiki 3,7" (Unfallpaten) ist stale (10.05.) + am 25.05. NICHT erneut abgerufen → nicht-nachprüfbare Wettbewerber-Bewertung (§6 II Nr. 2). | **Entweder** Webwiki-Score frisch abrufen + datieren, **oder** Zahl streichen — Zelle dann nur „kein Trustpilot-Profil". (Empfehlung: streichen — sauberste Lösung.) |
| **F2** | Mittel | Exakte Trustpilot-**Dezimalwerte** (Neo 4,6 / Giganten 4,5) im Archiv-Screenshot nicht scharf lesbar (Counts 133/14 + aktive Profile sind belegt). | 2× Browser-Recheck (de.trustpilot.com), frischen Screenshot mit lesbarem Score ablegen; bei Abweichung Zelle aktualisieren. |
| **F8** | Mittel | „Sicherungsabtretung (§164 BGB)" — §164 ist Stellvertretung; korrekt wohl **§398 BGB**. | Legal prüfen + an beiden Stellen korrigieren (FAQ-Text + JSON-LD `citation`). |
| **F3** | Mittel | Alleinstellung „einzige der vier" / „Nur Claimondo … Whitelabel" — stärkste §6-Behauptung, Basis = Negativ-Recherche. | Negativ-Recherche-Basis dokumentieren (3 Sites geprüft, kein Whitelabel-Angebot) — ist in FC; Legal soll Alleinstellung freigeben. Fallback-Formulierung „als einzige der vier **uns bekannten**" erwägen. |
| **F4** | Niedrig | „Premium Member"/„kostenpflichtige Profil-Listings" (Giganten) nur aus FC-Textextraktion, im Archiv-Screenshot nicht sichtbar. | Screenshot der Premium-/„Jetzt mitmachen"-Seite nachziehen **oder** auf „Profil-Listings" abschwächen. |
| **F6** | Niedrig | FAQ #6 „Neogutachter … endet im Wesentlichen mit dieser Vermittlung" untertreibt ggü. eigener Tabellen-Zeile (Neo-Anwalt „ja"). | Glätten, z. B. „… liegt der Schwerpunkt auf der Vermittlung" — vermeidet §6-Nr.4-Angriffsfläche + interne Inkonsistenz. |
| **F7** | Niedrig | „telefonisch rund um die Uhr" = Eigen-Aussage (Aaron), operativ zu bestätigen. | Bestätigen, dass 24/7-Telefon real erreichbar ist (sonst §5). |

---

## Ausdrücklich NICHT Gegenstand dieses Audits

- **Finale anwaltliche Freigabe** der vergleichenden Werbung — bleibt menschliche Aufgabe (Plan §„Rechtliche Absicherung"). Dieser Audit ist die Engineering-/Faktentreue-Vorprüfung, keine Rechtsberatung.
- **Tag 12 (PR + Indexing)** — bewusst NICHT ausgelöst. Merge-Watcher würde einen grünen Nicht-Draft-staging-PR autonom mergen → PR erst nach F1-Fix **und** anwaltlicher Freigabe öffnen.

---

## Reproduktion / Datenbasis

- Cell-Quelle: `src/app/kfz-gutachter/vermittlungsportale-vergleich/page.tsx` (`ROWS`, FAQ, Prosa) @ `b281454b`.
- Belege: `docs/25.05.2026/vergleich-belege/` (8 PNG, alle 130–869 KB, am 26.05. visuell ausgewertet) + `faktencheck-vergleichstabelle.md`.
- Wettbewerber-/Trustpilot-Abruf reproduzierbar via `scripts/probe-vergleich-belege.cjs`; SV-Netz-Zahl via `scripts/probe-sv-netz-count.cjs`.
