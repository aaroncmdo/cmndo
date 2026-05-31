/**
 * Audit-Probe: 2FA-Redirect-Loop + Google-Auth — gegen app.staging.claimondo.de.
 *
 * READ-ONLY / NON-MUTATING:
 *  - Szenario A: loggt test-admin (2FA aus) ein, loescht NUR das
 *    claimondo_2fa_verified-Cookie (simuliert Ablauf/Verlust) und prueft per
 *    maxRedirects:0-GETs, ob Middleware (/admin -> /login/2fa) und 2FA-Page
 *    (/login/2fa -> /admin) sich gegenseitig im Kreis schicken (Loop-Beweis).
 *    Danach EIN Browser-goto /admin um den ERR_TOO_MANY_REDIRECTS-Screenshot
 *    zu fangen.
 *  - Szenario B: Google-Login-Initiierung von /login (kein Consent-Abschluss) —
 *    faengt die Supabase-authorize-URL + redirect_to ab.
 *  - Szenario C: GETtet die Connect-Endpunkte (/api/auth/google/connect,
 *    /api/auth/google-calendar/connect) mit maxRedirects:0 und liest die
 *    Location, um auf STAGING zu sehen ob GOOGLE_OAUTH_CLIENT_ID gesetzt ist
 *    und welche redirect_uri gebaut wird (localhost-Fallback?). Es wird NIE
 *    der Callback aufgerufen -> kein DB-Write, kein Token-Exchange.
 *
 * Es werden KEINE Twilio/Resend-Sends ausgeloest (kein Login auf 2FA-ON-Accounts).
 *
 *   node scripts/probe-2fa-google-audit.mjs
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
function loadEnv() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnv()

const BASE = process.env.SMOKE_STAGING_BASE ?? 'https://app.staging.claimondo.de'
const BA_USER = process.env.STAGING_BASIC_AUTH_USER ?? 'aaroncmdo'
const BA_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''
const PW = 'Test1234!'
const ADMIN_EMAIL = 'test-admin@claimondo.de'
if (!BA_PASS) { console.error('FEHLER: STAGING_BASIC_AUTH_PASS fehlt (.env.local)'); process.exit(2) }
const BASIC = 'Basic ' + Buffer.from(`${BA_USER}:${BA_PASS}`).toString('base64')

const OUT = join(ROOT, 'docs/31.05.2026/2fa-google-audit')
mkdirSync(OUT, { recursive: true })
const findings = { base: BASE, ts: new Date().toISOString(), scenarios: {} }

const browser = await chromium.launch()

// ───────────────────────── Szenario A: 2FA-off Redirect-Loop ────────────────
async function scenarioA() {
  const ctx = await browser.newContext({
    httpCredentials: { username: BA_USER, password: BA_PASS },
    locale: 'de-DE',
    viewport: { width: 1366, height: 900 },
  })
  const page = await ctx.newPage()
  const A = { name: '2FA-off redirect loop' }
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(800)
    await page.fill('input[type="email"], input[name="email"], #email', ADMIN_EMAIL)
    await page.fill('input[type="password"], input[name="password"], #password', PW)
    await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
    A.landedAfterLogin = new URL(page.url()).pathname

    const cookies = await ctx.cookies()
    A.cookieNames = cookies.map(c => c.name)
    const twofa = cookies.find(c => c.name === 'claimondo_2fa_verified')
    A.had2faCookie = !!twofa
    A.twofaCookieValue = twofa?.value ?? null
    A.hadRememberCookie = cookies.some(c => c.name === 'claimondo_remember')

    // Simuliere Ablauf/Verlust des 2FA-Cookies
    await ctx.clearCookies({ name: 'claimondo_2fa_verified' })
    const after = await ctx.cookies()
    A.cookieClearedOk = !after.some(c => c.name === 'claimondo_2fa_verified')

    // Loop-Beweis ohne Browser-Loop: zwei einzelne Hops betrachten
    const r1 = await ctx.request.get(`${BASE}/admin`, { headers: { Authorization: BASIC }, maxRedirects: 0 })
    A.hop1 = { url: '/admin', status: r1.status(), location: r1.headers()['location'] ?? null }

    const r2 = await ctx.request.get(`${BASE}/login/2fa`, { headers: { Authorization: BASIC }, maxRedirects: 0 })
    A.hop2 = { url: '/login/2fa', status: r2.status(), location: r2.headers()['location'] ?? null }

    const loc1 = (A.hop1.location || '')
    const loc2 = (A.hop2.location || '')
    A.loopProven =
      /\/login\/2fa/.test(loc1) && /\/admin(\b|\/|$)/.test(loc2.replace(/^https?:\/\/[^/]+/, ''))

    // Visueller Beweis: echtes Browser-goto loopt bis ERR_TOO_MANY_REDIRECTS
    try {
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      A.browserGotoOutcome = 'kein Fehler (kein Loop?) — final: ' + new URL(page.url()).pathname
    } catch (e) {
      A.browserGotoOutcome = String(e.message).split('\n')[0].slice(0, 160)
    }
    await page.screenshot({ path: join(OUT, 'A-loop-error.png') }).catch(() => {})
  } catch (e) {
    A.error = String(e.message).slice(0, 200)
    await page.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {})
  }
  findings.scenarios.A = A
  await ctx.close()
}

// ───────────────────────── Szenario B: Google-Login-Initiierung ─────────────
async function scenarioB() {
  const ctx = await browser.newContext({
    httpCredentials: { username: BA_USER, password: BA_PASS },
    locale: 'de-DE',
    viewport: { width: 1366, height: 900 },
  })
  const page = await ctx.newPage()
  const B = { name: 'Google login initiation' }
  const navUrls = []
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navUrls.push(f.url()) })
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(600)
    // Google-Tab
    await page.click('button:has-text("Google")').catch(() => {})
    await page.waitForTimeout(400)
    await page.click('button:has-text("Mit Google anmelden")').catch(() => {})
    await page.waitForTimeout(4000)
    B.finalUrl = page.url().slice(0, 300)
    B.navChain = navUrls.map(u => u.slice(0, 200))
    const authorize = navUrls.find(u => u.includes('supabase.co/auth/v1/authorize'))
    if (authorize) {
      const sp = new URL(authorize).searchParams
      B.supabaseAuthorize = true
      B.redirect_to = sp.get('redirect_to')
      B.provider = sp.get('provider')
    } else {
      B.supabaseAuthorize = false
    }
    B.reachedGoogle = navUrls.some(u => u.includes('accounts.google.com'))
    await page.screenshot({ path: join(OUT, 'B-google-login.png') }).catch(() => {})
  } catch (e) {
    B.error = String(e.message).slice(0, 200)
    B.navChain = navUrls.map(u => u.slice(0, 200))
    await page.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {})
  }
  findings.scenarios.B = B
  await ctx.close()
}

// ───────────────────────── Szenario C: Google-Connect-Endpunkte (Config) ────
async function scenarioC() {
  const ctx = await browser.newContext({
    httpCredentials: { username: BA_USER, password: BA_PASS },
    locale: 'de-DE',
  })
  const page = await ctx.newPage()
  const C = { name: 'Google connect endpoints (staging config)' }
  try {
    // Session holen (test-admin) — die Connect-Endpunkte brauchen einen User.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(800)
    await page.fill('input[type="email"], input[name="email"], #email', ADMIN_EMAIL)
    await page.fill('input[type="password"], input[name="password"], #password', PW)
    await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })

    // Mitarbeiter/Kanzlei-Flow
    const e1 = await ctx.request.get(`${BASE}/api/auth/google/connect?return=/admin/einstellungen/google`, { headers: { Authorization: BASIC }, maxRedirects: 0 })
    const l1 = e1.headers()['location'] ?? null
    C.googleConnect = {
      status: e1.status(),
      location: l1 ? l1.slice(0, 320) : null,
      reachesGoogle: !!l1 && l1.includes('accounts.google.com'),
      notConfigured: !!l1 && /error=(not_configured|config)/.test(l1),
      redirectUriParam: l1 ? (new URL(l1).searchParams.get('redirect_uri')) : null,
    }

    // Gutachter-Flow (manuell gebaute URL, localhost-Fallback?)
    const e2 = await ctx.request.get(`${BASE}/api/auth/google-calendar/connect?return=/gutachter/kalender`, { headers: { Authorization: BASIC }, maxRedirects: 0 })
    const l2 = e2.headers()['location'] ?? null
    C.googleCalendarConnect = {
      status: e2.status(),
      location: l2 ? l2.slice(0, 320) : null,
      reachesGoogle: !!l2 && l2.includes('accounts.google.com'),
      notConfigured: !!l2 && /error=(not_configured|config)/.test(l2),
      redirectUriParam: l2 ? (new URL(l2).searchParams.get('redirect_uri')) : null,
    }
  } catch (e) {
    C.error = String(e.message).slice(0, 200)
  }
  findings.scenarios.C = C
  await ctx.close()
}

try {
  await scenarioA()
  await scenarioB()
  await scenarioC()
} finally {
  await browser.close()
}

writeFileSync(join(OUT, 'findings.json'), JSON.stringify(findings, null, 2))
console.log(JSON.stringify(findings, null, 2))
console.log('\nDONE — Screenshots + findings.json in', OUT)
