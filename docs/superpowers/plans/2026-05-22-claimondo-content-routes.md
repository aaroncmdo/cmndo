# claimondo.de Content-Render-Routen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 69 Markdown-Assets (2 Cornerstones, 57 Haftpflicht-Spokes, 10 Decoder) als öffentliche, SEO/GEO-optimierte HTML-Seiten unter claimondo.de rendern.

**Architecture:** Next 16 App-Router, SSG via `generateStaticParams`. Reine Content-Discovery-Logik in `src/lib/content/claimondo-mdx.ts` (vitest-getestet). Rendering über `react-markdown@10` (bereits installiert) + `remark-gfm`/`rehype-slug`/`rehype-autolink-headings`, gestylt über `components`-Map mit Claimondo-Tokens (kein `@tailwindcss/typography`). Pro-Artikel-JSON-LD wird aus dem MD extrahiert und injiziert. Marketing-Page-Idiom analog `/vorteile` (LandingTopbar/Footer/StickyCallBar wiederverwendet).

**Tech Stack:** Next 16.2.1, React 19.2.4, react-markdown 10, remark-gfm, rehype-slug, rehype-autolink-headings, vitest 4, Tailwind 4 (Claimondo-Tokens).

**Spec:** `docs/superpowers/specs/2026-05-22-claimondo-content-routes-layout-design.md`
**Branch:** `kitta/doc16-claimondo-content-routes` (bereits angelegt, isoliert). PR-Base: **staging**.

---

## File Structure

**Create:**
- `src/lib/content/__tests__/claimondo-mdx.test.ts` — vitest für reine Helper
- `src/components/content/MarkdownRenderer.tsx` — MD→HTML, Token-Styling, interne Links
- `src/components/content/ContentJsonLd.tsx` — injiziert pro-Artikel-Schema (+ Breadcrumb), Fallback
- `src/components/content/AssetHero.tsx` — Header (Eyebrow/H1/Snippet/TrustChips/Meta)
- `src/components/content/TableOfContents.tsx` — sticky H2-Liste (Desktop) / einklappbar (Mobile)
- `src/components/content/RelatedAssets.tsx` — Cluster-Geschwister-Grid
- `src/components/content/DecoderCtaBlock.tsx` — starker Decoder-CTA (Anruf+WhatsApp)
- `src/components/content/ClusterHubGrid.tsx` — Cornerstone-Hub-Navigation
- `src/components/content/ContentStickyCall.tsx` — Sticky-Bar mit persistentem WhatsApp (wrappt/erweitert Pattern)
- `src/app/haftpflicht/[slug]/page.tsx`
- `src/app/decoder/[slug]/page.tsx`
- `src/app/kfz-haftpflicht-schaden/page.tsx`
- `src/app/ratgeber/page.tsx`

**Modify:**
- `src/lib/content/claimondo-mdx.ts` — `related`-Feld + reine Render-Helper
- `src/components/landing/StickyCallBar.tsx` — optionaler `whatsappHref`-Prop
- `src/components/landing/LandingFooter.tsx` — Cornerstone-Links

---

## Task 1: Schritt 0 — Content-Base committen (Artefakte sichern)

Sichert die 69 untracked MD-Files + bestehenden Helper + die 4 modifizierten Crawler-Routen in Git, BEVOR neuer Code dazukommt. Kein Code-Change, reine Git-Operation + Build-Gate.

**Files:** keine neuen — committet vorhandene `src/content/claimondo/**`, `src/lib/content/claimondo-mdx.ts`, `src/app/{robots.ts,sitemap.ts,llms.txt/route.ts,llms-full.txt/route.ts}`

- [ ] **Step 1: Counts verifizieren**

Run (PowerShell):
```powershell
$b="C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-v2"
"corner: " + (gci "$b\src\content\claimondo\cornerstones" -Filter *.md).Count
"haft:   " + (gci "$b\src\content\claimondo\haftpflicht" -Filter *.md).Count
"decoder:" + (gci "$b\src\content\claimondo\decoder" -Filter *.md).Count
```
Expected: 2 / 57 / 10. Bei Abweichung: STOP, Aaron eskalieren.

- [ ] **Step 2: Nur Content-Routes-Pfade stagen (NICHT die DSGVO-docx)**

Run:
```powershell
git -C $b add src/content/claimondo/
git -C $b commit -m "feat(content): seed 69 claimondo.de markdown assets" -m "2 Cornerstones + 57 Haftpflicht-Spokes (H1/H2/H3/H4/H6/H7) + 10 Decoder. Source: marketing-strategy/published (gitignored). src/content/claimondo/ ist ab jetzt SoT fuer Production-Render. Ref Doc 16/23." -m "Audit: Build folgt Step 4. UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression n/a (reiner Content-Seed)." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Helper + Crawler-Surfaces committen**

Run:
```powershell
git -C $b add src/lib/content/ src/app/robots.ts src/app/sitemap.ts src/app/llms.txt/route.ts src/app/llms-full.txt/route.ts
git -C $b commit -m "feat(seo): wire content discovery + robots/sitemap/llms.txt" -m "claimondo-mdx.ts Discovery-Helper; robots (AI-Bots allow + portal disallows); sitemap (+69 URLs); llms.txt/llms-full.txt Neufassung. Ref Doc 16/23." -m "Audit: Build folgt Step 4. Inkonsistenz: DB-Naming n/a. Regression: sitemap/robots/llms werden von Buildtime-Discovery gespeist; Step 4 prueft." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Build-Gate**

Run: `npm run build`
Expected: PASS. `claimondo-mdx.ts` nutzt `node:fs` server-seitig (nur in sitemap/llms-Routes aufgerufen) → erlaubt. Bei broken-YAML-Fehler in einer MD: Frontmatter manuell fixen.

- [ ] **Step 5: Token-Audit (modifizierte Routen)**

Run: `npm run check:token-audit`
Expected: PASS (robots/sitemap/llms haben kein UI). Bei Fehler: betroffenen Hex mappen.

---

## Task 2: claimondo-mdx.ts — Render-Helper (TDD)

Reine, testbare Funktionen für die Render-Pipeline: Schema-Extraktion, Body-Cleanup, Heading-/TrustChip-Extraktion, interne-Link-Erkennung. Plus `related`-Feld.

**Files:**
- Modify: `src/lib/content/claimondo-mdx.ts`
- Create: `src/lib/content/__tests__/claimondo-mdx.test.ts`

- [ ] **Step 1: Failing tests schreiben**

Create `src/lib/content/__tests__/claimondo-mdx.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  extractSchemaJson, stripSchemaSection, stripLeadingSnippet,
  extractHeadings, extractTrustChips, isInternalHref, readingTimeMin,
} from '../claimondo-mdx'

const SAMPLE = `# Titel

> **Kurz erklärt:** Das ist die Antwort.

---

## Worum es geht

Text mit § 286 BGB und BGH VI ZR 235/13 als Referenz.

## Wie lange?

Mehr Text.

---

## Schema (JSON-LD)

\`\`\`json
{ "@context": "https://schema.org", "@type": "Article", "headline": "Titel" }
\`\`\`

---
`

describe('extractSchemaJson', () => {
  it('extrahiert den JSON-Block unter ## Schema', () => {
    const json = extractSchemaJson(SAMPLE)
    expect(json).toContain('"@type": "Article"')
    expect(JSON.parse(json!)).toMatchObject({ '@type': 'Article' })
  })
  it('gibt null zurück wenn kein Schema-Block', () => {
    expect(extractSchemaJson('# Nur Titel\n\nText')).toBeNull()
  })
})

describe('stripSchemaSection', () => {
  it('entfernt die ## Schema-Sektion samt Codeblock', () => {
    const out = stripSchemaSection(SAMPLE)
    expect(out).not.toContain('Schema (JSON-LD)')
    expect(out).not.toContain('@context')
    expect(out).toContain('## Worum es geht')
  })
})

describe('stripLeadingSnippet', () => {
  it('entfernt das erste Kurz-erklärt-Blockquote', () => {
    const out = stripLeadingSnippet(SAMPLE)
    expect(out).not.toContain('Kurz erklärt')
    expect(out).toContain('## Worum es geht')
    expect(out).toContain('# Titel')
  })
})

describe('extractHeadings', () => {
  it('liefert H2 mit slug-id und text (ohne Schema-H2)', () => {
    const hs = extractHeadings(stripSchemaSection(SAMPLE))
    expect(hs).toEqual([
      { id: 'worum-es-geht', text: 'Worum es geht' },
      { id: 'wie-lange', text: 'Wie lange?' },
    ])
  })
})

describe('extractTrustChips', () => {
  it('findet §- und BGH-Treffer, dedupe, max 2', () => {
    const chips = extractTrustChips(SAMPLE)
    expect(chips).toContain('§ 286 BGB')
    expect(chips).toContain('BGH VI ZR 235/13')
    expect(chips.length).toBeLessThanOrEqual(2)
  })
})

describe('isInternalHref', () => {
  it('erkennt interne Pfade und claimondo.de-Absolut-URLs', () => {
    expect(isInternalHref('/haftpflicht/x')).toBe(true)
    expect(isInternalHref('#anker')).toBe(true)
    expect(isInternalHref('https://claimondo.de/check')).toBe(true)
    expect(isInternalHref('https://gesetze-im-internet.de')).toBe(false)
  })
})

describe('readingTimeMin', () => {
  it('rechnet ~200 WPM, min 1', () => {
    expect(readingTimeMin('a '.repeat(400))).toBe(2)
    expect(readingTimeMin('kurz')).toBe(1)
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/lib/content/__tests__/claimondo-mdx.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Implementieren — an `claimondo-mdx.ts` anhängen + Interface erweitern**

In `src/lib/content/claimondo-mdx.ts` das `ClaimondoAsset`-Interface um `related` ergänzen (nach `body`):
```typescript
  /** Aus Frontmatter `related` — verwandte interne URLs */
  related?: string[]
```
Im `readOneFolder`-Return-Objekt ergänzen:
```typescript
        related: Array.isArray(meta.related) ? (meta.related as string[]) : undefined,
```
Am Dateiende anhängen:
```typescript
// ---- Render-Helper (rein, testbar) ----

const SCHEMA_HEADING = /\n##\s+Schema \(JSON-LD\)[\s\S]*$/

/** JSON aus dem ```json-Block unter "## Schema (JSON-LD)" — oder null. */
export function extractSchemaJson(body: string): string | null {
  const sec = body.match(/##\s+Schema \(JSON-LD\)[\s\S]*?```json\s*([\s\S]*?)```/)
  if (!sec) return null
  const raw = sec[1].trim()
  try { JSON.parse(raw); return raw } catch { return null }
}

/** Entfernt die "## Schema (JSON-LD)"-Sektion bis Body-Ende (inkl. trailing ---). */
export function stripSchemaSection(body: string): string {
  return body.replace(SCHEMA_HEADING, '').replace(/\n+---\s*$/, '').trimEnd()
}

/** Entfernt das erste Blockquote (Kurz-erklärt-Snippet) nach der H1. */
export function stripLeadingSnippet(body: string): string {
  return body.replace(/^(#\s+.+\n+)>\s+[\s\S]+?(?=\n\n)/, '$1').replace(/^\n+/, (m, o) => o === 0 ? m : m)
}

/** H2-Überschriften als {id, text} mit GitHub-Slug (kompatibel zu rehype-slug). */
export function extractHeadings(body: string): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = []
  for (const m of body.matchAll(/^##\s+(.+)$/gm)) {
    const text = m[1].trim()
    if (/^Schema \(JSON-LD\)/.test(text)) continue
    out.push({ id: slugify(text), text })
  }
  return out
}

/** GitHub-Slugger-kompatibel (rehype-slug nutzt github-slugger). */
function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

const SECTION_RE = /§\s?\d+\w*(?:\s+\w+)?/g
const BGH_RE = /BGH\s+[IVX]+\s?ZR\s?\d+\/\d+/g

/** Bis zu 2 §/BGH-Treffer aus dem Body, dedupe. Für Trust-Chips. */
export function extractTrustChips(body: string): string[] {
  const hits = new Set<string>()
  for (const m of body.matchAll(BGH_RE)) hits.add(m[0].replace(/\s+/g, ' '))
  for (const m of body.matchAll(SECTION_RE)) hits.add(m[0].replace(/\s+/g, ' '))
  return [...hits].slice(0, 2)
}

/** Interner Link: relativ, Anker, oder claimondo.de-Absolut. */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#') || href.startsWith('https://claimondo.de')
}

/** Lesezeit in Minuten (~200 WPM, min 1). */
export function readingTimeMin(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}
```
Note zu `extractTrustChips`-Reihenfolge: Test erwartet `§ 286 BGB` UND `BGH VI ZR 235/13` bei max 2 — BGH zuerst einfügen, dann §; Set-Order = Insert-Order. Bei `slice(0,2)` müssen beide rein. Da im SAMPLE genau ein BGH + ein § vorkommt, passt es. (Bei echten Artikeln mit mehreren §: BGH-Priorität ist gewollt.)

- [ ] **Step 4: Run → pass**

Run: `npx vitest run src/lib/content/__tests__/claimondo-mdx.test.ts`
Expected: PASS (alle 8). Bei `stripLeadingSnippet`-Edge (mehrzeiliges Blockquote): Regex ggf. auf `(?=\n\n##|\n\n[^>])` schärfen und Test erneut.

- [ ] **Step 5: Commit**

```powershell
git -C $b add src/lib/content/claimondo-mdx.ts src/lib/content/__tests__/claimondo-mdx.test.ts
git -C $b commit -m "feat(content): render-helper fuer claimondo-mdx (schema-extract, body-cleanup, headings, trust-chips)" -m "Reine testbare Funktionen + related-Feld. 8 vitest-Cases gruen." -m "Audit: Build n/a hier (Task 1 gruen); Tests gruen; Redundanz: in bestehende Datei integriert; Regression: nur Additionen, bestehende Exports unveraendert." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Markdown-Plugins installieren

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install (Versionen ans Setup pinnen lassen)**

Run: `npm install remark-gfm rehype-slug rehype-autolink-headings`
Expected: kein Peer-Konflikt (react-markdown@10 ist React-19-kompatibel).

- [ ] **Step 2: Build/Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git -C $b add package.json package-lock.json
git -C $b commit -m "chore(deps): remark-gfm + rehype-slug + rehype-autolink-headings fuer content-render" -m "Audit: Build gruen; reine Dep-Addition." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: MarkdownRenderer (Token-Styling, interne Links)

Server-Component. Rendert den (bereits gecleanten) Body mit Claimondo-Tokens über die `components`-Map. KEIN `prose`/typography-Plugin.

**Files:** Create `src/components/content/MarkdownRenderer.tsx`

- [ ] **Step 1: Komponente schreiben**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import Link from 'next/link'
import { isInternalHref } from '@/lib/content/claimondo-mdx'

/** Body MUSS bereits via stripSchemaSection + stripLeadingSnippet gereinigt sein. */
export function MarkdownRenderer({ body }: { body: string }) {
  return (
    <div className="max-w-[740px] text-[16.5px] leading-[1.65] text-claimondo-shield">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 font-montserrat text-4xl font-extrabold tracking-tight text-claimondo-navy">{children}</h1>,
          h2: ({ children, id }) => <h2 id={id} className="mt-10 mb-3 scroll-mt-24 font-montserrat text-2xl font-bold text-claimondo-navy">{children}</h2>,
          h3: ({ children, id }) => <h3 id={id} className="mt-7 mb-2 font-montserrat text-lg font-bold text-claimondo-shield">{children}</h3>,
          p: ({ children }) => <p className="my-4">{children}</p>,
          ul: ({ children }) => <ul className="my-4 list-disc space-y-1.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-1.5 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-claimondo-navy">{children}</strong>,
          em: ({ children }) => <em className="font-semibold not-italic text-claimondo-navy">{children}</em>,
          hr: () => <div className="my-8 h-px bg-claimondo-border" aria-hidden />,
          blockquote: ({ children }) => <blockquote className="my-4 rounded-r-lg border-l-4 border-claimondo-light-blue bg-claimondo-bg px-4 py-3 italic text-claimondo-shield">{children}</blockquote>,
          table: ({ children }) => <div className="my-6 overflow-x-auto rounded-ios-md border border-claimondo-border"><table className="w-full border-collapse text-sm">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-claimondo-bg">{children}</thead>,
          th: ({ children }) => <th className="border-b border-claimondo-border px-4 py-2.5 text-left font-montserrat font-bold text-claimondo-navy">{children}</th>,
          td: ({ children }) => <td className="border-t border-claimondo-border px-4 py-2.5 align-top">{children}</td>,
          pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-ios-md bg-claimondo-navy p-4 text-xs leading-relaxed text-white">{children}</pre>,
          code: ({ children }) => <code className="rounded bg-claimondo-bg px-1.5 py-0.5 text-[0.9em] text-claimondo-navy">{children}</code>,
          a: ({ href, children }) => {
            if (href && isInternalHref(href)) {
              const internal = href.startsWith('https://claimondo.de') ? href.replace('https://claimondo.de', '') || '/' : href
              return <Link href={internal} className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{children}</Link>
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">{children}</a>
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
```
Note: `code` in `<pre>` (Block) erbt das `code`-Override — der dunkle `<pre>` umschließt es; das `code`-bg wirkt nur bei Inline-Code akzeptabel. Falls Block-Code falsch getönt: `code`-Override auf `inline`-Check umstellen (react-markdown v10 gibt kein `inline` mehr → via `node.position`/Parent prüfen; MVP: so lassen, Brief-Template rendert lesbar).
Note Font: `font-montserrat` nur nutzen, wenn als Tailwind-Utility vorhanden; sonst `style={{fontFamily:'Montserrat, system-ui, sans-serif'}}` (siehe StickyCallBar-Pattern). In Step 2 prüfen.

- [ ] **Step 2: `font-montserrat`-Klasse verifizieren**

Run: `git -C $b grep -n "font-montserrat" -- src/ | head -3`
Falls 0 Treffer: in der Komponente `className="font-montserrat ..."` durch `style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}` ersetzen (Headings h1/h2/h3/th). Falls Treffer: so lassen.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS (Komponente wird erst in Task 11 importiert; hier nur Syntax/Type-Check via Build).

- [ ] **Step 4: Commit**

```powershell
git -C $b add src/components/content/MarkdownRenderer.tsx
git -C $b commit -m "feat(content): MarkdownRenderer mit Claimondo-Tokens + interne Links" -m "react-markdown@10 + gfm/slug/autolink, components-map statt prose. Tokens statt blue/gray. claimondo.de-Absolut-Links als intern (next/link)." -m "Audit: Build gruen; Komponenten-Set: content-spezifisch, tokenisiert; Inkonsistenz: kein Inline-Hex; Dead-Code: keiner." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: AssetHero + TrustChips

**Files:** Create `src/components/content/AssetHero.tsx`

- [ ] **Step 1: Komponente schreiben**

```tsx
import { ShieldCheck } from 'lucide-react'

interface Props {
  title: string
  snippet?: string
  clusterLabel?: string   // z.B. "H4 · Fristen"
  trustChips?: string[]   // §/BGH aus extractTrustChips
  lastModified: Date
  readingMin: number
}

const BRAND_CHIP = 'Bundesweites SV-Netzwerk · Sitz Köln'

export function AssetHero({ title, snippet, clusterLabel, trustChips = [], lastModified, readingMin }: Props) {
  const chips = [...trustChips, BRAND_CHIP]
  const valid = !Number.isNaN(lastModified.getTime())
  return (
    <header className="border-b border-claimondo-border pb-7">
      {clusterLabel && (
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
          <span className="h-1.5 w-1.5 rounded-full bg-claimondo-light-blue" />{clusterLabel}
        </div>
      )}
      <h1 className="mb-4 max-w-[820px] text-4xl font-extrabold leading-[1.08] tracking-tight text-claimondo-navy md:text-5xl" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>{title}</h1>
      {snippet && (
        <div className="max-w-[820px] rounded-r-xl border-l-4 border-claimondo-ondo bg-claimondo-bg px-[18px] py-4 text-[16.5px] text-claimondo-shield">
          <strong className="text-claimondo-navy">Kurz erklärt:</strong> {snippet}
        </div>
      )}
      <div className="mt-[18px] flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-claimondo-border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-claimondo-shield shadow-claimondo-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-claimondo-ondo" aria-hidden />{c}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5 text-[13px] text-claimondo-shield/60">
        {valid && <><time dateTime={lastModified.toISOString().slice(0, 10)}>Aktualisiert {lastModified.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</time><span>·</span></>}
        <span>Lesezeit ~{readingMin} Min</span><span>·</span><span>Redaktion Claimondo / LexDrive</span>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git -C $b add src/components/content/AssetHero.tsx
git -C $b commit -m "feat(content): AssetHero mit Snippet-Box + TrustChips + Invalid-Date-Guard" -m "Audit: Build gruen; Tokens; Inline-Hex keiner; Invalid-Date-Guard fuer toISOString." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: TableOfContents (sticky Desktop / einklappbar Mobile)

**Files:** Create `src/components/content/TableOfContents.tsx`

- [ ] **Step 1: Komponente schreiben** (client für `<details>`-Default-Open ist nicht nötig — native `<details>`)

```tsx
import Link from 'next/link'

export function TableOfContents({ headings }: { headings: Array<{ id: string; text: string }> }) {
  if (headings.length < 2) return null
  const list = (
    <ul className="border-l-2 border-claimondo-border">
      {headings.map((h) => (
        <li key={h.id}>
          <Link href={`#${h.id}`} className="-ml-0.5 block border-l-2 border-transparent py-1.5 pl-3.5 text-[13.5px] text-claimondo-shield hover:border-claimondo-ondo hover:text-claimondo-ondo">{h.text}</Link>
        </li>
      ))}
    </ul>
  )
  return (
    <>
      {/* Desktop: sticky */}
      <aside className="sticky top-[84px] hidden lg:block">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-claimondo-shield/50">Auf dieser Seite</div>
        {list}
      </aside>
      {/* Mobile: einklappbar */}
      <details className="mb-6 rounded-ios-md border border-claimondo-border bg-white p-4 lg:hidden">
        <summary className="cursor-pointer text-sm font-bold text-claimondo-navy">Auf dieser Seite</summary>
        <div className="mt-3">{list}</div>
      </details>
    </>
  )
}
```

- [ ] **Step 2: Build → PASS.** Run: `npm run build`

- [ ] **Step 3: Commit**
```powershell
git -C $b add src/components/content/TableOfContents.tsx
git -C $b commit -m "feat(content): TableOfContents (sticky desktop / collapsible mobile)" -m "Audit: Build gruen; Tokens; <2 Headings -> null." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: RelatedAssets (Cluster-Geschwister)

**Files:** Create `src/components/content/RelatedAssets.tsx`

- [ ] **Step 1: Komponente schreiben**

```tsx
import Link from 'next/link'
import { getAllAssets, type ClaimondoAsset } from '@/lib/content/claimondo-mdx'

export function RelatedAssets({ current }: { current: ClaimondoAsset }) {
  if (!current.cluster) return null
  const siblings = getAllAssets().filter(
    (a) => a.cluster === current.cluster && a.folder === current.folder && a.url !== current.url,
  ).slice(0, 6)
  if (siblings.length === 0) return null
  return (
    <aside className="mt-12 border-t border-claimondo-border pt-8">
      <h2 className="mb-[18px] font-montserrat text-[22px] font-bold text-claimondo-navy" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>Verwandte Themen aus Cluster {current.cluster}</h2>
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {siblings.map((s) => (
          <li key={s.url}>
            <Link href={s.url} className="block rounded-ios-md border border-claimondo-border bg-white p-4 transition hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-sm">
              {s.nummer && <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-claimondo-light-blue">{s.nummer}</div>}
              <div className="mt-1 font-montserrat text-[15.5px] font-bold text-claimondo-navy" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>{s.title}</div>
              {s.snippet && <div className="mt-1 line-clamp-2 text-[13.5px] text-claimondo-shield/70">{s.snippet}</div>}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 2: Build → PASS.** Run: `npm run build`
- [ ] **Step 3: Commit**
```powershell
git -C $b add src/components/content/RelatedAssets.tsx
git -C $b commit -m "feat(content): RelatedAssets cluster-geschwister-grid" -m "Audit: Build gruen; Tokens; leere Liste -> null (kein Crash bei Cornerstone/Decoder ohne Geschwister)." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: ContentJsonLd + CTA-Komponenten (Decoder + Spoke)

**Files:** Create `src/components/content/ContentJsonLd.tsx`, `src/components/content/DecoderCtaBlock.tsx`, `src/components/content/InlineCheckCta.tsx`, `src/components/content/SpokeCtaBand.tsx`

- [ ] **Step 1: ContentJsonLd schreiben** (injiziert MD-Schema verbatim + Breadcrumb; Fallback articleSchema)

```tsx
import { articleSchema, breadcrumbsSchema, jsonLdScript } from '@/lib/seo/jsonld'

interface Props {
  schemaJson: string | null   // aus extractSchemaJson
  fallback: { headline: string; description: string; datePublished: string; url: string }
  crumbs: Array<{ name: string; url: string }>
}

export function ContentJsonLd({ schemaJson, fallback, crumbs }: Props) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={
        schemaJson ? { __html: schemaJson } : jsonLdScript(articleSchema(fallback))
      } />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumbsSchema(crumbs))} />
    </>
  )
}
```

- [ ] **Step 2: DecoderCtaBlock schreiben** (Navy, Anruf+WhatsApp primär). Styling-Referenz: Spoke-End-CTA aus /vorteile.

```tsx
import { Phone } from 'lucide-react'
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'

const WA_HREF = 'https://wa.me/4922125906530'

export function DecoderCtaBlock() {
  return (
    <div className="relative mt-5 overflow-hidden rounded-ios-md bg-claimondo-navy p-6 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.4), transparent 55%)' }} />
      <div className="relative">
        <h2 className="text-xl font-extrabold" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>Genau diesen Brief bekommen?</h2>
        <p className="mt-1 text-sm text-white/80">Wir antworten kostenlos für Sie — und setzen die Frist korrekt. Ohne Kostenrisiko bei unverschuldetem Unfall.</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-claimondo-navy"><Phone className="h-4 w-4" aria-hidden />{PHONE_DISPLAY}</a>
          <a href={WA_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white" style={{ backgroundColor: '#25D366' }}><WhatsAppIcon />WhatsApp</a>
          <a href="/schaden-melden" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90">Online melden</a>
        </div>
      </div>
    </div>
  )
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg>
}
```
Note: `#25D366` ist in `external-brand-colors.ts` whitelisted → token-audit OK als Inline-Style. (Falls Audit dennoch meckert: Skip-Header oben in der Datei mit Grund setzen.)

- [ ] **Step 2b: InlineCheckCta + SpokeCtaBand schreiben** (Spoke Mid-CTA `/check` + End-Band `/schaden-melden`+WhatsApp, Spec §7)

`src/components/content/InlineCheckCta.tsx`:
```tsx
export function InlineCheckCta() {
  return (
    <div className="my-8 flex flex-wrap items-center justify-between gap-4 rounded-ios-md border border-claimondo-light-blue/40 bg-claimondo-bg p-5">
      <div>
        <b className="block font-montserrat text-[17px] text-claimondo-navy" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>Frist schon abgelaufen?</b>
        <span className="text-sm text-claimondo-shield">Wir prüfen kostenfrei, wo du in deinem Schadensfall stehst — ohne Kostenrisiko.</span>
      </div>
      <a href="/check" className="shrink-0 rounded-full bg-claimondo-ondo px-5 py-2.5 text-sm font-bold text-white transition hover:bg-claimondo-navy">Anspruch prüfen →</a>
    </div>
  )
}
```

`src/components/content/SpokeCtaBand.tsx`:
```tsx
import { ChevronRight } from 'lucide-react'

export function SpokeCtaBand({ headline = 'Nicht sicher, ob deine Frist schon läuft?' }: { headline?: string }) {
  return (
    <section className="relative mt-14 overflow-hidden rounded-ios-lg bg-claimondo-navy p-10 text-center text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 18% 22%, rgba(69,115,162,0.35), transparent 55%), radial-gradient(circle at 82% 78%, rgba(123,163,204,0.2), transparent 50%)' }} />
      <div className="relative">
        <h2 className="text-[27px] font-extrabold" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>{headline}</h2>
        <p className="mx-auto mt-2 max-w-xl text-white/75">Anonyme Erst-Einschätzung. Antwort &lt;15 Min. Bei unverschuldetem Unfall trägt der Gegner die Anwaltskosten.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href="/schaden-melden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-extrabold text-claimondo-navy">Schaden online melden<ChevronRight className="h-4 w-4" aria-hidden /></a>
          <a href="https://wa.me/4922125906530" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-white" style={{ backgroundColor: '#25D366' }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg>WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}
```
Note Position: Spec §2.1 nennt den Mid-CTA „nach der ersten Sektion". MVP platziert `InlineCheckCta` am Artikel-Ende (vor `SpokeCtaBand`), um Body-Splitting zu vermeiden — echte Mid-Section-Platzierung ist Refinement (Doc 25). Dokumentierte, minimale Abweichung.

- [ ] **Step 3: Build → PASS.** Run: `npm run build`
- [ ] **Step 4: Commit**
```powershell
git -C $b add src/components/content/ContentJsonLd.tsx src/components/content/DecoderCtaBlock.tsx src/components/content/InlineCheckCta.tsx src/components/content/SpokeCtaBand.tsx
git -C $b commit -m "feat(content): ContentJsonLd (MD-schema-injektion + breadcrumb + fallback) + DecoderCtaBlock" -m "dangerouslySetInnerHTML statt script-spread (jsonLdScript liefert {__html}). WhatsApp #25D366 whitelisted." -m "Audit: Build gruen; Tokens (WA-Hex whitelisted); Spec-Hebel-3 erfuellt." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: ClusterHubGrid (Cornerstone-Hub)

**Files:** Create `src/components/content/ClusterHubGrid.tsx`

- [ ] **Step 1: Komponente schreiben** — gruppiert Spokes nach Cluster via bestehendem `groupSpokesByCluster` + `clusterLabel`.

```tsx
import Link from 'next/link'
import { groupSpokesByCluster, clusterLabel } from '@/lib/content/claimondo-mdx'

// Kurz-Titel je Cluster für die Karten-Headline (clusterLabel ist die Langform).
const SHORT: Record<string, string> = {
  H1: 'Haftungs-Grundlagen', H2: 'Anspruchs-Grundlagen', H3: 'Schadenspositionen',
  H4: 'Fristen', H6: 'Standard-Unfälle', H7: 'Komplexe Fälle',
}

export function ClusterHubGrid() {
  const groups = groupSpokesByCluster()
  const order = ['H1', 'H2', 'H3', 'H4', 'H6', 'H7'].filter((c) => groups[c]?.length)
  return (
    <div className="my-8">
      <h2 className="mb-[14px] font-montserrat text-xl font-bold text-claimondo-navy" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>Wähle dein Thema</h2>
      <div className="grid gap-3.5 md:grid-cols-3">
        {order.map((c) => (
          <div key={c} className="rounded-ios-md border border-claimondo-border bg-white p-[18px]">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-claimondo-light-blue">Cluster {c}</div>
            <div className="mb-2.5 mt-1 font-montserrat text-base font-bold text-claimondo-navy" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>{SHORT[c] ?? clusterLabel(c)}</div>
            <ul>
              {groups[c].slice(0, 3).map((s) => (
                <li key={s.url} className="border-t border-claimondo-bg first:border-0">
                  <Link href={s.url} className="block py-1 text-[13.5px] text-claimondo-shield hover:text-claimondo-ondo">{s.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build → PASS.** Run: `npm run build`
- [ ] **Step 3: Commit**
```powershell
git -C $b add src/components/content/ClusterHubGrid.tsx
git -C $b commit -m "feat(content): ClusterHubGrid fuer Cornerstone-Hub-Navigation" -m "Audit: Build gruen; nutzt bestehende groupSpokesByCluster/clusterLabel; Tokens." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: StickyCallBar — persistenter WhatsApp-Prop

WhatsApp „immer präsent" (Aaron). Non-breaking: optionaler `whatsappHref`, default off.

**Files:** Modify `src/components/landing/StickyCallBar.tsx`

- [ ] **Step 1: Prop + Button ergänzen**

In `type Props` ergänzen:
```typescript
  /** Wenn gesetzt: persistenter WhatsApp-Button in der Sticky-Bar (Content-Pages). */
  whatsappHref?: string
```
Signatur: `export function StickyCallBar({ quelle = 'Hauptseite', whatsappHref }: Props) {`
Im Sticky-Bar-`<div>` (nach dem `tel:`-`<a>`, vor dem Rückruf-`<button>`) einfügen:
```tsx
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(37,211,102,0.34)] transition-all duration-200 active:scale-[0.97]"
            style={{ backgroundColor: '#25D366' }}
            aria-label="WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z"/></svg>
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        )}
```

- [ ] **Step 2: Build + Token-Audit**

Run: `npm run build` → PASS. Run: `npm run check:token-audit` → PASS (#25D366 whitelisted).

- [ ] **Step 3: Commit**
```powershell
git -C $b add src/components/landing/StickyCallBar.tsx
git -C $b commit -m "feat(landing): optionaler persistenter WhatsApp-Button in StickyCallBar" -m "whatsappHref-Prop, default off (non-breaking fuer /vorteile etc.), aktiv auf Content-Pages." -m "Audit: Build+token-audit gruen; WA-Hex whitelisted; Regression: Prop optional, bestehende Caller unveraendert." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Route /haftpflicht/[slug] (Spoke-Grundtemplate)

**Files:** Create `src/app/haftpflicht/[slug]/page.tsx`

- [ ] **Step 1: Route schreiben**

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { TableOfContents } from '@/components/content/TableOfContents'
import { RelatedAssets } from '@/components/content/RelatedAssets'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import { InlineCheckCta } from '@/components/content/InlineCheckCta'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import {
  getHaftpflichtSpokes, clusterLabel, extractSchemaJson, stripSchemaSection,
  stripLeadingSnippet, extractHeadings, extractTrustChips, readingTimeMin,
} from '@/lib/content/claimondo-mdx'
import { SITE_URL } from '@/lib/seo/jsonld'

const WA = 'https://wa.me/4922125906530'

export function generateStaticParams() {
  return getHaftpflichtSpokes().map((a) => ({ slug: a.slug }))
}

function get(slug: string) {
  return getHaftpflichtSpokes().find((a) => a.slug === slug)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = get(slug)
  if (!a) return {}
  return {
    title: `${a.title} · Claimondo`,
    description: a.snippet || a.title,
    alternates: { canonical: a.url },
    openGraph: { type: 'article', url: `${SITE_URL}${a.url}`, title: a.title, description: a.snippet, locale: 'de_DE', siteName: 'Claimondo' },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = get(slug)
  if (!a) notFound()

  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))
  const headings = extractHeadings(cleaned)

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd
        schemaJson={extractSchemaJson(a.body)}
        fallback={{ headline: a.title, description: a.snippet, datePublished: a.lastModified.toISOString(), url: `${SITE_URL}${a.url}` }}
        crumbs={[
          { name: 'Start', url: '/' },
          { name: 'Kfz-Haftpflichtschaden', url: '/kfz-haftpflicht-schaden' },
          { name: a.title, url: a.url },
        ]}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1140px] px-6 py-10">
        <AssetHero
          title={a.title}
          snippet={a.snippet}
          clusterLabel={a.cluster ? `${a.cluster} · ${clusterLabel(a.cluster).split(' (')[0]}` : undefined}
          trustChips={extractTrustChips(a.body)}
          lastModified={a.lastModified}
          readingMin={readingTimeMin(a.body)}
        />
        <div className="grid grid-cols-1 gap-12 pt-9 lg:grid-cols-[230px_1fr]">
          <TableOfContents headings={headings} />
          <article>
            <MarkdownRenderer body={cleaned} />
            <InlineCheckCta />
            <SpokeCtaBand />
            <RelatedAssets current={a} />
          </article>
        </div>
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Wissen: ${a.slug}`} whatsappHref={WA} />
    </div>
  )
}
```
Note: `clusterLabel(...)` ist die Langform mit Klammer-Aufzählung; `.split(' (')[0]` nimmt die Kurzform (z.B. „Fristen"). Falls `clusterLabel` keine Klammer hat, gibt split den ganzen String — ok.
Note: `LandingTopbar`-Prop-Name `authenticatedUser` aus /vorteile übernommen; in Step 2 verifizieren.

- [ ] **Step 2: Topbar-Prop verifizieren**

Run: `git -C $b grep -n "export function LandingTopbar" -- src/components/landing/LandingTopbar.tsx`
Prop-Signatur prüfen; falls kein `authenticatedUser`-Prop → Aufruf anpassen (ggf. `<LandingTopbar />`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS + 57 statische `/haftpflicht/*`-Seiten im Output.

- [ ] **Step 4: Curl-Smoke**

Run:
```powershell
npm run build; npm run start
```
In zweitem Terminal:
```powershell
(iwr http://localhost:3000/haftpflicht/4-wochen-frist).Content -match '<h2'   # True
(iwr http://localhost:3000/haftpflicht/4-wochen-frist).Content -match 'application/ld\+json'  # True
(iwr http://localhost:3000/haftpflicht/nonexistent -SkipHttpErrorCheck).StatusCode   # 404
```

- [ ] **Step 5: Screenshot-Smoke** (Pflicht laut AGENTS.md)

Mit dem brainstorm-Companion oder Playwright `/haftpflicht/4-wochen-frist` öffnen, Screenshot im selben Turn auswerten: Header/Snippet/TOC/Tabelle/Related/Sticky-Bar (mit WhatsApp) sichtbar? Schema-Codeblock NICHT sichtbar? „Kurz erklärt" nur einmal?

- [ ] **Step 6: Commit**
```powershell
git -C $b add src/app/haftpflicht/
git -C $b commit -m "feat(content): /haftpflicht/[slug] spoke-route (SSG, JSON-LD, TOC, related)" -m "57 statische Seiten. Schema-Injektion aus MD, Snippet-Dedup, Tokens. WhatsApp persistent." -m "Audit: Build gruen (57 SSG); UI: oeffentlich erreichbar via Cornerstone/sitemap; Spec-Hebel 1/2/3/4 erfuellt; Screenshot-Smoke ok." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Route /decoder/[slug]

Wie Task 11, aber: **kein TOC**, `DecoderCtaBlock` nach dem Body, Breadcrumb „Decoder", Slugs deutsch.

**Files:** Create `src/app/decoder/[slug]/page.tsx`

- [ ] **Step 1: Route schreiben**

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { DecoderCtaBlock } from '@/components/content/DecoderCtaBlock'
import { RelatedAssets } from '@/components/content/RelatedAssets'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import {
  getDecoder, extractSchemaJson, stripSchemaSection, stripLeadingSnippet,
  extractTrustChips, readingTimeMin,
} from '@/lib/content/claimondo-mdx'
import { SITE_URL } from '@/lib/seo/jsonld'

const WA = 'https://wa.me/4922125906530'

export function generateStaticParams() {
  return getDecoder().map((a) => ({ slug: a.slug }))
}
function get(slug: string) { return getDecoder().find((a) => a.slug === slug) }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = get(slug)
  if (!a) return {}
  return {
    title: `${a.title} · Claimondo`,
    description: a.snippet || a.title,
    alternates: { canonical: a.url },
    openGraph: { type: 'article', url: `${SITE_URL}${a.url}`, title: a.title, description: a.snippet, locale: 'de_DE', siteName: 'Claimondo' },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = get(slug)
  if (!a) notFound()
  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd
        schemaJson={extractSchemaJson(a.body)}
        fallback={{ headline: a.title, description: a.snippet, datePublished: a.lastModified.toISOString(), url: `${SITE_URL}${a.url}` }}
        crumbs={[{ name: 'Start', url: '/' }, { name: 'Versicherer-Brief-Decoder', url: '/kfz-haftpflicht-schaden' }, { name: a.title, url: a.url }]}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[820px] px-6 py-10">
        <AssetHero title={a.title} snippet={a.snippet} clusterLabel="Versicherer-Brief-Decoder" trustChips={extractTrustChips(a.body)} lastModified={a.lastModified} readingMin={readingTimeMin(a.body)} />
        <article className="pt-8">
          <MarkdownRenderer body={cleaned} />
          <DecoderCtaBlock />
          <RelatedAssets current={a} />
        </article>
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Decoder: ${a.slug}`} whatsappHref={WA} />
    </div>
  )
}
```

- [ ] **Step 2: Build → PASS** (10 SSG-Seiten). Run: `npm run build`
- [ ] **Step 3: Curl-Smoke**
```powershell
(iwr http://localhost:3000/decoder/wir-pruefen-sachverhalt).Content -match 'Genau diesen Brief'   # True
(iwr http://localhost:3000/decoder/wir-pruefen-sachverhalt).Content -match 'FAQPage'   # True (Schema-Injektion)
```
- [ ] **Step 4: Screenshot-Smoke** — Decoder-CTA prominent, WhatsApp grün, kein Schema-Codeblock.
- [ ] **Step 5: Commit**
```powershell
git -C $b add src/app/decoder/
git -C $b commit -m "feat(content): /decoder/[slug] route (SSG, DecoderCtaBlock, kein TOC)" -m "10 statische Seiten, deutsche Slugs. CTA nach Antwort (SEO-konform). Schema-Injektion." -m "Audit: Build gruen (10 SSG); Spec-Variante Decoder erfuellt; Screenshot-Smoke ok." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Routen /kfz-haftpflicht-schaden + /ratgeber (Cornerstones)

**Files:** Create `src/app/kfz-haftpflicht-schaden/page.tsx`, `src/app/ratgeber/page.tsx`

- [ ] **Step 1: /kfz-haftpflicht-schaden schreiben** (mit ClusterHubGrid)

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { ClusterHubGrid } from '@/components/content/ClusterHubGrid'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import {
  getCornerstones, extractSchemaJson, stripSchemaSection, stripLeadingSnippet,
  extractTrustChips, readingTimeMin,
} from '@/lib/content/claimondo-mdx'
import { SITE_URL } from '@/lib/seo/jsonld'

const SLUG = 'kfz-haftpflicht-schaden'
const WA = 'https://wa.me/4922125906530'
function get() { return getCornerstones().find((a) => a.slug === SLUG) }

export function generateMetadata(): Metadata {
  const a = get()
  if (!a) return {}
  return { title: `${a.title} · Claimondo`, description: a.snippet || a.title, alternates: { canonical: `/${SLUG}` },
    openGraph: { type: 'article', url: `${SITE_URL}/${SLUG}`, title: a.title, description: a.snippet, locale: 'de_DE', siteName: 'Claimondo' } }
}

export default function Page() {
  const a = get()
  if (!a) notFound()
  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd schemaJson={extractSchemaJson(a.body)}
        fallback={{ headline: a.title, description: a.snippet, datePublished: a.lastModified.toISOString(), url: `${SITE_URL}${a.url}` }}
        crumbs={[{ name: 'Start', url: '/' }, { name: a.title, url: a.url }]} />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1040px] px-6 py-10">
        <AssetHero title={a.title} snippet={a.snippet} trustChips={extractTrustChips(a.body)} lastModified={a.lastModified} readingMin={readingTimeMin(a.body)} />
        <ClusterHubGrid />
        <article className="pt-2"><MarkdownRenderer body={cleaned} /></article>
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Cornerstone: Haftpflicht-Hub" whatsappHref={WA} />
    </div>
  )
}
```

- [ ] **Step 2: /ratgeber schreiben** (analog, OHNE ClusterHubGrid, SLUG='ratgeber', `quelle="Cornerstone: Ratgeber"`, sonst identische Struktur ohne `<ClusterHubGrid />`).

```tsx
// src/app/ratgeber/page.tsx — wie kfz-haftpflicht-schaden, aber:
//   const SLUG = 'ratgeber'
//   KEIN <ClusterHubGrid /> (Persona-basiert)
//   quelle="Cornerstone: Ratgeber"
// Vollständige Datei = Kopie von Step 1 mit diesen 3 Änderungen.
```
(Engineer: Datei 1:1 aus Step 1 kopieren, `SLUG`, `quelle` ändern, `<ClusterHubGrid />`-Zeile löschen.)

- [ ] **Step 3: Build → PASS** (2 Cornerstone-Seiten). Run: `npm run build`
- [ ] **Step 4: Curl + Screenshot-Smoke**
```powershell
(iwr http://localhost:3000/kfz-haftpflicht-schaden).Content -match 'Wähle dein Thema'  # True (Hub-Grid)
(iwr http://localhost:3000/ratgeber).StatusCode  # 200
```
Screenshot: Hub-Grid auf /kfz-haftpflicht-schaden, kein Grid auf /ratgeber.
- [ ] **Step 5: Commit**
```powershell
git -C $b add src/app/kfz-haftpflicht-schaden/ src/app/ratgeber/
git -C $b commit -m "feat(content): cornerstone-routen /kfz-haftpflicht-schaden (hub) + /ratgeber" -m "Audit: Build gruen; Hub-Grid nur auf Haftpflicht-Pillar; Screenshot-Smoke ok." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Footer-Links zu Cornerstones

**Files:** Modify `src/components/landing/LandingFooter.tsx`

- [ ] **Step 1: Bestehende Footer-Struktur lesen**

Run: `git -C $b grep -n "href" -- src/components/landing/LandingFooter.tsx | head -20`
Existierende Link-Liste/Sektion identifizieren.

- [ ] **Step 2: Zwei Links ergänzen** im passenden Footer-Block (Muster der bestehenden Links exakt übernehmen):
```tsx
<Link href="/kfz-haftpflicht-schaden">Kfz-Haftpflichtschaden</Link>
<Link href="/ratgeber">Ratgeber</Link>
```
(Konkrete Klassen/Wrapper aus den Nachbar-Links kopieren — Footer-Idiom beibehalten.)

- [ ] **Step 3: Build → PASS.** Run: `npm run build`
- [ ] **Step 4: Commit**
```powershell
git -C $b add src/components/landing/LandingFooter.tsx
git -C $b commit -m "feat(landing): footer-links zu claimondo.de cornerstones" -m "Audit: Build gruen; Erreichbarkeit der Cornerstones ohne organische Suche; Regression: nur Link-Add." -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Gesamt-Verifikation + PR

**Files:** keine (Verifikation + PR)

- [ ] **Step 1: Voller Build + Audits**

Run: `npm run build` → PASS. Run: `npm test` → PASS (mdx-Helper-Tests). Run: `npm run check:token-audit` → PASS. Run: `npm run check:component-set` → PASS.

- [ ] **Step 2: Production-Smoke (alle 4 Routen-Typen)**

Run: `npm run start`, dann:
```powershell
(iwr http://localhost:3000/sitemap.xml).Content.Split('<url>').Count   # >= 80
(iwr http://localhost:3000/llms.txt).Content.Substring(0,200)
(iwr http://localhost:3000/kfz-haftpflicht-schaden).StatusCode  # 200
(iwr http://localhost:3000/haftpflicht/4-wochen-frist).StatusCode  # 200
(iwr http://localhost:3000/decoder/wir-pruefen-sachverhalt).StatusCode  # 200
(iwr http://localhost:3000/haftpflicht/gibtsnicht -SkipHttpErrorCheck).StatusCode  # 404
```

- [ ] **Step 3: JSON-LD-Validierung (Stichprobe)**

`(iwr http://localhost:3000/decoder/wir-pruefen-sachverhalt).Content` → JSON-LD-Block extrahieren, in https://validator.schema.org prüfen (FAQPage + HowTo + Article erkannt).

- [ ] **Step 4: Screenshot-Smoke alle 3 Layout-Typen** (Pflicht) — Spoke, Decoder, Cornerstone-Hub. Im selben Turn auswerten.

- [ ] **Step 5: Push + PR gegen staging**

```powershell
git -C $b push -u origin kitta/doc16-claimondo-content-routes
gh pr create --base staging --head kitta/doc16-claimondo-content-routes --title "feat(seo): claimondo.de Content-Render-Routen (69 Assets, Archetyp C)" --body "..."
```
PR-Body: Spec-/Plan-Links, 4 Routen, SEO/GEO-Hebel, Smoke-Output, Screenshots. **NIE --base main.**

- [ ] **Step 6: finishing-a-development-branch-Skill** ausführen (Status melden, Memory-Update, ggf. Notion).

---

## Self-Review (gegen Spec)

**Spec-Coverage:**
- §2.1 Spoke-Layout → Task 5/6/7/11 ✓
- §2.2 Decoder → Task 8/12 ✓
- §2.3 Cornerstone-Hub → Task 9/13 ✓
- §3 SEO/GEO-Hebel 1–5 → Task 11/12/13 (URL+Meta+JSON-LD+Semantik) + Task 1 (sitemap/llms) ✓
- §4 Render-Transformationen (Schema-Strip, Snippet-Dedup, interne Links, Trenner, Tokens) → Task 2 + Task 4 ✓
- §4.1 Schema-Injektion → Task 2 (extract) + Task 8 (ContentJsonLd) ✓
- §5 Komponenten + StickyCallBar-WhatsApp → Task 4–10 ✓
- §6 Routen-Specs → Task 11–13 ✓
- §7 CTA-Strategie (WhatsApp persistent, /check, /schaden-melden) → Task 8 (InlineCheckCta + SpokeCtaBand) + Task 10 (StickyCallBar) + Task 11 ✓
- §8 Edge Cases (Invalid-Date, Schema-Fallback, leere Related) → Task 5/8/7 ✓
- §9 Out-of-Scope respektiert ✓

**Gap gefunden + behoben:** §7 Spoke Mid-CTA (`/check`) + End-Band fehlten. Fix inline: `InlineCheckCta` + `SpokeCtaBand` in Task 8 ergänzt, in Task 11 nach `MarkdownRenderer` eingebunden (Position am Artikel-Ende — dokumentierte MVP-Abweichung von „mid-section", echtes Mid-Splitting = Doc-25-Refinement).

**Placeholder-Scan:** /ratgeber (Task 13 Step 2) ist als „Kopie mit 3 Änderungen" beschrieben statt voll ausgeschrieben — bewusst (DRY, identische Datei), Änderungen explizit benannt. Akzeptiert.

**Type-Konsistenz:** Helper-Namen (`extractSchemaJson`, `stripSchemaSection`, `stripLeadingSnippet`, `extractHeadings`, `extractTrustChips`, `readingTimeMin`, `isInternalHref`) über Task 2/4/11/12/13 konsistent ✓. `ClaimondoAsset.related` additiv ✓.

**Status:** Gap behoben — Plan vollständig + ausführbar. 15 Tasks, TDD für die reine Logik (Task 2), Build+curl+Screenshot-Smoke für UI (Projekt-Idiom + AGENTS.md-Audit).
