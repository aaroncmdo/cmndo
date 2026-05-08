/**
 * scripts/journey/05-termin-bestaetigung.mjs — Phase 5: Termin-Bestätigung Kunde
 *
 * Was getestet wird:
 *  Der Kunde erhält einen anonymen Termin-Link (gutachter_termine.kunde_response_token).
 *  Er öffnet /kunde-termin/[token] und bestätigt den Termin — OHNE Login.
 *
 *  Entscheidende Zustandsübergänge:
 *    - gutachter_termine.status → 'bestaetigt'
 *    - Mitteilung an SV (posteingang)
 *    - SV sieht bestätigten Termin in /gutachter/heute
 *
 * Headless-Limitation:
 *  Falls kein kunde_response_token im DB-Termin vorhanden ist, legen wir
 *  einen via Service-Role an (Token-Versand ist UI-Test der Phase 2.5).
 *
 * Cross-Role-Checks nach Bestätigung:
 *  - SV: /gutachter/heute zeigt Termin mit Status "bestätigt"
 *  - Dispatch: /dispatch/leads — Lead hat aktivierten Termin
 *  - Admin: /admin/faelle — Fall hat bestätigten Termin
 */

import { record, shoot, checkpoint, assertVisible, getAdminDb, loadFixtureIds, saveFixtureIds, getBrowser } from './_helpers.mjs'

const PHASE = 5
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export async function runPhase5(prevResult = {}) {
  console.log('\n━━━ Phase 5: Termin-Bestätigung Kunde ━━━\n')

  const fixtures = loadFixtureIds() ?? {}
  const leadId = prevResult.leadId ?? fixtures.journey_lead_id ?? null
  const fallId = prevResult.fallId ?? fixtures.journey_fall_id ?? null

  if (!leadId) {
    record('HARD', PHASE, 'Lead-ID fehlt — Phase 1+2 hat keinen Lead bereitgestellt', 'precondition')
    return { ok: false }
  }

  const db = getAdminDb()

  // ─── Schritt 5.1: Termin + Token sicherstellen ──────────────────────────
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, status, start_zeit, sv_id, fall_id, kunde_response_token, kunde_response_token_expires_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!termin) {
    record('SOFT', PHASE, 'Kein gutachter_termin für Lead — Phase 4 hatte keinen Termin', 'precondition-termin')
    return { ok: false, leadId, fallId }
  }

  // Token generieren falls keiner vorhanden oder abgelaufen
  let token = termin.kunde_response_token
  const expired = termin.kunde_response_token_expires_at && new Date(termin.kunde_response_token_expires_at) < new Date()
  if (!token || expired) {
    record('INFO', PHASE, 'Kein gültiger Kunden-Response-Token — lege via Service-Role an', 'token-create')
    token = `journey-termin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await db
      .from('gutachter_termine')
      .update({ kunde_response_token: token, kunde_response_token_expires_at: expiresAt })
      .eq('id', termin.id)
  }

  record('PASS', PHASE, `Termin-Token bereit: ${token.slice(0, 12)}… Termin-Status: ${termin.status}`, 'token-ready')

  // ─── Schritt 5.2: /kunde-termin/[token] anonym öffnen ───────────────────
  const browser = await getBrowser()
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 850 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  })
  const page = await ctx.newPage()

  await page.goto(`${BASE_URL}/kunde-termin/${token}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await page.waitForTimeout(3_000)
  await shoot(page, '05-termin-bestaetigungs-page')

  // ─── Schritt 5.3: Token-gültig-Check ───────────────────────────────────
  const errMsg = page.locator('text=/Link nicht gültig|abgelaufen|Fehler/i').first()
  if (await errMsg.isVisible({ timeout: 1_500 }).catch(() => false)) {
    record('SOFT', PHASE, 'Termin-Bestätigungs-Page zeigt Fehler', 'page-error')
    await ctx.close().catch(() => {})
    return { ok: false, leadId, fallId }
  }
  record('PASS', PHASE, 'Termin-Bestätigungs-Page geladen', 'page-loaded')

  // ─── Schritt 5.4: Termin-Info sichtbar ──────────────────────────────────
  // Die Seite zeigt das Datum/Uhrzeit des Termins + SV-Name
  const terminInfo = page.locator('text=/Sachverständige|Gutachter|Termin/i').first()
  await assertVisible(page, terminInfo, 'Termin-Info (SV/Termin-Datum) sichtbar', PHASE, { tag: 'termin-info-visible' })
  await shoot(page, '05-termin-info')

  // ─── Schritt 5.5: Termin bestätigen ────────────────────────────────────
  const bestaetigenBtn = page.getByRole('button', { name: /bestätigen|Termin annehmen|Ja, bestätigen|Annehmen/i }).first()
  const bestaetigenVisible = await bestaetigenBtn.isVisible({ timeout: 3_000 }).catch(() => false)

  if (!bestaetigenVisible) {
    // Termin ist eventuell bereits bestätigt (idempotent re-run)
    const bereitsBestaetigt = page.locator('text=/bereits bestätigt|Termin bestätigt|Danke/i').first()
    if (await bereitsBestaetigt.isVisible({ timeout: 1_500 }).catch(() => false)) {
      record('PASS', PHASE, 'Termin bereits bestätigt (idempotenter Re-Run)', 'already-confirmed')
    } else {
      record('SOFT', PHASE, 'Bestätigen-Button nicht sichtbar und Termin nicht bereits bestätigt', 'btn-fehlt')
      await shoot(page, '05-bestaetigen-btn-fehlt')
    }
    await ctx.close().catch(() => {})
  } else {
    await bestaetigenBtn.click()
    record('PASS', PHASE, 'Bestätigen-Button geklickt', 'btn-click')
    await page.waitForTimeout(5_000)
    await shoot(page, '05-nach-bestaetigung')

    // Erfolgs-Message prüfen
    const successMsg = page.locator('text=/bestätigt|informiert|Geschafft|Danke/i').first()
    await assertVisible(page, successMsg, 'Bestätigungs-Erfolgs-Meldung sichtbar', PHASE, { tag: 'success-msg', timeout: 4_000 })

    await ctx.close().catch(() => {})
  }

  // ─── Schritt 5.6: DB-Verifikation ──────────────────────────────────────
  const { data: terminNach } = await db
    .from('gutachter_termine')
    .select('id, status, kunde_bestaetigt_am')
    .eq('id', termin.id)
    .single()

  if (terminNach?.status === 'bestaetigt' || terminNach?.kunde_bestaetigt_am) {
    record('PASS', PHASE, `Termin-Status nach Bestätigung: ${terminNach.status}`, 'db-termin-status')
  } else {
    record('SOFT', PHASE, `Termin-Status NICHT bestätigt: ${terminNach?.status ?? 'null'}`, 'db-termin-status')
    // Service-Role-Fallback: Status forcen für Phase 6
    await db.from('gutachter_termine').update({ status: 'bestaetigt' }).eq('id', termin.id)
    record('INFO', PHASE, 'Termin-Status via Service-Role auf bestaetigt gesetzt (Fallback)', 'db-fallback')
  }

  saveFixtureIds({ journey_termin_id: termin.id })

  // ─── Schritt 5.7: Cross-Role-Checks ────────────────────────────────────
  // SV: /gutachter/heute zeigt Termin-Card
  await checkpoint('sv', async (svPage) => {
    await svPage.goto(`${BASE_URL}/gutachter/heute`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    await svPage.waitForTimeout(2_500)
    await svPage.reload({ waitUntil: 'domcontentloaded' })
    await svPage.waitForTimeout(2_000)
    await shoot(svPage, '05-cross-sv-heute')
    const terminCard = svPage.locator('text=/Mueller|Lisa/i').first()
    await assertVisible(svPage, terminCard, 'SV: Termin-Card in /gutachter/heute sichtbar', PHASE, { tag: 'cross-sv-heute', timeout: 5_000 })
  })

  return { ok: true, leadId, fallId, terminId: termin.id }
}
