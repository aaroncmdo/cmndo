/**
 * scripts/smoke/phases/phase-3-sv-akzept.mjs — Phase 3: SV nimmt Auftrag an
 *
 * Was getestet wird:
 *  SV loggt sich ein, navigiert zur /gutachter/auftraege-Liste,
 *  findet den Auftrag (gutachter_termin mit status='reserviert'),
 *  navigiert zur Detail-View, macht Screenshots.
 *  Da das Dispatch-Flow direkt gutachter_termine anlegt (nicht auftraege),
 *  ist "Annehmen" hier das Bestätigen des reservierten Termins via
 *  Service-Role (bis UI-Flow für Phase-3 vollständig ist).
 *
 * Architektur-Hinweis:
 *  - Das Dispatch-Flow (Phase 2) legt einen gutachter_termin mit status='reserviert' an
 *  - Die SV-Seite zeigt diesen in /gutachter/auftraege (Termin-Cards) an
 *  - "Auftrag annehmen" im Smoke = Termin von 'reserviert' auf 'bestaetigt' setzen
 *  - Im echten Produkt: via SA + FlowLink-Unterschrift → terminBestaetigen()
 *  - Für Phase 3 Smoke: Service-Role-Update als Forward-Progress-Fallback
 *
 * DB-Checks:
 *  - gutachter_termine.status → 'bestaetigt'
 *  - mitteilungen für dispatch + admin (termin.bestaetigt Event)
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

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * @param {import('playwright').BrowserContext} svContext
 * @param {{ auftragId: string|null, notes: string[] }} phase2Result
 * @returns {{ phase: 3, result: 'pass'|'soft'|'hard', notes: string[], auftragId: string|null }}
 */
export async function runPhase3(svContext, phase2Result) {
  const notes = []
  let result = 'pass'
  let page = null
  let terminId = null

  logPhase(3, '=== Phase 3: SV nimmt Auftrag an ===')

  const db = getServiceDb()
  const fixtures = loadFixtureIds()
  const leadId = fixtures?.lead_direkt_id ?? null

  // --- Pre-Condition: Existiert ein Termin für den Lead? ------------------
  if (leadId) {
    const { data: termine } = await db
      .from('gutachter_termine')
      .select('id, status, sv_id, lead_id, start_zeit, auftrag_id')
      .eq('lead_id', leadId)
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (termine && termine.length > 0) {
      terminId = termine[0].id
      logPhase(3, `Termin gefunden: ID=${terminId}, status=${termine[0].status}`)
    } else {
      const msg = 'Kein aktiver Termin für Lead gefunden — Phase 2 hat möglicherweise keinen Termin angelegt'
      logSoft(3, msg)
      notes.push(`SOFT: ${msg} — gutachter_termine für lead_id=${leadId} leer`)
      result = 'soft'
    }
  } else {
    notes.push('SOFT: Keine Fixture-IDs verfügbar — terminId unbekannt')
    result = 'soft'
  }

  // --- Login als test-sv@claimondo.de -------------------------------------
  logPhase(3, 'Login als test-sv@claimondo.de')
  try {
    page = await loginAs(svContext, 'test-sv@claimondo.de', 'Test1234!', BASE_URL)
  } catch (err) {
    const msg = `Login als test-sv fehlgeschlagen: ${err.message}`
    logHard(3, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 3, result: 'hard', notes, auftragId: null }
  }
  logPhase(3, `Nach Login URL: ${page.url()}`)

  if (page.url().includes('/login')) {
    const msg = 'SV-Login fehlgeschlagen — URL ist /login'
    logHard(3, msg)
    notes.push(`HARD: ${msg} — test-sv@claimondo.de muss rolle='sachverstaendiger' haben + Test1234! + force_password_change=false`)
    await page.close().catch(() => {})
    return { phase: 3, result: 'hard', notes, auftragId: null }
  }

  try {
    // --- Schritt 3a: Heute-Hub aufrufen ------------------------------------
    logPhase(3, 'Navigiere zu /gutachter/heute')
    await gotoAndShoot(page, `${BASE_URL}/gutachter/heute`, 'sv-heute-hub')

    // --- Schritt 3b: Mitteilungen prüfen -----------------------------------
    logPhase(3, 'Navigiere zu /gutachter/mitteilungen (Inbox)')
    await gotoAndShoot(page, `${BASE_URL}/gutachter/mitteilungen`, 'sv-mitteilungen')

    // --- Schritt 3c: Aufträge-Liste aufrufen -------------------------------
    logPhase(3, 'Navigiere zu /gutachter/auftraege')
    await gotoAndShoot(page, `${BASE_URL}/gutachter/auftraege`, 'sv-auftraege-liste')

    // Auftrag-Card in der Liste suchen
    if (terminId) {
      const auftragLink = page.locator(`a[href*="${terminId}"]`).first()
      if (await auftragLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        logPhase(3, 'Auftrag-Link in Liste gefunden — klicke')
        await clickAndShoot(page, auftragLink, 'sv-auftrag-oeffnen')
      } else {
        // Termin-Detail direkt navigieren — Auftraege-Seite zeigt evtl. andere URL-Struktur
        logSoft(3, `Auftrag-Link für Termin ${terminId} nicht in Liste — navigiere direkt`)
        notes.push(`SOFT: Termin-Card in /gutachter/auftraege nicht sichtbar — möglicherweise pre-FlowLink-Termin ohne Fall. Prüfe AuftragCard.tsx Sichtbarkeits-Logik.`)
        result = result === 'hard' ? 'hard' : 'soft'
      }

      // Navigiere zur Termin-Detail-Seite (falls vorhanden)
      logPhase(3, `Navigiere zu /gutachter/termine/${terminId}`)
      await gotoAndShoot(page, `${BASE_URL}/gutachter/termine/${terminId}`, 'sv-termin-detail')

      // Screenshot-Check: Seite soll Termin-Infos zeigen
      const currentUrl = page.url()
      if (currentUrl.includes('/gutachter/termine') && !currentUrl.endsWith('/gutachter/termine')) {
        logPhase(3, `Termin-Detail-Seite geladen: ${currentUrl}`)
      } else {
        logSoft(3, `Redirect von Termin-Detail: ${currentUrl} — Termin gehört möglicherweise anderem SV oder hat no Fall`)
        notes.push(`SOFT: /gutachter/termine/${terminId} redirectet nach ${currentUrl} — Seite prüft sv_id + typ='sv_begutachtung'. Falls Termin kein 'typ'-Feld hat, schlägt .single() fehl → redirect to /gutachter/termine`)
        result = result === 'hard' ? 'hard' : 'soft'
      }
    }

    // --- Schritt 3d: "Auftrag annehmen" = Termin bestätigen ---------------
    // Im aktuellen Dispatch-Flow gibt es keinen dedizierten "Auftrag annehmen"-Button
    // für reservierte Termine im SV-Portal. Das Bestätigen passiert via:
    // a) SA-Unterschrift (FlowLink) → automatisch → terminBestaetigen()
    // b) Direkte Bestätigung im SV-Fall-Detail (wenn fall_id vorhanden)
    // c) Für Phase 3 Smoke: Service-Role-Update als Fallback
    logPhase(3, 'FALLBACK: Termin via Service-Role auf bestaetigt setzen (SV-Akzeptanz simuliert)')

    if (terminId) {
      const { error: updateErr } = await db
        .from('gutachter_termine')
        .update({ status: 'bestaetigt' })
        .eq('id', terminId)
        .eq('status', 'reserviert') // nur wenn noch reserviert

      if (updateErr) {
        const msg = `Termin-Update auf bestaetigt fehlgeschlagen: ${updateErr.message}`
        logSoft(3, msg)
        notes.push(`SOFT: ${msg} — Termin ID=${terminId}`)
        result = result === 'hard' ? 'hard' : 'soft'
      } else {
        logPhase(3, `Termin ${terminId} auf 'bestaetigt' gesetzt (Service-Role)`)
        notes.push(`SOFT: Termin via Service-Role auf 'bestaetigt' gesetzt — kein UI-"Auftrag annehmen"-Button gefunden. Hintergrund: Dispatch-Flow legt gutachter_termine direkt an (kein auftraege-Row). SV-Akzeptanz in Produktion via SA-Unterschrift + terminBestaetigen().`)
      }

      // Screenshot nach Service-Role-Update
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {})
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? '.'}/sv-termin-nach-bestaetigung.png`,
      }).catch(() => {})
    }

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 3: ${err.message}`
    logHard(3, msg)
    notes.push(`HARD: ${msg}`)
    if (page) await page.close().catch(() => {})
    return { phase: 3, result: 'hard', notes, auftragId: null }
  } finally {
    if (page) await page.close().catch(() => {})
  }

  // --- DB-Asserts --------------------------------------------------------
  if (terminId) {
    const dbAssert = await assertDb({
      table: 'gutachter_termine',
      where: { id: terminId, status: 'bestaetigt' },
      expect: { count: 1 },
    })
    if (!dbAssert.ok) {
      logSoft(3, dbAssert.msg)
      notes.push(`SOFT: DB-Assert gutachter_termine.status=bestaetigt fehlgeschlagen: ${dbAssert.msg}`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(3, `DB-Assert OK: Termin ${terminId} status=bestaetigt`)
    }
  }

  // Mitteilungs-Assert: dispatch + admin sollen Mitteilung bekommen
  logPhase(3, 'Mitteilungs-Assert: dispatch + admin für termin.bestaetigt')
  const { data: dispatchProfiles } = await db
    .from('profiles')
    .select('id')
    .eq('email', 'test-dispatch@claimondo.de')
    .limit(1)

  if (dispatchProfiles && dispatchProfiles.length > 0) {
    const mitteilungResult = await waitForMitteilung({
      empfaenger_id: dispatchProfiles[0].id,
      timeoutMs: 5000,
    })
    if (!mitteilungResult.ok) {
      notes.push(`SOFT: Mitteilung für dispatch nicht gefunden — ${mitteilungResult.msg} — emit.ts: auftrag.akzeptiert oder termin.bestaetigt fehlt`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(3, `Mitteilung für dispatch gefunden: ${mitteilungResult.msg}`)
    }
  }

  logPhase(3, `Phase 3 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 3, result, notes, auftragId: terminId }
}
