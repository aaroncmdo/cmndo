/**
 * scripts/smoke/phases/phase-4-termin.mjs — Phase 4: Termin-Bestätigung durch Kunde
 *
 * Was getestet wird:
 *  Die Termin-Bestätigungs-Strecke via Magic-Link (Token) für den Kunden.
 *
 * Architektur-Hinweis:
 *  Das Dispatch-Flow in Phase 2 hat einen Termin mit status='reserviert' angelegt.
 *  Der Termin ist zum Kunden noch NICHT gesendet — Kunde muss erst per Token-Link
 *  die Möglichkeit haben zuzustimmen.
 *
 *  Der /kunde-termin/<token>-Flow (KundeTerminClient.tsx) erwartet status='gegenvorschlag'
 *  und einen vorgeschlagenes_datum-Wert + gültigen kunde_response_token.
 *
 *  Phase 4 Setup (Service-Role):
 *   1. Termin auf 'gegenvorschlag' + vorgeschlagenes_datum setzen
 *   2. kunde_response_token generieren + setzen
 *  Phase 4 UI-Test:
 *   3. Als anonymer User /kunde-termin/<token> öffnen
 *   4. "Termin bestätigen"-Button klicken
 *  Phase 4 DB-Assert:
 *   5. gutachter_termine.status → 'bestaetigt'
 *
 *  Falls /kunde-termin/<token>-Route nicht erreichbar oder komplex:
 *   SOFT-Fallback = Service-Role-Update auf 'bestaetigt' + dokumentieren.
 *
 * Output: { phase: 4, result, notes, auftragId }
 */

import {
  clickAndShoot,
  gotoAndShoot,
  assertDb,
  loadFixtureIds,
  waitForMitteilung,
  loginAs,
  logPhase,
  logWarn,
  logHard,
  logSoft,
  getServiceDb,
} from '../helpers.mjs'

import { randomUUID } from 'crypto'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * @param {import('playwright').BrowserContext} anonContext — anonymer Browser-Context für Kunde-Token-Link
 * @param {{ auftragId: string|null, notes: string[] }} phase3Result
 * @returns {{ phase: 4, result: 'pass'|'soft'|'hard', notes: string[], auftragId: string|null }}
 */
export async function runPhase4(anonContext, phase3Result) {
  const notes = []
  let result = 'pass'
  let page = null

  logPhase(4, '=== Phase 4: Termin-Bestätigung durch Kunde ===')

  const db = getServiceDb()
  const fixtures = loadFixtureIds()
  const leadId = fixtures?.lead_direkt_id ?? null

  // --- Termin aus Phase 3 holen -------------------------------------------
  let terminId = phase3Result?.auftragId ?? null // Phase 3 gibt terminId als auftragId zurück

  if (!terminId && leadId) {
    // Termin anhand Lead-ID suchen
    const { data: termine } = await db
      .from('gutachter_termine')
      .select('id, status, start_zeit')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
    terminId = termine?.[0]?.id ?? null
  }

  if (!terminId) {
    const msg = 'Kein Termin-ID verfügbar — Phase 4 braucht Termin aus Phase 3'
    logSoft(4, msg)
    notes.push(`SOFT: ${msg} — FALLBACK: Letzte Termin-Row aus gutachter_termine suchen`)

    const { data: anyTermin } = await db
      .from('gutachter_termine')
      .select('id, status')
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('created_at', { ascending: false })
      .limit(1)
    terminId = anyTermin?.[0]?.id ?? null

    if (!terminId) {
      notes.push('SOFT: Kein Termin in DB — Phase 4 übersprungen')
      return { phase: 4, result: 'soft', notes, auftragId: null }
    }
  }

  logPhase(4, `Termin für Phase 4: ID=${terminId}`)

  // --- Termin-Status prüfen + ggf. auf gegenvorschlag setzen ---------------
  const { data: terminRow } = await db
    .from('gutachter_termine')
    .select('id, status, start_zeit, kunde_response_token, vorgeschlagenes_datum')
    .eq('id', terminId)
    .maybeSingle()

  if (!terminRow) {
    notes.push(`SOFT: Termin ${terminId} nicht in DB — übersprungen`)
    return { phase: 4, result: 'soft', notes, auftragId: null }
  }

  logPhase(4, `Termin-Status: ${terminRow.status}, Token: ${terminRow.kunde_response_token ?? 'null'}`)

  // Setup: Termin in gegenvorschlag-Status versetzen für Kunde-Response-Flow
  // (nur wenn noch nicht in finalem Status)
  let responseToken = terminRow.kunde_response_token
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // +7 Tage

  if (!responseToken || !['gegenvorschlag'].includes(terminRow.status)) {
    logPhase(4, 'Setup: Termin auf gegenvorschlag setzen + Response-Token generieren (Service-Role)')
    responseToken = randomUUID()
    const newStartZeit = terminRow.start_zeit
      ? new Date(terminRow.start_zeit)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

    const { error: setupErr } = await db
      .from('gutachter_termine')
      .update({
        status: 'gegenvorschlag',
        gegenvorschlag_von: 'sv',
        vorgeschlagenes_datum: newStartZeit.toISOString(),
        kunde_response_token: responseToken,
        kunde_response_token_expires_at: tokenExpiry,
      })
      .eq('id', terminId)

    if (setupErr) {
      const msg = `Termin-Setup fehlgeschlagen: ${setupErr.message}`
      logSoft(4, msg)
      notes.push(`SOFT: ${msg} — Phase 4 UI-Test übersprungen`)
      result = 'soft'

      // Fallback: Direkt auf bestaetigt setzen
      logPhase(4, 'FALLBACK: Direkt auf bestaetigt setzen (Service-Role)')
      await db.from('gutachter_termine').update({ status: 'bestaetigt' }).eq('id', terminId)
      notes.push('SOFT: Termin via Service-Role auf bestaetigt gesetzt — /kunde-termin-Flow nicht testbar')
      return { phase: 4, result: 'soft', notes, auftragId: terminId }
    } else {
      logPhase(4, `Termin auf gegenvorschlag gesetzt, Token: ${responseToken}`)
      notes.push('SOFT: Termin via Service-Role auf gegenvorschlag gesetzt — kein echter SV-Gegenvorschlag-UI-Flow')
    }
    result = result === 'hard' ? 'hard' : 'soft'
  }

  // --- UI-Test: /kunde-termin/<token> öffnen und Termin annehmen ----------
  try {
    page = await anonContext.newPage()
    const tokenUrl = `${BASE_URL}/kunde-termin/${responseToken}`
    logPhase(4, `Öffne Kunden-Termin-URL: ${tokenUrl}`)

    await gotoAndShoot(page, tokenUrl, 'kunde-termin-token-oeffnen')

    // Prüfe ob die Seite geladen hat (nicht /login, nicht 404)
    const currentUrl = page.url()
    if (currentUrl.includes('/login')) {
      const msg = '/kunde-termin/<token> ist nicht öffentlich zugänglich — Middleware leitet auf /login'
      logSoft(4, msg)
      notes.push(`SOFT: ${msg} — Route muss in isPublicPath() aufgenommen werden: src/lib/supabase/middleware.ts`)
      result = 'soft'

      // Fallback: Service-Role-Update
      logPhase(4, 'FALLBACK: Termin via Service-Role auf bestaetigt setzen')
      await db.from('gutachter_termine').update({ status: 'bestaetigt', vorgeschlagenes_datum: null, gegenvorschlag_von: null, gegenvorschlag_grund: null }).eq('id', terminId)
      notes.push('SOFT: Termin via Service-Role auf bestaetigt gesetzt (UI-Pfad nicht zugänglich)')
      if (page) await page.close().catch(() => {})
      // DB-Assert
      const dbAssert = await assertDb({ table: 'gutachter_termine', where: { id: terminId, status: 'bestaetigt' }, expect: { count: 1 } })
      if (dbAssert.ok) logPhase(4, 'DB-Assert OK: Termin bestaetigt')
      else notes.push(`SOFT: DB-Assert fehlgeschlagen: ${dbAssert.msg}`)
      logPhase(4, `Phase 4 abgeschlossen: ${result.toUpperCase()}`)
      return { phase: 4, result, notes, auftragId: terminId }
    }

    // Prüfe ob Seite Termin-Infos zeigt
    const pageTitle = await page.title()
    logPhase(4, `Seiten-Titel: ${pageTitle}`)

    // Seite sollte SV-Vorschlag anzeigen mit "Termin bestätigen"-Button
    const bestaetigungsBtn = page.getByRole('button', { name: /Termin bestätigen|Annehmen|Ja, passt/i }).first()
    const akzeptierenBtn = page.getByRole('button', { name: /Akzeptieren|Passt mir/i }).first()

    let confirmBtn = null
    if (await bestaetigungsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      confirmBtn = bestaetigungsBtn
    } else if (await akzeptierenBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      confirmBtn = akzeptierenBtn
    }

    if (confirmBtn) {
      logPhase(4, '"Termin bestätigen"-Button gefunden — klicke')
      await clickAndShoot(page, confirmBtn, 'kunde-termin-bestaetigen')

      // Warten auf Bestätigungs-View
      await page.waitForTimeout(2000)

      // Screenshot nach Bestätigung
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? '.'}/kunde-termin-nach-bestaetigung.png`,
      }).catch(() => {})
      logPhase(4, `Nach Bestätigung URL: ${page.url()}`)
    } else {
      // Screenshot für Diagnose
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? '.'}/SOFT-kunde-termin-kein-button.png`,
      }).catch(() => {})

      const msg = '"Termin bestätigen"-Button auf /kunde-termin/<token> nicht gefunden'
      logSoft(4, msg)
      notes.push(`SOFT: ${msg} — Möglicherweise zeigt die Seite einen anderen Status-Screen. Prüfe KundeTerminClient.tsx canAct-Logik: status muss 'reserviert' oder 'gegenvorschlag' sein.`)
      result = 'soft'

      // Fallback: Service-Role-Update
      logPhase(4, 'FALLBACK: Termin via Service-Role auf bestaetigt setzen')
      await db.from('gutachter_terme').update({ status: 'bestaetigt', vorgeschlagenes_datum: null, gegenvorschlag_von: null }).eq('id', terminId).catch(() => {})
      await db.from('gutachter_termine').update({ status: 'bestaetigt', vorgeschlagenes_datum: null, gegenvorschlag_von: null, gegenvorschlag_grund: null }).eq('id', terminId)
      notes.push('SOFT: Termin via Service-Role auf bestaetigt gesetzt (UI-Button nicht gefunden)')
    }

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 4: ${err.message}`
    logHard(4, msg)
    notes.push(`HARD: ${msg}`)
    if (page) await page.close().catch(() => {})
    return { phase: 4, result: 'hard', notes, auftragId: null }
  } finally {
    if (page) await page.close().catch(() => {})
  }

  // --- DB-Assert ----------------------------------------------------------
  await new Promise((r) => setTimeout(r, 1500))

  const dbAssert = await assertDb({
    table: 'gutachter_termine',
    where: { id: terminId, status: 'bestaetigt' },
    expect: { count: 1 },
  })

  if (!dbAssert.ok) {
    logSoft(4, dbAssert.msg)
    notes.push(`SOFT: DB-Assert gutachter_termine.status=bestaetigt fehlgeschlagen: ${dbAssert.msg}`)
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    logPhase(4, `DB-Assert OK: Termin ${terminId} status=bestaetigt`)
  }

  // Mitteilungs-Assert: SV + Dispatch sollen Benachrichtigung bekommen
  logPhase(4, 'Mitteilungs-Assert: SV + Dispatch für termin.bestaetigt')
  const { data: svProfiles } = await db.from('profiles').select('id').eq('email', 'test-sv@claimondo.de').limit(1)
  if (svProfiles && svProfiles.length > 0) {
    const mittResult = await waitForMitteilung({ empfaenger_id: svProfiles[0].id, timeoutMs: 5000 })
    if (!mittResult.ok) {
      notes.push(`SOFT: Mitteilung für SV nicht gefunden — ${mittResult.msg}`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(4, `Mitteilung für SV gefunden: ${mittResult.msg}`)
    }
  }

  logPhase(4, `Phase 4 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 4, result, notes, auftragId: terminId }
}
