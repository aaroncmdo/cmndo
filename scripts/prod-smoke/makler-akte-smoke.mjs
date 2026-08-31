// One-off Prod-Smoke: Makler-Fallakte — Ansprechpartner-Karte (F2/Feature) + Gruppenchat (F2)
// + Gutachten-Ergebnis/Gesamtforderung (F3) + Kunde-Name (Lead-Fallback-Fix).
// Login via GoTrue password-grant + Cookie-Injection (wie prod-smoke/smoke.mjs), dann echte SSR-Pages.
//
//   node --env-file="<repo>/.env.local" scripts/prod-smoke/makler-akte-smoke.mjs
//   ENV: SMOKE_APP_URL (default https://app.claimondo.de), SMOKE_EMAIL, SMOKE_PASSWORD
import { chromium } from 'playwright'
import { sessionToCookies } from './cookie.mjs'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const appUrl = process.env.SMOKE_APP_URL ?? 'https://app.claimondo.de'
const email = process.env.SMOKE_EMAIL ?? 'test-makler@claimondo.de'
// Kein Default mehr: (process.env.TEST_PASSWORT ?? '') ist auf prod nicht mehr setzbar (GoTrue pwned-Password-Policy,
// 14.07.) und ein funktionierendes prod-Passwort gehoert ohnehin nicht ins Repo.
const password = process.env.SMOKE_PASSWORD
if (!password) { console.error('SMOKE_PASSWORD fehlt (Passwort der Test-Fixtures — siehe Memory-Marker coordination-test-makler-prod-auth-500).'); process.exit(1) }
const outDir = join(tmpdir(), 'makler-akte-smoke')

if (!supabaseUrl || !anonKey) { console.error('NEXT_PUBLIC_SUPABASE_URL/ANON_KEY fehlen (--env-file .env.local)'); process.exit(1) }

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
const appHost = new URL(appUrl).hostname
const parts = appHost.split('.')
const cookieDomain = parts.length >= 2 ? '.' + parts.slice(-2).join('.') : appHost
const log = (...a) => console.log(...a)

const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const session = await authRes.json()
if (!session?.access_token) { console.error('❌ Auth fehlgeschlagen:', session?.error_description || session?.msg || JSON.stringify(session)); process.exit(1) }
log('✓ Auth OK als', email, '→ App', appUrl)

const cookies = sessionToCookies(session, { projectRef, cookieDomain })
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ baseURL: appUrl, viewport: { width: 1440, height: 1500 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()

// 1. Akten-Liste
let r = await page.goto('/makler/akten', { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => { log('nav-err:', e.message); return null })
log('→ /makler/akten  status', r?.status(), ' final', page.url())
if (/\/login|\/anmelden/.test(page.url())) { log('❌ auf Login umgeleitet — Session/Deploy-Problem'); await browser.close(); process.exit(1) }
await page.screenshot({ path: join(outDir, '1-akten-liste.png'), fullPage: true }).catch(() => {})

// 2. ALLE Akte-Detail-Links (UUID) finden
const hrefs = await page.evaluate(() => {
  const set = new Set()
  for (const x of document.querySelectorAll('a[href*="/makler/akten/"]')) {
    const h = x.getAttribute('href')
    if (h && /\/makler\/akten\/[0-9a-fA-F-]{36}/.test(h)) set.add(h.split('?')[0])
  }
  return [...set]
})
if (hrefs.length === 0) { log('⚠ keine Akte-Links — hat der Test-Makler Faelle? (Liste:', (await page.content()).includes('Akten') ? 'gerendert' : 'leer', ')'); await browser.close(); process.exit(0) }
log(`✓ ${hrefs.length} Akte(n) gefunden für den Makler`)

let i = 0
for (const fallPath of hrefs) {
  i++
  const id = fallPath.split('/').pop().slice(0, 8)
  // Übersicht: Kunde-Name (Kunde-Fix) + Gutachten (F3)
  let rr = await page.goto(fallPath, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
  await page.waitForTimeout(1000)
  const h1 = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() || '(kein h1)'
  const ov = await page.content()
  const hasGut = ov.includes('Gutachten-Ergebnis')
  const hasGesamt = ov.includes('Gesamtforderung')
  // Chat: Ansprechpartner-Karte (Feature) + Nachrichten sichtbar (F2)
  await page.goto(fallPath + '?tab=chat', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
  await page.waitForTimeout(1500)
  const ch = await page.content()
  const hasAnsp = ch.includes('Ansprechpartner') || ch.includes('Kundenbetreuer') || ch.includes('Sachverständiger')
  const chatEmpty = ch.includes('Noch keine Nachrichten')
  const bubbles = await page.locator('[class*="rounded-2xl"], [class*="rounded-bl"], [class*="rounded-br"]').count().catch(() => 0)
  log(`\n── Akte ${i}/${hrefs.length}  (${id})  ${rr?.status() ?? ''} ──`)
  log('  Kunde-Header (h1):', JSON.stringify(h1), h1 !== '–' ? '✓ Name (Kunde-Fix)' : '⚠ –')
  log('  Gutachten-Ergebnis-Card:', hasGut ? '✓ DA (F3 zeigt Werte)' : '– kein Gutachten', hasGesamt ? '| Gesamtforderung ✓' : '')
  log('  Ansprechpartner-Karte  :', hasAnsp ? '✓ DA (Feature deployed)' : '❌ FEHLT')
  log('  Chat-Nachrichten       :', chatEmpty ? '– leer ("Noch keine Nachrichten")' : `✓ sichtbar (F2; ~${bubbles} Bubble-Elemente)`)
  await page.screenshot({ path: join(outDir, `akte-${i}-${id}-chat.png`), fullPage: true }).catch(() => {})
}

log('\n✓ Screenshots:', outDir)
await browser.close()
log('done')
