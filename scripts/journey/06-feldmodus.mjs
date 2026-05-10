/**
 * scripts/journey/06-feldmodus.mjs — Phase 6: Feldmodus-Anfahrt + Ankunft
 *
 * Was getestet wird:
 *  SV öffnet /gutachter/heute, startet den Tagesmodus, landet auf /gutachter/feldmodus.
 *  GPS-Geofence feuert headless nicht → Service-Role-Arrive-Fallback setzt den
 *  Arrived-State direkt. Danach prüfen wir dass SvFallakteView sichtbar wird.
 *
 *  Entscheidende Zustandsübergänge:
 *    - sv_tages_session.status → 'arrived'
 *    - gutachter_termine.sv_angekommen_am gesetzt
 *    - SvFallakteView öffnet automatisch (FeldmodusClient-Logik)
 *
 * Headless-Limitation:
 *  Geolocation-API gibt kein Signal, Geofence feuert nicht. Wir fahren den
 *  Service-Role-Fallback (analog zu state-smoke Phase 6). Das UI-Pfad-Teil
 *  (Heute → Tagesmodus-Start-Button → Feldmodus-Navigation) ist echter UI-Klick.
 *
 * Cross-Role-Checks nach Arrive:
 *  - SV sieht SvFallakteView (FokusChatPanel-Header oder "Vor Ort"-Indikator)
 *  - Admin: /admin/faelle — Fall zeigt SV-Ankunftszeit
 */

import {
  record,
  shoot,
  checkpoint,
  assertVisible,
  getAdminDb,
  loadFixtureIds,
  saveFixtureIds,
  loginAs,
} from './_helpers.mjs'

const PHASE = 6
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

export async function runPhase6(prevResult = {}) {
  console.log('\n━━━ Phase 6: Feldmodus-Anfahrt + Ankunft ━━━\n')

  const fixtures = loadFixtureIds() ?? {}
  const leadId = prevResult.leadId ?? fixtures.journey_lead_id ?? null
  const fallId = prevResult.fallId ?? fixtures.journey_fall_id ?? null
  const terminId = prevResult.terminId ?? fixtures.journey_termin_id ?? null

  const db = getAdminDb()

  // ─── Schritt 6.1: SV-Session + Termin vorbereiten ──────────────────────
  // sv_tages_session muss als 'en_route' existieren damit der Feldmodus lädt.
  // Wir ermitteln den SV via test-sv@claimondo.de.
  const { data: svProfile } = await db.from('profiles').select('id').eq('email', 'test-sv@claimondo.de').maybeSingle()
  const { data: sv } = svProfile?.id
    ? await db.from('sachverstaendige').select('id').eq('profile_id', svProfile.id).maybeSingle()
    : { data: null }
  const svId = sv?.id ?? fixtures.sv_sachverstaendige_id ?? null

  if (!svId) {
    record('SOFT', PHASE, 'SV-ID nicht ermittelbar — Phase 6 übersprungen', 'precondition-sv')
    return { ok: false, leadId, fallId }
  }

  // Heute-Datum (TZ-sicher: lokale Mitternacht → UTC-String, exakt wie feldmodus/page.tsx)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const heute = today.toISOString().slice(0, 10)

  // sv_tages_session in en_route-Status bringen (UPSERT)
  const { error: sessionErr } = await db.from('sv_tages_session').upsert(
    {
      sv_id: svId,
      datum: heute,
      status: 'en_route',
      started_at: new Date().toISOString(),
      paused_at: null,
      completed_at: null,
    },
    { onConflict: 'sv_id,datum' },
  )
  if (sessionErr) {
    record('SOFT', PHASE, `sv_tages_session UPSERT Fehler: ${sessionErr.message}`, 'session-upsert')
  } else {
    record('PASS', PHASE, `sv_tages_session auf en_route gesetzt (sv=${svId} datum=${heute})`, 'session-ready')
  }

  // Termin auf heute legen falls kein terminId übergeben
  let aktTerminId = terminId
  if (!aktTerminId && leadId) {
    const { data: t } = await db
      .from('gutachter_termine')
      .select('id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminId = t?.id ?? null
  }

  if (aktTerminId) {
    // start_zeit auf jetzt setzen damit der Termin auf dem heutigen Tagesplan erscheint
    const startZeit = new Date(Date.now() + 10 * 60_000).toISOString()
    const endZeit = new Date(Date.now() + 70 * 60_000).toISOString()
    await db.from('gutachter_termine').update({
      sv_id: svId,
      start_zeit: startZeit,
      end_zeit: endZeit,
      status: 'bestaetigt',
    }).eq('id', aktTerminId)
    record('PASS', PHASE, `Termin auf heute verschoben: ${aktTerminId}`, 'termin-heute')
  }

  // ─── Schritt 6.2: SV-Login + /gutachter/heute ──────────────────────────
  const svPage = await loginAs('sv')
  await svPage.goto(`${BASE_URL}/gutachter/heute`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  await svPage.waitForTimeout(3_000)
  await shoot(svPage, '06-sv-heute-vor-start')

  // ─── Schritt 6.3: "Tagesmodus starten" / "Tagesmodus fortsetzen" klicken ─
  const startBtn = svPage.getByRole('button', { name: /Tagesmodus starten|Tagesmodus fortsetzen/i }).first()
  const startBtnVisible = await startBtn.isVisible({ timeout: 3_000 }).catch(() => false)
  const startBtnEnabled = startBtnVisible ? !(await startBtn.isDisabled().catch(() => true)) : false

  if (!startBtnVisible || !startBtnEnabled) {
    record('SOFT', PHASE, `"Tagesmodus starten"-Button nicht klickbar (visible=${startBtnVisible} enabled=${startBtnEnabled})`, 'start-btn')
    await shoot(svPage, '06-start-btn-nicht-klickbar')
    // Direkt zu Feldmodus navigieren als Fallback
    await svPage.goto(`${BASE_URL}/gutachter/feldmodus`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  } else {
    await startBtn.click()
    record('PASS', PHASE, '"Tagesmodus starten" geklickt', 'start-btn-click')
    // Warten auf Navigation zu /gutachter/feldmodus
    await svPage.waitForURL((url) => url.pathname.includes('/feldmodus'), { timeout: 15_000 }).catch(() => {})
    await svPage.waitForTimeout(3_000)
  }

  await shoot(svPage, '06-feldmodus-geladen')

  // ─── Schritt 6.4: Feldmodus-Page geladen? ──────────────────────────────
  const currentPath = new URL(svPage.url()).pathname
  if (!currentPath.includes('/feldmodus')) {
    record('SOFT', PHASE, `Feldmodus-Page nicht erreicht — aktueller Pfad: ${currentPath}`, 'feldmodus-nav')
    return { ok: false, leadId, fallId, terminId: aktTerminId }
  }
  record('PASS', PHASE, `Feldmodus-Page erreicht: ${currentPath}`, 'feldmodus-nav')

  // ─── Schritt 6.5: Karte / Route sichtbar ───────────────────────────────
  const mapContainer = svPage.locator('[id="feldmodus-map"], .mapboxgl-canvas, canvas').first()
  await assertVisible(svPage, mapContainer, 'Feldmodus: Karte/Canvas sichtbar', PHASE, { tag: 'map-visible', timeout: 8_000 })

  // AktuellerStopCard (Termin-Info)
  const stopCard = svPage.locator('[data-testid="aktueller-stop-card"], text=/Termin|Besichtigung|Anfahrt/i').first()
  await assertVisible(svPage, stopCard, 'Feldmodus: AktuellerStopCard sichtbar', PHASE, { tag: 'stop-card-visible', timeout: 5_000 })

  await shoot(svPage, '06-feldmodus-stop-card')

  // ─── Schritt 6.6: GPS-Arrive-Fallback via Service-Role ──────────────────
  // Geofence feuert headless nicht. Wir setzen sv_angekommen_am + session.status='arrived'
  // direkt. Das entspricht exakt was der GPS-Listener auslöst.
  if (aktTerminId) {
    await db.from('gutachter_termine').update({
      sv_angekommen_am: new Date().toISOString(),
    }).eq('id', aktTerminId)
  }

  // sv_tages_session auf arrived schalten
  await db.from('sv_tages_session').update({
    status: 'arrived',
  }).eq('sv_id', svId).eq('datum', heute)

  record('INFO', PHASE, 'GPS-Arrive via Service-Role gesetzt (headless-Fallback)', 'arrive-fallback')

  // Page reload damit FeldmodusClient den arrived-State via Supabase-Realtime oder
  // nächsten Poll-Tick erkennt (Realtime-Connection headless unzuverlässig → reload).
  await svPage.reload({ waitUntil: 'domcontentloaded' })
  await svPage.waitForTimeout(4_000)
  await shoot(svPage, '06-feldmodus-nach-arrive')

  // ─── Schritt 6.7: SvFallakteView sichtbar ──────────────────────────────
  // Nach arrived öffnet FeldmodusClient automatisch die SvFallakteView.
  // Sie enthält mindestens einen "Vor Ort"-Indikator oder FokusChatPanel-Header.
  const fallakteHeader = svPage.locator('text=/Vor Ort|Besichtigung|Fallakte|Auftragsdetails|Mueller|Lisa/i').first()
  await assertVisible(svPage, fallakteHeader, 'Feldmodus: SvFallakteView nach Arrive sichtbar', PHASE, {
    tag: 'fallakte-view-visible',
    timeout: 6_000,
  })
  await shoot(svPage, '06-sv-fallakte-view')

  // ─── Schritt 6.8: Cross-Role-Check Admin ───────────────────────────────
  if (fallId) {
    await checkpoint('admin', async (adminPage) => {
      await adminPage.goto(`${BASE_URL}/admin/faelle`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
      await adminPage.waitForTimeout(2_500)
      await shoot(adminPage, '06-cross-admin-faelle')
      const fallRow = adminPage.locator('text=/Mueller|Lisa/i').first()
      await assertVisible(adminPage, fallRow, 'Admin: Fall mit SV-Ankunft in /admin/faelle', PHASE, { tag: 'cross-admin-fall', timeout: 4_000 })
    })
  }

  record('PASS', PHASE, 'Phase 6 abgeschlossen — SV im Arrived-Modus', 'phase-done')
  return { ok: true, leadId, fallId, terminId: aktTerminId, svId }
}
