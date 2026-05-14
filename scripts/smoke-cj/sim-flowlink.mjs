// Simuliert „Dispatcher hat in Phase 5 FlowLink versendet" indem ein
// flow_links-row + nachrichten-row direkt via service-role angelegt wird —
// dieselbe Mutation die sendFlowLinkMultiChannel(leadId, 'email') sonst macht,
// nur OHNE Twilio/Email-Side-Effect.
//
// Dann öffnet ein Kunde-Browser-Context den Magic-Link, was flow_links.
// geoeffnet_am setzt. Phase 6 zeigt das im Dispatch-View.

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

loadEnv({ path: '.env.test' })
loadEnv({ path: '.env.local' })

const APP_URL = 'https://app.claimondo.de'
const OUT_DIR = `docs/13.05.2026/smoke-claimondo-de/sim-flowlink-${Date.now()}`
mkdirSync(OUT_DIR, { recursive: true })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// 1. Den jüngsten Multi-Smoke-Lead nehmen
const { data: leads } = await supabase
  .from('leads')
  .select('id, vorname, nachname, telefon, email, service_typ, sprache')
  .ilike('nachname', 'Multi%')
  .eq('qualifizierungs_phase', 'rueckruf')
  .order('created_at', { ascending: false })
  .limit(1)
const lead = leads?.[0]
if (!lead) { console.error('Kein Multi-Lead gefunden'); process.exit(1) }
console.log(`▶ Lead: ${lead.vorname} ${lead.nachname} (${lead.id})`)

// 2. flow_links-Row anlegen (token = 32 chars hex)
const token = randomBytes(16).toString('hex')
const now = new Date()
const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

const flowLinkPayload = {
  token,
  lead_id: lead.id,
  service_typ: lead.service_typ ?? 'komplett',
  sprache: lead.sprache ?? 'de',
  status: 'aktiv',
  expires_at: expires.toISOString(),
}

const { data: fl, error: flErr } = await supabase
  .from('flow_links')
  .insert(flowLinkPayload)
  .select('id, token')
  .single()
if (flErr || !fl) { console.error('flow_links insert:', flErr); process.exit(1) }
console.log(`✓ flow_link angelegt: ${fl.token}`)

// 3. Magic-Link in Browser öffnen
const browser = await chromium.launch({ headless: false, slowMo: 400 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })
const page = await ctx.newPage()
const url = `${APP_URL}/flow/${fl.token}`
console.log(`▶ Open ${url}`)
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(e.message))
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)
await page.screenshot({ path: path.join(OUT_DIR, '01-flow-page.png'), fullPage: true })

// 4. Verify flow_links.geoeffnet_am
const { data: flAfter } = await supabase
  .from('flow_links')
  .select('id, geoeffnet_am, abgeschlossen_am, status')
  .eq('id', fl.id)
  .single()
console.log('▶ flow_link state:', flAfter)

writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({
  leadId: lead.id,
  leadName: `${lead.vorname} ${lead.nachname}`,
  flowLinkId: fl.id,
  token: fl.token,
  url,
  flowLinkAfter: flAfter,
  consoleErrors,
}, null, 2))

console.log(`\n✓ Output: ${OUT_DIR}`)
await browser.close()
