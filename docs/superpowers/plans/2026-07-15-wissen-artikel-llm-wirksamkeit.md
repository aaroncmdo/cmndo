# KI-Wissensartikel LLM-wirksam machen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Veröffentlichte `wissen_artikel` auf allen LLM-/SEO-Surfaces sichtbar machen (llms.txt, llms-full.txt→MCP, Sitemap, FAQPage-Schema), Freshness reparieren, und die Crawl-Pipeline auf mehr frische News trimmen.

**Architecture:** Additive Änderungen über 2 Next-Apps. `claimondo-marketing` (Domain claimondo.de) rendert die öffentlichen Surfaces und liest published Artikel via bestehendem `getPublishedArtikel()` (Anon-Client, RLS-gated). `src` (app.claimondo.de) hält die Pipeline. Neue reine Render-Logik lebt in einem testbaren `llms-render.ts`-Helfer; Routes bleiben dünn.

**Tech Stack:** Next.js 15 (App Router, `force-static`+ISR Routes, async `sitemap()`), TypeScript, Supabase JS (Anon), Vitest, Anthropic SDK (Pipeline).

## Global Constraints

- **Kein DDL, kein Prod-Daten-Write.** Alle 4 Spalten (`audience`,`quelle`,`meta_description`,`last_modified`) existieren bereits (verifiziert Prod `paizkjajbuxxksdoycev`).
- **Branch/Worktree:** Arbeit läuft im Worktree `.claude/worktrees/wissen-artikel-llm-wirksamkeit` auf Branch `kitta/wissen-artikel-llm-wirksamkeit` (off `origin/main`). **Nie auf main pushen** (Regel 1). PR gegen `staging`.
- **2 PRs:** PR-A = `claimondo-marketing/**` (Tasks 1–7). PR-B = `src/**` (Tasks 8–10). Getrennte Branches beim Push (siehe Task 7/10).
- **Umlaute:** llms.txt/llms-full.txt/Sitemap sind öffentliche deutsche Content-Surfaces → echte Umlaute (`ä ö ü ß`) in allen Strings. (Kommentare/Commits dürfen ASCII sein.)
- **Commit-Format:** 7-Punkte-Audit-Block im Body, `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` als letzte Zeile (AGENTS.md §Post-Task-Audit).
- **Regel 4 (Prod-Smoke):** Nach Deploy jedes PRs ein Prod-Verify der betroffenen Surfaces (Tasks 7 + 10) — Aufgabe bleibt offen bis grün.
- **tsc-Heap:** Voller `tsc`/`build` im Main-App braucht `NODE_OPTIONS=--max-old-space-size=8192`.
- **Alle Pfade unten sind relativ zum Worktree-Root** `.claude/worktrees/wissen-artikel-llm-wirksamkeit/`.

---

## Task 0: Environment-Setup (Dependencies installieren)

Ein frischer Worktree hat **kein** `node_modules` (gitignored) — ohne Install laufen weder tsc noch Tests noch Build.

- [ ] **Step 1: Root-Deps installieren**

Run (im Worktree-Root):
```bash
npm install
```
Expected: `node_modules/` entsteht, exit 0.

- [ ] **Step 2: Marketing-Deps installieren**

Run:
```bash
cd claimondo-marketing && npm install && cd ..
```
Expected: `claimondo-marketing/node_modules/` entsteht, exit 0.

- [ ] **Step 3: Smoke-Check der Test-Runner**

Run:
```bash
cd claimondo-marketing && npx vitest run lib/wissen/db-articles.test.ts ; cd ..
```
Expected: bestehende Tests PASS (beweist Vitest+Pfade funktionieren). Kein Commit (Setup erzeugt keine getrackten Changes).

---

## Task 1: `db-articles` — audience/quelle + `groupByAudience`

**Files:**
- Modify: `claimondo-marketing/lib/wissen/db-articles.ts`
- Test: `claimondo-marketing/lib/wissen/db-articles.test.ts`

**Interfaces:**
- Produces: `WissenArtikel` erweitert um `audience: string` und `quelle: string`; `groupByAudience(items: WissenArtikel[]): { consumer: WissenArtikel[]; b2b: WissenArtikel[] }`.
- Consumes: nichts.

- [ ] **Step 1: Test-Factory um Pflichtfelder erweitern**

In `db-articles.test.ts`, im `makeArtikel`-Objektliteral (nach `author: 'aaron-sprafke',`) ergänzen:
```ts
    audience: 'consumer',
    quelle: 'redaktion',
```

- [ ] **Step 2: Failing test für `groupByAudience` schreiben**

Am Ende von `db-articles.test.ts` anhängen (und den Import oben um `groupByAudience` ergänzen: `import { mapArtikelToFeedItem, mergeAndSortItems, groupByAudience, type WissenArtikel } from './db-articles'`):
```ts
// ----- groupByAudience -----

describe('groupByAudience', () => {
  it('teilt nach audience in consumer und b2b', () => {
    const c = makeArtikel({ slug: 'c1', audience: 'consumer' })
    const b = makeArtikel({ slug: 'b1', audience: 'b2b' })
    const { consumer, b2b } = groupByAudience([c, b])
    expect(consumer.map((x) => x.slug)).toEqual(['c1'])
    expect(b2b.map((x) => x.slug)).toEqual(['b1'])
  })

  it('unbekannte/leere audience faellt auf consumer', () => {
    const x = makeArtikel({ slug: 'x', audience: '' })
    const { consumer, b2b } = groupByAudience([x])
    expect(consumer).toHaveLength(1)
    expect(b2b).toHaveLength(0)
  })

  it('erhaelt die Reihenfolge (newest-first bleibt)', () => {
    const a = makeArtikel({ slug: 'a', audience: 'b2b' })
    const b = makeArtikel({ slug: 'b', audience: 'b2b' })
    const { b2b } = groupByAudience([a, b])
    expect(b2b.map((x) => x.slug)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run:
```bash
cd claimondo-marketing && npx vitest run lib/wissen/db-articles.test.ts ; cd ..
```
Expected: FAIL — `groupByAudience is not a function` (bzw. TS-Fehler `audience`/`quelle` unbekannt).

- [ ] **Step 4: `WissenArtikel`-Type + SELECT erweitern**

In `db-articles.ts`, im `WissenArtikel`-Type nach `artikel_typ: string | null` ergänzen:
```ts
  audience: string
  quelle: string
```
Und `SELECT_COLUMNS` ersetzen:
```ts
const SELECT_COLUMNS =
  'id,slug,title,body,excerpt,key_facts,meta_description,primary_keyword,cluster,artikel_typ,last_modified,veroeffentlicht_am,author,audience,quelle'
```

- [ ] **Step 5: `groupByAudience` implementieren**

In `db-articles.ts` ans Datei-Ende anhängen:
```ts
/**
 * Teilt veroeffentlichte Artikel nach Zielgruppe auf. Pure — kein DB-Call.
 * consumer = Geschaedigten-Ratgeber, b2b = Fachartikel (SV/Kanzlei/Werkstatt).
 * Nicht-'b2b' faellt bewusst auf consumer (sichere Default fuer die Geschaedigten-Surface).
 * Reihenfolge bleibt erhalten (getPublishedArtikel liefert newest-first).
 */
export function groupByAudience(items: WissenArtikel[]): {
  consumer: WissenArtikel[]
  b2b: WissenArtikel[]
} {
  const consumer: WissenArtikel[] = []
  const b2b: WissenArtikel[] = []
  for (const a of items) {
    if (a.audience === 'b2b') b2b.push(a)
    else consumer.push(a)
  }
  return { consumer, b2b }
}
```

- [ ] **Step 6: Test ausführen — muss bestehen**

Run:
```bash
cd claimondo-marketing && npx vitest run lib/wissen/db-articles.test.ts ; cd ..
```
Expected: PASS (alle, inkl. bestehender mapArtikelToFeedItem/mergeAndSortItems).

- [ ] **Step 7: Commit**

```bash
git add claimondo-marketing/lib/wissen/db-articles.ts claimondo-marketing/lib/wissen/db-articles.test.ts
git commit -m "feat(wissen): db-articles audience+quelle + groupByAudience (TDD)

Audit:
- Build: tsc/vitest gruen (db-articles.test.ts PASS)
- UI: n/a (Datenschicht)
- Redundanz: nutzt bestehendes getPublishedArtikel; neuer pure Helper
- Dead-Code: nichts
- Spec: Lever-1-Vorarbeit (Audience-Split)
- Inkonsistenz: audience non-b2b -> consumer default dokumentiert
- Regression: bestehende db-articles-Tests gruen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `llms-render.ts` — reine Render-Helfer

**Files:**
- Create: `claimondo-marketing/lib/wissen/llms-render.ts`
- Test: `claimondo-marketing/lib/wissen/llms-render.test.ts`

**Interfaces:**
- Consumes: `WissenArtikel` (aus `./db-articles`).
- Produces: `artikelStand(a)`, `artikelIndexLine(a)`, `artikelFullBlock(a)`, `renderArtikelIndexSection(consumer, b2b)`, `renderArtikelFullSection(consumer, b2b)` — alle `: string`.

- [ ] **Step 1: Failing test schreiben**

Create `claimondo-marketing/lib/wissen/llms-render.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  artikelStand,
  artikelIndexLine,
  artikelFullBlock,
  renderArtikelIndexSection,
  renderArtikelFullSection,
} from './llms-render'
import type { WissenArtikel } from './db-articles'

function makeArtikel(overrides: Partial<WissenArtikel> = {}): WissenArtikel {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'wertminderung-berechnen',
    title: 'Wertminderung berechnen',
    body: '# Wertminderung berechnen\n\n> **Kurz erklärt:** …\n\n## Häufige Fragen\n**Was?**\nAntwort.',
    excerpt: 'Merkantile Wertminderung nach Unfall — Formel und BGH-Linie.',
    key_facts: ['§ 251 BGB', 'BGH VI ZR 35/22'],
    meta_description: 'Wertminderung nach Unfall berechnen.',
    primary_keyword: 'Wertminderung berechnen',
    cluster: 'H3',
    artikel_typ: 'glossar-spoke',
    last_modified: '2026-07-10',
    veroeffentlicht_am: '2026-07-09T08:00:00Z',
    author: 'aaron-sprafke',
    audience: 'consumer',
    quelle: 'redaktion',
    ...overrides,
  }
}

describe('artikelStand', () => {
  it('nimmt last_modified wenn vorhanden', () => {
    expect(artikelStand(makeArtikel({ last_modified: '2026-07-10' }))).toBe('2026-07-10')
  })
  it('faellt auf veroeffentlicht_am (nur Datumsteil)', () => {
    expect(artikelStand(makeArtikel({ last_modified: null }))).toBe('2026-07-09')
  })
  it('leerer String wenn beide fehlen', () => {
    expect(artikelStand(makeArtikel({ last_modified: null, veroeffentlicht_am: null }))).toBe('')
  })
})

describe('artikelIndexLine', () => {
  it('enthaelt Titel, Link, Excerpt, Stand und Fakten', () => {
    const line = artikelIndexLine(makeArtikel())
    expect(line).toContain('[Wertminderung berechnen](https://claimondo.de/wissen/wertminderung-berechnen)')
    expect(line).toContain('— Merkantile Wertminderung')
    expect(line).toContain('(Stand: 2026-07-10)')
    expect(line).toContain('Fakten: § 251 BGB; BGH VI ZR 35/22')
  })
  it('laesst Fakten-Teil weg wenn key_facts leer', () => {
    expect(artikelIndexLine(makeArtikel({ key_facts: [] }))).not.toContain('Fakten:')
  })
})

describe('artikelFullBlock', () => {
  it('mirror des assetBlock-Formats (---, Kommentar, Canonical, body)', () => {
    const block = artikelFullBlock(makeArtikel())
    expect(block).toContain('\n---\n')
    expect(block).toContain('<!-- Canonical: https://claimondo.de/wissen/wertminderung-berechnen -->')
    expect(block).toContain('# Wertminderung berechnen')
  })
})

describe('renderArtikelIndexSection', () => {
  it('leerer String wenn beide leer', () => {
    expect(renderArtikelIndexSection([], [])).toBe('')
  })
  it('nur besetzte Subsektionen erscheinen', () => {
    const out = renderArtikelIndexSection([makeArtikel({ slug: 'c' })], [])
    expect(out).toContain('### Ratgeber für Geschädigte')
    expect(out).not.toContain('### Fachartikel')
  })
})

describe('renderArtikelFullSection', () => {
  it('leerer String wenn beide leer', () => {
    expect(renderArtikelFullSection([], [])).toBe('')
  })
  it('enthaelt beide Subsektionen wenn besetzt', () => {
    const out = renderArtikelFullSection(
      [makeArtikel({ slug: 'c', audience: 'consumer' })],
      [makeArtikel({ slug: 'b', audience: 'b2b' })],
    )
    expect(out).toContain('# AKTUELLE ARTIKEL')
    expect(out).toContain('## Ratgeber für Geschädigte')
    expect(out).toContain('## Fachartikel für die Branche')
  })
})
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run:
```bash
cd claimondo-marketing && npx vitest run lib/wissen/llms-render.test.ts ; cd ..
```
Expected: FAIL — Modul `./llms-render` existiert nicht.

- [ ] **Step 3: `llms-render.ts` implementieren**

Create `claimondo-marketing/lib/wissen/llms-render.ts`:
```ts
// Reine Render-Helfer fuer die LLM-Surfaces (llms.txt Index + llms-full.txt Voll-Dump).
// Kein IO — direkt unit-testbar. Format spiegelt assetBlock() der MDX-Assets in
// app/llms-full.txt/route.ts, damit AI-Crawler ein einheitliches Layout sehen.

import type { WissenArtikel } from './db-articles'

const BASE = 'https://claimondo.de'

/** YYYY-MM-DD: last_modified (date) > veroeffentlicht_am (ISO, Datumsteil) > ''. */
export function artikelStand(a: WissenArtikel): string {
  if (a.last_modified) return a.last_modified.slice(0, 10)
  if (a.veroeffentlicht_am) return a.veroeffentlicht_am.slice(0, 10)
  return ''
}

/** Eine Index-Zeile fuer llms.txt: Titel + Link + Excerpt + Stand + Fakten. */
export function artikelIndexLine(a: WissenArtikel): string {
  const stand = artikelStand(a)
  const standTag = stand ? ` (Stand: ${stand})` : ''
  const facts = a.key_facts.length ? ` · Fakten: ${a.key_facts.join('; ')}` : ''
  const teaser = a.excerpt ? ` — ${a.excerpt}` : ''
  return `- [${a.title}](${BASE}/wissen/${a.slug})${teaser}${standTag}${facts}`
}

/** Voll-Block fuer llms-full.txt (mirror assetBlock: ---, Meta-Kommentar, Canonical, Body). */
export function artikelFullBlock(a: WissenArtikel): string {
  const stand = artikelStand(a)
  const rolle = a.audience === 'b2b' ? 'Fachartikel' : 'Ratgeber'
  const keyTag = a.primary_keyword ? ` · Primary-Keyword: "${a.primary_keyword}"` : ''
  return [
    '',
    '---',
    '',
    `<!-- wissen/${a.slug} · ${rolle}${keyTag} · Quelle ${a.quelle} · last_modified ${stand} -->`,
    `<!-- Canonical: ${BASE}/wissen/${a.slug} -->`,
    '',
    a.body.trim(),
    '',
  ].join('\n')
}

/** llms.txt-Index-Sektion mit 2 Audience-Subsektionen. '' wenn nichts vorliegt. */
export function renderArtikelIndexSection(
  consumer: WissenArtikel[],
  b2b: WissenArtikel[],
): string {
  if (!consumer.length && !b2b.length) return ''
  const parts: string[] = [
    '## Aktuelle Artikel & Fachbeiträge (redaktionell geprüft, KI-gestützt, tagesaktuell)',
    '',
  ]
  if (consumer.length) {
    parts.push('### Ratgeber für Geschädigte', '', consumer.map(artikelIndexLine).join('\n'), '')
  }
  if (b2b.length) {
    parts.push(
      '### Fachartikel für die Branche (Sachverständige, Kanzleien, Werkstätten)',
      '',
      b2b.map(artikelIndexLine).join('\n'),
      '',
    )
  }
  return parts.join('\n')
}

/** llms-full.txt-Voll-Dump-Sektion mit 2 Audience-Subsektionen. '' wenn nichts vorliegt. */
export function renderArtikelFullSection(
  consumer: WissenArtikel[],
  b2b: WissenArtikel[],
): string {
  if (!consumer.length && !b2b.length) return ''
  let out = '\n---\n\n# AKTUELLE ARTIKEL & FACHBEITRÄGE (redaktionell geprüft, KI-gestützt)\n\n'
  out +=
    'Täglich aktualisierte Beiträge der Claimondo-Redaktion — Ratgeber für Geschädigte und Fachartikel für die Branche (Sachverständige, Kanzleien, Werkstätten). Jeder Beitrag mit §§-/BGH-Ankern und FAQ.\n'
  if (consumer.length) {
    out += '\n## Ratgeber für Geschädigte\n'
    for (const a of consumer) out += artikelFullBlock(a)
  }
  if (b2b.length) {
    out += '\n## Fachartikel für die Branche (Sachverständige, Kanzleien, Werkstätten)\n'
    for (const a of b2b) out += artikelFullBlock(a)
  }
  return out
}
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run:
```bash
cd claimondo-marketing && npx vitest run lib/wissen/llms-render.test.ts ; cd ..
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/lib/wissen/llms-render.ts claimondo-marketing/lib/wissen/llms-render.test.ts
git commit -m "feat(wissen): pure llms-render Helfer (Index + Full-Dump, TDD)

Audit:
- Build: vitest gruen (llms-render.test.ts PASS)
- UI: n/a (Render-Logik fuer Text-Surfaces)
- Redundanz: spiegelt assetBlock-Format, keine Dup
- Dead-Code: nichts
- Spec: Lever 1 (2 Audience-Subsektionen)
- Inkonsistenz: echte Umlaute in Surface-Strings
- Regression: n/a (neues File)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `llms.txt` — Index-Sektion einhängen

**Files:**
- Modify: `claimondo-marketing/app/llms.txt/route.ts`

**Interfaces:**
- Consumes: `getPublishedArtikel`, `groupByAudience` (`@/lib/wissen/db-articles`), `renderArtikelIndexSection` (`@/lib/wissen/llms-render`).

- [ ] **Step 1: Imports ergänzen**

Nach dem bestehenden Import-Block (oberhalb des `/**`-Doc-Kommentars) einfügen:
```ts
import { getPublishedArtikel, groupByAudience } from '@/lib/wissen/db-articles'
import { renderArtikelIndexSection } from '@/lib/wissen/llms-render'
```

- [ ] **Step 2: Artikel laden (GET ist bereits `async`)**

In `GET`, direkt nach `const today = new Date().toISOString().slice(0, 10)` einfügen:
```ts
  const { consumer: consumerArtikel, b2b: b2bArtikel } = groupByAudience(await getPublishedArtikel())
  const artikelSektion = renderArtikelIndexSection(consumerArtikel, b2bArtikel)
```

- [ ] **Step 3: Sektion in den content-Template-Literal einhängen**

Im `content`-Template die Zeile
```
## Konversions- & Ratgeber-Seiten (Schmerzpunkt- & Service-Seiten mit hoher Intention)
```
ersetzen durch:
```
${artikelSektion}
## Konversions- & Ratgeber-Seiten (Schmerzpunkt- & Service-Seiten mit hoher Intention)
```
(Bei 0 Artikeln ist `artikelSektion === ''` → nur eine Leerzeile, harmlos.)

- [ ] **Step 4: Typecheck**

Run:
```bash
cd claimondo-marketing && npx tsc --noEmit ; cd ..
```
Expected: exit 0 (keine Fehler).

- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/app/llms.txt/route.ts
git commit -m "feat(wissen): wissen_artikel in llms.txt (2 Audience-Subsektionen)

Audit:
- Build: tsc --noEmit gruen (voller Build in Task 7)
- UI: n/a (Text-Surface fuer AI-Crawler)
- Redundanz: nutzt renderArtikelIndexSection/getPublishedArtikel
- Dead-Code: nichts
- Spec: Lever 1 (llms.txt)
- Inkonsistenz: Umlaute ok; force-static+ISR bleibt
- Regression: bestehende Sektionen unveraendert, additive Einhaengung

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `llms-full.txt` — Voll-Dump einhängen (alle consumer + neueste 40 b2b)

**Files:**
- Modify: `claimondo-marketing/app/llms-full.txt/route.ts`

**Interfaces:**
- Consumes: `getPublishedArtikel`, `groupByAudience`, `renderArtikelFullSection`.

- [ ] **Step 1: Imports + Cap-Konstante ergänzen**

Nach dem bestehenden Import-Block einfügen:
```ts
import { getPublishedArtikel, groupByAudience } from '@/lib/wissen/db-articles'
import { renderArtikelFullSection } from '@/lib/wissen/llms-render'

// Voll-Dump-Deckel: alle consumer (wenige, evergreen) + neueste N b2b (news-y, zeitgebunden),
// damit die Datei ueber Monate nicht durch taegliche B2B-News explodiert.
const MAX_FULL_B2B = 40
```

- [ ] **Step 2: GET-Assembly umbauen (Artikel laden + einhängen)**

Den `GET`-Kopf
```ts
export async function GET() {
  const content = [
```
ersetzen durch:
```ts
export async function GET() {
  const { consumer, b2b } = groupByAudience(await getPublishedArtikel())
  const artikelFull = renderArtikelFullSection(consumer, b2b.slice(0, MAX_FULL_B2B))
  const content = [
```
Und in der content-Array-Liste die Zeile `    renderSachverstaendige(),` ersetzen durch:
```ts
    renderSachverstaendige(),
    artikelFull,
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd claimondo-marketing && npx tsc --noEmit ; cd ..
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add claimondo-marketing/app/llms-full.txt/route.ts
git commit -m "feat(wissen): wissen_artikel-Voll-Dump in llms-full.txt (-> MCP wissensbasis)

Deckel MAX_FULL_B2B=40 (alle consumer + neueste 40 b2b). Kommt automatisch in
claimondo://wissensbasis (= llms-full.txt, 1h-Cache).

Audit:
- Build: tsc --noEmit gruen (voller Build in Task 7)
- UI: n/a
- Redundanz: renderArtikelFullSection spiegelt assetBlock
- Dead-Code: nichts
- Spec: Lever 1 (llms-full.txt + Wachstums-Policy)
- Inkonsistenz: Umlaute ok
- Regression: bestehende render*-Sektionen unveraendert

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `sitemap.ts` — async + per-Artikel-Einträge

**Files:**
- Modify: `claimondo-marketing/app/sitemap.ts`

**Interfaces:**
- Consumes: `getPublishedArtikel`.

- [ ] **Step 1: Import ergänzen**

Nach dem bestehenden `import { buildLanguageAlternates } ...` einfügen:
```ts
import { getPublishedArtikel } from '@/lib/wissen/db-articles'
```

- [ ] **Step 2: Signatur auf async umstellen**

`export default function sitemap(): MetadataRoute.Sitemap {` ersetzen durch:
```ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
```

- [ ] **Step 3: Artikel laden + Einträge anhängen**

Direkt nach `const now = new Date()` einfügen:
```ts
  const wissenArtikel = await getPublishedArtikel()
```
Im finalen `return [ ... ]`-Array **vor** der schließenden `]` (nach dem letzten `...getVersicherer().map(...)`-Eintrag) einfügen:
```ts
    // KI-Wissensartikel (DB) — einzelne /wissen/<slug>-URLs mit per-Artikel-Freshness.
    ...wissenArtikel.map((a) => ({
      url: `${SITE_URL}/wissen/${a.slug}`,
      lastModified: a.last_modified
        ? new Date(a.last_modified)
        : a.veroeffentlicht_am
          ? new Date(a.veroeffentlicht_am)
          : now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
```

- [ ] **Step 4: Typecheck**

Run:
```bash
cd claimondo-marketing && npx tsc --noEmit ; cd ..
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add claimondo-marketing/app/sitemap.ts
git commit -m "feat(wissen): /wissen/<slug>-Artikel in Sitemap (async, per-URL lastmod)

Audit:
- Build: tsc --noEmit gruen (voller Build in Task 7)
- UI: n/a (Sitemap)
- Redundanz: getPublishedArtikel wiederverwendet
- Dead-Code: nichts
- Spec: Lever 2a (Sitemap per-Artikel)
- Inkonsistenz: lastmod-Fallback last_modified||veroeffentlicht_am||now
- Regression: bestehende Sitemap-Eintraege unveraendert; sitemap jetzt async (Next 15 ok)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `wissen/[slug]/page.tsx` — FAQPage + speakable Schema

**Files:**
- Modify: `claimondo-marketing/app/[locale]/wissen/[slug]/page.tsx`

**Interfaces:**
- Consumes: `autoSchemaGraph` (`@/lib/seo/jsonld`), `extractFaqPairs` (`@/lib/content/claimondo-mdx`).

- [ ] **Step 1: Imports ergänzen**

Im Import aus `@/lib/content/claimondo-mdx` die Liste um `extractFaqPairs` erweitern (z.B. nach `extractCitations,`):
```ts
  extractFaqPairs,
```
Im Import `import { SITE_URL, WHATSAPP_HREF, articleSchema } from '@/lib/seo/jsonld'` ergänzen zu:
```ts
import { SITE_URL, WHATSAPP_HREF, articleSchema, autoSchemaGraph } from '@/lib/seo/jsonld'
```

- [ ] **Step 2: `articleJsonLd`-Block ersetzen**

Den Block
```ts
  const articleJsonLd = JSON.stringify(
    articleSchema({
      headline: a.title,
      description: description ?? a.title,
      datePublished: dateIso,
      dateModified: dateIso,
      url: `${SITE_URL}/wissen/${slug}`,
      citation: extractCitations(a.body),
      authorName: FOUNDER_AARON_NAME,
    }),
  )
```
ersetzen durch:
```ts
  // Article (Person=Aaron) + citation + speakable + FAQPage (aus der "## Häufige Fragen"-
  // Sektion des Bodys). autoSchemaGraph gibt null ohne FAQ-Paare -> Fallback aufs reine
  // articleSchema. FAQPage ist der GEO-Hebel, den die KI-Artikel bisher verschenkt haben.
  const articleArgs = {
    headline: a.title,
    description: description ?? a.title,
    datePublished: dateIso,
    dateModified: dateIso,
    url: `${SITE_URL}/wissen/${slug}`,
    citation: extractCitations(a.body),
    authorName: FOUNDER_AARON_NAME,
  }
  const articleJsonLd =
    autoSchemaGraph(articleArgs, extractFaqPairs(a.body)) ?? JSON.stringify(articleSchema(articleArgs))
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd claimondo-marketing && npx tsc --noEmit ; cd ..
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "claimondo-marketing/app/[locale]/wissen/[slug]/page.tsx"
git commit -m "feat(wissen): FAQPage+speakable Schema fuer KI-Artikel (autoSchemaGraph)

Audit:
- Build: tsc --noEmit gruen (voller Build in Task 7)
- UI: n/a (JSON-LD, kein sichtbarer Change)
- Redundanz: nutzt bestehendes autoSchemaGraph/extractFaqPairs; kein Eingriff in ContentJsonLd
- Dead-Code: nichts
- Spec: Lever 3 (FAQPage+speakable, Author=Aaron erhalten)
- Inkonsistenz: Fallback auf articleSchema wenn keine FAQ-Paare
- Regression: Breadcrumbs/ContentJsonLd unveraendert; nur schemaJson-Quelle getauscht

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: PR-A Build-Gate + Push + PR

**Files:** keine (Gate).

- [ ] **Step 1: Voller Marketing-Build**

Run:
```bash
cd claimondo-marketing && npm run build ; cd ..
```
Expected: Build **grün** (Next 15 findet Route-/Validator-Fehler, die tsc allein nicht sieht — AGENTS §Post-Task-Audit Punkt 1). Bei Rot: Fehler fixen, betroffenen Task-Commit nachziehen.

- [ ] **Step 2: Alle Wissen-Tests grün**

Run:
```bash
cd claimondo-marketing && npx vitest run lib/wissen ; cd ..
```
Expected: PASS (db-articles + llms-render).

- [ ] **Step 3: Push PR-A-Branch**

Der Worktree-Branch `kitta/wissen-artikel-llm-wirksamkeit` enthält Tasks 1–6 (+Spec+Plan). Push:
```bash
git push -u origin kitta/wissen-artikel-llm-wirksamkeit
```

- [ ] **Step 4: PR gegen staging öffnen**

```bash
gh pr create --base staging --head kitta/wissen-artikel-llm-wirksamkeit \
  --title "feat(wissen): KI-Artikel LLM-wirksam — llms.txt/full + Sitemap + FAQPage (PR-A)" \
  --body "Lever 1–3 des Wissen-LLM-Pakets (Marketing-App). Spec+Plan: docs/superpowers/{specs,plans}/2026-07-15-wissen-artikel-llm-wirksamkeit.*

## Regel-4 Prod-Smoke (nach Deploy, BLOCKING)
- \`curl -s https://claimondo.de/llms.txt | grep -A2 'Aktuelle Artikel'\` → 2 Subsektionen vorhanden
- \`curl -s https://claimondo.de/llms-full.txt | grep 'AKTUELLE ARTIKEL'\` → Voll-Dump vorhanden
- \`curl -s https://claimondo.de/sitemap.xml | grep '/wissen/'\` → per-Artikel-URLs vorhanden
- Playwright: einen veröffentlichten \`/wissen/<slug>\` laden, \`view-source\` bzw. DOM auf \`\"@type\":\"FAQPage\"\` prüfen
- MCP: \`claimondo://wissensbasis\` enthält die Artikel (Folge-Effekt von llms-full.txt)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Expected: PR-URL. **Aufgabe bleibt offen bis grüner Prod-Smoke** (Regel 4). Falls Deploy in anderer Session: Smoke-Pflicht im Marker übergeben.

---

## Task 8: `pipeline.ts` — last_modified bei Auto-Publish + Caps hoch

**Files:**
- Modify: `src/lib/wissen/pipeline.ts`

**Interfaces:**
- Consumes: nichts Neues.

> **Branch-Hinweis:** PR-B ist `src/**` und wird als **eigener Branch** gepusht. Vor Task 8 einen neuen Branch von der aktuellen Basis abzweigen, damit PR-A (Marketing) und PR-B (App) getrennt reviewbar sind:
> ```bash
> git checkout -b kitta/wissen-pipeline-crawl-tuning
> ```
> (So sitzen die src-Commits auf einem eigenen Branch; PR-A bleibt auf `kitta/wissen-artikel-llm-wirksamkeit`. Spec/Plan-Commit ist in beiden enthalten — unkritisch.)

- [ ] **Step 1: Caps anheben**

In `src/lib/wissen/pipeline.ts` die 4 Konstanten ändern (Werte, Kommentare belassen/anpassen):
```ts
const CRAWL_CAP = 16 // Maximale neue Themen pro Lauf (global) — hoch für mehr frische News
const PER_SOURCE_CAP = 5 // Maximale neue Themen pro Quelle/Lauf — Gold-Quellen nicht aushungern
```
und
```ts
const DAILY_MAX = 5 // Maximale PUBLIZIERTE Artikel pro Lauf (Deckel) — Crawl-Priorität hoch
```
und
```ts
const CRAWL_ATTEMPT_CAP = 6 → const CRAWL_ATTEMPT_CAP = 10 // KI-Versuche für tagesaktuelle Crawl+Manuell-Themen
```
`DAILY_MIN = 2`, `EVERGREEN_ATTEMPT_CAP = 6`, `EVERGREEN_TARGET = 6` **unverändert** (Evergreen bleibt reiner Boden-Filler; weicht bei published≥2 automatisch).

- [ ] **Step 2: last_modified beim Auto-Publish setzen**

In `generiereUndSpeichere`, in der `insertArtikel`-Insert-Payload die Zeile
```ts
      veroeffentlicht_am: v.autopublish ? now : null,
```
ersetzen durch:
```ts
      veroeffentlicht_am: v.autopublish ? now : null,
      last_modified: v.autopublish ? now.slice(0, 10) : null,
```

- [ ] **Step 3: Typecheck + Crawl-Tests**

Run:
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npx vitest run src/lib/wissen
```
Expected: tsc exit 0; alle wissen-Tests (pipeline-plan, propose, validate, generate, crawl) PASS (Caps sind interne Konstanten ohne Test-Assertion).

- [ ] **Step 4: Commit**

```bash
git add src/lib/wissen/pipeline.ts
git commit -m "feat(wissen): last_modified bei Auto-Publish + Crawl-Caps hoch (DAILY_MAX 3->5)

CRAWL_CAP 12->16, PER_SOURCE_CAP 3->5, DAILY_MAX 3->5, CRAWL_ATTEMPT_CAP 6->10.
DAILY_MIN=2 unveraendert (Evergreen bleibt Boden-Filler). last_modified fix schliesst
die 19/27-NULL-Luecke fuer neue Auto-Publishes.

Audit:
- Build: tsc --noEmit gruen; vitest src/lib/wissen gruen (voller Build in Task 10)
- UI: n/a (Cron-Pipeline)
- Redundanz: nutzt vorhandenes now; keine Dup
- Dead-Code: nichts
- Spec: Lever 2b + Lever 4 (Caps)
- Inkonsistenz: last_modified=now.slice(0,10) analog publishArtikel
- Regression: pipeline-plan/validate/relevance-Tests gruen; Evergreen-Boden intakt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `crawl/sources.ts` — Quellen schärfen (+ 0–2 verifizierte Feeds)

**Files:**
- Modify: `src/lib/wissen/crawl/sources.ts`

- [ ] **Step 1: (Optional) Kandidaten-Feeds live verifizieren**

Bevor ein neuer Feed aufgenommen wird, per WebFetch prüfen (HTTP 200 + parsebares RSS + on-topic Kfz-Schaden/SV-Recht-Items). Beispiel-Vorgehen für einen Kandidaten:
```
WebFetch(<kandidat-feed-url>, "Ist das ein valides RSS/Atom mit Kfz-Schaden-/Sachverstaendigen-/Verkehrsrecht-Items? Liste die letzten 5 Item-Titel.")
```
**0 neue Feeds ist ok** — nur aufnehmen, was verifiziert on-topic ist. Die Prune+Reorder unten schärft den Mix bereits.

- [ ] **Step 2: `B2B_CRAWL_SOURCES` neu ordnen + prunen**

`Rechtslupe` und `Pfefferminzia` entfernen; Reihenfolge Kfz-Schaden-zuerst. Das Array ersetzen durch:
```ts
export const B2B_CRAWL_SOURCES: CrawlSource[] = [
  // recht — spezialisierter Kfz-Schaden-/SV-Rechtsprechungs-Blog (Gold: hohe Trefferquote)
  {
    name: 'Captain-HUK',
    category: 'recht',
    kind: 'rss',
    url: 'https://www.captain-huk.de/feed/',
  },
  // werkstatt — Kfz-Betrieb / Werkstatt-Fachpresse (Kfz-nah)
  {
    name: 'kfz-betrieb',
    category: 'werkstatt',
    kind: 'rss',
    url: 'https://www.kfz-betrieb.vogel.de/rss.xml',
  },
  // sv_verband — Prueforganisationen / Sachverstaendigen-Umfeld (Kfz-nah)
  {
    name: 'KÜS',
    category: 'sv_verband',
    kind: 'rss',
    url: 'https://www.kues.de/rss',
  },
  // versicherung — Versicherungs-/Makler-News (breit; KI-Backstop filtert Nicht-Kfz). Nachrangig.
  {
    name: 'Versicherungsbote',
    category: 'versicherung',
    kind: 'rss',
    url: 'https://www.versicherungsbote.de/feed/',
  },
  {
    name: 'AssCompact',
    category: 'versicherung',
    kind: 'rss',
    url: 'https://www.asscompact.de/rss.xml',
  },
  // (Entfernt 2026-07-15: Rechtslupe = allg. Rechtsnews (niedrigste Kfz-Schaden-Quote);
  //  Pfefferminzia = Leben/Rente-lastig. ~78% Reject-Rate war grossteils deren Rauschen.)
  // Verifizierte Kfz-Schaden-/SV-Recht-Feeds hier ergaenzen (Reihenfolge = Prioritaet).
]
```

- [ ] **Step 3: Typecheck + Crawl-Tests**

Run:
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npx vitest run src/lib/wissen/crawl
```
Expected: tsc exit 0; crawl-Tests (rss, relevance) PASS. Falls ein Test die entfernten Quellen namentlich referenziert → Test auf die neue Liste anpassen (Relevanz-Logik-Tests referenzieren keine Quell-Namen, sind also unbetroffen).

- [ ] **Step 4: Commit**

```bash
git add src/lib/wissen/crawl/sources.ts
git commit -m "feat(wissen): Crawl-Quellen schaerfen — Captain-HUK zuerst, Rechtslupe+Pfefferminzia raus

Reduziert das ~78%-Reject-Rauschen (breite Feeds) und priorisiert Kfz-Schaden-/SV-Recht.
Mehr echte News, weniger verschwendete Sonnet-Calls.

Audit:
- Build: tsc --noEmit gruen; vitest crawl gruen (voller Build in Task 10)
- UI: n/a
- Redundanz: n/a
- Dead-Code: 2 Rausch-Feeds entfernt
- Spec: Lever 4 (Quellen schaerfen)
- Inkonsistenz: n/a
- Regression: relevance/rss-Tests gruen; PER_SOURCE_CAP=5 verhindert Gold-Quellen-Aushunger

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: PR-B Build-Gate + Push + PR + Prod-Smoke

**Files:** keine (Gate).

- [ ] **Step 1: Voller App-Build**

Run:
```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```
Expected: Build **grün**. Bei Rot fixen + betroffenen Commit nachziehen.

- [ ] **Step 2: Push PR-B-Branch**

```bash
git push -u origin kitta/wissen-pipeline-crawl-tuning
```

- [ ] **Step 3: PR gegen staging öffnen**

```bash
gh pr create --base staging --head kitta/wissen-pipeline-crawl-tuning \
  --title "feat(wissen): Crawl-Priorität hoch + Quellen schärfen + last_modified (PR-B)" \
  --body "Lever 2b+4 des Wissen-LLM-Pakets (App). Spec+Plan: docs/superpowers/{specs,plans}/2026-07-15-wissen-artikel-llm-wirksamkeit.*

## Regel-4 Prod-Smoke (nach Deploy, BLOCKING)
- Cron manuell triggern: \`curl -s -H \"Authorization: Bearer \$CRON_SECRET\" https://app.claimondo.de/api/cron/wissen-pipeline-b2b\` → JSON {crawled,generated,published,review}
- DB-Verify (MCP execute_sql READ, prod): neu publizierte crawl-Artikel haben \`last_modified\` gesetzt; published-by-quelle zeigt mehr crawl-Anteil über Folgetage
- Beobachten (kein Blocker): Sonnet-Call-Volumen/Kosten pro Lauf (DAILY_MAX=5)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Expected: PR-URL. **Offen bis grüner Prod-Smoke** (Regel 4).

---

## Self-Review (durchgeführt beim Schreiben)

- **Spec-Coverage:** Lever 1 → Tasks 2–4; Lever 2 → Tasks 5 (sitemap) + 8 (last_modified); Lever 3 → Task 6; Lever 4 → Tasks 8 (caps) + 9 (sources). db-articles-Vorarbeit → Task 1. Alle Spec-Abschnitte abgedeckt.
- **Placeholder-Scan:** Keine TBD/„später". Einzige bewusst offene Stelle: Task 9 Step 1 (0–2 Feeds, verifikations-gated) — explizit optional, „0 ist ok".
- **Type-Consistency:** `groupByAudience`, `renderArtikelIndexSection`, `renderArtikelFullSection`, `artikelIndexLine`, `artikelFullBlock`, `artikelStand` — überall identisch benannt zwischen Definition (Task 1/2) und Consumern (Task 3–4). `WissenArtikel.audience/quelle` in Task 1 definiert, in Task 2 (Factory) + Task 3/4 genutzt.

## Reihenfolge-Notiz für Executor

Tasks 1→6 auf Branch `kitta/wissen-artikel-llm-wirksamkeit` (PR-A). Vor Task 8 auf `kitta/wissen-pipeline-crawl-tuning` abzweigen (PR-B). Task 7 (PR-A push/PR) kann vor oder nach den src-Tasks laufen — die Branches sind unabhängig.
