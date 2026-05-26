#!/usr/bin/env node
// autounfall.io · PSEO Duplicate-Content-Gate (WP-5). Dependency-frei (node fetch >=20).
// Misst paarweise Jaccard (3-Wort-Shingles) über die 100 gerenderten PSEO-Seiten,
// klassifiziert nach Paar-Typ und GATED auf das eigentliche Doorway-Risiko:
//   - WITHIN-city  (gleiche Stadt, anderer Unfalltyp): nur Report — legitimes
//     Themen-Cluster (verschiedene Rechtslagen), teilt naturgemäß den Stadt-Block.
//   - CROSS-city SAME-type (andere Stadt, gleicher Typ): GATE. Das ist das
//     skalierte Near-Duplicate-/Doorway-Muster, das das noindex verursacht hat.
//   - CROSS-city DIFF-type: nur Report.
// Gate: CROSS-city-same-type max < THRESHOLD (default 0.40). Exit 1 wenn verletzt.
//
//   1) npm run build && npm run start    (Server)
//   2) SMOKE_BASE_URL=http://127.0.0.1:3002 node scripts/check-pseo-similarity.mjs
//
// Methode bewusst dokumentiert (das ursprüngliche 0,61 stammt aus der gitignored
// Prototyp-Analyse; dieses Script re-etabliert die Metrik als kanonisches Gate).
const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '')
const THRESHOLD = Number(process.env.PSEO_JACCARD_MAX || '0.40')

// Slugs = port-pseo.py CITY_SLUGS / TYPE_SLUGS (stabil, 20x5).
const CITY_SLUGS = ['berlin','bielefeld','bochum','bonn','bremen','dortmund','dresden','duesseldorf','duisburg','essen','frankfurt','hamburg','hannover','koeln','leipzig','muenchen','muenster','nuernberg','stuttgart','wuppertal']
const TYPE_SLUGS = ['auffahrunfall','parkplatzunfall','spurwechsel','vorfahrtsverletzung','wildunfall']

function visibleText(html) {
  // WICHTIG: Erst <script>/<style> strippen — Next 16 streamt den gerenderten
  // Content escaped als RSC-JSON in <script>-Blobs; ein <main>/<article>-Match
  // VOR dem Strip greift sonst in den Blob (liefert Müll/leer). Danach die
  // Content-Region <article> greedy (PSEO-Seiten haben genau eine), Fallback Doc.
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const article = (noScript.match(/<article[\s\S]*<\/article>/i) || [noScript])[0]
  return article
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}
function shingles(tokens, n = 3) {
  const s = new Set()
  for (let i = 0; i + n <= tokens.length; i++) s.add(tokens.slice(i, i + n).join(' '))
  return s
}
function jaccard(a, b) {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}
async function main() {
  const pages = []
  for (const c of CITY_SLUGS) {
    for (const t of TYPE_SLUGS) {
      const url = `${BASE}/kfz-unfall/${c}/${t}`
      const res = await fetch(url, { headers: { 'user-agent': 'au-jaccard/1.0' } })
      if (res.status !== 200) { console.error(`FAIL ${url} -> HTTP ${res.status}`); process.exit(1) }
      pages.push({ c, t, key: `${c}/${t}`, sh: shingles(visibleText(await res.text())) })
    }
  }
  const mk = () => ({ max: 0, sum: 0, n: 0, top: [] })
  const within = mk()      // gleiche Stadt, anderer Typ — nur Report
  const crossSame = mk()   // andere Stadt, gleicher Typ — GATE (Doorway)
  const crossDiff = mk()   // andere Stadt, anderer Typ — nur Report
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const sim = jaccard(pages[i].sh, pages[j].sh)
      const sameCity = pages[i].c === pages[j].c
      const sameType = pages[i].t === pages[j].t
      const b = sameCity ? within : sameType ? crossSame : crossDiff
      b.sum += sim; b.n++
      if (sim > b.max) b.max = sim
      b.top.push({ a: pages[i].key, b: pages[j].key, sim })
    }
  }
  const fmt = (b) => `max=${b.max.toFixed(3)} mean=${(b.sum / b.n).toFixed(3)} (n=${b.n})`
  console.log(`Gate: CROSS-City same-type max < ${THRESHOLD}\n`)
  console.log(`WITHIN-city (Report):          ${fmt(within)}`)
  console.log(`CROSS-city SAME-type (GATE):    ${fmt(crossSame)}`)
  console.log(`CROSS-city DIFF-type (Report):  ${fmt(crossDiff)}`)
  crossSame.top.sort((x, y) => y.sim - x.sim)
  console.log('\nTop-10 CROSS-City same-type (Doorway-Risiko):')
  for (const p of crossSame.top.slice(0, 10)) console.log(`  ${p.sim.toFixed(3)}  ${p.a}  ~  ${p.b}`)
  if (crossSame.max >= THRESHOLD) {
    console.error(`\nGATE ROT: CROSS-City same-type max ${crossSame.max.toFixed(3)} >= ${THRESHOLD}`)
    process.exit(1)
  }
  console.log(`\nGATE GRÜN: CROSS-City same-type max ${crossSame.max.toFixed(3)} < ${THRESHOLD}`)
}
main()
