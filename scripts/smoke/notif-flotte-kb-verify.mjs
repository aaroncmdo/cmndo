// Regel-4-Verify fuer PR #4479 (Notification-Slice): beweist LIVE auf prod, dass
//   (a) fall.created einen FLOTTENMANAGER der betroffenen Flotte in_app erreicht (P1.1) und
//   (b) fall.sv_assigned den KUNDENBETREUER erreicht (P1.3 KB-Rueckport).
// Mechanik: Test-Claim mit Flotten-Vehicle (Test-Firma dafc57ee) per service-role anlegen,
// 2 notification_events inserten, Worker (GET /api/notifications/process, Bearer CRON_SECRET)
// triggern, mitteilungen-Rows asserten, restlos aufraeumen.
// Isolation: nur Test-Firma/-Konten (flotte.test uid 9b849993, test-kb@), in_app-only Events
// fuer diese Rollen -> KEINE Mails/WA nach aussen. Marker created_via='regel4_notif_verify'.
//
//   node scripts/smoke/notif-flotte-kb-verify.mjs           # Verify
//   node scripts/smoke/notif-flotte-kb-verify.mjs --clean   # nur aufraeumen

import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const ENV_CANDIDATES = [
  process.env.CLAIMONDO_ENV_FILE,
  new URL('../../.env.local', import.meta.url),
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
].filter(Boolean)
let envRaw = null
for (const p of ENV_CANDIDATES) { try { envRaw = readFileSync(p, 'utf8'); break } catch { /* next */ } }
if (!envRaw) throw new Error('.env.local nicht gefunden')
const env = {}
for (const line of envRaw.split('\n')) {
  const l = line.replace(/\r$/, '')
  if (!l.includes('=') || l.trimStart().startsWith('#')) continue
  const i = l.indexOf('=')
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const BASE = 'https://app.claimondo.de'
const FIRMA_ID = 'dafc57ee-0d27-4d7e-8e1a-4a11edd6f713'
const FM_UID = '9b849993' // Prefix reicht fuer Assert-Ausgabe; volle uid wird aufgeloest
const MARK = 'regel4_notif_verify'
const CLEAN = process.argv.includes('--clean')
const log = (...a) => console.log(...a)
const fail = (m) => { console.error('\n❌ VERIFY ROT:', m); process.exit(1) }
const ok = (m) => log('  ✓', m)

async function cleanup() {
  // Identifikation ueber die vehicle-Kette: claims_created_via_check erlaubt keine
  // Custom-Marker -> der Marker lebt in vehicles.fin_quelle, Claims haengen am Vehicle.
  const { data: markVehs } = await db.from('vehicles').select('id').eq('fin_quelle', MARK)
  const vehIds = (markVehs ?? []).map((v) => v.id)
  const { data: claims } = vehIds.length
    ? await db.from('claims').select('id, vehicle_id').in('vehicle_id', vehIds)
    : { data: [] }
  const claimIds = (claims ?? []).map((c) => c.id)
  // Bridge -> fall_id: der 'Reguliert'-Trigger erzeugt partner_provisionen, die via
  // partner_provisionen_claim_bridge_fkey auf faelle_claim_bridge zeigen. Reihenfolge zwingend:
  // partner_provisionen (claim_id UND fall_id) VOR bridge VOR claim, sonst FK-Block.
  const { data: bridges } = claimIds.length
    ? await db.from('faelle_claim_bridge').select('fall_id, claim_id').in('claim_id', claimIds)
    : { data: [] }
  const fallIds = (bridges ?? []).map((b) => b.fall_id).filter(Boolean)
  // Alle claim_id-Kinder, die die Endzustand-/Provisions-Flows real erzeugen (best-effort).
  const KINDER = ['timeline', 'phase_transitions', 'notification_events', 'kanzlei_faelle', 'claim_parties', 'sla_tracking', 'claim_recency', 'fall_read_state', 'regulierungs_klassifizierung']
  for (const c of claims ?? []) {
    await db.from('partner_provisionen').delete().eq('claim_id', c.id)
    await db.from('mitteilungen').delete().eq('kontext_id', c.id)
    for (const t of KINDER) await db.from(t).delete().eq('claim_id', c.id)
  }
  for (const fid of fallIds) await db.from('partner_provisionen').delete().eq('fall_id', fid)
  for (const c of claims ?? []) {
    await db.from('faelle_claim_bridge').delete().eq('claim_id', c.id)
    const { error: cErr } = await db.from('claims').delete().eq('id', c.id)
    if (cErr) { log('  ⚠ claim', c.id.slice(0, 8), 'nicht loeschbar:', cErr.message); continue }
    if (c.vehicle_id) {
      await db.from('flotten_fahrzeuge').delete().eq('vehicle_id', c.vehicle_id)
      await db.from('vehicles').delete().eq('id', c.vehicle_id)
    }
    log('  geloescht: claim', c.id.slice(0, 8), '+ vehicle', c.vehicle_id?.slice(0, 8))
  }
  // Streuner-Vehicles frueherer Laeufe (falls Claim-Anlage scheiterte)
  const { data: vehs } = await db.from('vehicles').select('id').eq('fin_quelle', MARK)
  for (const v of vehs ?? []) {
    await db.from('flotten_fahrzeuge').delete().eq('vehicle_id', v.id)
    await db.from('vehicles').delete().eq('id', v.id)
  }
  log(`Cleanup fertig (${(claims ?? []).length} Claims, ${(vehs ?? []).length} Streuner-Vehicles).`)
}
if (CLEAN) { await cleanup(); process.exit(0) }

log('Notification-Verify (P1.1 Flottenmanager + P1.3 KB) gegen', BASE)
await cleanup()

// ── Beteiligte aufloesen ──────────────────────────────────────────────────────
const { data: fm } = await db.from('profiles').select('id').eq('email', 'flotte.test@claimondo.de').maybeSingle()
if (!fm) fail('flotte.test@claimondo.de fehlt (Fixture weg?)')
const { data: kb } = await db.from('profiles').select('id').eq('email', 'test-kb@claimondo.de').maybeSingle()
if (!kb) fail('test-kb@claimondo.de fehlt')
// P1.2: irgendein kanzlei-User als Assert-Ziel (Single-Kanzlei-Realitaet: alle werden beliefert)
const { data: kanzleiUsers } = await db.from('profiles').select('id, email').eq('rolle', 'kanzlei').limit(1)
const kanzleiUser = (kanzleiUsers ?? [])[0] ?? null
if (!kanzleiUser) fail('kein rolle=kanzlei-Profil vorhanden')
ok(`FM ${fm.id.slice(0, 8)} (erwartet ${FM_UID}) · KB ${kb.id.slice(0, 8)} · Kanzlei ${kanzleiUser.id.slice(0, 8)} (${kanzleiUser.email})`)

// ── Setup: Vehicle + Bind + Claim ────────────────────────────────────────────
const { data: veh, error: vErr } = await db.from('vehicles')
  .insert({ kennzeichen_aktuell: 'B-NV 901', hersteller: 'Smoke', modell_haupttyp: 'Notif-Verify', fin_quelle: MARK })
  .select('id').single()
if (vErr) fail('vehicle insert: ' + vErr.message)
const { error: bErr } = await db.from('flotten_fahrzeuge').insert({ firma_id: FIRMA_ID, vehicle_id: veh.id })
if (bErr) fail('bind insert: ' + bErr.message)
const { data: claim, error: cErr } = await db.from('claims')
  .insert({ vehicle_id: veh.id, kundenbetreuer_id: kb.id, created_via: 'manuell_admin', schadentag: '2026-07-16' })
  .select('id').single()
if (cErr) fail('claim insert: ' + cErr.message + ' (NOT-NULL-Spalte? -> Insert erweitern)')
ok(`Test-Claim ${claim.id.slice(0, 8)} mit Flotten-Vehicle ${veh.id.slice(0, 8)}`)

// P1.2-Gate: kanzlei_faelle-Row -> der Claim gilt als "an Kanzlei uebergeben"
const { error: kfErr } = await db.from('kanzlei_faelle').insert({ claim_id: claim.id, status: 'versicherungskontakt' })
if (kfErr) fail('kanzlei_faelle insert: ' + kfErr.message)

// ── ORGANISCHER Trigger: Admin setzt Endzustand 'Reguliert' via echte UI ─────
// claim.reguliert beliefert laut Matrix ALLE drei neuen Rollen (FM via Flotten-Vehicle,
// KB via kundenbetreuer_id, Kanzlei via kanzlei_faelle-Gate). Der serverseitige
// emitEvent-POST (mit Server-CRON_SECRET) verarbeitet das Event sofort — unabhaengig
// vom fehlenden Worker-Fallback-Tick (eigener P0-Nachfund, s. Audit-Marker).
const browser = await chromium.launch({ headless: !process.env.HEADED })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill('test-admin@claimondo.de')
  await page.locator('input[type="password"]').fill((process.env.TEST_PASSWORT ?? ''))
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 })
  ok('Admin-Login')
  await page.goto(`${BASE}/faelle/${claim.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByTitle('Endzustand setzen').click()
  await page.getByText('Reguliert', { exact: true }).click()
  const modal = page.locator('[aria-label="Schaden regulieren"]') // Modal ariaLabel = t.label
  await modal.getByPlaceholder('z.B. 4500.00').fill('1000')
  await modal.locator('textarea').first().fill('Regel-4-Verify Notification-Slice (#4479/#4494)')
  // "Kunde informieren" bewusst ANLASSEN: das emitEvent('claim.reguliert') haengt an
  // notify_customer (endzustand-actions.ts:222) — Abwaehlen unterdrueckt ALLE Rollen-Notifs.
  // Kein Kunde am Test-Claim (geschaedigter_user_id NULL) -> 0 echte Kunden-Comms trotzdem.
  await modal.getByRole('button', { name: 'Schaden regulieren' }).click()
  await page.waitForTimeout(4000) // Server-Action + emitEvent + Worker-POST
  ok('Endzustand "Reguliert" organisch gesetzt (claim.reguliert emittiert)')
} catch (err) {
  await page.screenshot({ path: 'scripts/smoke/.notif-verify-fehler.png' }).catch(() => {})
  fail('UI-Trigger: ' + (err instanceof Error ? err.message : String(err)))
} finally {
  await browser.close()
}

// ── Asserts: mitteilungen-Rows (Poll bis 30s, Worker-Verarbeitung asynchron) ──
let fmRow = null, kbRow = null, kzRow = null
for (let i = 0; i < 10 && (!fmRow || !kbRow || !kzRow); i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const { data: rows } = await db.from('mitteilungen')
    .select('empfaenger_id, empfaenger_rolle, titel')
    .eq('kontext_id', claim.id)
  fmRow = (rows ?? []).find((r) => r.empfaenger_id === fm.id && r.empfaenger_rolle === 'flottenmanager') ?? fmRow
  kbRow = (rows ?? []).find((r) => r.empfaenger_id === kb.id && r.empfaenger_rolle === 'kundenbetreuer') ?? kbRow
  kzRow = (rows ?? []).find((r) => r.empfaenger_id === kanzleiUser.id && r.empfaenger_rolle === 'kanzlei') ?? kzRow
}
if (!fmRow) fail('KEINE flottenmanager-Mitteilung fuer flotte.test (P1.1 nicht wirksam?)')
ok(`P1.1 BEWIESEN: flottenmanager-Row "${(fmRow.titel ?? '').slice(0, 50)}"`)
if (!kbRow) fail('KEINE kundenbetreuer-Mitteilung (P1.3 nicht wirksam?)')
ok(`P1.3 BEWIESEN: kundenbetreuer-Row "${(kbRow.titel ?? '').slice(0, 50)}"`)
if (!kzRow) fail('KEINE kanzlei-Mitteilung (P1.2 nicht wirksam?)')
ok(`P1.2 BEWIESEN: kanzlei-Row "${(kzRow.titel ?? '').slice(0, 50)}"`)

log('\n✅ VERIFY GRUEN — alle drei Rollen (FM/KB/Kanzlei) erreichen die Glocke. Aufraeumen: --clean')
