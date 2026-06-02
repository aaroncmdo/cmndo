// Smoke: SV-Self-Onboarding Claim-Flow (/sv/registrieren) auf staging.
// READ-ONLY — treibt die Suche mit einem echten claimbaren sv_leads-Pin,
// klickt aber NICHT den finalen Claim-Button (kein Pending-Account/keine Mail).
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)
const USER = env.STAGING_BASIC_AUTH_USER
const PASS = env.STAGING_BASIC_AUTH_PASS
const BASE = 'https://app.staging.claimondo.de'
const OUT = 'docs/02.06.2026/smoke-sv-claim'
mkdirSync(OUT, { recursive: true })

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: leads, error } = await admin
  .from('sv_leads')
  .select('id, vorname, name, firma, plz, ort, claim_status, dat_expert_nr, dat_id')
  .eq('claim_status', 'offen')
  .not('name', 'is', null)
  .limit(5)
console.log('=== claimbare sv_leads (Sample) ===')
console.log(error ? `ERR ${error.message}` : JSON.stringify(leads, null, 2))
const lead = leads?.[0]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  httpCredentials: { username: USER, password: PASS },
  viewport: { width: 1280, height: 1500 },
})
const page = await ctx.newPage()
const dump = async (label) => {
  const headings = await page.locator('h1, h2, h3').allTextContents()
  const buttons = await page.locator('button').allTextContents()
  const inputs = await page.locator('input').evaluateAll((els) =>
    els.map((e) => ({ type: e.type, ph: e.placeholder, name: e.name })))
  console.log(`\n--- ${label} ---`)
  console.log('URL:', page.url())
  console.log('headings:', JSON.stringify(headings))
  console.log('buttons:', JSON.stringify(buttons))
  console.log('inputs:', JSON.stringify(inputs))
}

try {
  // 1. Landing
  await page.goto(`${BASE}/sv/registrieren`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true })
  await dump('01 LANDING')

  // 2. Suche treiben — SAUBERES Keyword (längster alphabet. Token), weil die
  // Sanitierung Punktuation killt (siehe claim-actions.ts:88). Fallback PLZ.
  const cleanTokens = String(lead?.name ?? lead?.firma ?? '')
    .replace(/[^a-zA-ZäöüÄÖÜß]/g, ' ').split(/\s+/).filter((w) => w.length >= 4)
  const term = cleanTokens.sort((a, b) => b.length - a.length)[0] ?? lead?.plz ?? 'Gutachter'
  console.log(`\n>>> Suchbegriff: "${term}" (Lead ${lead?.id ?? '—'}, Name "${lead?.name ?? '—'}")`)
  const search = page.locator('input[type="text"], input[type="search"], input:not([type]):not([type="hidden"])').first()
  if (await search.count()) {
    await search.fill(String(term))
    // Suche ist button-getriggert (nicht Auto-Debounce) — "Suchen" klicken
    await page.getByRole('button', { name: /^Suchen$/i }).click().catch(() => search.press('Enter'))
    await page.waitForTimeout(4000) // Server-Suche (sucheSvLeadKandidaten, rate-limited)
    await page.screenshot({ path: `${OUT}/02-suche-ergebnisse.png`, fullPage: true })
    await dump('02 SUCHE')

    // 3. Ersten Kandidaten anklicken (Claim-Schritt zeigen, NICHT finalisieren)
    const cand = page.getByRole('button', { name: /Das bin ich/i }).first()
    if (await cand.count()) {
      await cand.scrollIntoViewIfNeeded().catch(() => {})
      await cand.click().catch(() => {})
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${OUT}/03-claim-schritt.png`, fullPage: true })
      await dump('03 CLAIM-SCHRITT (Formular, NICHT abgeschickt)')
    } else {
      console.log(`Kein klickbarer Kandidat ("${key}") gefunden — siehe 02.`)
    }
  } else {
    console.log('Kein Such-Input gefunden — evtl. Step-0-Auswahl davor (siehe 01).')
  }

  // 4. "Neu registrieren"-Pfad (falls als Alternative sichtbar)
  const fresh = page.locator('button, a').filter({ hasText: /neu|registrier|ohne.*pin|nicht.*gefunden|manuell/i }).first()
  if (await fresh.count()) {
    await fresh.click().catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/04-neu-registrieren.png`, fullPage: true })
    await dump('04 NEU-REGISTRIEREN-PFAD')
  }
} catch (e) {
  console.log('SMOKE-FEHLER:', e.message)
  await page.screenshot({ path: `${OUT}/99-fehler.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n=== Screenshots in', OUT, '===')
}
