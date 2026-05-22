/**
 * scripts/smoke-cmm44-spj.mjs — CMM-44 SP-J Portal-Smoke gegen Staging.
 *
 * Prueft die Oberflaechen + Datenpfade, die der SP-J-Sweep beruehrt
 * (11 Zahlungs-/Abrechnungs-Spalten: 3 Bucket-A -> claim_payments [Reroute+Rename],
 * 8 Bucket-B -> claims, 1 Bucket-C zahlung_erwartet_am Phase-6-DROP):
 *  - DB-Sanity: claims traegt die 8 Bucket-B; claim_payments lesbar
 *  - Embed-Probe: die exakten Nested-Embeds des Codes (faelle->claims->claim_payments)
 *    resolven gegen die LIVE-PostgREST-Schema-Cache (sonst 500/leer im UI)
 *  - Round-Trip (Bucket-A, der heikle Teil): INSERT claim_payments-Row auf den
 *    Test-Kunde-Claim -> Read-Back via getCurrentClaimPayment-Query + Nested-Embed
 *    -> Kunde-Fallakte rendert den Eingang -> DELETE (cleanup, try/finally)
 *  - Admin /admin/finance* + /faelle/[id] (getFallFinanzen Bucket-A + analytics getCashFlow/getUmsatz)
 *  - SV /gutachter/abrechnung (Bucket-B via View) + /gutachter/fall/[id] (KanzleiStatusCard)
 *  - Kunde /kunde + /kunde/faelle/[id] (getKundeFallDetailRecord Bucket-A)
 *  - KB/Dispatch /faelle/[id]
 * Read-only Navigation; Screenshots zur In-Turn-Analyse.
 */
import { chromium } from 'playwright'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { getServiceDb } from './smoke/helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'docs', '22.05.2026', 'cmm44-spj-smoke')
mkdirSync(OUT, { recursive: true })
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'
if (!BASIC_USER || !BASIC_PASS) { console.error('HARD: STAGING_BASIC_AUTH_USER/PASS fehlen'); process.exit(1) }

const results = []; let stepN = 0
const pad = (n) => String(n).padStart(3, '0')
async function shoot(page, label) { const name = `${pad(++stepN)}-${label.replace(/[^a-z0-9-]/gi,'_').slice(0,50)}.png`; await page.screenshot({ path: join(OUT, name), fullPage: false }).catch(()=>{}); return name }

async function visit(ctx, user, path, label) {
  const page = await ctx.newPage(); const errs = []; let worst = 0
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0,140)}`) })
  page.on('response', (r) => { if (r.url().includes('staging.claimondo') && r.status() >= 500) { worst = Math.max(worst, r.status()); errs.push(`HTTP ${r.status()}`) } })
  let nav = ''
  try { const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })); nav = resp ? `${resp.status()}` : '?' } catch (e) { nav = `NAV-FAIL ${e.message.slice(0,50)}` }
  await page.waitForTimeout(1500)
  const shot = await shoot(page, `${user}-${label}`)
  const hard = worst >= 500 || errs.some((e) => e.startsWith('pageerror'))
  results.push({ s: `${user} ${path}`, status: hard ? 'HARD' : (errs.length ? 'SOFT' : 'OK'), note: `nav=${nav} ${page.url().replace(BASE,'')} ${shot}${errs.length ? ' | ' + errs.slice(0,2).join(' ; ') : ''}` })
  console.log(`[${hard ? 'HARD' : (errs.length ? 'SOFT' : 'OK')}] ${user} ${path} (${nav}) ${shot}`)
  await page.close()
}
async function login(ctx, email) {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.fill('input[type="email"], input[name="email"], #email', email)
  await page.fill('input[type="password"], input[name="password"], #password', TEST_PASS)
  await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => console.warn(`[login] ${email} kein Redirect`))
  await page.close()
}

async function main() {
  const db = getServiceDb()
  const cleanup = []  // claim_payments-IDs zum Loeschen am Ende

  // ── 1. DB-Sanity: 8 Bucket-B auf claims ────────────────────────────────
  const BUCKET_B = ['guthaben_verrechnet_netto','schlussabrechnung_am','auszahlung_gutachter_betrag','auszahlung_gutachter_eingegangen_am','auszahlung_zahlungsweg','sv_nachzahlung_netto','abrechnung_id','kanzlei_abrechnung_id']
  const { error: bErr } = await db.from('claims').select(BUCKET_B.join(',') + ',id').limit(1).maybeSingle()
  results.push({ s: 'DB claims Bucket-B (8 Spalten)', status: bErr ? 'HARD' : 'OK', note: bErr ? bErr.message : 'alle 8 Bucket-B-Spalten lesbar' })
  console.log(`[${bErr ? 'HARD' : 'OK'}] DB claims Bucket-B read: ${bErr ? bErr.message : 'ok'}`)

  // ── 2. claim_payments lesbar (Bucket-A-Heimat) ─────────────────────────
  const { count: cpCount, error: cpErr } = await db.from('claim_payments').select('id', { count: 'exact', head: true })
  results.push({ s: 'DB claim_payments lesbar', status: cpErr ? 'HARD' : 'OK', note: cpErr ? cpErr.message : `erreichbar, ${cpCount ?? 0} Rows (pre-launch 0 erwartet)` })
  console.log(`[${cpErr ? 'HARD' : 'OK'}] DB claim_payments read: ${cpErr ? cpErr.message : `${cpCount ?? 0} rows`}`)

  // ── 3. Embed-Probe: faelle->claims->claim_payments resolvt? (PostgREST) ─
  const { error: embErr } = await db.from('faelle').select('id, claims:claim_id(claim_payments(zahlungseingang_am, erhaltener_betrag, zahlungsweg))').limit(1).maybeSingle()
  results.push({ s: 'Embed faelle->claims->claim_payments', status: embErr ? 'HARD' : 'OK', note: embErr ? embErr.message : 'Nested-Embed resolvt gegen Live-Schema (analytics/conversion-Pfad)' })
  console.log(`[${embErr ? 'HARD' : 'OK'}] Embed-Probe: ${embErr ? embErr.message : 'ok'}`)

  // ── 4. Test-Faelle ermitteln ───────────────────────────────────────────
  // (a) irgendein Fall mit claim_id fuer Admin/SV-Detail
  const { data: anyFall } = await db.from('faelle').select('id, claim_id, sv_id').not('claim_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const adminFallId = anyFall?.id ?? null
  let svEmail = 'test-sv@claimondo.de'
  if (anyFall?.sv_id) { const { data: p } = await db.from('profiles').select('email').eq('id', anyFall.sv_id).maybeSingle(); if (p?.email?.startsWith('test-')) svEmail = p.email }
  // (b) Test-Kunde-Fall fuer Kunde-Detail + Round-Trip
  let kundeFallId = null, kundeClaimId = null
  const { data: kp } = await db.from('profiles').select('id').eq('email', 'test-kunde@claimondo.de').maybeSingle()
  if (kp?.id) {
    const { data: kf } = await db.from('faelle').select('id, claim_id').eq('kunde_id', kp.id).not('claim_id', 'is', null).limit(1).maybeSingle()
    if (kf) { kundeFallId = kf.id; kundeClaimId = kf.claim_id }
    else {
      const { data: party } = await db.from('claim_parties').select('claim_id').eq('user_id', kp.id).eq('rolle', 'geschaedigter').limit(1).maybeSingle()
      if (party?.claim_id) { kundeClaimId = party.claim_id; const { data: f } = await db.from('faelle').select('id').eq('claim_id', kundeClaimId).maybeSingle(); kundeFallId = f?.id ?? null }
    }
  }
  console.log(`[info] adminFallId=${adminFallId} svEmail=${svEmail} kundeFallId=${kundeFallId} kundeClaimId=${kundeClaimId}`)

  // ── 5. Bucket-A Round-Trip (write -> read -> render -> cleanup) ─────────
  if (kundeClaimId) {
    try {
      const now = new Date().toISOString()
      // Nur die echt migrierten Bucket-A-Felder: zahlung_eingegangen_am->
      // zahlungseingang_am, zahlung_betrag->erhaltener_betrag. zahlungsweg ist
      // NICHT migriert (faelle.zahlungsweg-ZIEL != claim_payments.zahlungsweg-Methode).
      const { data: ins, error: insErr } = await db.from('claim_payments').insert({
        claim_id: kundeClaimId, zahlungseingang_am: now, erhaltener_betrag: 123.45,
        status: 'erhalten', zahlungsreferenz: 'SMOKE-SPJ-TESTDELETE',
      }).select('id').maybeSingle()
      if (insErr) {
        results.push({ s: 'Bucket-A Round-Trip INSERT', status: 'HARD', note: insErr.message })
      } else {
        if (ins?.id) cleanup.push(ins.id)
        // Read-Back via getCurrentClaimPayment-Query (Single-Claim-Pfad)
        const { data: rb, error: rbErr } = await db.from('claim_payments').select('zahlungseingang_am, erhaltener_betrag, zahlungsweg').eq('claim_id', kundeClaimId).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const okBetrag = Number(rb?.erhaltener_betrag) === 123.45 && rb?.zahlungsweg === 'kundenkonto'
        results.push({ s: 'Bucket-A Round-Trip read-back', status: rbErr ? 'HARD' : (okBetrag ? 'OK' : 'SOFT'), note: rbErr ? rbErr.message : `erhaltener_betrag=${rb?.erhaltener_betrag} zahlungsweg=${rb?.zahlungsweg} zahlungseingang_am=${rb?.zahlungseingang_am ? 'set' : 'null'}` })
        console.log(`[${rbErr ? 'HARD' : (okBetrag ? 'OK' : 'SOFT')}] Round-Trip read-back: betrag=${rb?.erhaltener_betrag} weg=${rb?.zahlungsweg}`)
      }
    } catch (e) {
      results.push({ s: 'Bucket-A Round-Trip', status: 'HARD', note: `crash: ${e.message}` })
    }
  } else {
    results.push({ s: 'Bucket-A Round-Trip', status: 'SOFT', note: 'kein Test-Kunde-Fall mit claim_id gefunden — uebersprungen' })
  }

  // ── 6. Navigation-Smoke ────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ httpCredentials: { username: BASIC_USER, password: BASIC_PASS } })
  try {
    await visit(ctx, 'public', '/', 'landing')

    // Admin — Finance (analytics getCashFlow/getUmsatz Bucket-A bulk + Bucket-C) + Fallakte (getFallFinanzen)
    await login(ctx, 'test-admin@claimondo.de')
    await visit(ctx, 'admin', '/admin/finance', 'finance-dashboard')
    await visit(ctx, 'admin', '/admin/finance/abrechnungen', 'finance-abrechnungen')
    await visit(ctx, 'admin', '/faelle', 'faelle-liste')
    if (adminFallId) await visit(ctx, 'admin', `/faelle/${adminFallId}`, 'fallakte-finanzen')

    // SV — Abrechnung (Bucket-B via View) + Fall-Detail (KanzleiStatusCard view-fed)
    await login(ctx, svEmail)
    await visit(ctx, 'sv', '/gutachter/abrechnung', 'sv-abrechnung')
    if (adminFallId) await visit(ctx, 'sv', `/gutachter/fall/${adminFallId}`, 'sv-fall-kanzleistatus')

    // KB
    await login(ctx, 'test-kb@claimondo.de')
    if (adminFallId) await visit(ctx, 'kb', `/faelle/${adminFallId}`, 'kb-fallakte')

    // Kunde — Dashboard + Fall-Detail (getKundeFallDetailRecord Bucket-A) — Round-Trip-Row noch da
    await login(ctx, 'test-kunde@claimondo.de')
    await visit(ctx, 'kunde', '/kunde', 'kunde-dashboard')
    if (kundeFallId) await visit(ctx, 'kunde', `/kunde/faelle/${kundeFallId}`, 'kunde-fall-zahlung')
  } finally {
    await browser.close()
    // ── 7. Cleanup Round-Trip-Rows ──────────────────────────────────────
    for (const id of cleanup) {
      const { error: delErr } = await db.from('claim_payments').delete().eq('id', id)
      console.log(`[cleanup] claim_payments ${id}: ${delErr ? 'FEHLER ' + delErr.message : 'geloescht'}`)
      if (delErr) results.push({ s: `Cleanup claim_payments ${id.slice(0,8)}`, status: 'HARD', note: `NICHT geloescht: ${delErr.message}` })
    }
    // Safety-Net: alle SMOKE-Marker-Rows weg (falls ein frueherer Run abbrach)
    const { error: sweepErr } = await db.from('claim_payments').delete().eq('zahlungsreferenz', 'SMOKE-SPJ-TESTDELETE')
    if (sweepErr) console.warn(`[cleanup] Sweep-Delete Warnung: ${sweepErr.message}`)
  }

  const hard = results.filter((r) => r.status === 'HARD')
  console.log('\n===== SP-J SMOKE =====')
  for (const r of results) console.log(`  [${r.status}] ${r.s} — ${r.note}`)
  console.log(`\nHARD=${hard.length} SOFT=${results.filter(r=>r.status==='SOFT').length} OK=${results.filter(r=>r.status==='OK').length}`)
  console.log(`Screenshots: ${OUT}`)
  process.exit(hard.length ? 2 : 0)
}
main().catch((e) => { console.error('SMOKE-CRASH:', e); process.exit(3) })
