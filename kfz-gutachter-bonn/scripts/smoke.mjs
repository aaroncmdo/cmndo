#!/usr/bin/env node
// Cluster-LP · Regression-Smoke (dependency-frei, node >=20, cluster-AGNOSTISCH).
// Liest die zu pruefenden URLs aus /sitemap.xml — funktioniert fuer jeden Cluster
// ohne hartkodierte Staedte.
//   node scripts/smoke.mjs [baseUrl]
//   SMOKE_BASE_URL=https://kfz-unfallgutachter-duesseldorf.de node scripts/smoke.mjs
//   SMOKE_BASIC_AUTH="user:pass" node scripts/smoke.mjs   # Staging hinter Auth
const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'https://kfz-unfallgutachter-wuppertal.de').replace(/\/+$/, '')
const AUTH = process.env.SMOKE_BASIC_AUTH ? 'Basic ' + Buffer.from(process.env.SMOKE_BASIC_AUTH).toString('base64') : null

let pass = 0, fail = 0
const fails = []
const ok = (n) => { pass++; console.log(`  OK   ${n}`) }
const bad = (n, d) => { fail++; fails.push(n); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`) }
const check = (c, n, d) => (c ? ok(n) : bad(n, d))
const has = (needle, s) => (typeof needle === 'string' ? s.includes(needle) : needle.test(s))

async function get(path) {
  const url = path.startsWith('http') ? path : BASE + path
  const headers = { 'user-agent': 'kfz-smoke/1.0', ...(AUTH ? { authorization: AUTH } : {}) }
  const res = await fetch(url, { redirect: 'manual', headers })
  const body = res.status >= 200 && res.status < 400 ? await res.text() : ''
  return { status: res.status, body }
}
const titleOf = (html) => { const m = html.match(/<title>([^<]*)<\/title>/i); return m ? m[1].trim() : '' }

async function main() {
  console.log(`\nCluster-LP Smoke gegen ${BASE}\n`)
  // URLs aus der Sitemap ziehen
  const sm = await get('/sitemap.xml')
  const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, '') || '/')
  check(sm.status === 200 && locs.length >= 2, `sitemap.xml (${locs.length} URLs)`, `HTTP ${sm.status}`)

  console.log('\n[1] Alle Sitemap-URLs: 200 + unique, city-spezifischer Title:')
  const titles = new Set()
  for (const path of locs) {
    try {
      const r = await get(path)
      check(r.status === 200, `${path} → 200`, `HTTP ${r.status}`)
      if (r.status === 200) {
        const t = titleOf(r.body)
        check(/^Kfz-Gutachter .+· bei Unschuld 0/.test(t), `${path} Title-Muster + Stadt`, `"${t}"`)
        check(!titles.has(t), `${path} Title unique`, `dup: "${t}"`)
        titles.add(t)
      }
    } catch (e) { bad(path, e.message) }
  }

  const home = (await get('/')).body
  console.log('\n[2] JSON-LD + SEO (Home):')
  check(has('"AutomotiveBusiness"', home), 'LocalBusiness (AutomotiveBusiness)')
  check(has('"FAQPage"', home), 'FAQPage')
  check(has('"BreadcrumbList"', home), 'BreadcrumbList')
  check(has(/rel=["']canonical["']/, home), 'canonical')
  check(has(/name=["']theme-color["']/, home), 'theme-color Meta')
  check(has('data-cta="hero_call"', home), 'Hero-Call-CTA')
  check(has('+4915153608515', home), 'Einheitliche Telefonnummer')
  check(has('/assets/brand/kanzlei-lexdrive-logo.png', home) || has('data-cta="footer_wa"', home), 'Footer/Brand-Marker')

  console.log('\n[3] robots:')
  try { const r = await get('/robots.txt'); check(r.status === 200 && has(/sitemap/i, r.body), 'robots.txt + Sitemap-Verweis', `HTTP ${r.status}`) } catch (e) { bad('robots.txt', e.message) }

  console.log(`\n${'─'.repeat(52)}\nSmoke: ${pass} OK · ${fail} FAIL`)
  if (fail > 0) { console.error('FEHLGESCHLAGEN: ' + fails.join(', ')); process.exit(1) }
  console.log('Alle Smoke-Checks bestanden.')
}
main().catch((e) => { console.error('Smoke-Crash:', e); process.exit(1) })
