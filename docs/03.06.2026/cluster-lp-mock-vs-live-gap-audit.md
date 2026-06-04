# Cluster-LP — Mock (v15) ↔ Live Gap-Audit

**Datum:** 2026-06-03 · **Branch:** `kitta/cluster-lp-v15-page-fixes`
**Mock (Source of Truth):** `02_spec_code/MASTER_preview-complete_v3-praxis-v2.html` (v15.5 Cowork)
**Live:** `kfz-unfallgutachter-{wuppertal,duesseldorf,bonn}.de` (deployed = dieser Branch)
**Methodik:** Mock rendert lokal **ungestylt** (kein Tailwind/Assets) → Vergleich über **Content-/Struktur-Grep (Mock-HTML ↔ Live-HTML + React-Komponenten + `lib/content.ts`/`cluster.ts`)** + Cowork's gestylte QA-Refs (`05_qa_screenshots/`). Reine Pixel-Layout-Feinheiten = „visuell zu prüfen". 4 parallele Audit-Agenten, hier synthetisiert.
**Direktive (Aaron):** Mock = Source of Truth. Jeder Diff → Mock gewinnt; Ausnahme = begründete Live-Verbesserung → Aaron entscheidet.

---

## 0 · Executive Summary

**Der dominante Befund:** Die Live-React-Komponenten haben **keine dedizierten Mobile-Varianten.** Der Mock liefert für **9 Sektionen** je eigenes `sm:hidden`-Mobile-DOM (eigenes Markup + eigene Copy); die Live-Komponenten **kollabieren nur das Desktop-Layout** auf 1 Spalte. Das ist der größte Teil der „nicht-1:1"-Lücke.

**Grobeinordnung:**
- ✅ **1:1 / erledigt:** Compare-Tabelle (8 Zeilen verbatim + DIFF1 full-width), Leistungen-Copy (6 Schritte verbatim), Footer-Struktur, Final-CTA, sowie der **Desktop-Content** von Ablauf / Über-uns / Netzwerk / Einsatzgebiet.
- 🔴 **Desktop-Lücken (Copy/Struktur):** Hero (USPs „2.500+/10+ Jahre", Trust-Cluster, 0€-Copy), Praxis (Hero-Stat + Section-H2/Sub), Reviews (komplette Struktur), Netzwerk-H2, FAQ (5 kuratierte vs 8 generische Fragen + Trust-Elemente), Footer-Copyright, diverse Copy-Diffs.
- 🟠 **Mobile-Lücken (fehlende `sm:hidden`-Varianten):** Header (Burger-Nav!), Hero (0€-Anker), Reviews (Inline-List), Ablauf (Tag-Timeline), Leistungen (Karussell), Über-uns (Founder-Card), Netzwerk (Team-Hero + 4-Pain-Cards), Einsatzgebiet (Map-Card), FAQ (Mobile-Sizing).
- 🟡 **Bewusste Abweichungen (KEINE Gaps):** Praxis Dots statt Pfeile, Monika Dedupe+Avatar, Telefon `+49`-Format, `rounded-cta`-Token.
- ❓ **Aaron-Entscheidungen (Live evtl. Verbesserung):** Reviews 4↔7, Ratgeber-Section, per-City-SEO-Text, FAQ-8er-Array (inkl. Near-Duplikat).

---

## 1 · Status-Übersicht je Sektion

| Sektion | Desktop | Mobile-Variante | Verdikt |
|---|---|---|---|
| Header | 🔴 Composite-Logo fehlt | 🔴 **Burger-Nav fehlt** | nicht 1:1 |
| Hero | 🔴 USPs/Trust-Cluster/Copy | 🔴 0€-Anker fehlt | nicht 1:1 (Live = Pre-v14) |
| Reviews | 🔴 andere Struktur | 🔴 Inline-List fehlt | nicht 1:1 |
| Praxis | 🔴 Hero-Stat + H2/Sub fehlen | — (Cards ok) | Card-Mechanik 1:1, Rahmen fehlt |
| Ablauf | ✅ 1:1 | 🔴 Tag-Timeline fehlt | Desktop 1:1 |
| Leistungen | ✅ Copy 1:1 | 🟠 Karussell fehlt | Copy 1:1 |
| Über uns | 🟠 2 Copy/Asset-Diffs | 🔴 Founder-Card fehlt | Desktop fast 1:1 |
| Netzwerk | 🟠 H2-Copy | 🔴 Team-Hero/Pain-Cards fehlen | Content 1:1, H2 weicht ab |
| **Compare** | ✅ **1:1** | ✅ full-width | **vollständig 1:1** |
| Einsatzgebiet | 🟠 Quellen-Copy | 🔴 Map-Card/Pills fehlen | Desktop 1:1 |
| FAQ | 🔴 5↔8 + Trust-Elemente | 🔴 Mobile-Sizing fehlt | nicht 1:1 |
| Ratgeber | ❓ separate Section (Live) vs In-FAQ-Pills (Mock) | 🟠 | Aaron-Entscheid |
| Final-CTA | ✅ ~1:1 | — | ~1:1 |
| Footer | 🟠 Copyright/Logo | ✅ (kollabiert ok) | Struktur 1:1 |

---

## 2 · Gap-Tabellen je Sektion

Legende Impact **H/M/L**, Effort **S/M/L**, Viewport **M(obile)/T(ablet)/D(esktop)**.

### Header
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **Burger + Off-Canvas-Menü** (`#burgerBtn`/`#burgerMenu`) für `<lg`: Anruf-CTA, Nav, „24/7 · Rückruf < 15 Min", WhatsApp-CTA | Nav nur `hidden lg:flex`, **kein Burger** → Mobile/Tablet **ohne Navigation** | **H** | M | M/T |
| Struktur | Desktop-Composite-Logo: Dark-Icon + Amber-Hairline + zweizeilige Wortmarke „Kfz-Gutachter"/„WUPPERTAL" | Ein `logo-{key}.webp`, kein Composite/Wortmarke | M | M | M/T/D |
| Layout | Mobile-Höhe `h-[60px]`, `relative` (nicht sticky) bis Tablet; Glass-Gradient-BG + `backdrop saturate/blur` | `h-[84px]` durchgängig `sticky`; `bg-paper/90` schlicht | M | S | M/D |

### Hero  *(Live-Komponente kommentiert sich selbst als „Mock-Quelle Z294-385" = Pre-v14)*
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | USPs enthalten **„2.500+ Schäden begleitet"** + **„10+ Jahre Erfahrung"** (alle VP) | Nur 3 Bullets, **keine** dieser zwei | **H** | M | M/T/D |
| Struktur | **Mobile-0€-Anker** (`hero-zero-block`, 3-zeilig: „0 €"/„Bei unverschuldetem Unfall"/„Versicherung zahlt alles") | Auf Mobile **kein** prominenter 0€-Anker (nur Desktop-Fließtext `hidden sm:block`) | **H** | M | M |
| Struktur | **`#heroTrustClusterDesktop`**: v3-Siegel + „Zertifizierter Claimondo-Partner" + Stats „2.500+/10+ Jahre" (1 Zeile) | Existiert nicht; alter 3-Zeilen-Trust ohne Stats, Siegel ohne `-v3` | M | M | T/D |
| Copy | `…zahlen Sie 0 €. Die Versicherung übernimmt alles.` (Punkt, „Die" groß) | `…zahlen Sie 0 € — die Versicherung übernimmt alles.` (Halbgeviertstrich, „die" klein) | M | S | alle |
| Copy | h1-Sub fix **kursiv**: „Unabhängige Sachverständige. Gerichtsfeste Gutachten nach DAT-Standard, mit BVSK-Kompetenz." | `city.h1Sub` = „unabhängiger Sachverständiger" (nicht kursiv, per City) | M | S | alle |
| Copy | Bullet 1: „…Mietwagen — **alles aus einer Hand**" | „…Mietwagen — **ein Netzwerk**" | M | S | D |
| Struktur | Mobile-Editorial-Header (Eyebrow ★★★★★ 5,0 + Tagline) + Glass-Wrapper + Scroll-Chevron | fehlt | M | M | M |

### Reviews  *(Mock = „Mobile Option E · Inline-List" für ALLE VP; alte Scroller-Variante explizit `display:none`)*
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **Inline-Liste** (weiße Card, Divider-Reihen, 36px-Avatar, kursives Quote), **4** Reviews, `max-w-[440px]` | **7-Karten-Scroller** (`#crTrack`, `w-[180px]`) + großes „5,0"-Badge + Google-Glyph | **H** | M | alle |
| Struktur | Praxis ist **eigene `#praxis`-Sektion danach** | Praxis-Cards **innerhalb** der ReviewsSection gerendert | **H** | M | alle |
| Copy | Eyebrow „★★★★★ 5,0 · GOOGLE-BEWERTUNGEN"; Soft-Link **unter** Liste | großes 5.0-Badge oben; „Alle ansehen" oben | M | S | alle |
| Copy | H2 „Was Wuppertaler über uns sagen" (**ohne** „?") | „…sagen**?**" | L | S | alle |
| Inhalt | 4 kurze Quotes | 7 längere Reviews (3 ohne Text) | M | M | alle — *Inhalt evtl. Live-SEO → Aaron* |

### Praxis  *(Card-Mechanik 1:1; Section-Rahmen fehlt)*
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **`praxis-hero-stat`** „+ 2.805 € im Schnitt mehr für unsere Mandanten · 5 anonymisierte Realfälle" (Summenzeile über Cards) | **fehlt komplett** | **H** | M | alle |
| Copy | **`praxis-section-h2`** „Schnellangebot der Versicherung — oder das, was Ihnen zusteht." | fehlt | **H** | S | alle |
| Copy | **`praxis-section-sub`** „Fünf anonymisierte Realfälle, die unser Netzwerk in den letzten 12 Monaten begleitet hat." | fehlt | M | S | alle |
| Copy | kurzer Disclaimer | längerer Disclaimer (Live) | L | S | alle |

→ **Spec liegt fertig:** `07_gap_specs/PRAXIS-HERO-STAT_SPEC_2026-06-02.md` (HTML + CSS M/T/D + daten-getriebene Berechnung aus `CASES` + CountUp). **Phase-1-Quick-Win.** Details §3.

### Ablauf
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **Mobile-Tag-Timeline** (`#ablaufMobile`): „In ~32 Tagen zum Geld", TAG-0…TAG-32-Anker, IntersectionObserver-Reveal, „☎ Jetzt Tag 0 starten"-CTA | **keine** Mobile-Variante (Desktop-5er-Grid kollabiert) | **H** | L | M |
| — | Desktop (Eyebrow/H2/Grid/Portal/CTA/LexDrive) | **1:1** (Heading-„0×"-Indiz war Grep-Artefakt `l&auml;uft`) | — | — | D/T |

### Leistungen
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Copy | 6 Schritte (Titel/Beschreibung/Badge) | **1:1, verbatim identisch** (alle 6) | — | — | — |
| Struktur | **Mobile-Karussell** (`#leistungenTrack`, Auto-Advance + Step-Badge „1/6" + Dots) | **kein** Karussell (Grid stapelt 6 Karten) | M | M | M |
| Copy(alt) | Spezifische Bild-`alt` („Lackschichtdicke und Spaltmaße…") | generisch `alt={title}` (a11y/SEO-Verlust; „Lackschicht"-Indiz war nur im alt) | L | S | alle |

### Über uns
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **Mobile-Variante** (`#ueberUnsMobile`, heller BG): Founder-Avatar-Quote-Card (`avatar-tobias-…`) + Trust-Pill-Row (DAT/BVSK/10+J/90+ Netz) | **keine** Mobile-Variante (Petrol-Block kollabiert) | **H** | L | M |
| Copy | „…seit über 10 Jahren Geschädigte **im Bergischen Land**." | „…in **{city.name} und Umgebung**" → „in Wuppertal und Umgebung" | M | S | D/T |
| Asset | Siegel **`-v3`.svg** | `siegel-claimondo-partner.svg` (ohne `-v3`) | M | S | D/T |

### Netzwerk
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **Mobile-Sektion** (`#netzwerkMobile`): Team-Hero-Card + Eyebrow „Die 4 wichtigsten Fragen" + **4 Pain-Cards** (autounfall.io-Deeplinks) + Mobile-Compare-Panel (8 Topic-Badges) + CTA-v8 (3 Rollen-Avatare) | **fehlt komplett** (Desktop kollabiert) | **H** | L | M |
| Copy | Desktop-H2 „Andere geben Ihnen ein Gutachten. / Wir geben Ihnen die **komplette Lösung**." | „Sie bekommen nicht *einen* Gutachter. / …ein ganzes **Netzwerk**." | M | S | D/T |
| — | Desktop Intro/4-Badges/Bild-Karte | **1:1** | — | — | D/T |

### Compare  ✅
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| — | 8 Zeilen + Header + Toggle-Labels + Hinweis + Deep-Links | **vollständig 1:1, verbatim** (DIFF1 full-width erledigt + live verifiziert) | — | — | — |

### Einsatzgebiet
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **Mobile-Variante B** (`#einsatzMobile`): eigene H2, Map-Card mit 3 Mini-Stats (12 Städte/60 Min/24/7), Städte-Pills, Mobile-CTA „Vor-Ort-Termin anfragen" | **fehlt komplett** | **H** | L | M |
| Copy | Brennpunkt-Quelle „**Quelle: Polizei-Jahresverkehrsbericht 2025**" | „Beispiele verkehrsreicher Bereiche im Stadtgebiet — …" | M | S | D/T |
| Struktur | `#areaTags`-Pill-Row | fehlt (nur areaTagsList-Zeile) | L | S | D/T |
| ❓ | — | **per-City-SEO-Absatz** (`seoTextFor`) — **Live-Verbesserung** (Doorway/Duplicate-Schutz) → **Aaron: behalten?** | — | — | alle |
| — | Desktop H2/Eyebrow/Karte/Wahrzeichen/Facts/Brennpunkte/Städte-Liste | **1:1** | — | — | D/T |

### FAQ
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **5 kuratierte, lokal angereicherte Fragen** | **8 generische Fragen** (`FAQ`-Array, andere Texte/Reihenfolge); **#8 ≈ Duplikat zu #1** | **H** | M | alle |
| Struktur | Q1 **Amber `0 €`-Chip-Badge** (Trust-Anker) | kein Badge | **H** | M | alle |
| Struktur | Q4 **4-Punkt-Bullet-Liste** (DAT/Anwalt/Mietwagen/Tracking) | einzelner `<p>` | **H** | M | alle |
| Struktur | **2 Lokal-Mini-Cards** (Stadtteil? / Wochenend-Termin?) + Quellen-Anker | fehlen | **H** | M | alle |
| Struktur | **In-FAQ-Ratgeber-Pill-Row** (4 swipebare Pills + „Mehr im Magazin") | fehlt (→ Live separate Ratgeber-Section, s.u.) | **H** | M | alle |
| Copy | Eyebrow „· Klartext"; H2 „Sprechen wir *Klartext.*" | Eyebrow ohne „Klartext"; H2 „Häufig gestellte Fragen" | M | S | alle |
| Layout | dedizierte Mobile-Sizing-Stufen (`py-9 sm:…`, H2-clamp, …) | nur Desktop-Werte (mobil zu groß/luftig) | **H** | M | M |

### Ratgeber  ❓
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Struktur | **Keine** eigene Section — nur In-FAQ-Pill-Row | **Eigene `#ratgeber`-Section** (4 Bild-Karten) zwischen FAQ + Final-CTA | **H** | M | alle |

→ **Aaron-Entscheid:** Live-Bild-Karten-Section **behalten** (richer) oder auf die schlanke In-FAQ-Pill-Brücke des Mocks **zurückführen**? Section-Reihenfolge weicht dadurch ab (Live: FAQ→Ratgeber→Final-CTA; Mock: FAQ→Final-CTA).

### Final-CTA
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| — | H2/Sub | **1:1** | — | — | — |
| Struktur | `id="final-cta"` auf Section | kein `id` | L | S | — |

### Footer
| Typ | Mock | Live | Impact | Effort | VP |
|---|---|---|---|---|---|
| Copy | Copyright „© 2026 … · **Betreiber: Claimondo GmbH**" | „© 2026 … · **Bergisches Land**" (Region statt Betreiber) | **H** | S | alle |
| Asset | Logo `logo-wuppertal-new.svg` | `logo-{key}.webp` | M | S | alle |
| — | 4-Spalten-Grid + Bottom-Bar + Kontakt/Erreichbarkeit/Legal | **1:1** (Grid kollabiert beidseitig) | — | — | — |

---

## 3 · Praxis-Hero-Stat — ready-to-implement (Phase 1)

Nicolas' Spec (`07_gap_specs/PRAXIS-HERO-STAT_SPEC_2026-06-02.md`) ist 1:1 portierbar. **React-Anpassung** (Server-Component → Wert build-time aus `CASES`, CountUp als optionale Client-Insel):

**DOM-Position:** in der Praxis-Sektion **zwischen Section-Header (Eyebrow + `praxis-section-h2` + `-sub`) und dem Card-Carousel.** Einbau-Stelle im Live: `ReviewsSection.tsx` zwischen Praxis-Eyebrow und `<CasesCarousel/>` — sauberer beim Ausgliedern in eine eigene `PraxisSection`/`<section id="praxis">`.

**Wert (verifiziert mit Live-`CASES`):** Ø(`anspruch−erstangebot`) = 14.023/5 = 2.804,6 → auf 5er gerundet → **„+ 2.805 €"**, Count **5**. Identisch über alle 3 Cluster (CASES cluster-agnostisch).

**CSS:** `praxis-hero-stat` / `praxis-stat-big` (`var(--green)`, Mobile 38px / Desktop clamp 46-56px) / `-sub` / `-source`. Desktop ≥1024 = transparent/randlos; Tablet 641-1279 = zentriert `max-width:480px`; Mobile = weiße Card + Gradient + 1px-Border. **`--green` ist Brand-Konstante (NICHT cluster-spezifisch).** Klassen müssen aus dem Mock-CSS in das LP-`globals.css` übernommen werden (existieren live nicht).

**Akzeptanz:** Wert dynamisch (nicht hardcoded `2.805`), 5er-Rundung, `Intl.NumberFormat('de-DE')`, CountUp mit `prefers-reduced-motion`-Fallback, Count aus `CASES.length`, 3 Cluster identisch, Screenshot-Vergleich gg. `qa-v15-5/M390_*_praxis.png`.

---

## 4 · Bewusste Abweichungen — KEINE Gaps (nicht anfassen)
- **Praxis Dots statt Pfeile** (Aaron-Entscheid DIFF 2).
- **Monika** Dedupe + Avatar-Embed (gewollt; Deploy gehalten, A/B/C offen).
- **Telefon `+49 1515 3608515`** statt Mock-`0151 5360 8515` (Aaron-Vorgabe Mobilformat).
- **`rounded-cta`** statt Mock-`rounded-sm` (Token-Migration).

## 5 · Aaron-Entscheidungen nötig (Live evtl. Verbesserung)
1. **Reviews:** Mock-Struktur (Inline-List, 4 Reviews) übernehmen? Oder Live-7-Karten-Scroller behalten? (Struktur klar Mock; Review-**Inhalt** evtl. Live-SEO-Stand.)
2. **Ratgeber:** Live-Bild-Karten-Section behalten oder Mock-In-FAQ-Pills?
3. **Einsatzgebiet per-City-SEO-Text:** behalten (Doorway-Schutz für Spokes)?
4. **FAQ:** Mock-5-kuratiert vs Live-8-Array — und **#8 ist Near-Duplikat zu #1** (Live-Redundanz, in jedem Fall fixen).

---

## 6 · Phasen-Vorschlag

**Phase 1 — Conversion-critical Quick-Wins** *(Effort S, Impact H — Copy + kleine Struktur, alle 3 Cluster)*
- **Praxis-Hero-Stat + `praxis-section-h2`/`-sub`** (Spec ready).
- Hero-USPs „2.500+ Schäden" + „10+ Jahre Erfahrung"; 0€-Copy-Interpunktion; Bullet-1-Copy.
- Footer-Copyright „Betreiber: Claimondo GmbH".
- Netzwerk-Desktop-H2; Reviews-H2-„?"; Über-uns „im Bergischen Land"; Einsatzgebiet-Brennpunkt-Quelle.

**Phase 2 — Desktop-Vollständigkeit** *(Effort M)*
- Hero `heroTrustClusterDesktop` (v3-Siegel + Stats) + Siegel-`-v3` (auch Über-uns); h1-Sub kursiv/fix.
- FAQ-Reconciliation: 5 kuratierte Fragen + 0€-Badge + Q4-Bullets + Q5-Werkstatt-CTA + Lokal-Mini-Cards + Quellen-Anker (+ #8-Duplikat fixen).
- Leistungen-Bild-Alt-Texte; Einsatzgebiet-`areaTags`-Pill-Row; Final-CTA-`id`.

**Phase 3 — Mobile-UX-Reconciliation** *(Effort L — der große Block, 9 Mobile-Varianten)*
- **Header-Burger-Nav** (höchste Prio — Mobile/Tablet aktuell ohne Navigation).
- Hero-0€-Anker-Block; Reviews-Inline-List; Ablauf-Tag-Timeline; Leistungen-Karussell; Über-uns-Founder-Card; Netzwerk-Team-Hero+4-Pain-Cards; Einsatzgebiet-Map-Card; FAQ-Mobile-Sizing.

**Phase 4 — Struktur-Entscheidungen** *(Aaron — §5)*: Reviews-Struktur, Ratgeber-Section, per-City-SEO, FAQ-Array.

---

## 7 · Cross-Cluster
Die React-Komponenten sind über **alle 3 Apps byte-identisch** (nur `content.ts`/`cluster.ts` = Daten differieren pro Cluster). → **Jeder Komponenten-Gap gilt für alle 3 LPs**; jeder Fix = 1 Edit, 3× kopiert (bzw. shared). Cluster-spezifische Daten (Hero-Bild, Brennpunkte, Cities) bleiben pro Cluster.

## 8 · Aufwand (grob)
- Phase 1 ≈ ½ Tag · Phase 2 ≈ 1 Tag · **Phase 3 (Mobile) ≈ 3–5 Tage** (9 Varianten, eigenes Markup je Sektion) · Phase 4 = Aaron-Entscheide.

**Empfehlung:** Phase 1 sofort (höchster Wert/Aufwand), Phase 2 anschließen, Phase 3 als eigener Sprint einplanen (das ist der eigentliche „Mobile-Mock-Sync"). Compare ist fertig, Monika separat (gehalten).
