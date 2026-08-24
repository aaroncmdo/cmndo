// Prueft, ob der Crawler auf den Cluster-Domains ueberhaupt durchkommt.
//
// WOFUER: Im nginx-Log hat Googlebot in 14 Tagen nur 18 von 50 LP-Seiten
// besucht. Bevor man das der Textaehnlichkeit zuschreibt, muessen die
// einfacheren Ursachen ausgeschlossen sein — und die liegen alle im
// ausgelieferten HTML.
//
// Fuenf Achsen, jede einzeln toedlich:
//   1. canonical zeigt woanders hin  -> Seite wird NICHT indexiert, egal wie gut
//   2. noindex                        -> dito
//   3. keine eingehenden Links        -> Waise, Crawler findet sie nur ueber die Sitemap
//   4. Status != 200                  -> tot
//   5. fehlt in der Sitemap           -> schlechter auffindbar
//
// ⚠ Achse 1 ist im Projekt schon FUENFMAL aufgetreten (SEO-Audit 18.08.:
// /impressum, /datenschutz, /agb canonicalisierten auf die Startseite = stille
// De-Indexierung). Sie wird von keinem Build gefangen.
//
// Run: node scripts/pruefe-cluster-linknetz.mjs [domain]
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const NUR = process.argv[2]

function orteVon(ordner) {
  const src = readFileSync(`${ordner}/lib/cluster.ts`, 'utf8')
  const t = src.slice(src.indexOf('SEO_BODY'))
  return [...t.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)].map((m) => m[1])
}

/** Alle internen /lp/-Ziele einer Seite — aus href, nicht aus dem Fliesstext. */
function lpLinks(html) {
  const s = new Set()
  for (const m of html.matchAll(/href="(?:https?:\/\/[^"]*?)?\/lp\/([a-z-]+)"/g)) s.add(m[1])
  return s
}
function hubLink(html, domain) {
  return /href="(?:https:\/\/[^"]*?)?\/"/.test(html) || html.includes(`href="https://${domain}/"`)
}
const meta = (html, re) => (html.match(re) ?? [])[1] ?? null

const ordner = readdirSync('.').filter(
  (d) => /^kfz-gutachter-[a-z]+$/.test(d) && existsSync(`${d}/lib/cluster.ts`) && (!NUR || d.endsWith(NUR)),
)

let problemeGesamt = 0

for (const o of ordner) {
  const stadt = o.replace('kfz-gutachter-', '')
  const domain = `kfz-unfallgutachter-${stadt}.de`
  const orte = orteVon(o)
  const spokes = orte.filter((x) => x !== stadt)

  console.log(`\n${'='.repeat(78)}\n${domain}  ·  ${spokes.length} LP + 1 Hub\n${'='.repeat(78)}`)

  // Sitemap
  let inSitemap = new Set()
  try {
    const sm = await (await fetch(`https://${domain}/sitemap.xml`)).text()
    inSitemap = new Set([...sm.matchAll(/\/lp\/([a-z-]+)</g)].map((m) => m[1]))
  } catch {
    console.log('  ⚠ sitemap.xml nicht abrufbar')
  }

  const seiten = new Map()
  const probleme = []

  // Hub zuerst
  try {
    const r = await fetch(`https://${domain}/`)
    seiten.set(stadt, { status: r.status, html: await r.text() })
  } catch {
    probleme.push('Hub nicht abrufbar')
  }
  for (const ort of spokes) {
    try {
      const r = await fetch(`https://${domain}/lp/${ort}`)
      seiten.set(ort, { status: r.status, html: await r.text() })
    } catch {
      probleme.push(`${ort}: nicht abrufbar`)
    }
  }

  // Eingehende Links zaehlen
  const eingehend = new Map(spokes.map((s) => [s, new Set()]))
  for (const [von, { html }] of seiten) {
    if (!html) continue
    for (const ziel of lpLinks(html)) {
      if (ziel === von) continue
      if (eingehend.has(ziel)) eingehend.get(ziel).add(von)
    }
  }

  console.log('Ort                  Status  canonical            noindex  ein  Sitemap')
  console.log('-'.repeat(78))
  for (const ort of [stadt, ...spokes]) {
    const s = seiten.get(ort)
    if (!s) { console.log(`${ort.padEnd(20)}  —  nicht abrufbar`); continue }
    const can = meta(s.html, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)
    const erwartet = ort === stadt ? `https://${domain}/` : `https://${domain}/lp/${ort}`
    // ⚠ Trailing Slash normalisieren: `https://x.de` und `https://x.de/` sind
    // dieselbe URL. Ohne das meldet der Pruefer den Hub jeder Domain als Fehler
    // — ein Fehlalarm, der die echten Befunde zudeckt.
    const norm = (u) => String(u).replace(/\/$/, '')
    const canOk = norm(can) === norm(erwartet)
    const noindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(s.html)
    const ein = ort === stadt ? '—' : String(eingehend.get(ort).size)
    const sm = ort === stadt ? '—' : inSitemap.has(ort) ? 'ja' : '🔴 NEIN'

    console.log(
      `${ort.padEnd(20)}  ${String(s.status).padStart(3)}   ${(canOk ? '✓ self' : `🔴 ${String(can).slice(0, 44)}`).padEnd(20)} ` +
        `${noindex ? '🔴 JA' : '  nein'}  ${String(ein).padStart(3)}  ${sm}`,
    )
    if (s.status !== 200) probleme.push(`${ort}: HTTP ${s.status}`)
    if (!canOk) probleme.push(`${ort}: canonical -> ${can}`)
    if (noindex) probleme.push(`${ort}: noindex`)
    if (ort !== stadt && eingehend.get(ort).size === 0) probleme.push(`${ort}: WAISE (0 eingehende Links)`)
    if (ort !== stadt && !inSitemap.has(ort)) probleme.push(`${ort}: fehlt in der Sitemap`)
    if (ort !== stadt && s.html && !hubLink(s.html, domain)) probleme.push(`${ort}: kein Rueckweg zum Hub`)
  }

  if (probleme.length) {
    console.log(`\n🔴 ${probleme.length} Befunde:`)
    for (const p of probleme) console.log(`   ${p}`)
    problemeGesamt += probleme.length
  } else {
    console.log('\n✓ keine Befunde')
  }
}

console.log(`\n${'='.repeat(78)}\nGESAMT: ${problemeGesamt} Befunde`)
process.exitCode = problemeGesamt > 0 ? 1 : 0
