#!/usr/bin/env node
// Freshness-Report fuer die Feed-Wissens-Assets (geo-feeds-spec H1).
//
// Listet jedes MDX-Asset mit last_modified + Alter (Tage), aelteste zuerst, plus
// Summary. Freshness ist im Projekt BEWUSST manuell gepflegt (vgl.
// lib/kfz-gutachter/freshness.ts) — dieses Tool macht den Pflege-Bedarf sichtbar,
// es ist KEIN Auto-Fix (Inhalte aktuell halten bleibt redaktionell).
//
// Nutzung:  npm run feed:freshness   (aus claimondo-marketing/)
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'content', 'claimondo')
const FOLDERS = ['cornerstones', 'haftpflicht', 'decoder', 'sachverstaendige', 'versicherer']
const STALE_DAYS = 90

function readLastModified(raw) {
  const m = raw.replace(/\r\n?/g, '\n').match(/^last_modified:\s*(.+)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

const now = Date.now()
const rows = []
for (const folder of FOLDERS) {
  const dir = path.join(ROOT, folder)
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const lm = readLastModified(fs.readFileSync(path.join(dir, name), 'utf8'))
    const d = lm ? new Date(lm) : null
    const ageDays = d && !Number.isNaN(d.getTime()) ? Math.floor((now - d.getTime()) / 86_400_000) : null
    rows.push({ slug: `${folder}/${name.replace(/\.md$/, '')}`, lm: lm ?? '(fehlt)', ageDays })
  }
}

rows.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))

const withAge = rows.filter((r) => r.ageDays !== null)
const newest = withAge.length ? Math.min(...withAge.map((r) => r.ageDays)) : null
const staleCount = withAge.filter((r) => r.ageDays >= STALE_DAYS).length

console.log(`\nFeed-Freshness-Report  (${rows.length} Assets)\n`)
console.log('  ALTER  LAST_MODIFIED  ASSET')
for (const r of rows) {
  const age = r.ageDays === null ? '    ?' : `${String(r.ageDays).padStart(4)}d`
  const flag = r.ageDays !== null && r.ageDays >= STALE_DAYS ? '  [stale]' : ''
  console.log(`  ${age}  ${String(r.lm).padEnd(12)}  ${r.slug}${flag}`)
}
console.log(
  `\nSummary: frischestes Asset ${newest === null ? '?' : newest + ' Tage alt'} | ` +
    `${staleCount}/${rows.length} aelter als ${STALE_DAYS} Tage`,
)
console.log('Hinweis: bei echten Content-Updates last_modified im Frontmatter bumpen.\n')
