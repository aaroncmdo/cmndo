#!/usr/bin/env node
// SEO/GEO-Smoke — verifiziert, dass die Marketing-/Content-Strecke SEO- und
// LLM/GEO-fähig ist: AI-Bot-Crawlbarkeit (robots.txt), Discovery (sitemap),
// AI-direkt (llms.txt), Route-Erreichbarkeit (kein 307-Trap), valides JSON-LD
// + erwartete Schema-Typen + canonical/meta pro Schlüsselseite.
//
// Nutzung:  node scripts/seo-geo-smoke.mjs [baseURL]
//           BASE_URL=https://app.staging.claimondo.de node scripts/seo-geo-smoke.mjs
// Default-Target = Prod (claimondo.de) — dort crawlen Google/GPTBot/Perplexity.
// Exit 0 = alle harten Checks grün, 1 = mindestens ein harter Check rot.

const BASE = (process.argv[2] || process.env.BASE_URL || 'https://claimondo.de').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)'
const TIMEOUT_MS = 25000

// AI-Crawler die im robots.txt explizit erlaubt sein müssen (GEO-Kern).
const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'Bingbot']
// Live-Content-Routen — müssen für anon/Crawler 200 liefern (kein 307→/login).
const ROUTES = [
  '/', '/kfz-haftpflicht-schaden', '/ratgeber', '/sachverstaendige',
  '/kosten-kfz-gutachten', '/gegnerische-versicherung-zahlt-nicht',
  '/versicherung-schickt-gutachter', '/unverschuldeter-unfall-rechte',
  '/motorrad-gutachter', '/lkw-gutachter', '/e-auto-gutachter', '/unfallskizze',
  '/unfall-was-tun-als-geschaedigter',
  '/haftpflicht/wertminderung', '/decoder/unser-sachverstaendiger',
]
const PDF = '/downloads/unfallskizze-claimondo-vorlage.pdf'
// Pro Seite erwartete JSON-LD @types (GEO-Hebel). FAQPage = +40 % AI-Cite.
const SCHEMA_EXPECT = {
  '/': ['Organization', 'WebSite'],
  '/kosten-kfz-gutachten': ['Service', 'FAQPage', 'BreadcrumbList'],
  '/unverschuldeter-unfall-rechte': ['Service', 'FAQPage', 'BreadcrumbList'],
  '/unfallskizze': ['HowTo', 'FAQPage', 'BreadcrumbList'],
  '/kfz-haftpflicht-schaden': ['Article', 'FAQPage', 'BreadcrumbList'],
  '/haftpflicht/wertminderung': ['Article', 'FAQPage'],
  '/decoder/unser-sachverstaendiger': ['Article', 'FAQPage'],
  '/unfall-was-tun-als-geschaedigter': ['Article', 'HowTo', 'FAQPage', 'BreadcrumbList'],
}
// Routen die (noch) als „pending" gelten dürfen — Info, kein harter Fail.
// /unfall-was-tun-als-geschaedigter = Stream B.5, bis #1622-Merge nicht live.
const INFO_ROUTES = [] // B.5 /unfall-was-tun-als-geschaedigter ist inzwischen live → jetzt harter Check in ROUTES.

let pass = 0, fail = 0
const fails = []
function ok(name, detail = '') { pass++; console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? ' — ' + detail : ''}`) }
function bad(name, detail = '') { fail++; fails.push(name); console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' — ' + detail : ''}`) }
function info(name, detail = '') { console.log(`  \x1b[33mINFO\x1b[0m ${name}${detail ? ' — ' + detail : ''}`) }

async function fetchText(path, { redirect = 'follow' } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(BASE + path, { headers: { 'user-agent': UA }, redirect, signal: ctrl.signal })
    const body = redirect === 'manual' ? '' : await res.text()
    return { status: res.status, body, ct: res.headers.get('content-type') || '' }
  } finally { clearTimeout(t) }
}

function collectTypes(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectTypes(n, out); return }
  if (node && typeof node === 'object') {
    if (node['@type']) { const t = node['@type']; (Array.isArray(t) ? t : [t]).forEach((x) => out.add(x)) }
    for (const v of Object.values(node)) collectTypes(v, out)
  }
}

async function checkRobots() {
  console.log('\n▌ robots.txt — AI-Crawl-Zugang')
  try {
    const { status, body } = await fetchText('/robots.txt')
    if (status !== 200) return bad('robots.txt erreichbar', `HTTP ${status}`)
    ok('robots.txt erreichbar', 'HTTP 200')
    if (/Sitemap:\s*http/i.test(body)) ok('robots deklariert Sitemap'); else bad('robots deklariert Sitemap')
    if (/Disallow:\s*\/admin/i.test(body)) ok('robots disallowed /admin (Portal privat)'); else bad('robots disallowed /admin')
    for (const bot of AI_BOTS) {
      // Bot-Block: ab "User-Agent: <bot>" bis zur nächsten Leerzeile → muss "Allow: /" enthalten.
      const re = new RegExp(`User-Agent:\\s*${bot}\\b[\\s\\S]*?(?:\\n\\s*\\n|$)`, 'i')
      const block = body.match(re)
      block && /Allow:\s*\//i.test(block[0]) ? ok(`AI-Bot erlaubt: ${bot}`) : bad(`AI-Bot erlaubt: ${bot}`, 'kein Allow:/ Block')
    }
  } catch (e) { bad('robots.txt', e.message) }
}

async function checkSitemap() {
  console.log('\n▌ sitemap.xml — Discovery')
  try {
    const { status, body } = await fetchText('/sitemap.xml')
    if (status !== 200) return bad('sitemap erreichbar', `HTTP ${status}`)
    const count = (body.match(/<loc>/g) || []).length
    count >= 50 ? ok('sitemap erreichbar', `${count} URLs`) : bad('sitemap URL-Anzahl', `nur ${count}`)
    for (const r of ['/kosten-kfz-gutachten', '/motorrad-gutachter', '/unfallskizze', '/unverschuldeter-unfall-rechte']) {
      body.includes(`${BASE}${r}`) ? ok(`sitemap enthält ${r}`) : bad(`sitemap enthält ${r}`)
    }
  } catch (e) { bad('sitemap.xml', e.message) }
}

async function checkLlms() {
  console.log('\n▌ llms.txt / llms-full.txt — AI-direkt')
  for (const f of ['/llms.txt', '/llms-full.txt']) {
    try {
      const { status, body } = await fetchText(f)
      status === 200 && body.length > 1000
        ? ok(`${f} live`, `${body.length} bytes`)
        : bad(`${f} live`, `HTTP ${status}, ${body.length} bytes`)
    } catch (e) { bad(f, e.message) }
  }
}

async function checkRoutes() {
  console.log('\n▌ Route-Erreichbarkeit (GPTBot, redirect=manual → 200 = crawlbar, 3xx = 307-Trap)')
  for (const r of ROUTES) {
    try {
      const { status } = await fetchText(r, { redirect: 'manual' })
      status === 200 ? ok(`200 ${r}`) : bad(`200 ${r}`, `HTTP ${status}`)
    } catch (e) { bad(r, e.message) }
  }
  try {
    const { status, ct } = await fetchText(PDF, { redirect: 'manual' })
    status === 200 && /pdf/i.test(ct) ? ok(`PDF ${PDF}`, ct) : bad(`PDF ${PDF}`, `HTTP ${status}, ${ct}`)
  } catch (e) { bad(PDF, e.message) }
  for (const r of INFO_ROUTES) {
    try { const { status } = await fetchText(r, { redirect: 'manual' }); info(`(pending) ${r}`, `HTTP ${status}`) }
    catch (e) { info(`(pending) ${r}`, e.message) }
  }
}

async function checkSchema() {
  console.log('\n▌ JSON-LD + Meta/Canonical pro Schlüsselseite')
  for (const [path, expect] of Object.entries(SCHEMA_EXPECT)) {
    try {
      const { status, body } = await fetchText(path)
      if (status !== 200) { bad(`schema ${path}`, `HTTP ${status}`); continue }
      const blocks = [...body.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
      const types = new Set()
      let invalid = 0
      for (const b of blocks) { try { collectTypes(JSON.parse(b), types) } catch { invalid++ } }
      if (!blocks.length) { bad(`${path} JSON-LD vorhanden`); continue }
      invalid === 0 ? ok(`${path} JSON-LD valide`, `${blocks.length} Block(s)`) : bad(`${path} JSON-LD valide`, `${invalid} invalid`)
      const missing = expect.filter((t) => !types.has(t))
      missing.length === 0 ? ok(`${path} Schema-Typen`, expect.join('+')) : bad(`${path} Schema-Typen`, `fehlt: ${missing.join(',')}`)
      if (/<link[^>]*rel="canonical"[^>]*href="https?:\/\//i.test(body)) ok(`${path} canonical`); else bad(`${path} canonical`)
      if (/<title>[^<]{10,}<\/title>/i.test(body)) ok(`${path} <title>`); else bad(`${path} <title>`)
      if (/<meta name="description" content="[^"]{30,}"/i.test(body)) ok(`${path} meta-description`); else bad(`${path} meta-description`)
    } catch (e) { bad(`schema ${path}`, e.message) }
  }
}

console.log(`SEO/GEO-Smoke gegen ${BASE}  (${new Date().toISOString()})`)
await checkRobots()
await checkSitemap()
await checkLlms()
await checkRoutes()
await checkSchema()
console.log(`\n══ Ergebnis: ${pass} PASS / ${fail} FAIL ══`)
if (fail) { console.log('Fehlgeschlagen: ' + fails.join(', ')); process.exit(1) }
console.log('SEO/GEO-fähig: alle harten Checks grün ✓')
process.exit(0)
