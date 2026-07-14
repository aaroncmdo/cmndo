#!/usr/bin/env node
// Route-Health-Sweep: besucht (read-only, keine Klicks) eine Liste von Routen als EINE Rolle
// und erfasst pro Route: HTTP-Status, Redirect(->login), console.error, fehlgeschlagene
// API-Calls (>=400), Error-Boundary-Text. Kein Action-Trigger => keine Writes/Comms.
//   SMOKE_EMAIL/PASSWORD + --role <name> --checks '@datei.json'|'[...]'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { sessionToCookies } from './cookie.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const APP = 'https://app.claimondo.de'
const ROLE = arg('role', 'unknown')
let raw = arg('checks', '[]'); if (raw.startsWith('@')) raw = readFileSync(raw.slice(1), 'utf8')
const routes = JSON.parse(raw)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
})
const session = await authRes.json()
if (!session?.access_token) { console.error('AUTH FAIL', session?.error_description ?? session); process.exit(1) }
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 1000 } })
await ctx.addCookies(sessionToCookies(session, { projectRef, cookieDomain: '.claimondo.de' }))
const page = await ctx.newPage()

// Bekanntes NICHT-App-Rauschen ausfiltern (sonst False-Positive-Verdicts):
//  - api.mapbox.com — Karten-Kacheln/Styles (externe Ressource, Rate-Limit/Netz)
//  - _rsc=…-CORS — Next.js-RSC-Prefetch über die App→Marketing-Domaingrenze
//    (Navigation funktioniert trotzdem; der Prefetch scheitert still)
const NOISE = /api\.mapbox\.com|_rsc=|mapbox-gl|favicon|\.map(\?|$)/
// Fehler-Kollektoren pro Route (via cur-Ref getaggt)
let cur = { consoleErrors: [], failed: [] }
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!NOISE.test(t)) cur.consoleErrors.push(t.slice(0, 160)) } })
page.on('response', (r) => {
  const s = r.status()
  if (s >= 400) { const u = r.url(); if (!NOISE.test(u)) cur.failed.push(`${s} ${u.replace(APP, '').replace(supabaseUrl, 'SB').slice(0, 90)}`) }
})
page.on('pageerror', (e) => { const t = String(e.message); if (!NOISE.test(t)) cur.consoleErrors.push('PAGEERROR: ' + t.slice(0, 140)) })

const ERR_MARKERS = ['Application error', 'Etwas ist schiefgelaufen', 'Ein Fehler ist aufgetreten', 'client-side exception', 'Internal Server Error']
const results = []
for (const rt of routes) {
  cur = { consoleErrors: [], failed: [] }
  let status = 'no-resp', navErr = null
  try {
    const resp = await page.goto(rt.path, { waitUntil: 'domcontentloaded', timeout: 30000 })
    status = resp ? resp.status() : 'no-resp'
  } catch (e) { navErr = String(e.message).slice(0, 60) }
  await page.waitForTimeout(2500) // settle: RSC-Streams + Client-Fetches
  const finalUrl = page.url().replace(APP, '')
  // SICHTBARER Text (nicht page.content()): Next.js bettet Error-Boundary-Fallback-Strings
  // in JEDES Client-Bundle ein -> content()-Scan = False Positive auf jeder Seite.
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
  const redirectedToLogin = /\/login|\/anmelden/.test(finalUrl)
  const errBoundary = ERR_MARKERS.filter((m) => bodyText.includes(m))
  // 401/403 auf Supabase-REST getrennt zaehlen (haeufigste echte API-Fehlerklasse)
  const auth4xx = cur.failed.filter((f) => /^40[13]/.test(f))
  const server5xx = cur.failed.filter((f) => /^5\d\d/.test(f))
  const verdict = navErr ? 'NAV-ERR'
    : redirectedToLogin ? 'REDIRECT-LOGIN'
    : (typeof status === 'number' && status >= 500) ? 'HTTP-5XX'
    : errBoundary.length ? 'ERROR-BOUNDARY'
    : cur.consoleErrors.length ? 'CONSOLE-ERR'
    : server5xx.length ? 'API-5XX'
    : auth4xx.length ? 'API-401/403'
    : 'OK'
  if (verdict !== 'OK') { try { await page.screenshot({ path: `/tmp/sweep-${ROLE}-${rt.label}.png`, fullPage: false }) } catch {} }
  results.push({
    label: rt.label, path: rt.path, verdict, status, finalUrl: finalUrl === rt.path ? '=' : finalUrl,
    navErr, errBoundary: errBoundary[0] ?? null,
    consoleErrors: cur.consoleErrors.slice(0, 3),
    api401_403: [...new Set(auth4xx)].slice(0, 3),
    api5xx: [...new Set(server5xx)].slice(0, 3),
  })
}
await browser.close()
console.log(JSON.stringify({ role: ROLE, total: results.length, results }, null, 2))
