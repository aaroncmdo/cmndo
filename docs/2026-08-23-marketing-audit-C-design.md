# Marketing-Audit C — Design-Konsistenz

**Datum:** 2026-08-23
**Gegenstand:** `claimondo-marketing/` (app/ + components/, 277 TS/TSX-Files) + Live-Abgleich gegen `https://claimondo.de`
**Methode:** Statischer Scan des Quellcodes, Abgleich gegen das **gebaute** CSS (lokal + live von prod geladen), Playwright-Messung des gerenderten DOM auf 14 Seiten und 4 Viewports.

---

## Kurzfassung

Farbe und Radius sind tatsächlich diszipliniert — aber nicht ganz so sauber wie in der Vormessung. Die eigentliche Geschichte ist eine andere und liegt tiefer als Typografie-Wildwuchs:

> **Der Marketing-Build kennt die halbe Design-Sprache der App nicht — und sagt es niemandem.**
> `claimondo-marketing/app/globals.css` ist ein Fork der App-`globals.css`, der **vor** der Token-Foundation (2026-06-10) abgezweigt ist. Die Typo-Skala (`--text-caption`, `--text-body*`, `--text-heading-*`) und die semantischen Farbtokens (`--color-success/warning/danger`) fehlen dort **komplett**. Wer sie trotzdem schreibt, erzeugt **eine Klasse ohne jede CSS-Regel** — kein Fehler, kein Build-Bruch, nur stille Wirkungslosigkeit.

Das ist keine Stilfrage. Es ist auf prod **sichtbar kaputt**: 376 Elemente auf `/gutachter-finden` rendern in der falschen Schriftgröße, und 8 Fehlermeldungen rendern nicht rot.

Die 354 Magic-Numbers sind demgegenüber weitgehend **folgenlos** — sie sind das Symptom, nicht die Krankheit.

---

## Korrektur der Vormessung

Vier der vier Ausgangszahlen halten der Nachprüfung nicht stand. Für Radien und Farbskalen war die Aussage „0" das Gegenteil des Befunds.

| Metrik | Vormessung | Nachgemessen | Bewertung |
|---|---:|---:|---|
| Hex-Farben in Klassen | 5 | **10** | ✅ **kein Befund** — alle 10 sind WhatsApp `#25D366` (8×) und LinkedIn `#0A66C2` (2×), also dokumentierte Fremdmarken |
| Tailwind-Default-Radien | 0 | **38** | ⚠️ echt, aber kosmetisch (s. §6) |
| rohe Farbskalen | 0 | **209** | ⚠️ echt, aber **kein Verstoß** — die Alternative existiert im Marketing-Build nicht (s. §1) |
| Schriftgrößen als `[Npx]` | 354 | **368** arbitrary (128 `px` + **240 `rem/em`**) | Die `rem`-Hälfte war die größere und fehlte in der Messung |

Der Grund für die Nullen ist vermutlich, dass gegen den Ratchet-Regex gegrept wurde. Der scannt laut `scripts/check-token-audit.mjs:58` ausschließlich `git ls-files "src/**"` — Marketing ist dort per Konstruktion unsichtbar.

**Gegenprobe, dass das Messwerkzeug lebt:** Im live von prod geladenen CSS liefern `claimondo-navy` und `rounded-ios` je Treffer, `danger-strong` und `text-body-xs` je **0**. Die Nullen sind Befund, nicht Instrumentenfehler.

---

# Befunde nach Wirkung

## Rang 1 — 🔴 376 Elemente auf `/gutachter-finden` rendern in der falschen Größe

**Was der Nutzer sieht:** Im „Städte"/„Ratgeber"-Sprungpanel des Gutachter-Finders ist die typografische Hierarchie **vollständig flach**. Überschrift, Hinweistext, Bundesland-Label und Städte-Links haben alle exakt dieselbe Größe. Das Panel ist dadurch deutlich zu groß, und die Ordnung „Region → Stadt" ist optisch nicht mehr erkennbar.

**Messung (live, prod, Panel geöffnet):**

```
Elemente mit text-body-* Klasse: 376
alle gerendert: 16px          (Soll: text-body-sm = 13px, text-body-xs = 11px)
```

Betroffen u. a. das Bundesland-Label `text-body-xs font-bold uppercase tracking-[0.1em]` — als 11px-Kapitälchen entworfen, gerendert als 16px-Fließtext.

**Ursache:** `components/gutachter-finden/FinderSprungPanel.tsx` nutzt an 8 Stellen (Z. 94, 126, 132, 145, 154, 159, 175, 182) `text-body-sm` / `text-body-xs`. Diese Utilities existieren im Marketing-Build nicht.

**Nicht kosmetisch.** Der Gutachter-Finder ist eine Konversionsseite.

---

## Rang 2 — 🔴 8 Fehlermeldungen rendern nicht rot

**Was der Nutzer sieht:** Wer im Community-Bereich einen Kommentar mit fehlerhafter Eingabe abschickt, bekommt die Fehlermeldung in der **Farbe des Fließtexts** statt in Rot. Die Größe stimmt (`text-[0.75rem]` greift), nur die Signalfarbe fehlt — also genau das, was eine Fehlermeldung als Fehlermeldung kenntlich macht.

**Fundstellen** (alle `text-danger-strong`, alle im Fehlerpfad):

| File | Zeile |
|---|---|
| `components/community/PostComments.tsx` | 89, 199, 317 |
| `components/community/CommentForm.tsx` | 70 |
| `components/community/PostComposer.tsx` | 178 |
| `components/community/PostCard.tsx` | 153 |
| `components/community/LikeButton.tsx` | 73 |
| `components/community/ReportButton.tsx` | 31 |

**Beweis am gebauten Output:** `danger-strong` erzeugt im live von `claimondo.de` geladenen CSS **0 Regeln**.

---

## Rang 3 — 🟠 Die Sticky-Call-Bar bricht auf 28 Seiten-Templates

**Was der Nutzer sieht:** Sobald die Bar einen WhatsApp-Button trägt, passen die drei Buttons nicht mehr nebeneinander. Die Telefonnummer bricht um, die Pille wächst von 50 px auf **88 px** und wirkt wie ein Layoutfehler — die Nummer steht als „0151 / 5360 / 8515" untereinander.

**Messung `/de/unfallskizze`, gerenderte Bar-Höhe:**

| Viewport | Höhe | Zustand |
|---|---:|---|
| 390 × 844 (mobil) | 50 px | ✅ intakt (Nummer ist `hidden`, erscheint erst ab `sm:`) |
| 768 × 1024 | 88 px | ❌ gebrochen |
| 1024 × 768 | 88 px | ❌ gebrochen |
| 1440 × 900 | 88 px | ❌ gebrochen |

Also **auf jedem Desktop- und Tablet-Viewport**, nur mobil nicht.

**Stichprobe über 16 Seiten:** 9 gebrochen, 7 intakt — die Trennlinie ist exakt „WhatsApp-Button ja/nein".

**Ursache:** `components/landing/StickyCallBar.tsx:63` — der Container ist auf `max-w-md` (448 px) gedeckelt. Bei zwei Buttons reicht das, bei drei nicht. **28 der 52 Consumer** übergeben `whatsappHref`, darunter die dynamischen Templates `kfz-gutachter/[stadt]`, `haftpflicht/[slug]`, `decoder/[slug]`, `sachverstaendige/[slug]` — die realen Seitenzahlen liegen also deutlich über 28.

---

## Rang 4 — 🟠 Startseite: Die Sticky-Bar deckt die Mitte eines Formularfelds

**Was der Nutzer sieht:** Auf der Startseite liegt die feste Anruf-Pille über einem Eingabefeld des Lead-Formulars. Ein Klick auf die Feldmitte trifft die Bar, nicht das Feld.

**Messung (`document.elementFromPoint` auf die Feldmitte):**

| Viewport | betroffenes Feld | Überlappung | Mitte blockiert |
|---|---|---:|---|
| 1440 × 900 | „z. B. Köln oder 50670" | 28 px | **ja** |
| 1366 × 768 | — | 1 px | nein |
| 1280 × 720 | `name` (erstes Feld) | 40 px | **ja** |

**Einordnung — und Korrektur einer eigenen Fehlannahme:** Der erste Screenshot legte nahe, dass auch die 173 Stadtseiten betroffen sind. Die Nachmessung auf Köln, München und Hamburg zeigt: dort **überlappt** die Bar zwar, die Feldmitte bleibt aber frei — der Klick landet. **Betroffen ist nur die Startseite**, und dort viewport-abhängig. Das Feld bleibt oberhalb der Bar anklickbar, es ist also kein Totalausfall, aber es ist das Hauptformular der wichtigsten Seite.

Das ist exakt die Klasse, die in `AGENTS.md` als *Fixed-Overlay-Safe-Area-Gate* für `src/**` bereits maschinell verhindert wird — und die im Marketing niemand prüft.

---

## Rang 5 — 🟡 `/impressum` hat weder Kopf- noch Fußzeile noch Navigation

**Was der Nutzer sieht:** Eine nackte weiße Karte auf grauem Grund. Kein Logo, kein Menü, kein Footer, keine Möglichkeit, von dort auf die Website zu gelangen. Die Überschrift ist 24 px / w600 — jede andere Seite hat 40–62 px.

**Messung über 14 Seiten:**

| Seite | Header | Footer | Logo-Link | Nav-Links |
|---|---|---|---|---|
| 11 Standardseiten | ✅ | ✅ | ✅ | 35 |
| `/de/gutachter-partner` | ❌ | ✅ | ❌ | 0 |
| `/de/gutachter-finden` | ❌ | ❌ | ❌ | 0 |
| **`/de/impressum`** | ❌ | ❌ | ❌ | 0 |

`/gutachter-finden` ist als Vollbild-Kartenanwendung vertretbar. `/gutachter-partner` (SV-Akquise, kein Weg zurück ins Angebot) ist fragwürdig. `/impressum` ist der klare Ausreißer: eine rechtlich verpflichtende Seite, die häufig direkt angesteuert wird, ohne jeden Ausgang.

---

## Rang 6 — 🟡 Typografie: 44 verschiedene Schriftgrößen, 11 davon zwischen 13 und 16 px

Das ist der Punkt, der nach der Vormessung am dramatischsten klang — und der am wenigsten **direkt** schadet. Er ist trotzdem wichtig, weil er die Maschine ist, die die Ränge 1 und 2 erzeugt hat.

**Alle Quellen in px vereinheitlicht** (Tailwind-Skala + `text-[…]` + inline `fontSize`): **44 distinct**, 1.965 Vorkommen.

Das Gedränge im Lesetext-Band ist das eigentliche Problem:

```
13px(68)  13.5px(2)  13.6px(1)  14px(440)  14.4px(6)  14.5px(3)
14.72px(3)  15px(58)  15.2px(31)  15.6px(3)  16px(214)
```

**Elf Stufen zwischen 13 und 16 px.** Unterschiede von 0,2 px sind für niemanden wahrnehmbar — sie tragen keine Bedeutung, kosten aber jede Entscheidung neu. Eine Skala wird ab etwa 8–10 Stufen unlesbar; hier sind allein *in einem 3-px-Band* elf.

**Sektionsüberschriften — dasselbe Element, drei Gewichte, sechs Größen.** 283 `<h2>` verteilen sich auf **19 verschiedene Klassensignaturen**:

| Gewicht | n | | Größe | n |
|---|---:|---|---|---:|
| `font-extrabold` | 145 | | `text-lg` (18 px) | 46 |
| `font-bold` | 119 | | `text-xl` (20 px) | 39 |
| `font-semibold` | 5 | | `text-2xl` (24 px) | 34 |
| | | | `[1.375rem]` (22 px) | 22 |
| | | | `[1.0625rem]` (17 px) | 11 |
| | | | `[1.3125rem]` (21 px) | 4 |

Das ist der messbare Ausdruck von „Seiten verschiedener Baujahre": 17, 18, 20, 21, 22 und 24 px für dieselbe semantische Rolle.

**Kosmetisch, aber nicht harmlos** — solange es keine Skala gibt, ist jede neue Seite eine neue Erfindung.

---

## Rang 7 — 🟡 Sektionsrhythmus: 16 Muster, 24 px bis 112 px

Gerenderte vertikale Sektionsabstände (`padding-top/bottom`, live gemessen):

| Seite | Abstände in Dokumentreihenfolge |
|---|---|
| Startseite | 112 · 96 · 96 · 56 · 96 ×7 · 80 · 80 · 96 · 80 ×3 · 96 · 80 |
| `/kfz-gutachter/kosten` | 64 · 48 · 64 · 64 · 48 · 64 · 56 |
| `/kfz-gutachter/koeln` | 80 ×6 · 96 · 112 · 96 ×5 · 56 · 80 · 96 · 80 |
| `/werkstatt/partner-werden` | 80 · **8/24** · 40 · 48 · 64 · 40 · 32 · 80 |
| `/unfallskizze` | 28 · 0 · 24 · 28 · 28 · 40 |

Zwei Dinge fallen auf: `/unfallskizze` läuft in einem **völlig anderen Rhythmus** (24–40 px) als die Startseite (80–112 px), und `/werkstatt/partner-werden` springt **innerhalb einer Seite** von 8 px auf 80 px und wieder zurück. Im Quellcode: 16 verschiedene `py-`-Muster auf `<section>`, davon `py-16` (64×), `py-12` (26×), `py-20` (19×) plus 13 Einzelfälle.

Die Abstände selbst kommen sauber aus der 4er-Skala — arbitrary Werte gibt es nur **17** (`p-[18px]`, `px-[22px]`, `pb-[76px]`, …). Das Problem ist nicht die Skala, sondern dass es **keine Regel** gibt, welche Stufe eine Sektion bekommt.

---

## Rang 8 — 🟡 Wiederverwendung: Das Komponenten-Set ist praktisch ungenutzt

Es gibt eine `components/primitives/`-Ebene (Button, Card, Badge, Modal, Text, …) — sie wird von **3 von 214 TSX-Files (1,4 %)** importiert. `components/shared/` von 17 (7,9 %).

Dem stehen gegenüber:

| handgerollt | Vorkommen | Files |
|---|---:|---:|
| Cards (`bg-white` + `rounded` + `border/shadow` + Padding) | 167 | 91 |
| `<Link>` als Button gestylt | 102 | 53 |
| Pills / Badges | 24 | 23 |
| `<button>` mit eigenem Styling | 21 | 11 |

### Die drei häufigsten identischen Duplikate

**1. Chip-Pille „verwandte Seite" — 14 Files, 24 Vorkommen**
`rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo`
`app/[locale]/faq/FaqClient.tsx:156` · `app/[locale]/kfz-gutachter/ablauf/page.tsx:233,236,239` · `app/[locale]/gutachter-partner/marketing/page.tsx:194` · `app/[locale]/gutachter-partner/neukundengewinnung/page.tsx:194` · +8 weitere
Existiert zusätzlich in einer Ondo-Variante (12×), also ein ungeschriebenes `<Chip variant>`-Paar.

**2. Standard-Content-Card — 20 Files, 14 identische Signaturen**
`rounded-ios-md border border-claimondo-border bg-white p-6`
`app/[locale]/e-auto-gutachter/page.tsx:182,195` · `app/[locale]/gegnerische-versicherung-zahlt-nicht/page.tsx:217,234` · `app/[locale]/kfz-gutachter/vermittlungsportale-vergleich/page.tsx:303` · +15 weitere
Mit Varianten (`p-4`, `p-5`, `+shadow-claimondo-sm`, `border-claimondo-ondo/20 rounded-ios-lg`) kommen weitere 40+ Vorkommen dazu — es ist erkennbar *eine* Card mit Parametern, nur nirgends als solche geschrieben.

**3. Glass-Eyebrow-Pille über der Hero-Überschrift — 8 Files**
`inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm`
`app/[locale]/beratung-anfragen/page.tsx:157` · `app/[locale]/check/page.tsx:85` · `app/[locale]/flotte/partner-werden/page.tsx:135` · `app/[locale]/makler/partner-werden/page.tsx:133` · `app/[locale]/werkstatt/partner-werden/page.tsx:137` · `app/[locale]/schaden-melden/page.tsx:69` · `app/[locale]/schaden-melden/link-versendet/page.tsx:105` · `components/check/MaklerEmpfehlungHinweis.tsx:26`
Zeichen-für-Zeichen identisch über 7 Files — der achte weicht bereits ab (`border-claimondo-ondo/30 bg-white/80 text-claimondo-navy`). Genau so beginnt Drift.

---

## Rang 9 — 🟢 209 rohe Status-Farbskalen — echt, aber kein Vorwurf

`red-*`, `emerald-*`, `amber-*` und Verwandte kommen 209-mal in 32 Abstufungen vor. In `src/**` wäre das ein Ratchet-Verstoß. Im Marketing ist es **die einzig mögliche Schreibweise** — `bg-success`, `text-danger-strong` usw. erzeugen dort keine CSS-Regel (siehe Rang 2, wo genau dieser Versuch stillschweigend gescheitert ist).

Der Befund ist also nicht „209 Verstöße", sondern: **Diese 209 Stellen sind die Kandidaten, die beim Angleichen der Tokens mitwandern müssten.** Vorher sie einzeln zu „fixen" wäre Arbeit ohne Ziel.

---

## Rang 10 — 🟢 38 Tailwind-Default-Radien — kosmetisch

`rounded-3xl` (22×), `rounded-2xl` (14×), `rounded-lg` (1×), plus `rounded-[10px]`, `[6px]`, `[4px]`. Konzentriert in den vier `*/partner-werden`-Seiten (Flotte, Makler, Werkstatt — untereinander identisch aufgebaut) und den Rechtstexten (AGB, Datenschutz, Impressum, Nutzungsbedingungen).

Dem stehen **~370 korrekte `rounded-ios-*` / `rounded-full`** gegenüber. Die Radien-Disziplin ist real, es sind zwei abgrenzbare Seitenfamilien, die danebenliegen. Optisch fällt der Unterschied zwischen `rounded-3xl` (24 px) und `rounded-ios-lg` (24 px) übrigens **gar nicht** auf — nur `rounded-2xl` (16 px) vs. `rounded-ios-md` (18 px) ist minimal sichtbar. Reine Hygiene.

---

## Ausdrücklich **kein** Befund

Damit die Mängelliste nicht länger wirkt, als sie ist:

- **Farbdisziplin ist exzellent.** Alle 10 Hex-Werte in Klassennamen sind dokumentierte Fremdmarken (WhatsApp, LinkedIn). Die 48 Inline-Hex ohne `var(--brand-*)` liegen fast vollständig in `opengraph-image.tsx`-Dateien (Bildgenerierung, kein CSS-Kontext) und in `GoogleReviewsStrip.tsx`.
- **Die drei `sr-only`-`h1` sind korrekt.** `/faq`, `/gutachter-finden` und `/gutachter-partner` melden eine `h1` mit 16 px — das sind absichtlich versteckte Screenreader-Überschriften (1×1 px, geclippt), kein Layoutfehler. Meine erste Messung hat sie fälschlich als Bruch gelesen.
- **Die dritte Schriftfamilie ist nicht unsere.** `titilliumweb` erscheint auf **jeder** Seite — es ist das ProvenExpert-Siegel (`div.pe-pro-seal`), ein Fremd-Widget. Auffällig als visueller Fremdkörper (goldenes Siegel, eigene Typo, fixiert oben rechts auf jeder Seite), aber keine Design-System-Frage.
- **Startseite, `/kosten`, `/faq`, `/koeln`, `/werkstatt/partner-werden` wirken wie ein Auftritt.** Gleiche Navigation, gleiches Navy, gleiche Schrift, gleiche Rundungen, gleiche Formsprache. Die Marke trägt.

### Wirkt es wie ein Auftritt oder wie verschiedene Baujahre?

Überwiegend wie **ein** Auftritt. Woran man die Ausnahmen merkt, konkret:

1. **Vier verschiedene Hero-Bauformen.** Startseite = randloses Foto mit Overlay. `/kosten` = randloses Navy-Band. `/unfallskizze` = **eingerückte, abgerundete Navy-Karte** mit Rand ringsum. `/werkstatt/partner-werden` = heller Verlauf mit zentriertem dunklem Text. `/koeln` = **zwei gestapelte Heroes** (Fotoband mit Zitat, darunter Navy-Hero). Der Wechsel „randlos ↔ eingerückte Karte" ist der auffälligste Bruch.
2. **Der H1-Sprung.** 62 px (Start) → 60 px (Partner) → 54 px (Köln) → 48 px (Kosten) → 40 px (Unfallskizze) → 24 px (Impressum), bei drei verschiedenen Gewichten (600/700/800).
3. **Der Rhythmuswechsel.** `/unfallskizze` atmet in 28-px-Schritten, während die Startseite in 96-px-Schritten atmet. Nebeneinander gelegt wirkt das eine gedrängt, das andere großzügig.

`/impressum` fällt komplett aus dem Auftritt heraus — aber weil ihm Rahmen und Navigation fehlen (Rang 5), nicht wegen Tokens.

---

## Die drei größten Hebel

1. **Die fehlenden Tokens in `claimondo-marketing/app/globals.css` nachziehen** (Typo-Skala + semantische Farben aus `src/app/globals.css:124-132, 165-188`). Ein Block CSS repariert unmittelbar Rang 1 und Rang 2 — 376 falsch gerenderte Elemente und 8 farblose Fehlermeldungen — und schafft überhaupt erst die Voraussetzung dafür, die 44 Schriftgrößen und 209 Status-Farben je anzugleichen.

2. **`StickyCallBar.tsx:63` entdeckeln** (`max-w-md` → breiter bzw. `flex-wrap` verhindern) und die Startseiten-Überlappung durch Bodenabstand am scrollenden Container auflösen. Zwei kleine Änderungen an *einer* Komponente reparieren einen sichtbaren Layoutbruch auf 28+ Templates und eine Klickblockade auf dem wichtigsten Formular der Website.

3. **`check:token-audit` auf `claimondo-marketing/**` ausweiten** — aber **erst nach Hebel 1**, sonst meldet er 209 Farb- und 38 Radien-„Verstöße", für die es keine Alternative gibt. Danach mit Baseline auf den Ist-Stand und Boy-Scout-Abbau, exakt wie in `src/**`. Ohne diesen Schritt driftet alles Reparierte innerhalb weniger Monate zurück, weil im Marketing bis heute **kein einziges** der vier Design-Ratchets greift.

---

## Anhang — Reproduktion

Messskripte liegen im Scratchpad dieser Session (`measure-all.mjs`, `measure-dup.mjs`, `shots.mjs`, `overlap2.mjs`, `panel.mjs`, `nav.mjs`, `bar.mjs`).

Der Kernbeweis für Rang 1 + 2 ohne Werkzeuge nachvollziehbar:

```bash
curl -s https://claimondo.de/ | grep -oE '[^"]*\.css'          # CSS-Chunks der Live-Seite
curl -s https://claimondo.de/_next/static/chunks/<chunk>.css > live.css
grep -c "danger-strong"   live.css    # 0  → Klasse ohne Regel
grep -c "text-body-xs"    live.css    # 0  → Klasse ohne Regel
grep -c "claimondo-navy"  live.css    # >0 → Gegenprobe, Instrument lebt
grep -c "rounded-ios"     live.css    # >0 → Gegenprobe, Instrument lebt
```
