# Design-Spec — claimondo.de Home „maximal geil" (Premium-Rework)

**Datum:** 2026-05-31 · **Status:** Design (Review-Gate vor Implementierung) · **Branch:** `kitta/marketing-home-premium-rework`
**Sub-Projekt 1** der Strecke „alle claimondo.de-Seiten maximal geil" (Decomposition siehe §1). Brainstorm-Mockups: Visual-Companion-Session (`.superpowers/brainstorm/…`), Screens `home-anatomie`, `ziel-architektur`, `hero-directions`, `personas`.

---

## 1 · Kontext & Programm-Scope

Ziel: die öffentlichen Marketing-Seiten von claimondo.de auf die **Premium-/Conversion-Bar der `kfzgutachter-lp`** heben (aus deren Hero-Loop das `section-audit`-Skill entstand): *premium content over photo*, Scrim-beats-Box, cinematische Bild-Führung, klarer Conversion-Anker.

„Alle Seiten" = **52 Seiten in 6 Template-Familien** (nicht 52 Einzelfälle) — Hebel ist das Polieren der geteilten Templates:
1. **Flagship** — `/` Home ← **dieses Sub-Projekt**
2. Conversion-Funnel (schaden-melden, vorteile, wie-es-funktioniert, gutachter-finden, beratung, ersteinschaetzung)
3. SEO Hub+Spoke (kfz-gutachter Hub + 8 Spokes + `[stadt]`; haftpflicht Hub + `[slug]`; vehicle-Varianten) — 1 Spoke-Template = ~30 Seiten
4. Directory (versicherer, sachverstaendige + `[slug]`)
5. Tools (decoder, unfallskizze, schadensreport)
6. Company/Legal (ueber-uns, faq, ratgeber, agb/datenschutz/impressum)

Jedes Sub-Projekt durchläuft einzeln: Brainstorm → Design-Doc → writing-plans → Implementierung (section-by-section) → eigener PR.
**Out of Scope hier:** Familien 2–6; B2B/Subdomain-LPs (gutachter-partner, makler, kfzgutachter-lp) — letztere wegen `feedback_subdomains_in_ruhe_lassen` unangetastet.

## 2 · Diagnose (Ist-Home)

Die Home rendert `LandingPage` = `HauptseitePremium` (16 Sektionen, „Premium-Rework" 13.05.) + `VersichererTaktikenSection` + `SchadensreportTeaserSection` + `SiebenFehlerSection` + `FounderSection` + Footer + `StickyCallBar` = **21 Sektionen**.

Vier Befunde:
1. **Scroll-Marathon** — 21 Sektionen, 9 Card-/Grid-Blöcke; kein Rhythmus, Conversion verliert sich nach unten.
2. **Doppel-Hero** — Sektion 1 (Foto-Band) + 2 (Hero+Lead-Form) sind zwei Hero-Bänder hintereinander.
3. **Card-Monotonie** — Ansprüche · Misstrauen · Prozess · Sieben-Fehler = 4× dasselbe `rounded-ios + shadow + hover-lift`-Grid → SaaS-Wand statt Premium.
4. **Authority verstreut** — BGH-Grid + Wertminderungs-Tabelle + Versicherer-Taktiken über die Seite verteilt statt als *ein* Beweis-Block.

## 3 · Ziel-Architektur (freigegeben: „A — Architektur zuerst")

**21 → 12 Sektionen.** Erst der Architektur-Schnitt, dann section-by-section polieren (sonst poliert man Sektionen, die nicht bleiben).

| # | Ziel-Section | Aus Ist (Merge) |
|---|---|---|
| 1 | **Hero (cinematisch)** | 1+2 verschmolzen — Scrim-Foto + Lead-Form integriert |
| 2 | **Trust-Strip** | 3 — mit ECHTEN KPIs (aktuell „Phantom"/UWG-Risiko) |
| 3 | **Was Ihnen zusteht** | 4 + 8 + 19 — Ansprüche + Sorgen + häufige Fehler |
| 4 | **Wie es funktioniert** | 5 + 7 + 11 — Service-Realität + Plattform-Mechanik + Prozess (Foto-Strecke) |
| 5 | **Beweis / Authority** | 9 + 12 + 17 — BGH-Urteile + Wertminderung + Versicherer-Taktiken |
| 6 | **Produkt / App** | 10 — echte Portal-Screens + App-Shield-Motiv |
| 7 | **Menschen** | 6 + 20 — Berater + Founder (Augenhöhe-Trust) |
| 8 | **Einsatzgebiet** | 13 — lokale SEO + City-Pills |
| 9 | **Schadensreport** | 18 — Lead-Magnet |
| 10 | **FAQ** | 15 |
| 11 | **Bottom-CTA** | 16 |
| 12 | **Footer** | 21 |

`14 Tesla/E-Auto` → als Spezial-Hinweis in „Was Ihnen zusteht" gefaltet (eigene Spoke, keine Home-Section).

## 4 · Hero (freigegeben: „B — Problem→Lösung")

Ein cinematischer Hero statt zwei Bänder. Bild: erleichtertes Paar nach Unfall, Handy mit Claimondo-Shield in die Kamera (Pain + Relief + Produkt in einem markenechten Bild).
- **Mechanik:** Vollbild-Foto, **linear-gradient Scrim** (kein Box/Border/Blur — `section-audit`-Regel „Scrim beats Box"), Text/Lead-Form auf einem dezenten Glaspanel (Subjekte sind zentral → Scrim/Panel eher unten).
- **Conversion-Anker (4 Fragen):** Wer (Claimondo, bundesweit) · Glaubwürdig (KPIs/§249 BGB) · Was bringt's (0 € für Sie) · Was tun (Lead-Form + Anruf + WhatsApp).
- **Copy-Regel:** Rollentrennung wahren (Claimondo koordiniert, **nie** „wir verhandeln" — siehe `project_marketing_rdg_rollentrennung`).
- **Performance:** Scrim = linear-gradient (GPU-billig), `priority`-Image, kein backdrop-blur.

## 5 · Foto-Narrativ, Personas & App-Shield-Motiv

Die Fotos (Aaron-Batch 31.05. + Archiv-Library) sind ein **Narrativ-System**, das Prozess + Personas erzählt.

**Personas (freigegeben — tragen „Menschen" + „Wie es funktioniert" + Beweis):**
| Persona | Rolle (Rollentrennung) | Bild-Casting (vorläufig) |
|---|---|---|
| Der/die Geschädigte | meldet, lehnt sich zurück | Sofa / Paar+App |
| Claimondo | **koordiniert** (ein Ansprechpartner) | Berater / Team |
| Sachverständige:r | begutachtet **vor Ort** (kein Online-Prüfdienst) | „Andreas" SV an der Schaden-Stelle |
| Partner-Werkstatt | repariert | Mechaniker (Blaumann) + App |
| Partnerkanzlei **LexDrive** | **verhandelt & setzt rechtlich durch** (§249 BGB) | Anzug/Office |

**App-Shield-Motiv (freigegeben: roter Faden über die ganze Seite).** Es existiert eine Foto-Serie „Person hält die Claimondo-App (Shield) in die Kamera" über alle Personas (SV Andreas, Werkstatt-Mechaniker, Berater, Kundin, Paar). Das **Shield/die App** wird das durchgängige Produkt-Anker-Motiv: präsent an den Schlüssel-Stellen Hero · Produkt/App-Section · Personas · Trust-Strip — mit Craft dosiert, damit es Motiv bleibt statt Tapete. **Die App-Screens in den Hand-Fotos bekommen echte App-UI-Mocks komposited** (Fallakte / Live-Tracking) statt des KI-Shields — so zeigt das Motiv das echte Produkt und das KI-Text-Problem auf dem Screen entfällt. Reale Mobile-Portal-Ansicht = §9-Lücke (von Aaron / aus dem Portal).

**Prozess-Foto-Strecke:** „Wie es funktioniert" nutzt die **Besichtigungs-6-Schritt-Reihe** aus dem Archiv (`shared/besichtigung/schritt-1…6` — Erstaufnahme, Lackmessung, Strukturschaden, Unterboden, Technik, Gutachten) → visueller, beweisstarker Ablauf statt Text-Steps.

## 6 · Differenzierung: „kein Online-Prüfdienst" (roter Faden)

Wiederkehrender inhaltlicher Beat (freigegeben): **echte Vor-Ort-Begutachtung** vs. Versicherer-**Online-Prüfdienst** (ControlExpert/K-Expert), der am Schreibtisch ohne Fahrzeug kürzt (typisch 30–40 %). Platzierung: Hero-Story (implizit), „Wie es funktioniert" (Vor-Ort-Fotos), Beweis-Block (BGH gegen Prüfdienst-Kürzungen), evtl. ein expliziter „So begutachten WIR / so ‚prüft' die Versicherung"-Kontrast.

## 7 · Premium-Treatment-Prinzipien (section-audit, pro Section anzuwenden)

- **Scrim beats Box** — linear-gradient-Scrim über Fotos statt Border/Radius/Blur/Shadow-„Card-over-photo".
- **Bass + Treble Type Scale** — Typo-Größen aggressiv spreizen (Anker-H ~44px vs Caption ~12px), Kontrast = Hierarchie.
- **Proximity / Rhythmus** — eng (4–8px) innerhalb einer Gruppe, weit (24–32px) zwischen Gruppen; kein Gleichabstand.
- **Consolidate, don't add** — Card-Grids bündeln (siehe Architektur), zwei Botschaften in einen Slot.
- **Echte Fotos** wo es zählt; KI-Platzhalter mit „echt"-Anspruch vor Go-Live ersetzen (§9).
- **CSS-Variable pro Theme** — ein Mechanismus, N Werte (für spätere Cluster/Spokes wiederverwendbar).

## 8 · Asset-Map & Format

**Vorhanden (reich, markenecht):** Aaron-Batch 31.05. (16 frisch, 87 ChatGPT gesamt: Team, Sofa, Paar+App, SV-Feld, Berater, App-Shield-Serie) + Archiv-Library (`_ASSET_MANIFEST.md`, ~24 Assets nach `public/img/`-Schema: `shared/`, `besichtigung/` 6-Schritt, `abwicklung/`, `portal/`, `cases/`, City-OG).

Zuordnung (Start): Hero ← Paar+App · Trust-Strip ← KPIs · Wie-es-funktioniert ← besichtigung-Reihe + SV-Feld · Beweis ← BGH/Wertminderung · Produkt/App ← App-Shield-Shots + Portal-Screens · Menschen ← Berater/Founder/Team.
**Format:** Bilder vor Einbau in `.webp` konvertieren (sharp), via `next/image`. (Companion-Mockups nutzen verkleinerte JPEG-Data-URIs.)

## 9 · Echte Lücken / Vor-Go-Live (UWG / E-E-A-T)

Nicht KI-promptbar → echt/lizenziert beschaffen (Aaron):
- **Trust-Siegel:** DAT, BVSK (+ evtl. DEKRA/TÜV), Google-Bewertungs-Badge, **LexDrive-Kanzlei-Logo**, Presse (NDR).
- **Echte Porträts:** Berater + Founder (KI-Platzhalter mit Gesicht/„echt"-Anspruch ersetzen).
- **Mobile-Portal-Screen** (vorhandene Portal-Bilder sind Desktop).
- **Echte KPIs** für Trust-Strip — aktuelle Zahlen sind „Phantom"/UWG-riskant (Code-Kommentar `HauptseitePremium`): # Schäden · Ø Auszahlungsdauer · Ø zurückgeholte Summe · # Partner-SVs.
- **Reviews/Testimonials:** Rating + Anzahl + 3–5 echte Stimmen (Name/Ort/Foto).
- Portal-Demo-Zahlen real machen oder als Beispiel kennzeichnen.
- **KI-Text in Bildern (Brand/Seriosität) — selektiv, nicht pauschal:** Entscheidung pro Bild; viele Originale sind so gut und bleiben unverändert (z.B. das Kundin-20:55-Bild — Original behalten). Nur wo Text wirklich garbled/störend wirkt: **Hintergrund-Text** (Schilder/Gebäude/Werkstatt-Klutter) → **radiale Tiefenschärfe** (`sharp`, Muster `blur-bg.cjs`) — versteckt + premium Tiefe (Subjekt scharf). **Vordergrund-/Marken-Text** (Wortmarke, App-Screen, Jacken-Aufschrift) → **echtes SVG-Logo / echte App-UI** im Code drüber oder wegcroppen (Blur hilft da nicht). Nie garbled KI-Text ausliefern.

## 10 · Constraints (technisch / Marke)

- **Tokens:** `claimondo-*` Tailwind-Klassen (greifen über `var(--brand-*)`), keine Inline-Hex; `design-tokens.ts` + `globals.css` der Marketing-App sind self-contained + in sync mit dem Monolith.
- **Komponenten:** `primitives/*` (Atoms) + `shared/*` (Composites) bevorzugen; neue Section-Bausteine als wiederverwendbare Komponenten (auch für spätere Familien).
- **i18n:** Home-Copy liegt mehrsprachig in `i18n/messages/*.json` (de/en/tr/ar/ru/pl). Jede Struktur-/Copy-Änderung muss alle 6 Sprachen mitziehen (Key-paritätisch).
- **Rollentrennung (RDG):** „Claimondo koordiniert · Partnerkanzlei LexDrive verhandelt" — nie „wir verhandeln/setzen durch" (`project_marketing_rdg_rollentrennung`).
- **i18n-Routing/Standalone-Stack:** eigene Middleware (as-needed), Routen sind `ƒ` (kein `generateStaticParams`) — Layout nutzt `headers()` (`feedback_nextintl_asneeded_next16`).

## 11 · Umsetzungs-Reihenfolge

1. **Architektur-Schnitt** — `HauptseitePremium`/`LandingPage` auf 12 Sektionen konsolidieren (Merges aus §3), i18n-Keys mitziehen.
2. **Hero-Pilot** (Section 1) zuerst maximal geil bauen — Qualitäts-Muster, an dem die restlichen Sektionen gemessen werden.
3. Danach Section 2→12 einzeln (section-audit-Loop), wiederverwendbare Section-Komponenten extrahieren.
4. Asset-Einbau als `.webp`; Lücken (§9) parallel von Aaron beschaffen, dann 1:1 eintauschen.

## 12 · Offene Punkte

- Finale Bild-Auswahl je Section (Casting) beim Bau.
- Werkstatt + Unfallgegner als Personas: Werkstatt aufgenommen; Unfallgegner offen (NFC-Flow-Bezug, Phase 2).
- KPI-Zahlen (Aaron / Supabase) bevor Trust-Strip live geht.
- Stacking/Basis-Branch beim Merge (aktuell auf `kitta/marketing-copy-rollentrennung` aufgesetzt).
