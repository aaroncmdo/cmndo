/**
 * scripts/smoke/phases/phase-6-feldmodus.mjs — Phase 6: Feldmodus + Anfahrt
 *
 * Was getestet wird:
 *  Der SV klickt „Tagesmodus starten" auf /gutachter/heute und wechselt in
 *  /gutachter/feldmodus. GPS wird per Playwright gemockt. Fünf Wegpunkte
 *  interpolieren von Mediapark Köln (SV-Origin) zur Termin-Adresse Köln-
 *  Innenstadt. Pro Wegpunkt: 4s warten + Pre/Post-Screenshot. Bei < 50m
 *  Geofence-Annäherung reagiert das UI automatisch (sv_angekommen_am wird
 *  gesetzt) — kein manueller Button nötig. Als Fallback (falls auto-arrive
 *  nicht feuert) gibt es einen manuellen Trigger im Smoke.
 *
 *  DB-Checks danach:
 *   - gutachter_termine.sv_angekommen_am ist gesetzt
 *   - faelle.status = 'besichtigung' (oder äquivalent)
 *   - mitteilungen für Kunde + Admin mit sv.angekommen-Event
 *
 * Selektoren-Status:
 *   - NaviHud: Kein data-testid. Prüfung über CSS-Klasse oder Text-Inhalt
 *     'Unterwegs' im FokusHeader (FokusHeader.tsx:41).
 *   - Mapbox-Canvas: '.mapboxgl-canvas' — stabil
 *   - Phase-Header-Status 'Vor Ort': text 'Vor Ort' in FokusHeader
 *     (FokusHeader.tsx:44)
 *   - Bottom-Sheet Toggle: 'button[aria-label="Stops einklappen"]' aus
 *     screenshot-feldmodus.mjs:167
 *   - AktuellerStopCard Status-Hinweis: 'Ankunft wird gleich bestätigt'
 *     (AktuellerStopCard.tsx:263) — erscheint wenn im Geofence
 *
 * Annahmen:
 *   - page aus Phase 5 wird übergeben (SV ist bereits auf /gutachter/heute
 *     und eingeloggt). Falls nicht: neuer Login.
 *   - svContext hat bereits geolocation granted (Phase 5 setzt das).
 *   - Der Termin-Besichtigungsort ist auf Köln-Innenstadt-Koords geseedet
 *     (lat: 50.9375, lng: 6.9603) — bei Abweichung muss Seed angepasst werden.
 *   - sv_tages_session wird durch startOrResumeTagesSession (Server-Action)
 *     beim Klick auf den CTA angelegt — nicht durch diesen Smoke.
 */

import {
  clickAndShoot,
  gotoAndShoot,
  assertDb,
  loadFixtureIds,
  loginAs,
  logPhase,
  logWarn,
  logHard,
  logSoft,
  getServiceDb,
  mockGpsRoute,
  waitForMitteilung,
} from '../helpers.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// GPS-Wegpunkte: Mediapark → Köln-Innenstadt (5 Punkte inkl. Start + Ziel)
// Ziel-Koords müssen zum geseedeten Termin passen — Smoke-Default Köln-Zentrum.
const GPS_ROUTE = [
  { lat: 50.9522, lng: 6.9430 },   // Start: Mediapark
  { lat: 50.9490, lng: 6.9480 },   // Zwischenpunkt 1
  { lat: 50.9450, lng: 6.9530 },   // Zwischenpunkt 2
  { lat: 50.9410, lng: 6.9570 },   // Zwischenpunkt 3
  { lat: 50.9375, lng: 6.9603 },   // Ankunft: Köln-Innenstadt (Termin-Adresse)
]

// Geofence-Radius des Systems: 50 m (AktuellerStopCard.tsx:269)
// Für den Smoke setzen wir den letzten GPS-Punkt identisch zu den Termin-Koords.
const GEOFENCE_PUNKT = { lat: 50.9375, lng: 6.9603 }

/**
 * Haupt-Funktion Phase 6.
 *
 * @param {import('playwright').BrowserContext} svContext
 * @param {{ notes: string[] }} reportRef
 * @param {{ svPage?: import('playwright').Page; terminId?: string }} phase5Result
 * @returns {{ phase: 6, result: 'pass'|'soft'|'hard', notes: string[], svPage: import('playwright').Page|null }}
 */
export async function runPhase6(svContext, reportRef = { notes: [] }, phase5Result = {}) {
  const notes = reportRef.notes
  let result = 'pass'
  let page = phase5Result.svPage ?? null

  logPhase(6, '=== Phase 6: Feldmodus + Anfahrt ===')

  const fixtures = loadFixtureIds()
  const terminId = phase5Result.terminId ?? fixtures?.termin_id ?? null
  const fallId = fixtures?.fall_id ?? null
  const svUserId = fixtures?.sv_user_id ?? null

  if (!terminId) {
    notes.push('SOFT: terminId nicht bekannt — DB-Asserts nach Ankunft nur teilweise möglich')
    result = 'soft'
  }

  try {
    // Falls Phase 5 keine funktionierende Page zurückgegeben hat: neu einloggen
    if (!page || page.isClosed()) {
      logPhase(6, 'Kein Page-Handle aus Phase 5 — neuer Login')
      page = await loginAs(svContext, 'test-sv@claimondo.de', 'Test1234!', BASE_URL)
      await gotoAndShoot(page, `${BASE_URL}/gutachter/heute`, 'heute-hub-p6-recovery')
      await page.waitForTimeout(4_000)
    } else {
      logPhase(6, 'Page-Handle aus Phase 5 übernommen')
    }

    // Sicherstellen dass wir auf /gutachter/heute sind
    if (!page.url().includes('/gutachter/heute')) {
      logPhase(6, `Aktuelle URL: ${page.url()} — navigiere zu /gutachter/heute`)
      await gotoAndShoot(page, `${BASE_URL}/gutachter/heute`, 'heute-hub-p6-nav')
      await page.waitForTimeout(4_000)
    }

    // --- Klick: „Tagesmodus starten" → /gutachter/feldmodus ---------------
    logPhase(6, 'Suche „Tagesmodus starten"-CTA')
    const triggerSelektoren = [
      page.getByRole('button', { name: /Tagesmodus (starten|fortsetzen)/i }).first(),
      page.locator('button').filter({ hasText: /Tagesmodus/i }).first(),
      page.locator('text=Feldmodus starten').first(),
      page.locator('text=Tagesroute starten').first(),
      page.locator('a[href="/gutachter/feldmodus"]').first(),
    ]

    let ctaGeklickt = false
    for (const sel of triggerSelektoren) {
      if (await sel.isVisible({ timeout: 2000 }).catch(() => false)) {
        logPhase(6, 'CTA gefunden — klicke')
        await clickAndShoot(page, sel, 'tagesmodus-starten')
        ctaGeklickt = true
        break
      }
    }

    if (!ctaGeklickt) {
      logWarn(6, 'Tagesmodus-CTA nicht gefunden — navigiere direkt zu /gutachter/feldmodus')
      notes.push('SOFT: Tagesmodus-CTA nicht gefunden — direkte Navigation als Fallback (Session muss existieren)')
      result = result === 'hard' ? 'hard' : 'soft'
      await gotoAndShoot(page, `${BASE_URL}/gutachter/feldmodus`, 'feldmodus-direkt')
    }

    // Warten auf /gutachter/feldmodus
    await page.waitForURL((url) => url.pathname.includes('/gutachter/feldmodus'), { timeout: 15_000 }).catch(() => {
      logWarn(6, 'Redirect auf /gutachter/feldmodus ausgeblieben')
    })
    logPhase(6, `Aktuelle URL: ${page.url()}`)

    if (!page.url().includes('/gutachter/feldmodus')) {
      const msg = '/gutachter/feldmodus nicht erreicht — Server-Action startOrResumeTagesSession fehlgeschlagen?'
      logHard(6, msg)
      notes.push(`HARD: ${msg}`)
      return { phase: 6, result: 'hard', notes, svPage: page }
    }

    // --- Feldmodus loaded: NaviHud + Mapbox-Canvas -------------------------
    logPhase(6, 'Warte auf Mapbox-Canvas im Feldmodus')
    const mapVisible = await page.waitForFunction(
      () => {
        const c = document.querySelector('.mapboxgl-canvas')
        if (!c) return false
        const rect = c.getBoundingClientRect()
        return rect.width > 100 && rect.height > 100
      },
      { timeout: 30_000 },
    ).then(() => true).catch(() => false)

    if (!mapVisible) {
      const msg = 'Mapbox-Canvas im Feldmodus nicht sichtbar nach 30s'
      logSoft(6, msg)
      notes.push(`SOFT: ${msg} — src/app/gutachter/feldmodus/FeldmodusMap.tsx`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(6, 'Mapbox-Canvas im Feldmodus sichtbar')
    }

    // Warte 2.5s auf Tile-Load + NaviHud-Init
    await page.waitForTimeout(2_500)

    // Screenshot: Feldmodus Initialzustand
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/feldmodus-start.png`,
      fullPage: false,
    }).catch(() => {})

    // Bottom-Sheet einklappen (Mobile) damit Map sichtbar ist
    const collapseBtn = page.locator('button[aria-label="Stops einklappen"]').first()
    if (await collapseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await collapseBtn.click().catch(() => {})
      await page.waitForTimeout(700)
      logPhase(6, 'Mobile-Bottom-Sheet eingeklappt')
    }

    // FokusHeader-Status prüfen: sollte 'Unterwegs' oder 'Bereit' zeigen
    const statusBadge = page.locator('span').filter({ hasText: /Unterwegs|Bereit|Vor Ort/i }).first()
    const statusText = await statusBadge.textContent().catch(() => '?')
    logPhase(6, `FokusHeader-Status: ${statusText}`)

    // --- GPS-Simulation: 5 Wegpunkte ------------------------------------
    logPhase(6, 'Starte GPS-Simulation (5 Wegpunkte)')
    await mockGpsRoute(svContext, GPS_ROUTE, 4_000)

    // Nach jedem Wegpunkt: Screenshot + kurze Pause (mockGpsRoute liefert
    // bereits Wartezeiten — hier nochmal 1s für Render-Stabilisierung)
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/feldmodus-gps-strecke.png`,
      fullPage: false,
    }).catch(() => {})

    // --- Geofence-Annäherung (< 50m) ----------------------------------------
    logPhase(6, 'Setze GPS auf Geofence-Punkt (Ankunft)')
    await svContext.setGeolocation({ latitude: GEOFENCE_PUNKT.lat, longitude: GEOFENCE_PUNKT.lng, accuracy: 5 })

    // Warte auf Auto-Arrive: AktuellerStopCard.tsx löst über Realtime-Sub aus.
    // Das System setzt sv_angekommen_am + besichtigung_gestartet_am → sessionStatus='arrived'
    // Wir warten bis UI auf 'Vor Ort' wechselt (max 15s)
    logPhase(6, 'Warte auf Geofence-Trigger (Auto-Arrive, max 15s)')
    await page.waitForTimeout(2_000) // initialer Render-Delay

    const vorOrtStatus = page.locator('span').filter({ hasText: /Vor Ort/i }).first()
    const arrivedAuto = await vorOrtStatus.isVisible({ timeout: 12_000 }).catch(() => false)

    if (arrivedAuto) {
      logPhase(6, 'Auto-Arrive erfolgt — FokusHeader zeigt "Vor Ort"')
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/feldmodus-angekommen.png`,
        fullPage: false,
      }).catch(() => {})
    } else {
      logWarn(6, 'Auto-Arrive nicht erkannt — prüfe ob GPS-Permission erteilt + 50m-Geofence korrekt')
      notes.push('SOFT: Auto-Arrive (Geofence 50m) nicht ausgelöst — AktuellerStopCard.tsx:183 prüfen; GPS-Mock möglicherweise kein useWatchPosition-Event gefeuert')
      result = result === 'hard' ? 'hard' : 'soft'

      // Manuelle Fallback-Überprüfung: suche nach "Ankunft wird gleich bestätigt"
      const ankunftHinweis = page.locator('div').filter({ hasText: /Ankunft wird gleich bestätigt/i }).first()
      if (await ankunftHinweis.isVisible({ timeout: 3000 }).catch(() => false)) {
        logPhase(6, 'Geofence-Hinweis "Ankunft wird gleich bestätigt" sichtbar — Geofence erreicht, Auto-Arrive läuft')
      }

      // Warte nochmal 5s — manchmal dauert der Realtime-Sub
      await page.waitForTimeout(5_000)

      // 2026-05-08: Service-Role-Forced-Arrive damit Phase 7+8 die SvFallakte-
      // View und den BesichtigungAbschliessenButton sehen. Die Smoke-Pipeline
      // testet weiterhin den UI-Pfad oben (auto-arrive); wenn das fehlschlägt
      // (typisch headless ohne useWatchPosition-Permission-Events), zwingen
      // wir die DB+Session-Zustände damit die Cascade nicht alle Folgephasen
      // verfälscht.
      const dbForce = getServiceDb()
      if (terminId) {
        const nowIso = new Date().toISOString()
        await dbForce.from('gutachter_termine').update({
          sv_angekommen_am: nowIso,
          besichtigung_gestartet_am: nowIso,
        }).eq('id', terminId)
      }
      // sessionStatus auf arrived setzen
      const todaySession = new Date()
      todaySession.setHours(0, 0, 0, 0)
      const datum = todaySession.toISOString().slice(0, 10)
      const svId = (loadFixtureIds() ?? {}).sv_sachverstaendige_id
      if (svId) {
        await dbForce.from('sv_tages_session')
          .update({ status: 'arrived', aktueller_termin_id: terminId })
          .eq('sv_id', svId).eq('datum', datum)
      }
      logPhase(6, 'Forced-Arrive via Service-Role gesetzt (Workaround für headless GPS)')
      // Page neu laden damit Server-Components den neuen Zustand rendern
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(2_000)
    }

    // Screenshot nach Arrive
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/feldmodus-arrived-state.png`,
      fullPage: false,
    }).catch(() => {})

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 6: ${err.message}`
    logHard(6, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 6, result: 'hard', notes, svPage: page }
  }

  // --- DB-Asserts nach Ankunft -------------------------------------------
  const db = getServiceDb()

  // 1) sv_angekommen_am muss gesetzt sein
  if (terminId) {
    logPhase(6, 'DB-Assert: gutachter_termine.sv_angekommen_am gesetzt')
    const { data: terminRow } = await db
      .from('gutachter_termine')
      .select('sv_angekommen_am, besichtigung_gestartet_am, status')
      .eq('id', terminId)
      .maybeSingle()

    if (!terminRow?.sv_angekommen_am) {
      notes.push('SOFT: gutachter_termine.sv_angekommen_am ist null — Auto-Arrive hat nicht in DB geschrieben; markSvVorOrt() prüfen')
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(6, `sv_angekommen_am: ${terminRow.sv_angekommen_am}`)
    }
  }

  // 2) faelle.status soll auf 'besichtigung' oder ähnlichem stehen
  if (fallId) {
    logPhase(6, `DB-Assert: faelle.status für fall_id=${fallId}`)
    const { data: fallRow } = await db
      .from('faelle')
      .select('status')
      .eq('id', fallId)
      .maybeSingle()

    const besichtigungsStatus = ['besichtigung', 'sv-vor-ort', 'gutachten-laeuft']
    if (!fallRow) {
      notes.push(`SOFT: faelle row für id=${fallId} nicht gefunden`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else if (!besichtigungsStatus.includes(fallRow.status)) {
      notes.push(`SOFT: faelle.status='${fallRow.status}' — erwartet einen von: ${besichtigungsStatus.join(', ')}. State-Machine prüfen.`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(6, `faelle.status=${fallRow.status} — OK`)
    }
  } else {
    notes.push('INFO: fall_id nicht in Fixtures — faelle.status-Assert übersprungen')
  }

  // 3) Mitteilungen für Kunde + Admin: sv.angekommen-Event
  logPhase(6, 'Warte auf Mitteilungen für Kunde + Admin (sv.angekommen)')
  const mitteilungsKunde = await waitForMitteilung({
    empfaenger_email: 'test-kunde@claimondo.de',
    timeoutMs: 8_000,
  })
  if (!mitteilungsKunde.ok) {
    notes.push(`SOFT: Mitteilung für test-kunde nach Ankunft nicht gefunden — ${mitteilungsKunde.msg} — emit.ts: sv.angekommen-Event prüfen`)
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    logPhase(6, `Mitteilung für Kunde gefunden: ${mitteilungsKunde.msg}`)
  }

  const mitteilungsAdmin = await waitForMitteilung({
    empfaenger_email: 'test-admin@claimondo.de',
    timeoutMs: 5_000,
  })
  if (!mitteilungsAdmin.ok) {
    notes.push(`SOFT: Mitteilung für test-admin nach Ankunft nicht gefunden — ${mitteilungsAdmin.msg}`)
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    logPhase(6, `Mitteilung für Admin gefunden: ${mitteilungsAdmin.msg}`)
  }

  logPhase(6, `Phase 6 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 6, result, notes, svPage: page }
}
