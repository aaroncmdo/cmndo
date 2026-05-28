#!/usr/bin/env node
// Kfz-Gutachter Wuppertal · Regression-Smoke (dependency-frei, node >=20).
//   node scripts/smoke.mjs [baseUrl]          # default Prod-Domain
//   SMOKE_BASE_URL=http://127.0.0.1:3003 node scripts/smoke.mjs
// Exit 1 bei Fehlschlag (CI-tauglich).

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'https://kfz-unfall-gutachter-wuppertal.de').replace(/\/+$/, '')

// Hub + 11 Spokes (Hauptstadt = Hub "/").
const CITIES = [
  ['/', 'Wuppertal'],
  ['/lp/solingen', 'Solingen'],
  ['/lp/velbert', 'Velbert'],
  ['/lp/heiligenhaus', 'Heiligenhaus'],
  ['/lp/wuelfrath', 'Wülfrath'],
  ['/lp/mettmann', 'Mettmann'],
  ['/lp/haan', 'Haan'],
  ['/lp/schwelm', 'Schwelm'],
  ['/lp/sprockhoevel', 'Sprockhövel'],
  ['/lp/remscheid', 'Remscheid'],
  ['/lp/ennepetal', 'Ennepetal'],
  ['/lp/hattingen', 'Hattingen'],
]

let pass = 0, fail = 0
const fails = []
const ok = (n) => { pass++; console.log(`  OK   ${n}`) }
const bad = (n, d) => { fail++; fails.push(n); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`) }
const check = (c, n, d) => (c ? ok(n) : bad(n, d))
const has = (needle, s) => (typeof needle === 'string' ? s.includes(needle) : needle.test(s))

// Optionaler Basic-Auth (Staging hinter Auth): SMOKE_BASIC_AUTH="user:pass"
const AUTH = process.env.SMOKE_BASIC_AUTH
  ? 'Basic ' + Buffer.from(process.env.SMOKE_BASIC_AUTH).toString('base64')
  : null

async function get(path) {
  const headers = { 'user-agent': 'kfz-smoke/1.0', ...(AUTH ? { authorization: AUTH } : {}) }
  const res = await fetch(BASE + path, { redirect: 'manual', headers })
  const body = res.status >= 200 && res.status < 400 ? await res.text() : ''
  return { status: res.status, body }
}

function titleOf(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i)
  return m ? m[1].trim() : ''
}

async function main() {
  console.log(`\nKfz-Gutachter Wuppertal Smoke gegen ${BASE}\n`)
  const samples = {}
  const titles = new Set()

  console.log('[1] Routen 200 + unique Title + city-spezifisch:')
  for (const [path, city] of CITIES) {
    try {
      const r = await get(path)
      samples[path] = r
      check(r.status === 200, `${city} ${path} → 200`, `HTTP ${r.status}`)
      if (r.status === 200) {
        const t = titleOf(r.body)
        check(t.includes(`Kfz-Gutachter ${city}`), `${city} Title enthält Stadt`, `Title: "${t}"`)
        check(!titles.has(t), `${city} Title unique`, `dupliziert: "${t}"`)
        titles.add(t)
      }
    } catch (e) { bad(`${city} ${path}`, e.message) }
  }

  const home = samples['/']?.body || ''
  console.log('\n[2] JSON-LD (Home):')
  check(has('"AutomotiveBusiness"', home), 'LocalBusiness (AutomotiveBusiness)')
  check(has('"FAQPage"', home), 'FAQPage')
  check(has('"BreadcrumbList"', home), 'BreadcrumbList')

  console.log('\n[3] SEO-Basics (Home):')
  check(has(/rel=["']canonical["']/, home) || has('"canonical"', home), 'canonical vorhanden')
  check(has('#2A2E33', home), 'theme-color = #2A2E33 (Cluster-Petrol)')
  check(has('data-cta="hero_call"', home), 'Hero-Call-CTA (Tracking-Slot)')
  check(has('data-cta="footer_wa"', home), 'Footer-WhatsApp-CTA')
  check(has('+4915153608515', home), 'Einheitliche Telefonnummer im Markup')

  console.log('\n[4] robots + sitemap:')
  try {
    const rob = await get('/robots.txt')
    check(rob.status === 200 && has(/sitemap/i, rob.body), 'robots.txt + Sitemap-Verweis', `HTTP ${rob.status}`)
  } catch (e) { bad('robots.txt', e.message) }
  try {
    const sm = await get('/sitemap.xml')
    const locs = (sm.body.match(/<loc>/g) || []).length
    check(sm.status === 200 && locs === 12, `sitemap.xml (${locs} URLs, erwartet 12)`, `HTTP ${sm.status}, ${locs} locs`)
  } catch (e) { bad('sitemap.xml', e.message) }

  console.log(`\n${'─'.repeat(52)}\nSmoke: ${pass} OK · ${fail} FAIL`)
  if (fail > 0) { console.error('FEHLGESCHLAGEN: ' + fails.join(', ')); process.exit(1) }
  console.log('Alle Smoke-Checks bestanden.')
}

main().catch((e) => { console.error('Smoke-Crash:', e); process.exit(1) })
