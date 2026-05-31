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

## 13 · Nachträge aus Review (Aaron, 31.05.)

1. **Design-Tokens = Pflicht (es ist die Hauptseite):** Der Mock nutzt Inline-Hex nur als Preview. Die Implementierung baut **ausschließlich** auf dem Token-System — `claimondo-*` Tailwind-Klassen (→ `var(--brand-*)`), `design-tokens.ts`; **keine Inline-Hex**. Der `check:token-audit`-CI-Gate erzwingt das. Spacing/Radius/Shadow/Typo nur aus den Token-Skalen.
2. **Echte Portal-Screens** für „Produkt/App" statt CSS-Mock: aus dem Archiv (`portal/dashboard.png`, `timeline-12-schritte.png`) + **frischer Screenshot der echten Kunde-Fallakte** (app.claimondo.de). Reale **Mobile**-Portal-Ansicht bleibt §9-Lücke. → Bedarf: Test-Login/Demo-Fall für den Screenshot.
3. **Echte Google-Bewertungen** als Trust-Element (Rating + Anzahl + 2–3 Original-Stimmen) — an der Trust-Strip oder als eigene Reviews-Section. **Echt, nicht erfunden** (UWG/E-E-A-T). → Bedarf: Google-Business/Place-URL oder Rating+Anzahl+Stimmen.
4. **SV-Finder embedded:** die `gutachter-finden`-Mapbox-Karte direkt auf der Home einbetten („SV in Ihrer Nähe finden", interaktiv) — **erweitert/ersetzt die statische „Einsatzgebiet"-Section**. Mapbox-Token vorhanden. (Section-Liste §3 entsprechend: #8 wird interaktiver SV-Finder.)
5. **Page-Typ-Differenzierung (gesamtes Programm):** Home = **Conversion-Flagship** (emotional, Foto-getrieben, CTA-stark). SEO Hub/Spokes (kfz-gutachter, haftpflicht) = **informativ / E-E-A-T-tief** (BGH-fundiert, Content-Tiefe für Crawler + AI-Suche). Directories = funktional. Tools = interaktiv. Die **Premium-Bar gilt überall**, nur Dichte/Intention variieren je Familie.
6. **Login-Embed:** Bestehende Kunden/SV loggen sich **direkt auf claimondo.de** ein — eingebettetes Login-Formular (Topbar-Dropdown + „Bereits Kunde?/SV?"-Einstieg) statt nur Link auf `app.claimondo.de/login`. Die Marketing-App hat `lib/supabase` (Auth) + das geteilte `.claimondo.de`-Cookie → Login setzt die Session, Redirect ins Rollen-Portal (`roleToPath`). Macht claimondo.de zur **einheitlichen Tür** (Marketing + Login) und entschärft die `app.claimondo.de/`-404-Frage.
7. **Bestehende Asset-Library zuerst nutzen:** `public/` der Marketing-App hat bereits viel — `marketing-landing-koeln/` (hero-woman/-man, berater, founders, autohaus, office, nrw-karte), `kfzgutachter-lp/` (hero-unfall-frau/-mann, gutachter-handshake, berater, nrw-standorte — die Premium-Bar), `brand/` (team-founders, team-headset, team-office, hero-unfall-*) **+ die echten Brand-SVGs** (`claimondo-shield.svg`, `claimondo-logo.svg`, `claimondo-wortmarke.svg`). Asset-Map (§8) zieht **primär aus dieser Library** + Aaron-Batch + Archiv ergänzend. **Das echte `claimondo-shield.svg` / echte App-UI wird auf die App-Telefon-Screens gelegt** → löst das KI-Shield/Text-Problem (§13.1) sauber.
8. **Finale Hero-Entscheidung + Art-Direction (Aaron):** **Beides (C)** — Hero B (Paar+App) bleibt der Conversion-Hook, **„Ein Team hinter Ihrem Fall" wird prägnante Section #7** (Team-Foto, direkt unter der Trust-Strip). Übergreifende **Art-Direction für ALLE Sektionen:** bild-geführt, **viele GROSSE 16:9-Full-Bleed-Foto-Bänder** (die Bilder sind dafür 16:9 gemacht), **offen & luftig** (großzügiger Whitespace, viel Raum zwischen Gruppen), **aufregend/dynamisch** — weg von dichten Card-Grids, hin zu cinematischen Foto-Sektionen mit Scrim + Text. Das ist die kfzgutachter-LP-Bar. Konsequenz für §3: mehr Foto-Band-Sektionen, weniger Karten; Assets in großen Breiten (Hero/Bänder 1600–1920w).
