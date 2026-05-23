/**
 * Content-Discovery für die Claimondo-Asset-Library
 * (src/content/claimondo/{cornerstones,haftpflicht,decoder}/*.md).
 *
 * Wird zur Build-Zeit von:
 *  - sitemap.ts        → URL-Listen mit lastmod
 *  - llms.txt          → strukturierte Index-Sektion
 *  - llms-full.txt     → vollständiger Markdown-Dump
 *  - /content-Routen   → MDX-Render
 *
 * Frontmatter-Format pro File (siehe marketing-strategy/published/claimondo.de/):
 *   ---
 *   publish_status: live
 *   brand: claimondo.de
 *   url: /haftpflicht/4-wochen-frist
 *   type: glossar-spoke | decoder | cornerstone-pillar | cornerstone-ratgeber
 *   cluster: H1..H8 | PILLAR-B | PILLAR-RATGEBER
 *   nummer: H4.1
 *   primary_keyword: "…"
 *   secondary_keywords: ["…", "…"]
 *   last_modified: 2026-05-18
 *   related: ["/…","/…"]
 *   ---
 */

import fs from 'node:fs'
import path from 'node:path'

const CONTENT_ROOT = path.join(process.cwd(), 'src', 'content', 'claimondo')

export type ContentType =
  | 'cornerstone-pillar'
  | 'cornerstone-ratgeber'
  | 'glossar-spoke'
  | 'decoder'

export interface ClaimondoAsset {
  /** Relativer URL-Pfad ab Domain-Root, z. B. /haftpflicht/4-wochen-frist */
  url: string
  /** Datei-System-Pfad zur .md, absolut */
  filePath: string
  /** Bucket/Folder unter src/content/claimondo: cornerstones | haftpflicht | decoder */
  folder: 'cornerstones' | 'haftpflicht' | 'decoder'
  /** Slug ohne Extension */
  slug: string
  /** Aus Frontmatter `type` */
  type: ContentType
  /** Aus Frontmatter `cluster` */
  cluster: string
  /** Aus Frontmatter `nummer`, z. B. H4.1 */
  nummer?: string
  /** Aus Frontmatter `primary_keyword` */
  primaryKeyword?: string
  /** Aus Frontmatter `last_modified` (YYYY-MM-DD) als Date */
  lastModified: Date
  /** Aus erster Markdown-H1 oder Title (für llms.txt-Snippet) */
  title: string
  /** Featured-Snippet-Block (40–60 Wörter) — erstes Blockquote nach H1 */
  snippet: string
  /** Voller Markdown-Body (für llms-full.txt) */
  body: string
  /** Aus Frontmatter `related` — verwandte interne URLs (optional) */
  related?: string[]
}

/**
 * Sehr leichte Frontmatter-Extraktion (kein Library-Dependency).
 * Erkennt YAML-Block zwischen den ersten zwei `---`-Zeilen.
 */
function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: raw }
  const yaml = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\n+/, '')

  const meta: Record<string, unknown> = {}
  let currentKey: string | null = null

  for (const line of yaml.split('\n')) {
    const arrayItem = line.match(/^\s+-\s+(.*)$/)
    if (arrayItem && currentKey) {
      // Robust gegen den Fall, dass die `key:`-Zeile zuvor einen leeren
      // String gesetzt hat (mehrzeilige Array-Syntax `related:\n  - item`):
      // `'' ?? []` würde `''` behalten → `''.push()` wirft. Daher explizit
      // auf echtes Array koerzieren.
      const existing = meta[currentKey]
      const arr = Array.isArray(existing) ? (existing as string[]) : []
      arr.push(arrayItem[1].replace(/^["']|["']$/g, ''))
      meta[currentKey] = arr
      continue
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (!kv) continue
    const [, key, rawVal] = kv
    currentKey = key
    const val = rawVal.trim()
    if (val === '' || val === '[]') {
      meta[key] = val === '[]' ? [] : ''
    } else if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      meta[key] = val.replace(/^["']|["']$/g, '')
    }
  }
  return { meta, body }
}

function extractTitle(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : fallback
}

function extractSnippet(body: string): string {
  // Erstes Blockquote nach H1 (Pattern "> **Kurz erklärt:** …")
  const m = body.match(/^>\s+(.+(?:\n>\s+.+)*)/m)
  if (!m) return ''
  return m[1]
    .replace(/^>\s+/gm, '')
    .replace(/\*\*Kurz erklärt:\*\*\s*/i, '')
    .trim()
}

function readOneFolder(folder: ClaimondoAsset['folder']): ClaimondoAsset[] {
  const dir = path.join(CONTENT_ROOT, folder)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name): ClaimondoAsset => {
      const filePath = path.join(dir, name)
      const raw = fs.readFileSync(filePath, 'utf8')
      const { meta, body } = parseFrontmatter(raw)
      const slug = name.replace(/\.md$/, '')
      const frontmatterUrl = typeof meta.url === 'string' ? meta.url : ''
      const urlPath = frontmatterUrl ||
        (folder === 'cornerstones'
          ? `/${slug}`
          : folder === 'haftpflicht'
            ? `/haftpflicht/${slug}`
            : `/decoder/${slug}`)
      const last = typeof meta.last_modified === 'string' ? meta.last_modified : ''
      const lastModified = last ? new Date(last) : new Date()
      return {
        url: urlPath,
        filePath,
        folder,
        slug,
        type: (meta.type as ContentType) ?? 'glossar-spoke',
        cluster: (meta.cluster as string) ?? '',
        nummer: typeof meta.nummer === 'string' ? meta.nummer : undefined,
        primaryKeyword: typeof meta.primary_keyword === 'string' ? meta.primary_keyword : undefined,
        lastModified,
        title: extractTitle(body, slug),
        snippet: extractSnippet(body),
        body,
        related: Array.isArray(meta.related) ? (meta.related as string[]) : undefined,
      }
    })
}

/** Alle 69 Assets — gecached über Module-Scope (build-time stabil). */
let _all: ClaimondoAsset[] | null = null
export function getAllAssets(): ClaimondoAsset[] {
  if (_all) return _all
  _all = [
    ...readOneFolder('cornerstones'),
    ...readOneFolder('haftpflicht'),
    ...readOneFolder('decoder'),
  ]
  return _all
}

export function getCornerstones(): ClaimondoAsset[] {
  return getAllAssets().filter((a) => a.folder === 'cornerstones')
}
export function getHaftpflichtSpokes(): ClaimondoAsset[] {
  return getAllAssets().filter((a) => a.folder === 'haftpflicht')
}
export function getDecoder(): ClaimondoAsset[] {
  return getAllAssets().filter((a) => a.folder === 'decoder')
}

/** Spokes nach Cluster gruppieren (H1, H2, H3, H4, H6, H7) für llms.txt-Hierarchie. */
export function groupSpokesByCluster(): Record<string, ClaimondoAsset[]> {
  const map: Record<string, ClaimondoAsset[]> = {}
  for (const a of getHaftpflichtSpokes()) {
    const c = a.cluster || 'misc'
    if (!map[c]) map[c] = []
    map[c].push(a)
  }
  // Innerhalb des Clusters nach `nummer` sortieren (H4.1 vor H4.2 …)
  for (const c of Object.keys(map)) {
    map[c].sort((a, b) => (a.nummer ?? '').localeCompare(b.nummer ?? '', 'de', { numeric: true }))
  }
  return map
}

const CLUSTER_LABELS: Record<string, string> = {
  H1: 'Haftungs-Grundlagen (§§ 7/18 StVG, § 823 BGB, Mitverschulden, Beweislast, Anscheinsbeweis)',
  H2: 'Anspruchs-Grundlagen (Geschädigte, Beifahrer, Hinterbliebene, Schockschaden, Erben, Sozialträger-Regress)',
  H3: 'Schadenspositionen (Reparatur, Wertminderung, Wiederbeschaffung, Mietwagen, Nutzungsausfall, Schmerzensgeld, Verdienstausfall, Pflege, EM-Schaden, …)',
  H4: 'Fristen (4-Wochen-Regulierung, Verzug, Verzugszinsen, Verjährung, Anerkenntnis/Vergleich)',
  H6: 'Standard-Unfall-Szenarien (Auffahrunfall, Vorfahrt, Rotlicht, Spurwechsel, Linksabbieger, Parkplatz, Türöffnen, Wenden, Überholen, Wildunfall, Glatteis)',
  H7: 'Komplexe Konstellationen (Fahrerflucht, Verkehrsopferhilfe, Auslandsunfall, Schwarzfahrt, Anhänger, Produkthaftung, mehrere Schädiger, Dritte Beteiligte, Kasko)',
}

export function clusterLabel(cluster: string): string {
  return CLUSTER_LABELS[cluster] ?? cluster
}

// ---- Render-Helper (rein, testbar) — für die Content-Render-Routen ----

/** JSON aus dem ```json-Block unter "## Schema (JSON-LD)" — null bei Fehlen/Parse-Fehler. */
export function extractSchemaJson(body: string): string | null {
  const sec = body.match(/##\s+Schema \(JSON-LD\)[\s\S]*?```json\s*([\s\S]*?)```/)
  if (!sec) return null
  const raw = sec[1].trim()
  try {
    JSON.parse(raw)
    return raw
  } catch {
    return null
  }
}

/** Entfernt die "## Schema (JSON-LD)"-Sektion bis Body-Ende (inkl. trailing ---). */
export function stripSchemaSection(body: string): string {
  return body
    .replace(/\n##\s+Schema \(JSON-LD\)[\s\S]*$/, '')
    .replace(/\n+---\s*$/, '')
    .trimEnd()
}

/** Entfernt das erste Blockquote (Kurz-erklärt-Snippet) direkt nach der H1. */
export function stripLeadingSnippet(body: string): string {
  return body.replace(/^(#\s+.+\n+)(?:>.*\n?)+/, '$1')
}

/** GitHub-Slugger-kompatibler Slug (rehype-slug nutzt github-slugger). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

/** H2-Überschriften als {id, text} (ohne die Schema-Sektion). */
export function extractHeadings(body: string): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = []
  for (const m of body.matchAll(/^##\s+(.+)$/gm)) {
    const text = m[1].trim()
    if (/^Schema \(JSON-LD\)/.test(text)) continue
    out.push({ id: slugify(text), text })
  }
  return out
}

const SECTION_RE = /§\s?\d+\w*(?:\s+\w+)?/g
const BGH_RE = /BGH\s+[IVX]+\s?ZR\s?\d+\/\d+/g

/** Bis zu 2 §/BGH-Treffer aus dem Body (BGH-Priorität), dedupe — für Trust-Chips. */
export function extractTrustChips(body: string): string[] {
  const hits = new Set<string>()
  for (const m of body.matchAll(BGH_RE)) hits.add(m[0].replace(/\s+/g, ' '))
  for (const m of body.matchAll(SECTION_RE)) hits.add(m[0].replace(/\s+/g, ' '))
  return [...hits].slice(0, 2)
}

/** Interner Link: relativer Pfad, Anker, oder claimondo.de-Absolut-URL. */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#') || href.startsWith('https://claimondo.de')
}

/** Lesezeit in Minuten (~200 WPM, min 1). */
export function readingTimeMin(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}
