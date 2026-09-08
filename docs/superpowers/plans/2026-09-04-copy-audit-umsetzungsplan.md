# Copy-Audit Marketingseiten — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Befunde aus `docs/2026-09-04-copy-audit-marketingseiten.md` in zehn einzeln mergebaren PRs gegen `staging` beheben und die Klasse dauerhaft mit einem Copy-Lint (Ratchet + Prod-Spec) schließen.

**Architecture:** Copy lebt an vier Orten — `claimondo-marketing/i18n/messages/*.json` (6 Sprachen, Parität Pflicht), TS-Konstanten (`lib/brand/service-pitch.ts`, `lib/seo/brand-fakten-library.ts`, `lib/faq/faqs.ts`), Seiten-Dateien mit hartkodiertem Deutsch (`app/[locale]/**/page.tsx`) und Markdown (`content/claimondo/**`). autounfall.io hält Copy in generierten Dateien (`content/*.generated.ts`, „NICHT handeditieren") und ist ein eigener Build; die fünf Cluster-Domains sind fünf Kopien ohne Code-Sharing. Jeder Task ändert genau eine dieser Schichten und endet mit einem Prod-Smoke am gerenderten Text (Regel 4).

**Tech Stack:** Next 16 (Marketing standalone), next-intl, react-markdown + rehype-slug, vitest (Unit für Scanner), Playwright (`--project=marketing`, Prod-Smoke gegen claimondo.de), Node 24 für Skripte.

## Global Constraints

- **Regel 1:** nie auf `main`; Branch `kitta/copy-audit-<task>` von `origin/staging`, PR gegen `staging`. Kein `[locale]`-Dubletten-Fehlgriff: vor jeder Metadaten-Änderung prüfen, ob die Route doppelt existiert (`app/makler/partner-werden` UND `app/[locale]/makler/partner-werden`; `app/kfzgutachter-lp` UND `app/[locale]/kfzgutachter-lp` — beide Fassungen ändern).
- **Regel 4:** jeder Task endet mit einem Prod-Smoke per Playwright am **gerenderten Text** (`innerText`), nie per `curl`/Grep im HTML. Soll in Prosa steht bei jedem Task unter „Operatives Soll" und ist mit Aaron abzustimmen, bevor der Smoke als grün gilt.
- **RDG-Wortlaut (verbindlich):** Claimondo **koordiniert, kommuniziert, rechnet ab, zahlt aus** (im Sinne von „leitet die Auszahlung"); **verhandeln, durchsetzen, zurückholen, einholen, klagen, geltend machen, vertreten** tut ausschließlich „unsere Partnerkanzlei" (1× prominent „Partnerkanzlei LexDrive", sonst „unsere Partnerkanzlei"). Nie „unser Anwalt".
- **Zahlen-Register (eine Quelle, überall gleich):** Rückruf **15 Minuten (8–20 Uhr)** · Gutachter-Termin **< 48 h** · Auszahlung **Ø 32 Tage (Tag 30–60)** · Nutzungsausfall **23–219 €/Tag** · BVSK-Honorar **typisch 300–1.200 €, bis 2.500 €** · Bagatellgrenze **750 €** · Kürzung durch Prüfdienste **30–40 % (NDR 2022, Verbraucherzentrale, BGH VI ZR 38/22 ff.)**. „4–6 Monate Branchen-Durchschnitt" nur mit Quelle oder gar nicht (Aaron-Entscheid).
- **Anrede:** Sie. **Umlaute:** echte `ä ö ü ß` in jedem nutzersichtbaren String (auch `llms*.txt`).
- **i18n:** Änderungen in `de.json` immer in allen 6 Message-Dateien nachziehen (Parität; die Übersetzungs-Pipeline erkennt geänderte Werte NICHT — `scripts/i18n/translate.mjs --marketing --force` oder Handkorrektur, s. Audit E Umsetzungsprotokoll). Keine neuen Keys ohne alle 6 Dateien.
- **Generierte autounfall-Dateien** (`*.generated.ts`) nicht handeditieren; Korrekturen über Override-Maps (Muster `lib/serp-titel.ts`) oder im Renderer.
- **Kein Prod-DB-Write** ohne Aaron-Go (z. B. Netzwerkzahl aus DB).
- **7-Punkte-Audit** im Commit-Body (AGENTS.md).

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `.agents/product-marketing-context.md` (neu) | Positionierung, Zielgruppen, RDG-Regeln, Zahlen-Register, Ton — Grundlage aller Marketing-Skills |
| `scripts/lib/copy-lint-scan.mjs` (neu) + `scripts/copy-lint-scan.test.ts` (neu) | pure Detektoren: RDG-Muster, ASCII-Umlaute, Code in Überschriften, „SV/Mo", doppelte Marke — über Quelltext-Strings |
| `scripts/check-copy-lint.mjs` (neu) + `scripts/copy-lint-baseline.json` (neu) | Ratchet-Wrapper nach Muster `scripts/check-*.mjs` (`--warn` lokal, `--ratchet` CI) |
| `tests/e2e/marketing/copy-lint-prod.spec.ts` (neu) | Prod-Smoke: dieselben Regeln am gerenderten Text der Kernseiten |
| `claimondo-marketing/lib/brand/service-pitch.ts` | alter Pitch → RDG-konform (Task 1) |
| `claimondo-marketing/lib/seo/brand-fakten-library.ts`, `brand-constants.ts` | F55 „holt zurück", „bundesweit größte" (Task 1, 4) |
| `claimondo-marketing/components/landing/sections/BghAuthorityGrid.tsx` | Default-Subline (Task 1) |
| `claimondo-marketing/lib/faq/faqs.ts` | „klagen wir" (Task 1) |
| `claimondo-marketing/i18n/messages/{de,en,tr,ar,ru,pl}.json` | Keys aus Task 1, 2, 4, 6 |
| `claimondo-marketing/content/claimondo/cornerstones/{kfz-haftpflicht-schaden,ratgeber}.md` | Anker (Task 2) |
| `claimondo-marketing/app/[locale]/haftpflicht/page.tsx` | „Standard-Unfaelle" (Task 2) |
| `claimondo-marketing/app/[locale]/gewinnspiel/page.tsx`, `…/gewinnspiel/teilnahmebedingungen/page.tsx`, `…/gutachter-finden/page.tsx` | Titel doppelt (Task 2), „über 50" (Task 4) |
| `claimondo-marketing/app/[locale]/schaden-melden/page.tsx`, `components/landing/TrustBlock.tsx`, `components/landing/LandingFooter.tsx` | i18n (Task 3) |
| `claimondo-marketing/app/[locale]/gutachter-partner/page.tsx`, `components/partner/SvClaimClient.tsx` (Pfad im Task prüfen) | 10036, Warteliste, Du→Sie (Task 4, 5) |
| `claimondo-marketing/app/[locale]/{werkstatt,flotte,makler}/partner-werden/page.tsx` (+ `app/makler/partner-werden/page.tsx`) | RDG, i18n-Canonical (Task 1, 3) |
| `autounfall-io/lib/copy-sanitize.ts` (neu) + `autounfall-io/scripts/check-copy-sanitize.mjs` (neu), `autounfall-io/components/article/parts.tsx`, `autounfall-io/app/kfz-unfall/[stadt]/[typ]/page.tsx`, `autounfall-io/lib/serp-titel.ts` | Eyebrow/H1/Title-Sanitizer, pSEO-Grammatik (Task 7) |
| `kfz-gutachter-{koeln,duesseldorf,bonn,aachen,wuppertal}/lib/content.ts`, `components/HeroSection.tsx`, `components/*Timeline*` | H1-Split, Zahlen-Register, „Lösung ." (Task 8) |

---

### Task 0: Produkt-Marketing-Kontext anlegen

**Files:**
- Create: `.agents/product-marketing-context.md`

**Operatives Soll:** Jede künftige Copy-Session (Mensch oder Skill) findet Positionierung, Zielgruppen, RDG-Regeln und das Zahlen-Register an einer Stelle und muss die Zahlen nicht mehr aus 50 Namespaces zusammensuchen.

- [ ] **Step 1: Datei schreiben**

```markdown
# Claimondo — Product Marketing Context (Stand 04.09.2026)

## Produkt
Claimondo (Claimondo GmbH, Köln, gegr. 2025) koordiniert die Regulierung von Kfz-Haftpflichtschäden für unverschuldet Geschädigte: unabhängiger Sachverständiger vor Ort (< 48 h), Partnerkanzlei für Verkehrsrecht (LexDrive) für die Kommunikation/Verhandlung mit dem gegnerischen Versicherer, Partner-Werkstatt, Live-Fallakte. Für Geschädigte 0 € (§ 249 BGB, vorbehaltlich Anerkenntnis, ab ca. 750 € Schaden; bei Teilschuld anteilig). Claimondo verdient an Vermittlungsgebühren der Sachverständigen/Partner, nie am Geschädigten.

## Rechtliche Rollentrennung (RDG) — verbindlich in JEDER Formulierung
- Claimondo: koordiniert · organisiert · kommuniziert · disponiert · rechnet ab · leitet die Auszahlung weiter.
- Unsere Partnerkanzlei: verhandelt · setzt durch · holt zurück/ein · klagt · macht geltend · vertritt.
- Verboten: „wir verhandeln/setzen durch/holen zurück/klagen", „unser Anwalt". Erlaubt: „unsere Partnerkanzlei", 1× „Partnerkanzlei LexDrive".

## Zahlen-Register (eine Wahrheit; Änderung nur hier + überall nachziehen)
| Größe | Wert | Quelle |
|---|---|---|
| Rückruf | 15 Minuten, 8–20 Uhr | gelebter Prozess |
| Termin Sachverständiger | < 48 h | Prozessziel |
| Auszahlung | Ø 32 Tage (Tag 30–60) | Startseiten-KPI (Aaron) |
| Nutzungsausfall | 23–219 €/Tag (Klassen A–L) | lib/tools/nutzungsausfall.ts |
| BVSK-Honorar | typisch 300–1.200 €, bis 2.500 € | BVSK_STUFEN (kosten-kfz-gutachten) |
| Bagatellgrenze | 750 € | BGH-Linie |
| Prüfdienst-Kürzung | 30–40 % | NDR 2022 · Verbraucherzentrale · BGH VI ZR 38/22 ff. |
| Google-Bewertung | 5,0 · 27 (ProvenExpert live) | Widget |
| NICHT belegt (nicht verwenden ohne Quelle) | 2.000+ Fälle · 8 Mio. € · „4–6 Monate Branchen-Durchschnitt" · „über 50 Partner-Gutachter" · „hunderte SV" · „bundesweit größte" | offen (Aaron) |

## Zielgruppen und Sprache
- Geschädigte (B2C): gestresst, Kostenangst, Laien. Sie-Form, Frage als Überschrift, Antwort als erstes Wort, Fachwort in Klammern nach der Erklärung. Keine Ausrufezeichen.
- Sachverständige, Werkstätten, Flotten, Makler (B2B): Sie-Form, Zahlen zu Provision/Bindung/Ablauf zuerst.
- Ton: klar, direkt, mutig, ohne Superlative („Kein Call-Center-Roulette" ja, „bundesweit größte" nein).

## Properties und Rollen
- claimondo.de (+ gutachter./werkstatt./flotte./makler.): Conversion, Ansprüche (H3), Lokal (Stadtseiten). 6 Sprachen (de/en/tr/ar/ru/pl).
- autounfall.io: Education/How-to, standalone (keine Claimondo-Marke außer Vergleiche). Nur DE.
- kfz-unfallgutachter-<stadt>.de: lokale Conversion (Köln, Düsseldorf, Bonn, Aachen, Wuppertal).
- Keyword-Trennung: Stadt- und Brand-Keywords → claimondo.de/Cluster; Was-tun/Wie-geht/Technik → autounfall.io. Gleiche Themen auf beiden = Kannibalisierung.

## Referenzseiten (Vorlage)
/kfz-gutachter/kosten · /versicherung-schickt-gutachter · /check (Funnel) · Hero-Zeile der Partnerseiten · autounfall.io Quick-Answer-Struktur.
```

- [ ] **Step 2: Prüfen, dass die Marketing-Skills die Datei finden**

Run: `ls .agents/product-marketing-context.md && head -3 .agents/product-marketing-context.md`
Expected: Datei existiert, erste Zeile `# Claimondo — Product Marketing Context`.

- [ ] **Step 3: Commit**

```bash
git add .agents/product-marketing-context.md
git commit -m "docs(marketing): product-marketing-context als gemeinsame Copy-Grundlage

Audit:
- Build: n/a (Doku)
- UI: n/a
- Redundanz: ersetzt verstreute Zahlen in 50 Namespaces durch ein Register
- Dead-Code: nichts
- Spec: Copy-Audit 04.09. Task 0
- Inkonsistenz: Zahlen-Register nach Audit E
- Regression: n/a"
```

---

### Task 1: RDG-Sweep über alle Schichten (claimondo-marketing)

**Files:**
- Modify: `claimondo-marketing/lib/brand/service-pitch.ts:39-42, 106-122, 137-158, 229`
- Modify: `claimondo-marketing/components/landing/sections/BghAuthorityGrid.tsx:47`
- Modify: `claimondo-marketing/lib/seo/brand-fakten-library.ts:104`
- Modify: `claimondo-marketing/lib/faq/faqs.ts:293`
- Modify: `claimondo-marketing/app/[locale]/werkstatt/partner-werden/page.tsx:93`
- Modify: `claimondo-marketing/app/kfzgutachter-lp/page.tsx:287`, `claimondo-marketing/app/[locale]/kfzgutachter-lp/page.tsx:285`
- Modify: `claimondo-marketing/i18n/messages/de.json` Keys `home.prozess.steps[3].titel`, `home.prozess.steps[4].titel`, `home.versicherer_taktiken.taktiken[5].gegenargument`, `faq.groups[1].fragen[2].antwort`, `check.result_quote_sub`, `kfz_gutachter_ablauf.faqs[3].antwort` (+ dieselben Keys in en/tr/ar/ru/pl)
- Create: `scripts/lib/copy-lint-scan.mjs`, `scripts/copy-lint-scan.test.ts`

**Operatives Soll:** Ein Geschädigter liest auf keiner Seite und in keinem KI-Feed, dass Claimondo verhandelt, durchsetzt, zurückholt oder klagt. Wo eine Rechtshandlung beschrieben wird, steht „unsere Partnerkanzlei" als Handelnde. Der KI-Feed sagt dasselbe wie die Seite.

- [ ] **Step 1: Failing Test für den RDG-Scanner schreiben**

```ts
// scripts/copy-lint-scan.test.ts
import { describe, it, expect } from 'vitest'
import { scanRdg } from './lib/copy-lint-scan.mjs'

describe('scanRdg', () => {
  it('flaggt Erstperson-Rechtsverben', () => {
    expect(scanRdg('Wir verhandeln vollständige Erstattung.')).toHaveLength(1)
    expect(scanRdg('Wir setzen die Wertminderung durch.')).toHaveLength(1)
    expect(scanRdg('Wir holen es zurück.')).toHaveLength(1)
    expect(scanRdg('Im Streitfall klagen wir vor dem Landgericht.')).toHaveLength(1)
    expect(scanRdg('Claimondo holt diese Kürzungen zurück.')).toHaveLength(1)
    expect(scanRdg('schreibt unser Anwalt zurück')).toHaveLength(1)
  })
  it('lässt Partnerkanzlei, Koordination, Kommunikation und Cookie-Sätze durch', () => {
    expect(scanRdg('Unsere Partnerkanzlei verhandelt mit der Versicherung.')).toHaveLength(0)
    expect(scanRdg('Wir koordinieren Gutachter, Anwalt und Werkstatt.')).toHaveLength(0)
    expect(scanRdg('Wir führen die komplette Kommunikation mit der Versicherung.')).toHaveLength(0)
    expect(scanRdg('Cookies setzen wir nur nach Ihrer Einwilligung ein.')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run scripts/copy-lint-scan.test.ts`
Expected: FAIL — `Cannot find module './lib/copy-lint-scan.mjs'`

- [ ] **Step 3: Scanner implementieren**

```js
// scripts/lib/copy-lint-scan.mjs — pure, ohne I/O
export const RDG_PATTERNS = [
  ['wir_rechtsverb', /\b[Ww]ir\s+(verhandeln|klagen|fordern|erstreiten|erkämpfen|erzwingen|vertreten\s+Sie)\b/],
  ['wir_setzen_durch', /\b[Ww]ir\s+setzen\b[^.!?]{0,80}\bdurch\b/],
  ['wir_holen', /\b[Ww]ir\s+holen\b[^.!?]{0,80}\b(zurück|ein|raus|heraus)\b/],
  ['wir_fuehren_verhandlung', /\b[Ww]ir\s+führen\b[^.!?]{0,80}\b(Verhandlung|Verhandlungen|Gespräch|Gespräche)\b/],
  ['wir_machen_geltend', /\b[Ww]ir\s+machen\b[^.!?]{0,60}\bgeltend\b/],
  ['nachgestellt', /\b(verhandeln|klagen|fordern|erstreiten)\s+wir\b|\bsetzen\s+wir\b[^.!?]{0,60}\bdurch\b|\bholen\s+wir\b[^.!?]{0,60}\b(zurück|ein)\b/],
  ['unser_anwalt', /\bunser(e|em|en|er)?\s+(Anwalt|Anwälte|Rechtsanwalt|Rechtsanwälte)\b/],
  ['claimondo_rechtsverb', /\bClaimondo\s+(setzt\b[^.!?]{0,80}\bdurch|verhandelt|klagt|fordert|holt\b[^.!?]{0,60}\b(zurück|ein|raus))\b/],
]
export function scanRdg(text) {
  const hits = []
  for (const [code, re] of RDG_PATTERNS) {
    const m = text.match(re)
    if (m) hits.push({ code, match: m[0] })
  }
  return hits
}
export const UMLAUT_ASCII = /\b(fuer|ueber|koennen|muessen|waehrend|naechste[nrs]?|schaeden|faelle|zurueck|pruefen|pruefung|erklaert|hoehe|groesse|moeglich\w*|verfuegbar\w*|kuerzung(en)?|waehlen|ausserdem|grosse[nrs]?)\b/gi
export function scanUmlaute(text) { return [...new Set((text.match(UMLAUT_ASCII) || []).map(s => s.toLowerCase()))] }
export function scanHeadingCode(headingText) {
  return /<\/?[a-z][a-z0-9-]*(\s[^>]*)?>|&(amp|lt|gt|quot|nbsp);|\{[a-zA-Z_]+\}|\b[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}\b(?!\.(de|io|com))|\bSV\/Mo\b/.test(headingText)
}
export function scanTitleBrandTwice(title) { return /\|\s*Claimondo\s*\|\s*Claimondo/i.test(title) }
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run scripts/copy-lint-scan.test.ts`
Expected: PASS (2 Tests)

- [ ] **Step 5: Strings ersetzen — exakte Vorher/Nachher-Tabelle**

| Datei / Key | Vorher | Nachher |
|---|---|---|
| `BghAuthorityGrid.tsx:47` | `' Versicherer kürzen trotzdem. Wir holen es zurück.'` | `' Versicherer kürzen trotzdem. Unsere Partnerkanzlei holt es zurück.'` |
| `service-pitch.ts:120` (`PLATTFORM_MECHANIK_STEPS[2].body`) | `…schreibt unser Anwalt zurück – bevor Sie „Wartezeit" tippen können.` | `…schreibt unsere Partnerkanzlei zurück – bevor Sie „Wartezeit" tippen können.` |
| `service-pitch.ts:41` (`SERVICE_PITCH_SUB_HEADLINE_KFZGUTACHTER_LP`) | `Wir disponieren Ihren Gutachter (< 48 h), führen die Versicherungs-Verhandlung und setzen Ihren Anspruch BGH-konform durch. 0 € für Sie.` | `Wir disponieren Ihren Gutachter (< 48 h), unsere Partnerkanzlei verhandelt mit der Versicherung und setzt Ihren Anspruch BGH-konform durch. 0 € für Sie.` |
| `service-pitch.ts:39` (`SERVICE_PITCH_SUB_HEADLINE_CLAIMONDO`) | `Wir koordinieren Gutachter, Anwalt und Werkstatt – und führen die Verhandlung mit der gegnerischen Versicherung.` | `Wir koordinieren Gutachter, Anwalt und Werkstatt – unsere Partnerkanzlei verhandelt mit der gegnerischen Versicherung.` (= Wortlaut von `home.hero.sub_headline`) |
| `service-pitch.ts:140` (`ANSPRUECHE_REFRAMED[0].text`) | `Wir verhandeln vollständige Erstattung…` | `Unsere Partnerkanzlei verhandelt vollständige Erstattung…` |
| `service-pitch.ts:145` (`[1].text`) | `Wir setzen die Wertminderung … durch` | `Unsere Partnerkanzlei setzt die Wertminderung … durch` |
| `service-pitch.ts:150` (`[2].text`) | `Wir verhandeln Mietwagen…` | `Unsere Partnerkanzlei verhandelt Mietwagen…` |
| `service-pitch.ts:155` (`[3].text`) | `Wir holen Gutachter- und Anwaltskosten … ein` | `Unsere Partnerkanzlei holt Gutachter- und Anwaltskosten … ein` |
| `service-pitch.ts:229` (`SERVICE_PITCH_BRAND_BLOCK`, Ende) | `BGH-konform durchgesetzt.` | `Unsere Partnerkanzlei setzt die Ansprüche BGH-konform durch.` |
| `service-pitch.ts:214` (`SERVICE_PITCH_USPS[4]`) | `Hunderte BVSK-zertifizierte Sachverständige.` | `Verifizierte Sachverständige mit BVSK-, IHK- oder öbuv-Nachweis.` |
| `brand-fakten-library.ts:104` (F55) | `– Claimondo holt diese Kürzungen zurück` | `– unsere Partnerkanzlei holt diese Kürzungen zurück` |
| `faqs.ts:293` | `Im Streitfall klagen wir vor dem zuständigen Landgericht` | `Im Streitfall klagt die Partnerkanzlei vor dem zuständigen Landgericht` |
| `werkstatt/partner-werden/page.tsx:93` | `Claimondo setzt alle Ansprüche gegen die gegnerische Versicherung durch –` | `Claimondo koordiniert das Gutachten, unsere Partnerkanzlei setzt die Ansprüche gegen die gegnerische Versicherung durch –` |
| `kfzgutachter-lp/page.tsx:287` + `[locale]/…:285` | `Wir setzen alle Ansprüche durch` | `Unsere Partnerkanzlei setzt alle Ansprüche durch` |
| `de.json home.prozess.steps[3].titel` | `Wir treiben die Versicherung in Verzug` | `Unsere Partnerkanzlei setzt die Versicherung in Verzug` |
| `de.json home.prozess.steps[4].titel` | `Wir zahlen Ihnen aus` | `Die Versicherung zahlt aus – Sie sehen es live` |
| `de.json home.versicherer_taktiken.taktiken[5].gegenargument` | `Anwalt klagt vor dem zuständigen Landgericht.` | `Unsere Partnerkanzlei klagt vor dem zuständigen Landgericht.` |
| `de.json faq.groups[1].fragen[2].antwort` | `Unser Anwalt kennt die versicherungsspezifischen Taktiken` | `Unsere Partnerkanzlei kennt die versicherungsspezifischen Taktiken` |
| `de.json check.result_quote_sub` | `Wir holen das Maximum für Sie heraus.` | `Unsere Partnerkanzlei holt das Maximum für Sie heraus.` |
| `de.json kfz_gutachter_ablauf.faqs[3].antwort` | (enthält „unser Anwalt"/„wir holen" — Wortlaut beim Bearbeiten prüfen) | „unsere Partnerkanzlei …" |

Die fünf anderen Message-Dateien: dieselben Keys sinngemäß („our partner law firm", „ortak hukuk büromuz", …), nie den deutschen Wert stehen lassen.

- [ ] **Step 6: Quelltext-Scan über alle Copy-Schichten (lokal, muss 0 liefern)**

```bash
node -e "
import('./scripts/lib/copy-lint-scan.mjs').then(({scanRdg})=>{
  const fs=require('fs');const files=['claimondo-marketing/i18n/messages/de.json','claimondo-marketing/lib/brand/service-pitch.ts','claimondo-marketing/lib/seo/brand-fakten-library.ts','claimondo-marketing/lib/faq/faqs.ts','claimondo-marketing/components/landing/sections/BghAuthorityGrid.tsx','claimondo-marketing/app/[locale]/werkstatt/partner-werden/page.tsx','claimondo-marketing/app/[locale]/kfzgutachter-lp/page.tsx','claimondo-marketing/app/kfzgutachter-lp/page.tsx'];
  let n=0;for(const f of files){for(const h of scanRdg(fs.readFileSync(f,'utf8'))){n++;console.log(f,h.code,h.match)}}console.log('Treffer:',n);process.exit(n?1:0)})"
```
Expected: `Treffer: 0`, exit 0. (Der Text `datenschutz` „setzen wir … ein" liegt nicht in diesen Dateien; der Cookie-Satz ist im Unit-Test als Negativfall verankert.)

- [ ] **Step 7: Build der Marketing-App**

Run: `cd claimondo-marketing && npm run build 2>&1 | tail -5`
Expected: `✓ Compiled`, keine i18n-Parity-Fehler (`npm run check:i18n` grün).

- [ ] **Step 8: Prod-Smoke (nach Deploy) — Playwright am gerenderten Text**

```ts
// tests/e2e/marketing/copy-lint-prod.spec.ts (Auszug — vollständige Spec in Task 10)
import { test, expect } from '@playwright/test'
const RDG = /\bwir (verhandeln|setzen [^.]{0,80}durch|holen [^.]{0,80}(zurück|ein|heraus)|klagen)\b|\bunser(e[mnr]?)? anwalt\b|\bclaimondo (setzt [^.]{0,80}durch|verhandelt|klagt|holt [^.]{0,60}(zurück|ein))/i
for (const path of ['/', '/faq', '/haftpflicht/reparaturkosten', '/decoder/werkstatt-netz', '/werkstatt/partner-werden', '/kfzgutachter-lp']) {
  test(`RDG-frei: ${path}`, async ({ page }) => {
    await page.goto('https://claimondo.de' + path, { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText()
    expect(text).not.toMatch(RDG)
  })
}
test('llms-full.txt RDG-frei', async ({ request }) => {
  const body = await (await request.get('https://claimondo.de/llms-full.txt')).text()
  expect(body).not.toMatch(RDG)
})
```
Run: `PLAYWRIGHT_BASE_URL=https://claimondo.de npx playwright test tests/e2e/marketing/copy-lint-prod.spec.ts --project=marketing`
Expected: 7 passed. Positivkontrolle vor dem Fix: derselbe Lauf gegen den alten Stand muss rot sein (Startseite „Wir holen es zurück").

- [ ] **Step 9: Commit + PR gegen staging**

```bash
git add scripts/lib/copy-lint-scan.mjs scripts/copy-lint-scan.test.ts claimondo-marketing
git commit -m "fix(marketing): RDG-Rollentrennung in TS-Konstanten, Komponenten und Feeds

Claimondo koordiniert, die Partnerkanzlei verhandelt/setzt durch/holt zurück —
in service-pitch.ts, brand-fakten F55, BghAuthorityGrid-Default, faqs.ts, den
beiden kfzgutachter-lp-Fassungen, der Werkstatt-Partnerseite und 6 de.json-Keys
(+5 Locales). llms.txt/llms-full.txt sagen damit dasselbe wie die Seite.

Audit:
- Build: gruen (claimondo-marketing npm run build, check:i18n)
- UI: keine neuen Einstiege
- Redundanz: Scanner in scripts/lib/copy-lint-scan.mjs (pure), wiederverwendet in Task 10
- Dead-Code: nichts
- Spec: Copy-Audit 04.09. §2.1
- Inkonsistenz: Wortlaut identisch zu home.hero.sub_headline
- Regression: Consumer von service-pitch.ts (Hero/PlattformMechanik/ServiceRealitaet/kfzgutachter-lp/llms) gerendert geprueft"
```

---

### Task 2: Code in Überschriften, Fragmente, doppelte Marke, ASCII-Umlaute

**Files:**
- Modify: `claimondo-marketing/content/claimondo/cornerstones/kfz-haftpflicht-schaden.md:55-62, 70, 96, 130, 157, 192, 216, 240, 256, 277, 310, 330, 379`
- Modify: `claimondo-marketing/content/claimondo/cornerstones/ratgeber.md:43, 91, 142, 185, 233, 287, 317, 337` (+ Inhaltsverzeichnis-Block darüber)
- Modify: `claimondo-marketing/app/[locale]/haftpflicht/page.tsx:32-33`
- Modify: `claimondo-marketing/app/[locale]/gewinnspiel/page.tsx:40`, `claimondo-marketing/app/[locale]/gewinnspiel/teilnahmebedingungen/page.tsx` (Titel-Zeile), `claimondo-marketing/app/[locale]/gutachter-finden/page.tsx` (Titel-Zeile)
- Modify: `claimondo-marketing/i18n/messages/de.json` Keys `faq.groups[0].fragen[1].antwort`, `faq.groups[1].fragen[0].antwort` (+5 Locales)
- Modify: `claimondo-marketing/app/llms.txt/route.ts`, `claimondo-marketing/app/llms-full.txt/route.ts` (ASCII-Umlaute in Feed-Strings)
- Test: `claimondo-marketing/lib/content/claimondo-mdx.test.ts` (existierende Test-Datei erweitern; falls nicht vorhanden, neu anlegen)

**Operatives Soll:** Ein Leser der beiden Handbuch-Seiten sieht Überschriften wie „1. Die ersten 72 Stunden – Sofort-Maßnahmen", das Inhaltsverzeichnis springt beim Klick an die richtige Stelle, in keinem Titel steht die Marke zweimal, keine FAQ-Antwort bricht mitten im Satz, und auf `/haftpflicht` stehen echte Umlaute.

- [ ] **Step 1: Failing Test — kein Markdown-Heading enthält ein HTML-Tag**

```ts
// claimondo-marketing/lib/content/claimondo-mdx.test.ts (Ergänzung)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
function mdFiles(dir: string): string[] { return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? mdFiles(p) : p.endsWith('.md') ? [p] : [] }) }
it('kein Markdown-Heading enthält rohes HTML (react-markdown escaped es sichtbar)', () => {
  const bad: string[] = []
  for (const f of mdFiles(join(__dirname, '../../content/claimondo'))) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (/^#{1,6}\s.*<[a-z]/i.test(line)) bad.push(`${f}:${i + 1}`) })
  }
  expect(bad).toEqual([])
})
```

- [ ] **Step 2: Test laufen lassen — 20 Treffer erwartet**

Run: `cd claimondo-marketing && npx vitest run lib/content/claimondo-mdx.test.ts -t "rohes HTML"`
Expected: FAIL, Array mit 20 Einträgen (`kfz-haftpflicht-schaden.md:70`, … `ratgeber.md:337`).

- [ ] **Step 3: Anker entfernen und Inhaltsverzeichnis auf Slug-IDs umstellen**

Vorher (`kfz-haftpflicht-schaden.md:70`): `## <a name="akut"></a>1. Die ersten 72 Stunden – Sofort-Maßnahmen`
Nachher: `## 1. Die ersten 72 Stunden – Sofort-Maßnahmen`

`rehype-slug` (github-slugger) erzeugt daraus die ID `1-die-ersten-72-stunden--sofort-maßnahmen`. Das Inhaltsverzeichnis (Zeilen 55–66) entsprechend:

Vorher: `1. [Die ersten 72 Stunden – Sofort-Maßnahmen](#akut)`
Nachher: `1. [Die ersten 72 Stunden – Sofort-Maßnahmen](#1-die-ersten-72-stunden--sofort-maßnahmen)`

Alle 12 + 8 Überschriften und die zugehörigen Listeneinträge analog; die Slugs mit `node -e "const s=require('github-slugger');console.log(new s().slug('1. Die ersten 72 Stunden – Sofort-Maßnahmen'))"` erzeugen, nicht raten. Falls die Seite bereits `TableOfContents` aus den Headings rendert, den Markdown-TOC-Block stattdessen löschen (dann nur 20 Zeilen ändern).

- [ ] **Step 4: Fragmente und Umlaute**

| Key / Datei | Vorher | Nachher |
|---|---|---|
| `de.json faq.groups[0].fragen[1].antwort` | `…Versicherer-Prüfdienst-Kürzungen laut ), und BGH-Leitentscheidungen (VI ZR 38/22 ff., …` | `…Versicherer-Prüfdienst-Kürzungen laut NDR-Reportage 2022, Verbraucherzentrale und BGH-Leitentscheidungen (VI ZR 38/22 ff., …` |
| `de.json faq.groups[1].fragen[0].antwort` | `…die ohne Fahrzeugbesichtigung Positionen streichen. VI ZR 174/24) – aber nur wer widerspricht…` | `…die ohne Fahrzeugbesichtigung Positionen streichen. Der BGH hat diese Positionen bestätigt (VI ZR 65/18, VI ZR 174/24) – aber nur wer widerspricht…` |
| `haftpflicht/page.tsx:32-33` | `H6: 'Standard-Unfaelle', H7: 'Komplexe Faelle'` | `H6: 'Standard-Unfälle', H7: 'Komplexe Fälle'` |
| `gewinnspiel/page.tsx:40` | `title: 'Täglich 3 × 50 € Gutschein gewinnen \| Claimondo'` | `title: 'Täglich 3 × 50 € Gutschein gewinnen'` (Layout-Template hängt die Marke an) |
| `gewinnspiel/teilnahmebedingungen/page.tsx` | `title: 'Teilnahmebedingungen Gewinnspiel \| Claimondo'` | `title: 'Teilnahmebedingungen Gewinnspiel'` |
| `gutachter-finden/page.tsx` | `'Kfz-Gutachter-Termin online buchen – ohne Anruf \| Claimondo'` | `'Kfz-Gutachter-Termin online buchen – ohne Anruf'` |
| `llms.txt`/`llms-full.txt` Routen | `ueber`, `schaeden`, `pruefen`, `Kuerzungen`, `zurueck`, `kuerzung` in Feed-Strings | echte Umlaute (`grep -n "ueber\|schaeden\|pruef\|uerz\|zurueck" app/llms*.txt/route.ts` → 0 Treffer in String-Literalen) |

- [ ] **Step 5: Tests grün + Build**

Run: `cd claimondo-marketing && npx vitest run lib/content && npm run build 2>&1 | tail -3`
Expected: PASS; Build grün.

- [ ] **Step 6: Prod-Smoke**

```ts
test('Cornerstone-Überschriften ohne Anker, Sprungmarken funktionieren', async ({ page }) => {
  await page.goto('https://claimondo.de/kfz-haftpflicht-schaden', { waitUntil: 'networkidle' })
  const h2 = await page.locator('main h2').allInnerTexts()
  expect(h2.some(t => /<a name=/.test(t))).toBe(false)
  await page.locator('a[href="#1-die-ersten-72-stunden--sofort-maßnahmen"]').first().click()
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('#1-die')
  expect(await page.evaluate(() => !!document.getElementById(decodeURIComponent(location.hash.slice(1))))).toBe(true)
})
test('Titel ohne doppelte Marke', async ({ page }) => {
  for (const p of ['/gewinnspiel', '/gewinnspiel/teilnahmebedingungen', '/gutachter-finden']) {
    await page.goto('https://claimondo.de' + p)
    expect(await page.title()).not.toMatch(/\|\s*Claimondo\s*\|\s*Claimondo/)
  }
})
```
Expected: 2 passed; Positivkontrolle: gegen den alten Stand rot.

- [ ] **Step 7: Commit + PR**

```bash
git add claimondo-marketing
git commit -m "fix(marketing): Code in Ueberschriften, FAQ-Fragmente, doppelte Marke im Titel

Audit:
- Build: gruen
- UI: Sprungmarken der Cornerstones funktionieren wieder (20 Anker)
- Redundanz: Heading-Test in claimondo-mdx.test.ts
- Dead-Code: <a name>-Anker entfernt
- Spec: Copy-Audit 04.09. §3.1-3.3, §3.5
- Inkonsistenz: Umlaute auf /haftpflicht + llms-Feeds
- Regression: TableOfContents/rehype-slug IDs geprueft"
```

---

### Task 3: Funnel und Chrome übersetzen; halbdeutsche Fremdsprach-Seiten kanonisieren

**Files:**
- Modify: `claimondo-marketing/app/[locale]/schaden-melden/page.tsx` (hartkodierte Strings → `getTranslations('schaden_melden')`)
- Modify: `claimondo-marketing/components/landing/TrustBlock.tsx`, `claimondo-marketing/components/landing/LandingFooter.tsx:242`
- Modify: `claimondo-marketing/i18n/messages/{de,en,tr,ar,ru,pl}.json` — neuer Namespace `schaden_melden` (≈ 25 Keys: `badge`, `h1`, `intro`, `schuld.frage`, `schuld.gegner`, `schuld.gegner_hint`, `schuld.unklar`, `schuld.unklar_hint`, `schuld.selbst`, `schuld.selbst_hint`, `wann_wo`, `datum`, `ort`, `kontakt`, `vorname`, `nachname`, `telefon`, `email`, `email_hint`, `einwilligung`, `submit`, `rueckruf_text`, `rueckruf_cta`), `trust_block.*` (7 Keys), `footer.top_standorte`
- Modify: `claimondo-marketing/app/[locale]/{werkstatt,flotte,makler}/partner-werden/page.tsx`, `gewinnspiel/page.tsx`, `gewinnspiel/teilnahmebedingungen/page.tsx`, `kfzgutachter-lp/page.tsx`, `community/page.tsx` — `generateMetadata`: `alternates.canonical` auf die `de`-URL, keine `languages`-Alternates (Muster: `wissen/page.tsx`, Kopfkommentar dort)
- Modify: `claimondo-marketing/app/sitemap.ts` — für diese Routen keine hreflang-Alternates ausgeben

**Operatives Soll:** Ein türkischer Geschädigter, der `/tr/schaden-melden` öffnet, liest die Schuldfrage, die Formularfelder, die Einwilligung und den Rückruf-Hinweis auf Türkisch; Trust-Block und Footer-Überschrift sind in seiner Sprache. Die B2B-Partnerseiten, das Gewinnspiel und die LP existieren für Google nur auf Deutsch (Canonical), statt als fünf halbdeutsche Kopien.

- [ ] **Step 1: Keys anlegen (de.json) — Wortlaut 1:1 aus der heutigen Seite**

```json
"schaden_melden": {
  "badge": "Kostenlos & unverbindlich",
  "h1": "Ihren Schaden in wenigen Minuten melden",
  "intro": "Drei kurze Fragen, dann kommt Ihr sicherer Link per WhatsApp oder E-Mail. Den Gutachter-Termin und die Vollmacht erledigen Sie direkt dort, den Rest übernehmen wir.",
  "schuld": { "frage": "Wer ist schuld?", "gegner": "Der Gegner ist schuld", "gegner_hint": "Klassischer Haftpflichtfall – die Gegnerversicherung reguliert. Sie zahlen nichts dazu.", "unklar": "Die Schuldfrage ist unklar", "unklar_hint": "Wir klären das gemeinsam mit Ihnen und unserer Partnerkanzlei.", "selbst": "Ich bin selbst schuld", "selbst_hint": "Kasko- oder Selbstzahler-Fall – auch hier helfen wir. Ihr sicherer Link kommt direkt per WhatsApp oder E-Mail." },
  "wann_wo": "Wann und wo ist es passiert?", "datum": "Unfalldatum", "ort": "Unfallort",
  "kontakt": "Wie erreichen wir Sie?", "vorname": "Vorname", "nachname": "Nachname", "telefon": "Telefon", "email": "E-Mail",
  "email_hint": "Sie bekommen direkt nach dem Absenden einen sicheren Link an diese Adresse.",
  "einwilligung": "Ich willige ein, dass meine Daten zur Fall-Bearbeitung gespeichert und verarbeitet werden. Zusätzlich prüfen wir, ob meine Telefonnummer auf WhatsApp aktiv ist, damit Statusinformationen schneller zugestellt werden können. Die Datenschutzerklärung habe ich zur Kenntnis genommen.",
  "submit": "Sicheren Link erhalten",
  "rueckruf_text": "Keine Zeit für das Formular? Lassen Sie sich von einem Berater zurückrufen, meist innerhalb von 15 Minuten.",
  "rueckruf_cta": "Rückruf anfordern"
},
"trust_block": { "heading": "Mit anerkannten Partnern", "sv": "Zertifizierte Sachverständige", "sv_sub": "Unabhängig & gerichtsfest", "bvsk": "BVSK-Mitglieder", "bvsk_sub": "Bundesverband freier Sachverständiger", "kanzlei": "Fachanwalt-Netzwerk", "kanzlei_sub": "Partnerkanzlei LexDrive" },
"footer": { "top_standorte": "Top-Standorte" }
```
(„unseren Anwälten" → „unserer Partnerkanzlei" im `unklar_hint` — RDG.) Die fünf Übersetzungen mit `node scripts/i18n/translate.mjs --marketing` erzeugen und **jeden** Wert gegenlesen (Pipeline-Falle: pl.json trug 2024 ein türkisches Wort).

- [ ] **Step 2: Seite auf `t()` umstellen** — jedes Literal aus Step 1 durch `t('…')` ersetzen; `TrustBlock` und Footer-H4 erhalten `useTranslations('trust_block')` / `('footer')`.

- [ ] **Step 3: Parität und Build**

Run: `npm run check:i18n && cd claimondo-marketing && npm run build 2>&1 | tail -3`
Expected: Parität 6/6 grün, Build grün.

- [ ] **Step 4: Canonical der hartkodierten Seiten**

In den sechs `generateMetadata` (Partner ×3, Gewinnspiel ×2, LP, Community): `alternates: { canonical: 'https://claimondo.de/<pfad>' }` ohne `languages`; in `sitemap.ts` die Routen aus der hreflang-Ausgabe nehmen. Kontrolle: `curl -s https://claimondo.de/tr/werkstatt/partner-werden | grep -o 'rel="canonical" href="[^"]*"'` → `https://claimondo.de/werkstatt/partner-werden`.

- [ ] **Step 5: Prod-Smoke**

```ts
test('/tr/schaden-melden ist türkisch', async ({ page }) => {
  await page.goto('https://claimondo.de/tr/schaden-melden', { waitUntil: 'networkidle' })
  const h1 = await page.locator('h1').innerText()
  expect(h1).not.toBe('Ihren Schaden in wenigen Minuten melden')
  const text = await page.locator('main').innerText()
  const deMarker = (text.match(/\b(und|nicht|Ihre|Ihren|Sie)\b/g) || []).length
  expect(deMarker).toBeLessThan(5)             // Referenz heute: 27,7 % dt. Funktionswörter
  await expect(page.getByRole('button', { name: /Sicheren Link erhalten/ })).toHaveCount(0)
})
```
Positivkontrolle: gegen den alten Stand rot (H1 deutsch).

- [ ] **Step 6: Commit + PR** (`fix(marketing): schaden-melden, TrustBlock, Footer i18n ×6; hartkodierte B2B-Seiten kanonisch de`).

---

### Task 4: Belegbare Zahlen (UWG)

**Files:**
- Modify: `claimondo-marketing/app/[locale]/gutachter-partner/page.tsx:63-79` (`getNetzwerkGroesse`) + Consumer-Text + JSON-LD `Service.description`
- Modify: `claimondo-marketing/app/[locale]/gewinnspiel/page.tsx:79`, `de.json landing.hero.trust_badge` (+5)
- Modify: `claimondo-marketing/lib/seo/brand-constants.ts`, `claimondo-marketing/lib/seo/brand-fakten-library.ts` („bundesweit größte", „hunderte … 16 Bundesländer")
- Modify: `de.json` `page_meta.vorteile.title`, `vorteile.hero.h1_accent`, `vorteile.kpis[0].label`, `ueber_uns.zahlen.items[4].label`, `ueber_uns.trust_strip.labels[3]`, `faq.trust_strip.labels[3]`, `gutachter_finden.kpis[3].label` (+5 Locales); `app/[locale]/ueber-uns/page.tsx:411-431` (Fußnote rendern)
- Modify: `de.json kfz_gutachter_hub.*` („600 € und 2.400 €" → Zahlen-Register)
- **Aaron-Entscheid (Gate, nicht bauen ohne Go):** `home.kpis`, `home.kpi_methodik`, „4–6 Monate Branchen-Durchschnitt" (4 Keys), Cluster-Zahlen (2.500+, 10+ Jahre, 60 Min, +2.805 €)

**Operatives Soll:** Jede Zahl, die ein Sachverständiger, ein Makler oder ein Geschädigter auf den Seiten liest, ist entweder aus dem System belegbar oder trägt eine Quelle; keine Größe des Netzwerks wird behauptet, die nicht existiert.

- [ ] **Step 1: Netzwerkzahl**

```ts
// gutachter-partner/page.tsx — getNetzwerkGroesse: sv_leads NICHT mitzählen
const { count } = await supabase.from('sachverstaendige').select('id', { count: 'exact', head: true })
  .eq('ist_aktiv', true).eq('verifiziert', true).is('geloescht_am', null).not('ist_testaccount', 'is', true)
return count ?? null
```
Text: `Bereits {n} Sachverständige sind im Claimondo-Netzwerk.` → `Wir nehmen derzeit Sachverständige in weiteren Regionen auf – {n} Partner sind bereits freigeschaltet.` (n mit `toLocaleString('de-DE')`); JSON-LD `description` ohne Zahl. ⚠ `ist_aktiv`/`verifiziert` liegen nicht in den anon-Grants — der Read läuft über den Admin-Client (Muster `getNetzwerkGroesse` heute).

- [ ] **Step 2: Restliche Strings**

| Key / Datei | Vorher | Nachher |
|---|---|---|
| `gewinnspiel/page.tsx:79` | `{ zahl: 'über 50', label: 'Partner-Gutachter deutschlandweit' }` | `{ zahl: '< 48 h', label: 'bis der Gutachter vor Ort ist' }` — und die vorhandene 48-h-Kachel durch `{ zahl: '0 €', label: 'Eigenanteil bei unverschuldetem Unfall' }` ersetzen |
| `de.json landing.hero.trust_badge` (toter Namespace) | `Deutschlandweit über 50 Partner-Gutachter` | Key löschen (0 Consumer) |
| `brand-constants.ts` + `brand-fakten-library.ts` | `Claimondo ist die bundesweit größte digitale Plattform für die vollständige Regulierung von Kfz-Haftpflichtschäden in Deutschland.` | `Claimondo begleitet Kfz-Haftpflichtschäden von der Schadenmeldung bis zur Auszahlung: unabhängiger Sachverständiger, Partnerkanzlei, Werkstatt und Fallakte an einer Stelle.` |
| `brand-fakten-library.ts` (Fakt auf `/sachverstaendige/bvsk`) | `…umfasst hunderte zertifizierte Sachverständige in allen 16 Bundesländern – Termin überall in Deutschland in unter 48 Stunden vor Ort.` | `…besteht aus verifizierten Sachverständigen mit BVSK-, IHK- oder öbuv-Nachweis, Schwerpunkt NRW, bundesweit erreichbar – Termin in der Regel in unter 48 Stunden.` |
| `page_meta.vorteile.title` | `Vorteile – Versicherer-Kürzungen zurückgeholt` | `Vorteile – was Sie mit Claimondo behalten` |
| `vorteile.hero.h1_accent` | `Kürzungen zurückgeholt` | `Kürzungen abgewehrt` |
| `*.labels[3]` / `kpis[*].label` (5 Keys) | `Versicherer-Kürzung zurückgeholt¹` | `typische Kürzung durch Prüfdienste – dagegen arbeitet unsere Partnerkanzlei¹` |
| `ueber-uns/page.tsx:431` | (kein Fußnotenabsatz) | `<p className="text-caption text-claimondo-muted">{t('trust_strip.methodik_note')}</p>` unter dem Block rendern; ¹ auf `items[0]` mit der 750-€-Bedingung belegen |
| `kfz_gutachter_hub` (Honorar-Absatz) | `typischerweise zwischen 600 € und 2.400 €` | `typisch 300–1.200 €, bei hohen Schäden bis 2.500 €` |

- [ ] **Step 3: Entscheidungsvorlage für Aaron im PR** — KPI-Band (Vorschlag aus Audit E #2: `0 € · < 48 h · < 15 Min · § 249 BGB`), „4–6 Monate" (Quelle nennen oder streichen), Cluster-Zahlen (Beleg vom Netzwerk-SV einholen). Ohne Go bleiben diese Keys unverändert; der PR vermerkt sie als offen.

- [ ] **Step 4: Build + Prod-Smoke**

```ts
test('keine unbelegten Netzwerkzahlen', async ({ page }) => {
  for (const url of ['https://gutachter.claimondo.de/', 'https://claimondo.de/gewinnspiel', 'https://claimondo.de/haftpflicht/anscheinsbeweis', 'https://claimondo.de/vorteile', 'https://claimondo.de/ueber-uns']) {
    await page.goto(url, { waitUntil: 'networkidle' })
    const t = await page.locator('body').innerText()
    expect(t).not.toMatch(/1003\d Sachverständige|über 50 Partner|bundesweit größte|Kürzung zurückgeholt|Hunderte BVSK/i)
  }
})
```

- [ ] **Step 5: Commit + PR** (`fix(marketing): Netzwerkzahl, "über 50", "bundesweit größte", "zurückgeholt" belegbar formuliert`).

---

### Task 5: Versprechen und Funktion in Deckung bringen

**Files:**
- Modify: `claimondo-marketing/app/[locale]/ersteinschaetzung/page.tsx` + `de.json ersteinschaetzung.*` (47 Keys) + `page_meta.ersteinschaetzung.*`
- Modify: `de.json gutachter_partner.hero.subheadline`, `gutachter_partner.content.faqs[3]`, `gutachter_partner.success.*`, `gutachter_partner.form.*` (Warteliste-Keys löschen), `SvClaimClient.tsx` (~15 Du-Strings → Sie), `gutachter-partner/page.tsx:104` (sr-only-H1 entfernen, sichtbare H1 trägt den vollen Text)
- Modify: `de.json makler.*` Abschluss-CTA (`In 24 Stunden Rückmeldung` → `In zwei Minuten registriert – Zugang sofort.`) bzw. `app/[locale]/makler/partner-werden/page.tsx` (hartkodiert — beide Fassungen!)

**Operatives Soll:** `/ersteinschaetzung` verspricht genau das, was `/check` liefert (drei Fragen → Anspruchsliste → Kontakt); wer auf gutachter.claimondo.de landet, liest überall dieselbe Zeit („sofort registriert, Verifizierung parallel, Prüfung innerhalb 48 h"); der Makler-Abschluss verspricht keinen Rückruf, den es nicht gibt.

- [ ] **Step 1: Ersteinschätzung umschreiben (Entscheidung „Foto-Upload nicht auf der Roadmap" — sonst Upload bauen)**

| Key | Nachher |
|---|---|
| `ersteinschaetzung.hero.h1` | `Unverschuldeter Unfall? In 3 Fragen sehen, was Ihnen zusteht.` |
| `ersteinschaetzung.hero.sub` | `Kostenlose Ersteinschätzung: Schuldfrage, Schadenhöhe, Fahrzeugalter – wir zeigen sofort, welche Ansprüche Sie haben. Bei unverschuldetem Unfall trägt die gegnerische Haftpflicht Gutachter, Anwalt und Reparatur (§ 249 BGB).` |
| Schritte 01–03 | `Drei Fragen beantworten (30 Sekunden)` · `Anspruchsliste sofort` · `Auf Wunsch Rückruf in 15 Minuten` |
| KPI `3 Fotos + Beschreibung reichen` | `3 Fragen · 30 Sekunden` |
| `page_meta.ersteinschaetzung.description` | `In 3 Fragen prüfen, welche Ansprüche Sie nach einem unverschuldeten Kfz-Unfall haben: Gutachten, Wertminderung, Nutzungsausfall – kostenlos.` |
| JSON-LD `description` | ohne „Fotos hochladen"/„KI" |

- [ ] **Step 2: Freischaltungs-Aussagen vereinheitlichen**

| Key | Vorher | Nachher |
|---|---|---|
| `gutachter_partner.hero.subheadline` | `Wir nehmen Partner regional gestaffelt auf – sobald Ihre Region dran ist, melden wir uns. Kein Marketing, kein Spam.` | `In wenigen Minuten registriert und im Gutachter-Finder sichtbar. Die Qualifikationsprüfung läuft parallel – Ergebnis innerhalb von 48 Stunden.` |
| `gutachter_partner.content.faqs[3].antwort` | `Nach Freischaltung Ihrer Region: 7 bis 14 Werktage. …` | `Registrierung und Onboarding dauern zusammen unter 15 Minuten – danach sind Sie sichtbar. Die Verifizierung von DAT-, BVSK-, IHK- oder öbuv-Nachweis läuft parallel und ist innerhalb von 48 Stunden abgeschlossen; auf Wunsch gibt es einen 30-minütigen Onboarding-Call.` |
| `SvClaimClient.tsx` | `Finde deinen Eintrag` · `Suche nach deinem Namen, deiner Firma, PLZ oder DAT-Nummer.` · `Bestätige deine Kontaktdaten` · `schalten wir dich frei` · `Mit dem Absenden stimmst du …` | `Finden Sie Ihren Eintrag` · `Suchen Sie nach Ihrem Namen, Ihrer Firma, PLZ oder DAT-Nummer.` · `Bestätigen Sie Ihre Kontaktdaten` · `schalten wir Sie frei` · `Mit dem Absenden stimmen Sie …` (alle ~15 Strings) |
| Warteliste-Keys `gutachter_partner.success.headline` („Sie stehen auf der Liste."), `form.submit` („Auf die Warteliste setzen") | löschen (0 Consumer laut Audit B) — vorher `grep -rn "success.headline\|form.submit" claimondo-marketing/app claimondo-marketing/components` → 0 |

- [ ] **Step 3: Prod-Smoke**

```ts
test('Ersteinschätzung verspricht keine Foto-KI', async ({ page }) => {
  await page.goto('https://claimondo.de/ersteinschaetzung', { waitUntil: 'networkidle' })
  expect(await page.locator('main').innerText()).not.toMatch(/Fotos hochladen|KI analysiert|Fotos und Beschreibung/)
  await page.getByRole('link', { name: /Ersteinschätzung starten/ }).click()
  await expect(page).toHaveURL(/\/check$/)
  await expect(page.getByText(/Frage 1 von 3/)).toBeVisible()
})
test('gutachter-partner: eine Zeitaussage, Sie-Form, eine H1', async ({ page }) => {
  await page.goto('https://gutachter.claimondo.de/', { waitUntil: 'networkidle' })
  const t = await page.locator('body').innerText()
  expect(t).not.toMatch(/regional gestaffelt|7 bis 14 Werktage|Finde deinen Eintrag|deinem Namen/)
  expect(await page.locator('h1').count()).toBe(1)
})
```

- [ ] **Step 4: Commit + PR** (`fix(marketing): Ersteinschaetzung ehrlich, Partner-Freischaltung einheitlich, Claim-Flow Sie`).

---

### Task 6: Startseite, Hub, Vorteile, Wie-es-funktioniert, Über-uns — Copy-Politur

**Files:**
- Modify: `de.json` (+5): `home.prozess.steps[*].cta` („Details ansehen" ×5), `home.bgh.*` („Im Cluster ansehen →" ×7 → sprechende Labels), `wie_es_funktioniert.*` und `vorteile.*` („Mehr erfahren" ×7 je Seite), `kfz_gutachter_hub.themen[*].cta` (×9), `home.founder.founders[1].quote` / `ueber_uns.founders.items[1].quote_autor` (Aaron-Entscheid), `ueber_uns.hero.sub`, `ueber_uns.manifest.text` (Kommas), `ueber_uns.werte.items[1].text` (Passiv), `page_meta.home.title` / `home.hero.*` (Titel↔H1-Entscheid), `home.hero.trust_footer` (750 €)
- Modify: `claimondo-marketing/lib/kfz-gutachter/staedte.ts` (Köln-Intro, 54-Wort-Satz teilen)
- Modify: Startseite: Link auf `/check` im Hero-Sekundär-CTA (`home.hero.cta_secondary` → `Anspruch in 3 Fragen prüfen` → `/check`)

**Operatives Soll:** Jeder Knopf sagt, was passiert („Wie wir den Gutachter disponieren" statt „Details ansehen"); die Startseite verlinkt den `/check`-Funnel im Hero; das Über-uns-Manifest ist grammatisch sauber; ein Zitat hat einen Urheber.

- [ ] **Step 1: CTA-Labels** — je Karte den Kern der Karte als Verb-Phrase: Prozess-Schritte `So melden Sie den Schaden` · `Wie wir den Gutachter disponieren` · `Was Werkstatt und Partnerkanzlei tun` · `Wie die Frist die Versicherung unter Druck setzt` · `Wann das Geld kommt`; BGH-Grid: `Zum Urteil Werkstattrisiko →` usw. (Aktenzeichen-Thema); Hub/Vorteile/Wie-es-funktioniert: `Kosten ansehen` → `Was ein Gutachter kostet`, `Ablauf` → `So läuft es ab`, …

- [ ] **Step 2: Grammatik und Zitate**

| Key | Vorher | Nachher |
|---|---|---|
| `ueber_uns.hero.sub` | `Wir sind die Plattform die Geschädigten gibt was ihnen zusteht – nicht das was die Versicherung gerade noch durchwinkt.` | `Wir sind die Plattform, die Geschädigten gibt, was ihnen zusteht – nicht das, was die Versicherung gerade noch durchwinkt.` |
| `ueber_uns.manifest.text` | `Claimondo existiert weil das Standard ist und nicht Ausnahme. … Wer ohne Anwalt reguliert akzeptiert die erste Kürzung.` | `Claimondo existiert, weil das der Standard ist und nicht die Ausnahme. … Wer ohne Anwalt reguliert, akzeptiert die erste Kürzung.` |
| `ueber_uns.werte.items[1].text` | `Jede Schadensposition nach §249 BGB wird durchgesetzt` | `Unsere Partnerkanzlei setzt jede Schadensposition nach § 249 BGB durch` |
| `home.founder.founders[1].quote` / `ueber_uns…quote_autor` | `– Batman` / `Bruce Wayne` | ein Urheber, oder das Zitat durch einen eigenen Satz von Nicolas ersetzen (Aaron) |
| `home.hero.trust_footer` | `Anonyme Beratung · Keine Bindung · DSGVO-konform` | `Anonyme Beratung · Keine Bindung · 0 € bei unverschuldetem Unfall ab 750 € Schaden` |
| `staedte.ts` Köln `hyperlocal.intro` | ein Satz mit 54 Wörtern | zwei Sätze: Orte (Ringe, Zoobrücke, …) im ersten, Leistung im zweiten |

- [ ] **Step 3: Prod-Smoke** — `expect((await page.locator('main a, main button').allInnerTexts()).filter(t => /^(Mehr erfahren|Details ansehen|Im Cluster ansehen)/.test(t.trim()))).toEqual([])` auf `/`, `/wie-es-funktioniert`, `/vorteile`, `/kfz-gutachter`; `expect(hrefs).toContain('/check')` auf `/`.

- [ ] **Step 4: Commit + PR**.

---

### Task 7: autounfall.io — interne Metadaten, zerbrochene H1, Template-Grammatik

**Files:**
- Create: `autounfall-io/lib/copy-sanitize.ts` + `autounfall-io/scripts/check-copy-sanitize.mjs` (kein vitest im Build; Muster `check:serp-titel`)
- Modify: `autounfall-io/components/article/parts.tsx:88` (Eyebrow), Renderer der `rest-pages` (H1/Titel), `autounfall-io/lib/serp-titel.ts` (Titel mit `SV/Mo`), `autounfall-io/app/kfz-unfall/[stadt]/[typ]/page.tsx:65-98`, Decoder-Renderer für `decoder-data.generated.ts:41` („Sie nutzt"), Artikel-Footer („Stand:" aus einer Quelle), `/anspruch` (`&amp;`)

**Operatives Soll:** Kein Leser sieht Suchvolumen, Routen-Nummern oder Hub-Etiketten; „Schadenfreiheitsklasse" ist ein Wort; die 100 Stadt-Seiten lesen sich grammatisch („Auffahrunfälle sind in Berlin mit 24 % die häufigste Unfallkategorie."); eine Seite trägt ein Stand-Datum.

- [ ] **Step 1: Sanitizer mit Check-Skript**

```ts
// autounfall-io/lib/copy-sanitize.ts
const INTERNAL = /\s*·\s*(\d{1,3}(\.\d{3})*\s?SV\/Mo|Route \d+|Verursacher-(Hub|Bridge)|Dual-Hub|Pillar \d+)/g
export function sanitizeEyebrow(s: string): string { return s.replace(INTERNAL, '').replace(/^\s*·\s*|\s*·\s*$/g, '').trim() }
export function sanitizeHeading(s: string): string { return s.replace(/(\p{Ll})\s(\p{Ll})/gu, (m, a, b) => (/^(Schadenfreiheits|Nutzungs)$/.test(s.split(' ')[0]) ? a + b : m)) }
// gezielt: die beiden bekannten Bruchstellen; alles andere unverändert
export const KNOWN_H1_FIX: Record<string, string> = { 'Schadenfreiheits klasse': 'Schadenfreiheitsklasse', 'Nutzungs ausfall': 'Nutzungsausfall' }
export function fixH1(s: string): string { return KNOWN_H1_FIX[s] ?? s }
```

```js
// autounfall-io/scripts/check-copy-sanitize.mjs — laeuft in "npm run check:copy" (package.json ergaenzen)
import assert from 'node:assert/strict'
import { sanitizeEyebrow, fixH1 } from '../lib/copy-sanitize.ts'
assert.equal(sanitizeEyebrow('Verursacher-Hub · 28.750 SV/Mo'), '')
assert.equal(sanitizeEyebrow('Schadensposition · §249 BGB · 6.150 SV/Mo'), 'Schadensposition · §249 BGB')
assert.equal(sanitizeEyebrow('Route 12 · Auffahrunfall · 760 SV/Mo'), 'Auffahrunfall')
assert.equal(sanitizeEyebrow('Pillar 04 · Reparatur & Werkstatt · 7 Min Lesezeit'), 'Reparatur & Werkstatt · 7 Min Lesezeit')
assert.equal(fixH1('Schadenfreiheits klasse'), 'Schadenfreiheitsklasse')
console.log('copy-sanitize ok')
```
(TS-Import im mjs über `tsx`/`node --experimental-strip-types` wie bei `check:serp-titel` — dort nachsehen und dasselbe Muster nehmen.)

- [ ] **Step 2: Renderer verdrahten** — `parts.tsx:88` `{sanitizeEyebrow(article.eyebrow)}`; rest-pages-H1 `fixH1(page.h1)`; `serp-titel.ts`: die beiden Titel mit `· 1.330 SV/Mo` / `· 630 SV/Mo` in der Override-Map ohne Suffix.

- [ ] **Step 3: pSEO-Grammatik** (`page.tsx:98`)

Vorher: `{page.typ.name} sind in {stadt} mit {pct}% die <strong>{ranking}</strong> Unfall-Kategorien.`
Nachher: `{page.typ.pluralName} sind in {stadt} mit {pct} % <strong>{ranking === 'häufigste' ? 'die häufigste Unfallkategorie' : 'eine der häufigsten Unfallkategorien'}</strong>.` — `pluralName` je Typ in `lib/pseo.ts` ergänzen (`Auffahrunfälle`, `Parkschäden`, `Wildunfälle`, …); Fallback `pluralName ?? name + '-Unfälle'`.

- [ ] **Step 4: „Sie nutzt", „Stand", `&amp;`** — im Decoder-Renderer `html.replace(/\bSie nutzt\b/g, 'Sie nutzen')` ist Flickwerk; besser die Quelle des Generators korrigieren und neu generieren (Kommentar im File nennt den Generator). Artikel-Footer liest `SITE.contentStand` statt eines eigenen Datums. `/anspruch`: Quelle des `&amp;` (`content/rest-pages.manual.ts` oder Renderer mit doppeltem Escape) beheben.

- [ ] **Step 5: Prod-Smoke**

```ts
test('autounfall.io ohne interne Metadaten', async ({ page }) => {
  for (const p of ['/schadenfreiheitsklasse', '/nutzungsausfall', '/schmerzensgeld', '/schadenfreiheitsklasse/rabattschutz', '/kfz-unfall/berlin/auffahrunfall']) {
    await page.goto('https://autounfall.io' + p, { waitUntil: 'networkidle' })
    const t = await page.locator('body').innerText()
    expect(t).not.toMatch(/SV\/Mo|Route 1\d|Verursacher-Hub|Dual-Hub|Pillar 0\d/)
    expect(await page.title()).not.toMatch(/SV\/Mo/)
  }
  await page.goto('https://autounfall.io/schadenfreiheitsklasse')
  expect(await page.locator('h1').innerText()).toBe('Schadenfreiheitsklasse')
  await page.goto('https://autounfall.io/kfz-unfall/berlin/auffahrunfall')
  expect(await page.locator('main').innerText()).toMatch(/Auffahrunfälle sind in Berlin mit 24 % die häufigste Unfallkategorie\./)
})
```

- [ ] **Step 6: Commit + PR** (autounfall-io deployt separat — Deploy-Runbook `autounfall-io/DEPLOY.md`).

---

### Task 8: Cluster-LPs ×5 — H1, Zahlen-Register, Typografie

**Files (je Domain identisch, 5×):**
- Modify: `kfz-gutachter-<stadt>/components/HeroSection.tsx` (H1 → `<h1>Kfz-Gutachter {city}</h1><p class="hero-sub">Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard.</p>`), `lib/content.ts` (`HERO_FEATURES`, Timeline-Texte: `Rückruf innerhalb 60 Min` → `Rückruf in 15 Minuten (8–20 Uhr)`, `23–175 €/Tag` → `23–219 €/Tag`, `Ø Regulierungszeit · branchenüblich` → `Ø Regulierungszeit bei Claimondo`, `~TAG 32 €` → `~TAG 32`, `Mietwagen oder Geld ⓘ` → Icon aus der H3 in ein `aria-label`-Button), die beiden H2 mit „ Lösung ." / „ Rheinland ." (Satzzeichen in den Span ziehen), sekundärer Hero-CTA `Mehr erfahren` → `So läuft es ab`, doppelte 6-Schritte-Liste: Mobil-Variante `aria-hidden` + `hidden` per Breakpoint, damit nur ein Heading-Set im DOM zählt

**Operatives Soll:** Ein Leser in Köln liest dieselben Zusagen wie auf claimondo.de (15 Minuten, 23–219 €, 32 Tage als Claimondo-Wert), eine H1 mit einer Aussage, Überschriften ohne Icon-Zeichen und ohne Leerzeichen vor dem Punkt.

- [ ] **Step 1:** Änderungen in `kfz-gutachter-koeln`, Build lokal (`npm run build`), Screenshot 390 + 1280.
- [ ] **Step 2:** Byte-identische Komponenten-Änderung auf die vier anderen Ordner kopieren (`diff -r` der geänderten Dateien muss leer sein außer `lib/cluster.ts`).
- [ ] **Step 3: Prod-Smoke** — für alle 5 Hubs + 1 Spoke je Domain: `expect(h1).toMatch(/^Kfz-Gutachter [A-ZÄÖÜ]/)`, `expect(h1.length).toBeLessThan(40)`, `expect(text).not.toMatch(/Rückruf innerhalb 60|23–175|branchenüblich|Lösung \.|TAG 32 €/)`.
- [ ] **Step 4: Commit + PR** (Deploy via `scripts/deploy-cluster-a11y.py`-Muster, NO_GIT auf dem VPS).

---

### Task 9: Du → Sie in Content-Bodies und CTA-Band

**Files:**
- Modify: 45 Markdown-Dateien unter `claimondo-marketing/content/claimondo/{haftpflicht,decoder,sachverstaendige,cornerstones}/` (Liste: `for f in $(find claimondo-marketing/content -name "*.md" -not -path "*_translations*"); do grep -qE "\b(dein|deine|deinen|dir|dich|du)\b" "$f" && echo "$f"; done`)
- Modify: `de.json content.cta_band.headline_default`, `content.inline_check.text`, `wertminderung_rechner.titel`, `upload.signatur.successBody` (+5 Locales)

**Operatives Soll:** Snippet, erster Satz und CTA-Band sprechen den Leser gleich an (Sie).

- [ ] **Step 1:** Skriptgestützt ersetzen (`du → Sie`, `dein(e/en/em/er) → Ihr(e/en/em/er)`, `dir → Ihnen`, `dich → Sie`) mit Wortgrenzen, **danach jede Datei lesen** — Verbformen ändern sich („hast du" → „haben Sie", „machst" → „machen"); ein reiner Regex-Lauf erzeugt Grammatikfehler wie „Sie nutzt" (siehe autounfall.io).
- [ ] **Step 2:** Near-Duplicate-Messung unverändert (Jaccard, `aehnlichkeit.mjs` aus `PROJECT-seo-unfallinstandsetzung-cluster`), Build, 6 Locales.
- [ ] **Step 3: Prod-Smoke** auf 5 Stichproben: `expect(text).not.toMatch(/\b(dein|deine|dir|dich)\b/)`.
- [ ] **Step 4: Commit + PR** (in zwei bis drei PRs à 15 Dateien, damit Review möglich bleibt).

---

### Task 10: Copy-Lint als Ratchet und Prod-Spec verankern

**Files:**
- Create: `scripts/check-copy-lint.mjs`, `scripts/copy-lint-baseline.json`
- Create: `tests/e2e/marketing/copy-lint-prod.spec.ts` (alle Smokes aus Task 1–8 zusammengeführt)
- Modify: `package.json` (`"check:copy-lint": "node scripts/check-copy-lint.mjs"`), `.github/workflows/ci.yml` (Ratchet-Step `npm run check:copy-lint -- --ratchet` neben den anderen Ratchets), `AGENTS.md` (Abschnitt „Copy-Lint-Gate" nach dem Muster der bestehenden Gates: was, warum, Skip-Marker `// copy-lint-skip: <grund>`)

**Operatives Soll:** Ein neuer RDG-Verstoß, ein ASCII-Umlaut, ein HTML-Tag in einer Markdown-Überschrift, ein „SV/Mo" oder eine doppelte Marke im Titel blockt den PR; der nightly Prod-Lauf misst dieselben Regeln am gerenderten Text.

- [ ] **Step 1:** `check-copy-lint.mjs` nach dem Muster `scripts/check-silent-writes.mjs` (Dateien: `claimondo-marketing/i18n/messages/de.json`, `claimondo-marketing/lib/**/*.ts`, `claimondo-marketing/components/**/*.tsx`, `claimondo-marketing/app/**/page.tsx`, `claimondo-marketing/content/**/*.md`, `autounfall-io/content/*.ts`, `autounfall-io/lib/serp-titel.ts`, `kfz-gutachter-*/lib/content.ts`; Kommentare strippen; Baseline 0 nach Task 1–9).
- [ ] **Step 2:** Positivkontrolle dokumentieren: Probe-Datei mit „Wir verhandeln" → exit 1; entfernt → exit 0.
- [ ] **Step 3:** Spec in `playwright.config.ts` dem Projekt `marketing` zuordnen; im nightly `e2e`-Job läuft sie mit.
- [ ] **Step 4:** AGENTS.md-Abschnitt (≤ 25 Zeilen) + Commit + PR.

---

## Reihenfolge und Abhängigkeiten

| Reihenfolge | Task | Warum zuerst |
|---|---|---|
| 1 | 0 · Kontext | Grundlage, kein Risiko |
| 2 | 1 · RDG | Rechtsrisiko, kleinste Diffs, Scanner entsteht |
| 3 | 4 · Zahlen (Teil ohne Aaron-Gate) | UWG-Risiko (10036, „über 50") |
| 4 | 2 · Code in Überschriften | Aarons konkreter Befund, sichtbar |
| 5 | 3 · i18n Funnel | Konversionsseite |
| 6 | 5 · Versprechen | Vertrauen, braucht Roadmap-Entscheid (Foto-KI) |
| 7 | 7 · autounfall.io | eigener Build, unabhängig |
| 8 | 8 · Cluster | fünf Deploys, unabhängig |
| 9 | 6 · Politur | viele Keys, geringes Risiko |
| 10 | 9 · Du/Sie | größter Diff, zuletzt |
| 11 | 10 · Ratchet | schließt die Klasse, Baseline 0 erst nach 1–9 |

Aaron-Entscheide, die Tasks blockieren: KPI-Band + „4–6 Monate" + Cluster-Zahlen (Task 4), Foto-Upload ja/nein (Task 5), Zitat-Urheber (Task 6), Startseiten-Titel vs. H1 (Task 6), B2B-Fremdsprach-URLs kanonisieren (Task 3).

## Self-Review

- **Spec-Abdeckung:** Audit §2.1 → Task 1 · §2.2 → Task 4 · §2.3 → Task 5 (+ Titel/H1 in 6) · §3.1–3.3, 3.5 → Task 2 (+ Cluster in 8) · §3.4 → Task 7 · §4 → Task 3 · §5.1–5.4 → Task 6 · §5.5 → Task 5 · §5.6 → Task 8 · §5.7 → Task 7 · §5.8 → Task 9 (Du/Sie) + Task 6 (CTAs) · Dauerhaftigkeit → Task 10. Nicht im Plan: Audit A #1/#2 (Overlays — Layout, nicht Copy; Audit A/D), CTA-Position auf Ratgeberseiten (Design-Entscheid: Inline-CTA nach der „Kurz erklärt"-Box — als Vorschlag in Task 6 aufnehmen, wenn Aaron will).
- **Platzhalter:** keine „TBD"; wo ein Aaron-Entscheid fehlt, ist der Task als Gate markiert und der Rest des Tasks baubar.
- **Typ-Konsistenz:** `scanRdg`, `scanUmlaute`, `scanHeadingCode`, `scanTitleBrandTwice` (Task 1) werden in Task 10 unverändert konsumiert; `sanitizeEyebrow`/`fixH1` (Task 7) nur dort.


---

## Nachtrag aus dem zweiten Durchgang (Audit §9)

### Task 11: Tracking-Plan, Formular-Events, eine `LeadForm`-Komponente

**Files:**
- Create: `docs/marketing/tracking-plan.md`
- Create: `claimondo-marketing/components/landing/LeadForm.tsx` (ersetzt die vier `Field`-Kopien in `HomeLeadFormClient.tsx`, `CheckFunnelClient.tsx`, `StadtLeadFormClient.tsx`, `kfzgutachter-lp/LeadFormClient.tsx`)
- Modify: `claimondo-marketing/lib/analytics/track-event.ts` (typisierte Event-Namen), `MiniWizardClient.tsx` (`form_start`, `form_step`), `HomeLeadFormClient.tsx` (Honeypot, `form_start`), `StickyCallBar.tsx`/`HeroSection.tsx`/`SpokeCtaBand.tsx`/`InlineCheckCta.tsx` (`cta_click` mit `location`)
- Test: `claimondo-marketing/lib/analytics/track-event.test.ts` (existiert — um Namens-Whitelist erweitern)

**Operatives Soll:** Jede Interaktion auf dem Weg zum Lead hat genau einen Event-Namen nach `objekt_aktion`; ein Analyst kann aus GA4 die Kette Seite → CTA → Formularstart → Absenden lesen und sagen, welcher CTA-Ort konvertiert.

- [ ] **Step 1: Tracking-Plan schreiben** (`docs/marketing/tracking-plan.md`)

| Event | Properties | Trigger | Ort |
|---|---|---|---|
| `cta_click` | `location` (`hero`, `sticky`, `inline`, `footer`, `card`), `target` (`/check`, `/gutachter-finden`, `tel`, `wa`) | Klick auf primäre/sekundäre CTA | alle Marketing-Seiten |
| `form_start` | `form` (`home_rueckruf`, `schaden_melden`, `check`, `stadt`, `lp`, `gewinnspiel`) | erster Fokus in einem Feld | alle Formulare |
| `form_step` | `form`, `step` | Blockwechsel im Mini-Wizard, Frage im Check | `/schaden-melden`, `/check` |
| `generate_lead` (GA4-Standard, bleibt) | `source`, `value: 0`, `currency` | erfolgreicher Submit | alle Lead-Formulare (client) + Mini-Wizard (server, qualifiziert) |
| `check_start` / `check_step` / `check_complete` | bleiben | — | `/check` |
| `phone_click` / `whatsapp_click` | `location` | Klick | überall |
| `sa_signed` | `value: 210`, `currency: EUR`, `transaction_id` | Server (Flow) | App |

Abgelöst werden: `lead_created`, `check_pruefen`, `lead_submit`, `trackLpEvent('phone_call')` → `phone_click`.

- [ ] **Step 2: Failing Test — nur Whitelist-Namen**

```ts
// claimondo-marketing/lib/analytics/track-event.test.ts (Ergänzung)
import { EVENT_NAMES, trackEvent } from './track-event'
it('lehnt Event-Namen außerhalb des Tracking-Plans ab', () => {
  expect(EVENT_NAMES).toContain('cta_click')
  expect(() => trackEvent('lead_submit' as never)).toThrow(/nicht im Tracking-Plan/)
})
```

- [ ] **Step 3: Implementieren**

```ts
// track-event.ts
export const EVENT_NAMES = ['cta_click', 'form_start', 'form_step', 'generate_lead', 'check_start', 'check_step', 'check_complete', 'check_foto_cta_click', 'phone_click', 'whatsapp_click'] as const
export type EventName = (typeof EVENT_NAMES)[number]
export function trackEvent(name: EventName, params: Record<string, unknown> = {}): void {
  if (!(EVENT_NAMES as readonly string[]).includes(name)) throw new Error(`trackEvent: "${name}" ist nicht im Tracking-Plan (docs/marketing/tracking-plan.md)`)
  // … bestehender gtag/dataLayer-Pfad unverändert
}
```

`LeadForm.tsx`: Props `{ form: 'home_rueckruf' | 'stadt' | 'lp' | 'check', onSubmit, labels, submitLabel, source }`; rendert Name/Telefon/Stadt mit sichtbaren Labels, `autoComplete`, `inputMode`, Inline-Fehler, **Honeypot** (`name="honeypot"`, `tabIndex=-1`, `aria-hidden`, `autoComplete="off"`), feuert `form_start` beim ersten Fokus und `generate_lead` mit `source`. Die vier Consumer importieren sie; die vier `Field`-Definitionen entfallen (knip-Baseline sinkt).

- [ ] **Step 4: Prod-Smoke** — Playwright: `page.on('request')`/`dataLayer` beobachten: Fokus ins Namensfeld auf `/` → `form_start` mit `form=home_rueckruf`; Klick auf den Hero-CTA → `cta_click` mit `location=hero`. Positivkontrolle: vor dem Deploy fehlen beide Events.

- [ ] **Step 5: Commit + PR**.

### Task 12: Lead-Magnet „Das steht Ihnen zu" als PDF nach `/check`

**Files:**
- Create: `claimondo-marketing/app/[locale]/check/ergebnis-pdf/route.ts` (PDF aus `buildCheckResult`, Muster `unfallskizze`-Download), `claimondo-marketing/components/check/ErgebnisPdfCta.tsx`
- Modify: `CheckFunnelClient.tsx` (Ergebnisschirm: „Ergebnis als PDF an meine E-Mail" — optional, **nach** der sichtbaren Anspruchsliste), `lib/actions/…check-lead-action.ts` (E-Mail-Versand als Service-Mail über `resend-client`, werbefrei), `de.json` + 5 Locales (`check.pdf_cta`, `check.pdf_email_label`, `check.pdf_sent`)

**Operatives Soll:** Wer die drei Fragen beantwortet, sieht seine Anspruchsliste sofort und kann sie sich zusätzlich als PDF schicken lassen; die Zustell-Mail enthält nur das PDF, keinen Werbe-Block; ohne E-Mail bleibt alles nutzbar (Art. 7 IV DSGVO).

- [ ] Steps: (1) Test für den PDF-Builder (Snapshot der drei Tiers), (2) Route + CTA, (3) Mail-Template werbefrei (`BGH VI ZR 134/15`-Regel im Kopf des Templates), (4) Prod-Smoke per UI (Testadresse, Mail im Postfach prüfen), (5) Commit + PR. **Aaron-Entscheid vorab:** ob die E-Mail zusätzlich einen Reminder-Haken (Double-Opt-In) bekommt.

### Task 13: Cluster-Formular mit sichtbaren Labels (5 Domains)

**Files:** `kfz-gutachter-<stadt>/components/RueckrufPopover.tsx` (×5)

- [ ] `<label htmlFor>` für Vorname, Nachname, Telefon; Placeholder als Beispiel („z. B. Max"); `aria-required`; Prod-Smoke: `getByLabel('Telefonnummer')` findet das Feld auf allen 5 Hubs (Positivkontrolle: heute wirft `getByLabel`).

### Task 14: Experiment-Infrastruktur light (nur nach Task 11)

**Files:** `claimondo-marketing/middleware.ts` (Cookie `cm_exp_<name>` per Zufall, 30 Tage), `lib/analytics/experiment.ts` (`getVariant(name)` serverseitig, `dataLayer.push({ event: 'experiment_view', experiment, variant })`), `docs/marketing/experiment-backlog.md` (ICE-Liste aus Audit §9.5)

- [ ] Erst bauen, wenn `cta_click`/`form_start` Daten liefern und Aaron eine der drei Hypothesen freigibt. Primärmetrik = Mikro-Conversion (`check_start`-Rate), Guardrail = `generate_lead`.

### Entscheidungsvorlagen ohne Code (Aaron / Anwalt)

1. **Cold-Mail an `sv_leads`** — UWG § 7 II Nr. 3 (Audit §9.6): weiterführen, stoppen oder auf Telefon (cannaflow) verlagern? Ohne Freigabe kein weiterer Versand.
2. **Gewinnspiel-Teilnahmebedingungen** — anwaltliche Prüfung vor dem Launch (Marker `COORDINATION-gewinnspiel-taegliche-verlosung`).
3. **GA4 `G-9YF2W9ZP2S` mit Ads verknüpfen** und `sa_signed` als Schlüsselereignis importieren (Doc 20.06.) — im Ads-Konto, kein Code.
4. **Resend Open-/Click-Tracking** auf Domain-Ebene ausschalten oder per Einwilligung steuern (TDDDG § 25).

---

## Design-Tasks aus dem impeccable-Audit (05.09.2026)

Quelle: `docs/2026-09-05-impeccable-design-audit-marketingseiten.md` (Score 10/20). Je Task ein PR gegen `staging`, Regel-4-Smoke per `service-pitch-overlays-klickbar.spec.ts` bzw. neuer Spec, Messung mit `C:/pwtool/design-crawl.mjs` / `overlay-precise.mjs` vorher/nachher.

### Task D1: Overlays geben CTAs frei, Kontrast, Tap-Ziele, Heading-Reihenfolge — ERLEDIGT (PR #5868)

`StickyCallBar` weicht vor Lead-Formular-Feldern, Hero-CTAs und `data-sticky-bar-avoid`; ProvenExpert-Siegel < 1400 px aus (Entscheidung Aaron, reversibel); `shield/50|60 → /75`; Footer `h4 → h2`; FAQ-Anker 28 px; Markdown-Tabellen `tabIndex=0`; `GooglePlaceAutocomplete` mit `id`; autounfall Clarity-Leiste; Cluster-Cookie-Leiste mobil. **OFFEN: Regel-4-Smoke nach Deploy** (Spec im Branch, prod vorher 4 failed).

### Task D2: Typografie — Fließtext 16 px, Zeilenlänge, Kicker-System

**Entscheidung Aaron zuerst:** (a) `--text-body` 14 → 16 px global (830 Seiten reflowen) oder (b) nur `prose`/Ratgeber/Formularhinweise auf 16 px. Danach: `max-w-prose` (65–75 ch) auf Intro-Absätze unter Sektionsüberschriften und Kartentexte; Kicker (`text-xs uppercase tracking-[0.18em]`, 160 Stellen) auf einen je Seite reduzieren oder in DESIGN.md als System benennen. Messung: Anteil Fließtext < 16 px (Aufnahme: 77 %), Seiten mit Absätzen > 80 ch (770).

- Files: `claimondo-marketing/app/globals.css:166-175`, `components/landing/sections/*.tsx`, `components/content/MarkdownRenderer.tsx`
- Test: `design-crawl.mjs` auf 20 Repräsentanten vorher/nachher; Unit-Test für einen `max-w-prose`-Helper falls extrahiert

### Task D3: Distill — Startseite und Stadtseiten auf eine Entscheidung je Bildschirm

Hero: ein Primär-CTA + Telefon (statt 4 CTAs + Leiste + Bubble = 8 Aktionen); Kennzahlen-Streifen entfernen oder nur belegte Zahlen mit Quelle (verknüpft mit Copy-Task 4); fünf Kartengitter → zwei Sektionen mit verschiedener Struktur (nummerierte Liste, Tabelle, Prosa); Seitenlänge 29.818 px → ≤ 12.000 px mobil. Stadtseiten: Doppel-Hero (Foto-Zitat + Text-Hero) zu einem. **Entscheidung Aaron:** Stockfoto-Hero ersetzen (PRODUCT.md Anti-Referenz 1) — Vorschlag: echtes Foto aus dem Netzwerk (Gutachter am Fahrzeug) oder Drenched-Hero ohne Foto wie „Sie reden mit niemandem".

- Files: `components/landing/LandingPage.tsx`, `sections/HeroSection.tsx`, `HomeTrustStripSection.tsx`, `AnsprueecheSection.tsx`, `BeweisSection.tsx`, `BghAuthorityGrid.tsx`, `app/[locale]/kfz-gutachter/[stadt]/*`
- Test: Seitenlänge + CTA-Zahl im ersten Viewport (Playwright), Lead-Rate vorher/nachher (GA4 `generate_lead`, 4 Wochen)

### Task D4: Performance — Hero-Bilder, CLS

`priority` + `sizes` für Hero-`IMG.object-cover` der Stadtseiten (LCP 5,5–6,5 s), Cluster `hero-photo-bg` (6–7 s) als `next/image` mit Maßen (17 Bilder ohne width/height, 6 überdimensioniert je Startseite); Hero-Höhe auf `/kfz-gutachter`-Hub reservieren (CLS 0,389 mobil en/ar/tr); autounfall-Footer außerhalb der Suspense-Grenze (CLS 0,331 auf 20 Desktop-Seiten). Messung ohne Crawl-Last (Einzelseiten, 3 Läufe).

- Files: `app/[locale]/kfz-gutachter/[stadt]/page.tsx`, `app/[locale]/kfz-gutachter/page.tsx`, `kfz-gutachter-*/app/page.tsx` + `lp/[ort]`, `autounfall-io/app/layout.tsx`
- Test: `design-crawl.mjs` LCP/CLS je Seite; Lighthouse aus `C:/pwtool`

### Task D5: Harden — i18n-Blöcke, RTL, Markup

Verfügbarkeitsstreifen, ProvenExpert-Zeile, Trust-Zeile („Anonyme Beratung · …") in die Messages (6 Sprachen, String-Replace-Regel beachten); Flagge → Sprachkürzel; RTL-Overflow `ar/haftpflicht/nutzungsausfall` (`div.min-h-screen` 600 px); `nested-interactive` (`div[data-monika-widget]`, `#netzwerkTeamCard`); `dl`-Wrapper `.space-y-3`; Icon-Links `aria-label`; Subdomain-RSC-Prefetch (CORS) — Links von Subdomains auf claimondo.de-Routen als `prefetch={false}` oder absolute URLs; Verfügbarkeitsstreifen mit echten Slots je Stadt statt „09:00" überall.

- Files: `components/landing/sections/VerfuegbarkeitStreifen.tsx`, `components/landing/TrustBlock.tsx`, `LandingTopbar.tsx`, `i18n/messages/*.json`, `components/content/VersichererHero.tsx`, Monika-Widget-Komponente
- Test: `design-crawl.mjs` auf `/en`, `/ar`, `/ar/haftpflicht/nutzungsausfall`; axe-Regeln `nested-interactive`, `definition-list`, `link-name` = 0

### Task D6: Cluster ×5 konsolidieren

Kicker `#7ba3cc` (2,5:1) → dunkler; Overlays auf zwei reduzieren (Siegel oder FABs, nicht beides + Cookie); Bildmaße; Geviertstriche (Copy-Task 8); Navy+Gold-Reflex prüfen (Entscheidung Aaron); Änderungen als Script über alle fünf Kopien (Dateien sind byte-identisch, s. D1).

### Task D7: DESIGN.md (`/impeccable document`)

Aus `globals.css` (Tokens, Radien `rounded-ios-*`, Typo-Skala, Glass-Klassen, Kicker) ein DESIGN.md an der Repo-Wurzel erzeugen; darin Kicker, Glass und Kartengitter entweder als System benennen (mit Regeln, wann) oder streichen. Voraussetzung für konsistente Folgearbeit mit den impeccable-Kommandos.
