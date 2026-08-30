#!/usr/bin/env node
/**
 * GEO-Baseline-Messung (Generative Engine Optimization) fuer claimondo.de
 *
 * Misst die Zitierfaehigkeit der Marketing-Seiten fuer KI-Antwortmaschinen
 * (ChatGPT/OAI-SearchBot, Perplexity, Google AI Overviews, Claude, Copilot).
 *
 * Gemessen wird das ROHE HTML mit AI-Bot-User-Agent -- also exakt das, was ein
 * AI-Crawler sieht. Kein JS-Rendering: die meisten AI-Crawler rendern kein
 * JavaScript, was clientseitig nachgeladen wird, existiert fuer sie nicht.
 *
 * Usage:
 *   node geo-baseline.mjs                      # Standard-Sample
 *   node geo-baseline.mjs --all                # alle Sitemap-URLs (346, langsam)
 *   node geo-baseline.mjs --properties         # Sweep ueber ALLE 11 Web-Properties
 *   node geo-baseline.mjs --out report.json
 */

import { writeFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'
// GEO_BASE erlaubt die Messung gegen einen lokalen Build (Vorher/Nachher-Vergleich),
// z.B. GEO_BASE=http://localhost:3987 node scripts/geo-baseline.mjs
const BASE = process.env.GEO_BASE || 'https://claimondo.de'
const CONCURRENCY = 4

// Repraesentatives Sample ueber alle Content-Cluster der Sitemap.
// Bewusst je 2-3 pro Cluster: die Cluster sind templatisiert, ein Fund gilt
// mit hoher Wahrscheinlichkeit fuer den ganzen Cluster.
const SAMPLE = [
  // Kern / Conversion
  ['/', 'kern'],
  ['/gutachter-finden', 'kern'],
  ['/schaden-melden', 'kern'],
  ['/wie-es-funktioniert', 'kern'],
  ['/ueber-uns', 'kern'],
  ['/faq', 'kern'],
  // Cornerstone / Ratgeber
  ['/unfall-was-tun-als-geschaedigter', 'cornerstone'],
  ['/unverschuldeter-unfall-rechte', 'cornerstone'],
  ['/kosten-kfz-gutachten', 'cornerstone'],
  ['/gegnerische-versicherung-zahlt-nicht', 'cornerstone'],
  ['/schadensreport-2026', 'cornerstone'],
  // Haftpflicht-Cluster (58 Seiten)
  ['/haftpflicht/4-wochen-frist', 'haftpflicht'],
  ['/haftpflicht/anerkenntnis-bgb212', 'haftpflicht'],
  ['/haftpflicht/abschlepp-bergung', 'haftpflicht'],
  // Wissen/Glossar (64 Seiten)
  ['/wissen', 'wissen-hub'],
  ['/wissen/digitale-schadenaufnahme-mobiler-karosseriescanner', 'wissen'],
  ['/wissen/sommerhitze-reifenschaeden-schadenregulierung', 'wissen'],
  // Versicherer-Decoder (13 + 12 Seiten)
  ['/versicherer/huk-coburg-allgemeine', 'versicherer'],
  ['/versicherer/allianz', 'versicherer'],
  ['/decoder/kfz-gutachter-kosten-tabelle', 'decoder'],
  ['/decoder/mietwagen-zu-hoch', 'decoder'],
  // Sachverstaendigen-Verbaende (9 Seiten)
  ['/sachverstaendige/bvsk', 'sachverstaendige'],
  ['/sachverstaendige/dekra', 'sachverstaendige'],
  // Hyperlokal (160 Seiten)
  ['/kfz-gutachter/koeln', 'hyperlokal'],
  ['/kfz-gutachter/berlin', 'hyperlokal'],
  ['/kfz-gutachter/kosten', 'hyperlokal'],
  ['/kfz-gutachter/ablauf', 'hyperlokal'],
]

// ---------- HTML-Parsing (regex-basiert, kein DOM noetig) ----------

function stripTags(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:lt|#60);/g, '<')
    .replace(/&(?:gt|#62);/g, '>')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function all(re, html, group = 1) {
  const out = []
  let m
  while ((m = re.exec(html)) !== null) out.push(m[group])
  return out
}

function jsonLdTypes(html) {
  const blocks = all(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    html,
  )
  const types = []
  let parseErrors = 0
  for (const raw of blocks) {
    try {
      const parsed = JSON.parse(raw.trim())
      const collect = (node) => {
        if (Array.isArray(node)) return node.forEach(collect)
        if (!node || typeof node !== 'object') return
        if (node['@type']) {
          const t = node['@type']
          ;(Array.isArray(t) ? t : [t]).forEach((x) => types.push(x))
        }
        if (node['@graph']) collect(node['@graph'])
        // verschachtelte Entitaeten (mainEntity, itemListElement, ...) mitzaehlen
        for (const k of ['mainEntity', 'itemListElement', 'hasPart', 'about']) {
          if (node[k]) collect(node[k])
        }
      }
      collect(parsed)
    } catch {
      parseErrors++
    }
  }
  return { blocks: blocks.length, types, parseErrors }
}

const CITE_HOSTS =
  /(gesetze-im-internet|dejure|bundesgerichtshof|juris|rechtsprechung|bgh|adac|bvsk|dekra|gtue|kues|tuev|tuv|kba\.de|destatis|gdv\.de|bundesanzeiger|openjur|jurion|haufe|iww|anwalt\.de)/i

function analyze(url, cluster, html, meta) {
  const text = stripTags(html)
  const words = text ? text.split(/\s+/).length : 0

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || ''
  const desc =
    (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] ||
    (html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] ||
    ''

  const h1s = all(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, html).map(stripTags).filter(Boolean)
  const h2s = all(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, html).map(stripTags).filter(Boolean)
  const h3s = all(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, html).map(stripTags).filter(Boolean)
  // Frage-Ueberschriften = direkter Treffer fuer AI-Retrieval (Prompt ~ H2)
  const questionHeads = [...h2s, ...h3s].filter((h) => /\?\s*$/.test(h) || /^(wie|was|wer|wann|warum|wo|welche|wieviel|wie viel|muss|kann|darf|wird)\b/i.test(h))

  const ld = jsonLdTypes(html)

  // Princeton-GEO-Hebel: Statistiken (+37 %) und Zitate/Quellen (+40 %)
  const stats = (text.match(/\b\d{1,3}(?:[.,]\d+)?\s?(?:%|Prozent|Euro|€|Tage|Stunden|Monate|Jahre|km|Mio|Mrd)\b/gi) || []).length
  const paragraphs = (html.match(/<p[\s>]/gi) || []).length
  const lists = (html.match(/<(?:ul|ol)[\s>]/gi) || []).length
  const tables = (html.match(/<table[\s>]/gi) || []).length

  // WICHTIG: Quellenbelege laufen bei uns ueber ZWEI Kanaele. Die erste Fassung dieses
  // Skripts zaehlte nur externe Links und meldete dadurch faelschlich "keine Quellen" fuer
  // Seiten, die ihre BGH-Az. laengst als JSON-LD `citation` ausliefern (/haftpflicht,
  // /decoder, /sachverstaendige). Fuer AI-Crawler ist `citation` der staerkere Kanal.
  const schemaCitations = (html.match(/"citation"\s*:\s*\[/g) || []).length
    ? all(/"citation"\s*:\s*\[([\s\S]*?)\]/g, html)
        .flatMap((block) => all(/"name"\s*:\s*"([^"]+)"/g, block))
    : []

  const hrefs = all(/<a[^>]+href=["']([^"']+)["']/gi, html)
  const external = hrefs.filter((h) => /^https?:\/\//i.test(h) && !/claimondo\.de/i.test(h))
  const authorityCites = external.filter((h) => CITE_HOSTS.test(h))
  const extHosts = [...new Set(external.map((h) => { try { return new URL(h).hostname.replace(/^www\./, '') } catch { return null } }).filter(Boolean))]
  const internal = hrefs.filter((h) => h.startsWith('/') || /claimondo\.de/i.test(h))

  // Paragraphen-Zitate ("laut", "gemaess", "nach § ...", Urteil-Aktenzeichen)
  const legalRefs = (text.match(/§\s?\d+[a-z]?/gi) || []).length
  // ⚠ 30.08.2026 ERWEITERT um das nackte Aktenzeichen. Vorher verlangte das Muster
  // zwingend "Az."/"Urteil"/"Beschluss" NACH dem Gericht — die uebliche Schreibweise
  // unserer Seiten ist aber "Nach BGH VI ZR 280/22 traegt das Werkstatt-Risiko der
  // Schaediger". Die fiel durch, und das Skript meldete `caseRefs: 0`.
  //
  // Gemessen ueber dieselben 27 Seiten: erkannte Urteilsverweise 17 -> 25 Seiten,
  // avgScore 69,1 -> 70,0. Faelschlich auf 0 standen u.a. /haftpflicht/anerkenntnis-bgb212
  // (FUENF Verweise), /kosten-kfz-gutachten und /wie-es-funktioniert (je vier).
  //
  // ⭐⭐ Der Schaden war nicht der Score-Punkt, sondern die HANDLUNGSEMPFEHLUNG:
  // "/gegnerische-versicherung-zahlt-nicht hat null Urteilsverweise" liest sich wie eine
  // inhaltliche Luecke — dort steht ein korrekt eingeordnetes BGH-Urteil. Beinahe waeren
  // Urteile ergaenzt worden, die laengst dastehen; auf einer Rechtsseite die
  // gefaehrlichste Art von Fleiss.
  //
  // ⚠ Scores sind dadurch NICHT mehr mit Messungen vor dem 30.08. vergleichbar:
  // caseRefs gibt 3 Punkte ab dem ersten Treffer, 10 der 27 Seiten standen auf 0.
  const caseRefs = (text.match(
    /\b(?:BGH|OLG|LG|AG)\b[^.]{0,40}?(?:Az\.?|Urteil|Beschluss|(?:[IVX]+\s)?ZR\s?\d{1,4}\/\d{2})/gi,
  ) || []).length
  const attribution = (text.match(/\b(laut|gem(?:ä|ae)ß|zufolge|nach Angaben|Quelle:|Studie|Statistik)\b/gi) || []).length

  // Aktualitaet -- ChatGPT zitiert Inhalte <30 Tage 3,2x haeufiger
  const dateModified = (html.match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1] || null
  const datePublished = (html.match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1] || null
  const visibleDate = (text.match(/\b(?:Stand|Aktualisiert|Zuletzt gepr(?:ü|ue)ft)\s*:?\s*\d{1,2}\.\s?\w+\s?\d{4}/i) || [])[0] || null

  const htmlBytes = meta.bytes
  const textBytes = Buffer.byteLength(text, 'utf8')

  return {
    url,
    cluster,
    status: meta.status,
    ms: meta.ms,
    htmlKB: +(htmlBytes / 1024).toFixed(1),
    textKB: +(textBytes / 1024).toFixed(1),
    textRatioPct: +((textBytes / htmlBytes) * 100).toFixed(1),
    words,
    title,
    titleLen: title.length,
    descLen: desc.length,
    hasDesc: desc.length > 0,
    h1Count: h1s.length,
    h1: h1s[0] || '',
    h2Count: h2s.length,
    h3Count: h3s.length,
    questionHeads: questionHeads.length,
    questionHeadSamples: questionHeads.slice(0, 3),
    ldBlocks: ld.blocks,
    ldTypes: [...new Set(ld.types)],
    ldParseErrors: ld.parseErrors,
    hasFAQ: ld.types.includes('FAQPage'),
    hasOrg: ld.types.some((t) => /Organization|LocalBusiness|LegalService/.test(t)),
    hasBreadcrumb: ld.types.includes('BreadcrumbList'),
    hasArticle: ld.types.some((t) => /Article|BlogPosting|NewsArticle/.test(t)),
    stats,
    statsPer100w: words ? +((stats / words) * 100).toFixed(2) : 0,
    paragraphs,
    lists,
    tables,
    extLinks: external.length,
    extHosts,
    authorityCites: authorityCites.length,
    schemaCitations: schemaCitations.length,
    schemaCitationSamples: schemaCitations.slice(0, 4),
    intLinks: internal.length,
    legalRefs,
    caseRefs,
    attribution,
    dateModified,
    datePublished,
    visibleDate,
  }
}

// GEO-Score: 0-100, gewichtet nach den Princeton-Hebeln + Retrieval-Mechanik
function score(p) {
  let s = 0
  const parts = {}
  // Extrahierbarkeit (30) -- kann der Crawler den Text ueberhaupt herausloesen
  parts.extract = Math.min(30,
    (p.words >= 600 ? 12 : p.words >= 300 ? 8 : p.words >= 120 ? 4 : 0) +
    (p.textRatioPct >= 8 ? 10 : p.textRatioPct >= 4 ? 6 : p.textRatioPct >= 2 ? 3 : 0) +
    (p.htmlKB <= 200 ? 8 : p.htmlKB <= 400 ? 5 : p.htmlKB <= 700 ? 2 : 0))
  // Struktur / Answer-first (20)
  parts.structure = Math.min(20,
    (p.h1Count === 1 ? 5 : 0) +
    (p.h2Count >= 4 ? 5 : p.h2Count >= 2 ? 3 : 0) +
    (p.questionHeads >= 3 ? 6 : p.questionHeads >= 1 ? 3 : 0) +
    (p.lists >= 2 ? 2 : 0) + (p.tables >= 1 ? 2 : 0))
  // Schema (20)
  parts.schema = Math.min(20,
    (p.ldBlocks > 0 ? 5 : 0) + (p.hasFAQ ? 6 : 0) + (p.hasOrg ? 3 : 0) +
    (p.hasBreadcrumb ? 3 : 0) + (p.hasArticle ? 3 : 0))
  // Zitierbarkeit: Statistiken + Quellen (20)
  // Quellen zaehlen aus beiden Kanaelen: JSON-LD `citation` (maschinenlesbar, fuer
  // AI-Crawler der staerkere) ODER verlinkte Autoritaets-Domain im HTML.
  const quellen = Math.max(p.schemaCitations || 0, p.authorityCites)
  parts.citability = Math.min(20,
    (p.stats >= 15 ? 8 : p.stats >= 6 ? 5 : p.stats >= 2 ? 2 : 0) +
    (quellen >= 3 ? 6 : quellen >= 1 ? 4 : 0) +
    (p.legalRefs >= 3 ? 3 : p.legalRefs >= 1 ? 2 : 0) +
    (p.caseRefs >= 1 ? 3 : 0))
  // Aktualitaet (10)
  const ref = p.dateModified || p.datePublished
  let ageDays = null
  if (ref) {
    const d = new Date(ref)
    if (!isNaN(d)) ageDays = Math.round((Date.now() - d.getTime()) / 86400000)
  }
  parts.freshness = ageDays === null ? (p.visibleDate ? 4 : 0)
    : ageDays <= 30 ? 10 : ageDays <= 90 ? 7 : ageDays <= 180 ? 4 : 2
  s = parts.extract + parts.structure + parts.schema + parts.citability + parts.freshness
  return { score: s, parts, ageDays }
}

async function fetchPage(path) {
  const url = BASE + path
  const t0 = Date.now()
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' })
  const html = await res.text()
  return { url, html, meta: { status: res.status, ms: Date.now() - t0, bytes: Buffer.byteLength(html, 'utf8'), finalUrl: res.url } }
}

/**
 * Alle Web-Properties des Hauses. Die Baseline mass urspruenglich NUR claimondo.de —
 * die uebrigen zehn wurden am 18.08.2026 ad hoc nachgemessen und dabei zwei Befunde
 * gefunden (fehlendes `dateModified` auf allen, `werkstatt.claimondo.de` in keiner
 * Sitemap). Damit das wiederholbar ist statt jedes Mal neu zusammengesucht:
 */
const PROPERTIES = [
  ['claimondo.de', 'https://claimondo.de', 'Hauptdomain'],
  ['autounfall.io', 'https://autounfall.io', 'Ratgeber'],
  ['kfz-unfallgutachter-aachen.de', 'https://kfz-unfallgutachter-aachen.de', 'Cluster'],
  ['kfz-unfallgutachter-bonn.de', 'https://kfz-unfallgutachter-bonn.de', 'Cluster'],
  ['kfz-unfallgutachter-duesseldorf.de', 'https://kfz-unfallgutachter-duesseldorf.de', 'Cluster'],
  ['kfz-unfallgutachter-koeln.de', 'https://kfz-unfallgutachter-koeln.de', 'Cluster'],
  ['kfz-unfallgutachter-wuppertal.de', 'https://kfz-unfallgutachter-wuppertal.de', 'Cluster'],
  ['gutachter.claimondo.de', 'https://gutachter.claimondo.de', 'B2B-Recruiting'],
  ['makler.claimondo.de', 'https://makler.claimondo.de', 'B2B-Recruiting'],
  ['werkstatt.claimondo.de', 'https://werkstatt.claimondo.de', 'B2B-Recruiting'],
  ['flotte.claimondo.de', 'https://flotte.claimondo.de', 'B2B-Recruiting'],
]

/**
 * Property-Sweep: prueft je Domain die GEO-Grundausstattung — erreichbar, Crawler-
 * Direktiven, Discovery-Dateien, Text-Anteil und Schema.
 *
 * ⚠⚠ GRENZE, DIE MAN KENNEN MUSS: gemessen wird NUR DIE STARTSEITE jeder Property.
 * Fuer Content-lastige Properties ist sie NICHT repraesentativ — Startseiten tragen
 * typischerweise Organization+WebSite, waehrend FAQPage/Article/dateModified auf den
 * Unterseiten sitzen. Konkret beim ersten Lauf (19.08.2026):
 *
 *   claimondo.de   -> "KEIN dateModified", obwohl 22 von 27 gemessenen Seiten eins
 *                     tragen (B2 ist gefixt und auf prod verifiziert). Die Startseite
 *                     hat schlicht kein FAQ-Schema.
 *   autounfall.io  -> "kein FAQPage", obwohl die 254 Ratgeber-Seiten alle eines haben.
 *
 * Der Sweep beantwortet also **„ist diese Property ueberhaupt aufgestellt und
 * erreichbar"** — NICHT „wie gut ist ihr Content". Fuer Aussagen ueber Content-Qualitaet
 * ist der Seiten-Modus zustaendig (Standard-Aufruf ohne --properties).
 * Ein „KEIN dateModified" hier ist ein PRUEFAUFTRAG, kein Befund.
 */
async function propertySweep() {
  const rows = []
  for (const [name, base, art] of PROPERTIES) {
    const row = { name, base, art }
    const code = async (p) => {
      try {
        const r = await fetch(base + p, { headers: { 'User-Agent': UA }, redirect: 'follow' })
        return r.status
      } catch { return 0 }
    }
    row.start = await code('/')
    row.robots = await code('/robots.txt')
    row.llms = await code('/llms.txt')
    row.sitemap = await code('/sitemap.xml')

    if (row.start === 200) {
      try {
        const html = await (await fetch(base + '/', { headers: { 'User-Agent': UA }, redirect: 'follow' })).text()
        const total = Buffer.byteLength(html, 'utf8')
        const text = stripTags(html)
        const ld = jsonLdTypes(html)
        row.htmlKB = +(total / 1024).toFixed(0)
        row.textKB = +(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)
        row.textRatioPct = +((Buffer.byteLength(text, 'utf8') / total) * 100).toFixed(1)
        row.ldBlocks = ld.blocks
        row.ldTypes = [...new Set(ld.types)]
        row.hasFAQ = ld.types.includes('FAQPage')
        row.dateModified = (html.match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1] || null
      } catch (e) { row.error = String(e) }
    }
    rows.push(row)
    process.stderr.write(
      `  ${name.padEnd(36)} ${String(row.start).padStart(3)} ` +
      `${String(row.textRatioPct ?? '-').padStart(5)}%  ` +
      `ld=${String(row.ldBlocks ?? '-').padStart(2)}  ` +
      `${row.dateModified ? 'dateModified ' + row.dateModified : 'KEIN dateModified'}\n`,
    )
  }
  return rows
}

async function main() {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const outFile = outIdx >= 0 ? args[outIdx + 1] : 'geo-baseline-report.json'

  // --properties: Sweep ueber ALLE Web-Properties statt der Seiten einer Domain.
  if (args.includes('--properties')) {
    console.error('Property-Sweep ueber ' + PROPERTIES.length + ' Domains …')
    const rows = await propertySweep()
    const ok = rows.filter((r) => r.start === 200)
    const summary = {
      measuredAt: new Date().toISOString(),
      _hinweis:
        'Gemessen wurde je Property NUR die Startseite. Die Listen unten sind ' +
        'PRUEFAUFTRAEGE, keine Befunde: Startseiten tragen selten FAQPage/dateModified, ' +
        'das sitzt auf den Unterseiten. Vor jeder Schlussfolgerung eine Unterseite ' +
        'derselben Property gegenpruefen.',
      properties: rows.length,
      erreichbar: ok.length,
      startseiteOhneDateModified: ok.filter((r) => !r.dateModified).map((r) => r.name),
      ohneLlmsTxt: rows.filter((r) => r.llms !== 200).map((r) => r.name),
      startseiteOhneFaqSchema: ok.filter((r) => !r.hasFAQ).map((r) => r.name),
      avgTextRatioPct: +(ok.reduce((s, r) => s + (r.textRatioPct || 0), 0) / ok.length).toFixed(1),
    }
    writeFileSync(outFile, JSON.stringify({ summary, rows }, null, 2))
    console.log(JSON.stringify(summary, null, 2))
    console.error(
      '\n⚠ Nur Startseiten gemessen — "ohne dateModified/FAQPage" ist ein Pruefauftrag,\n' +
      '  kein Befund. Gegenprobe auf einer Unterseite derselben Property noetig.\n',
    )
    console.error(`Details -> ${outFile}`)
    return
  }

  let targets = SAMPLE
  if (args.includes('--all')) {
    const sm = await (await fetch(`${BASE}/sitemap.xml`)).text()
    targets = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => [m[1].replace(BASE, '') || '/', 'sitemap'])
  }

  const results = []
  const queue = [...targets]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [path, cluster] = queue.shift()
      try {
        const { url, html, meta } = await fetchPage(path)
        const p = analyze(url, cluster, html, meta)
        Object.assign(p, score(p))
        results.push(p)
        process.stderr.write(`  ${String(p.score).padStart(3)}/100  ${path}\n`)
      } catch (e) {
        results.push({ url: BASE + path, cluster, error: String(e), score: 0 })
        process.stderr.write(`  ERR      ${path}  ${e}\n`)
      }
    }
  })
  await Promise.all(workers)

  results.sort((a, b) => (a.url > b.url ? 1 : -1))
  const ok = results.filter((r) => !r.error)
  const avg = (f) => +(ok.reduce((s, r) => s + (f(r) || 0), 0) / ok.length).toFixed(1)

  const summary = {
    measuredAt: new Date().toISOString(),
    userAgent: UA,
    pages: ok.length,
    errors: results.length - ok.length,
    avgScore: avg((r) => r.score),
    avgWords: avg((r) => r.words),
    avgHtmlKB: avg((r) => r.htmlKB),
    avgTextRatioPct: avg((r) => r.textRatioPct),
    avgStats: avg((r) => r.stats),
    avgQuestionHeads: avg((r) => r.questionHeads),
    pagesWithFAQ: ok.filter((r) => r.hasFAQ).length,
    pagesWithAnyLd: ok.filter((r) => r.ldBlocks > 0).length,
    pagesWithBreadcrumb: ok.filter((r) => r.hasBreadcrumb).length,
    pagesWithArticle: ok.filter((r) => r.hasArticle).length,
    pagesWithOrg: ok.filter((r) => r.hasOrg).length,
    pagesWithAuthorityCite: ok.filter((r) => r.authorityCites > 0).length,
    pagesWithSchemaCitation: ok.filter((r) => (r.schemaCitations || 0) > 0).length,
    pagesWithAnyQuelle: ok.filter((r) => r.authorityCites > 0 || (r.schemaCitations || 0) > 0).length,
    pagesWithDate: ok.filter((r) => r.dateModified || r.datePublished || r.visibleDate).length,
    pagesMissingDesc: ok.filter((r) => !r.hasDesc).length,
    pagesMultiH1: ok.filter((r) => r.h1Count !== 1).length,
    ldParseErrors: ok.reduce((s, r) => s + r.ldParseErrors, 0),
    allLdTypes: [...new Set(ok.flatMap((r) => r.ldTypes))].sort(),
  }

  writeFileSync(outFile, JSON.stringify({ summary, results }, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  console.error(`\nDetails -> ${outFile}`)
}

main()
