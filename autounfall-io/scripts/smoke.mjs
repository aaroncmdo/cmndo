#!/usr/bin/env node
// autounfall.io · Regression-Smoke (WP-9). Dependency-frei (node fetch, >=20).
// Prueft die Live-/Build-Invarianten gegen eine Base-URL.
//
//   node scripts/smoke.mjs [baseUrl]      # default https://autounfall.io
//   SMOKE_BASE_URL=http://127.0.0.1:3002 node scripts/smoke.mjs
//
// Exit 1 bei jedem Fehlschlag (CI-tauglich). Ergaenzt:
//   - scripts/verify-rechner.mjs (Rechner-Formel-Logik, offline)
//   - scripts/contrast-check.mjs (Kontrast-Floor 0/0, Token-Paare)
//
// STANDALONE-Invariante (ENTITY-MODELL-LOCK v2, NICHT die Pre-Standalone-
// WP-9-Prompt-Zeile): KEIN "claimondo", KEIN #partner-service, KEIN GA4/gtag/
// Clarity. publisher = Kitta & Sprafke UG. Reviewer = LexDrive UG erlaubt.

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'https://autounfall.io').replace(/\/+$/, '')

let pass = 0
let fail = 0
const fails = []
const ok = (name) => { pass++; console.log(`  OK   ${name}`) }
const bad = (name, detail) => { fail++; fails.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
// Helfer: vermeidet Zeilen die mit /regex/ beginnen (ASI-Division-Falle).
const has = (needle, s) => (typeof needle === 'string' ? s.includes(needle) : needle.test(s))
const check = (cond, name, detail) => (cond ? ok(name) : bad(name, detail))

async function get(path) {
  const res = await fetch(BASE + path, { redirect: 'manual', headers: { 'user-agent': 'au-smoke/1.0' } })
  const body = res.status >= 200 && res.status < 400 ? await res.text() : ''
  return { status: res.status, body }
}

const INDEXABLE = [
  ['/', 'Home'],
  ['/unfall-was-tun', 'Pillar'],
  ['/nutzungsausfall', 'Master-Hub'],
  ['/schadenfreiheitsklasse/allianz', 'SF-Versicherer'],
  ['/fahrerflucht/strafen-bgh', 'nested-Artikel'],
  ['/auffahrunfall', 'flat-Artikel (WP-2)'],
  ['/versicherer-decoder', 'Decoder-Hub'],
  ['/versicherer-decoder/wir-pruefen-den-sachverhalt', '21. Decoder'],
  ['/rechner', 'Rechner-Tool'],
  ['/kuerzungs-checker', 'Kuerzungs-Checker'],
  ['/unfallbericht', 'Unfallbericht-Tool'],
  ['/schadenfreiheitsklasse/rechner', 'SF-Rechner'],
  ['/gutachter-finden', 'Lead-Form (WP-6)'],
  ['/impressum', 'Impressum'],
  ['/datenschutz', 'Datenschutz'],
]
const NOINDEX = [
  ['/kfz-unfall/koeln/auffahrunfall', 'PSEO'],
  ['/unfall-assistance', 'Wizard'],
]

const RE_NOINDEX = /<meta[^>]+name=["']robots["'][^>]+noindex/i
const RE_GA = /googletagmanager|gtag\(|google-analytics|ga\.js|clarity\.ms/i
const RE_PLAUSIBLE = /plausible\.io\/js\/script\.js/
const RE_DATADOMAIN = /data-domain[\\"':= ]+autounfall\.io/
const RE_LD = /application\/ld\+json/
const RE_PUBLISHER = /Kitta\s*&(amp;)?\s*Sprafke/
const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i

async function main() {
  console.log(`\nau.io Smoke gegen ${BASE}\n`)
  const samples = {}

  console.log('[1] Routen 200:')
  for (const [path, label] of INDEXABLE) {
    try {
      const r = await get(path)
      samples[path] = r
      check(r.status === 200, `${label} ${path} → 200`, `HTTP ${r.status}`)
    } catch (e) { bad(`${label} ${path}`, e.message) }
  }

  console.log('\n[2] noindex-Routen:')
  for (const [path, label] of NOINDEX) {
    try {
      const r = await get(path)
      if (r.status !== 200) { bad(`${label} ${path}`, `HTTP ${r.status}`); continue }
      check(has(RE_NOINDEX, r.body), `${label} ${path} → noindex`, 'kein noindex-meta')
    } catch (e) { bad(`${label} ${path}`, e.message) }
  }

  console.log('\n[3] STANDALONE-Invariante (kein Claimondo/GA4):')
  const allHtml = Object.values(samples).map((r) => r.body).join('\n')
  check(!has(/claimondo/i, allHtml), '0 claimondo', 'Treffer gefunden')
  check(!has('#partner-service', allHtml), '0 #partner-service', 'Treffer')
  check(!has(RE_GA, allHtml), '0 GA4/gtag/Clarity', 'Tracker-Treffer')

  console.log('\n[4] Plausible:')
  const home = samples['/']?.body || ''
  check(has(RE_PLAUSIBLE, home), 'Plausible-Script vorhanden')
  check(has(RE_DATADOMAIN, home), 'data-domain=autounfall.io', 'nicht gefunden')

  console.log('\n[5] JSON-LD / Publisher:')
  check(has(RE_LD, home), 'JSON-LD vorhanden')
  check(has(RE_PUBLISHER, home), 'publisher = Kitta & Sprafke UG')

  // [6] Lead-Seite: das Formular ist eine Client-Component (useSearchParams in
  // <Suspense fallback={null}>) → die Felder hydraten erst clientseitig und stehen
  // NICHT im SSR-HTML. HTTP-Smoke prueft daher die statische Page-Shell; die
  // Felder/Interaktivitaet deckt der Playwright-Browser-Smoke ab (siehe README/WP-6).
  console.log('\n[6] Lead-Seite /gutachter-finden (Shell; Felder client-rendered):')
  const lead = samples['/gutachter-finden']?.body || ''
  check(has('Sachverständigen finden', lead) && has('Anfrage', lead), 'Lead-Page-Shell (H1 + Anfrage-CTA)')

  console.log('\n[7] Impressum-Kontakt:')
  check(has(RE_EMAIL, samples['/impressum']?.body || ''), 'Kontakt-Email im Impressum', 'keine Email')

  console.log('\n[8] robots + sitemap:')
  try {
    const rob = await get('/robots.txt')
    check(rob.status === 200 && has(/sitemap/i, rob.body), 'robots.txt + Sitemap-Verweis', `HTTP ${rob.status}`)
  } catch (e) { bad('robots.txt', e.message) }
  try {
    const sm = await get('/sitemap.xml')
    if (sm.status !== 200) { bad('sitemap.xml', `HTTP ${sm.status}`) }
    else {
      const locs = (sm.body.match(/<loc>/g) || []).length
      check(locs > 100, `sitemap.xml (${locs} URLs)`, `nur ${locs} URLs`)
      check(!has('kfz-unfall', sm.body), 'PSEO NICHT in sitemap', 'kfz-unfall drin')
      check(has('/gutachter-finden<', sm.body), 'gutachter-finden in sitemap', 'fehlt')
    }
  } catch (e) { bad('sitemap.xml', e.message) }

  console.log(`\n${'─'.repeat(50)}\nSmoke: ${pass} OK · ${fail} FAIL`)
  if (fail > 0) { console.error('FEHLGESCHLAGEN: ' + fails.join(', ')); process.exit(1) }
  console.log('Alle Smoke-Checks bestanden.')
}

main().catch((e) => { console.error('Smoke-Crash:', e); process.exit(1) })
