// AAR-939 Stream 7 — Voller E2E-Daten-Smoke der SV-Lead-Inbox.
// Login als Test-SV -> Embed-Site via Wizard anlegen -> echte sv_embed-Anfrage
// submitten (Token von /api/embed/config, Origin = erlaubte Domain) -> Inbox
// (/sv-portal/anfragen) muss die Anfrage zeigen. Screenshot.
//
// Test-SV: 2FA aus. baileys_routing_nummer der Site = zentrale Nr (491633628571),
// also kein echter Gutachter benachrichtigt.
import { chromium, request } from 'playwright'

const BASE = 'https://app.claimondo.de'
const EMAIL = process.argv[2] || 'test-sv@claimondo.de'
const PW = process.argv[3] || 'Test1234!'
const DOMAIN = 'smoke-stream7.example.com'
const SLUG = 'smoke-stream7-' + Date.now().toString(36)
const KUNDE = 'SMOKE Inbox Test bitte ignorieren'
const TEL = '+491633628571'
const OUT = 'docs/02.06.2026/smoke-stream7-inbox.png'

const log = (m, x) => console.log(m, x !== undefined ? JSON.stringify(x) : '')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e.message)))

try {
  // ── 1) Login ──
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 30000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PW)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}),
    page.getByRole('button', { name: 'Einloggen' }).click(),
  ])
  await page.waitForTimeout(2000)
  log('after-login-url', page.url())

  // ── 2) Embed-Site via Wizard anlegen ──
  await page.goto(`${BASE}/sv-portal/embed-sites/neu`, { waitUntil: 'load', timeout: 30000 })
  await page.getByPlaceholder('z. B. Kanzlei Müller').fill('SMOKE Stream7 Test')
  const slugInput = page.getByPlaceholder('kanzlei-mueller')
  await slugInput.fill('') // auto-Slug ueberschreiben
  await slugInput.fill(SLUG)
  const domainInput = page.getByPlaceholder('z. B. meine-kanzlei.de')
  await domainInput.fill(DOMAIN)
  await domainInput.press('Enter')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Weiter' }).click() // -> Variante
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Weiter' }).click() // -> Tracking
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Weiter' }).click() // -> Zusammenfassung
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Site anlegen' }).click()
  await page.getByText('dein Einbinde-Snippet', { exact: false }).waitFor({ timeout: 15000 })
  log('embed-site-created-slug', SLUG)

  // ── 3) Echte sv_embed-Anfrage submitten (Token + Origin) ──
  const api = await request.newContext()
  const cfgResp = await api.get(`${BASE}/api/embed/config?site_id=${encodeURIComponent(SLUG)}`, {
    headers: { Origin: `https://${DOMAIN}`, Accept: 'application/json' },
  })
  const cfg = await cfgResp.json().catch(() => ({}))
  log('config-status', cfgResp.status())
  const token = cfg.site_token ?? null
  log('have-token', !!token)

  const submitResp = await api.post(`${BASE}/api/anfrage-from-lp`, {
    headers: { Origin: `https://${DOMAIN}`, 'Content-Type': 'application/json' },
    data: {
      source: 'sv_embed',
      embed_site_slug: SLUG,
      site_token: token,
      name: KUNDE,
      telefon: TEL,
      slot: 'asap',
      slot_text: 'So schnell wie möglich',
      page_url: `https://${DOMAIN}/`,
      consent_ts: new Date().toISOString(),
      honeypot: '',
    },
  })
  const submitBody = await submitResp.text()
  log('submit-status', submitResp.status())
  log('submit-body', submitBody.slice(0, 200))
  await api.dispose()

  // ── 4) Inbox muss die Anfrage zeigen ──
  await page.goto(`${BASE}/sv-portal/anfragen`, { waitUntil: 'load', timeout: 30000 })
  let inboxHasRow = false
  try {
    await page.getByText('SMOKE Inbox Test', { exact: false }).waitFor({ timeout: 12000 })
    inboxHasRow = true
  } catch {}
  await page.screenshot({ path: OUT, fullPage: true })
  log('INBOX-HAS-ROW', inboxHasRow)
  log('pageErrors', pageErrors)
} catch (err) {
  log('E2E-ERROR', String(err))
  await page.screenshot({ path: 'docs/02.06.2026/smoke-stream7-error.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}
