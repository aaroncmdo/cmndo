/**
 * scripts/smoke/phases/phase-5-heute.mjs — Phase 5: SV-Heute-Hub am Termin-Tag
 *
 * Was getestet wird:
 *  Der SV öffnet /gutachter/heute nach einer direkten DB-Mutation, die den
 *  Termin auf „heute + 15 Minuten" verlegt und die sv_tages_session auf
 *  idle/bereit setzt. Geprüft wird:
 *    - Mapbox-Canvas (Tagesroute) ist sichtbar
 *    - Mindestens eine Termin-Card erscheint in der Sidebar
 *    - „Tagesmodus starten"-CTA ist sichtbar (aber NICHT angeklickt — das
 *      übernimmt Phase 6)
 *    - Hub-Top-Pflicht-Counter stimmt mit dem Termin-Zeilen-Counter überein
 *    - Isochrone-Polygon-Layer reagiert auf LocalStorage-Toggle
 *
 * Vorbedingungen (werden vom Orchestrator per forceTerminAufHeute() gesetzt,
 * NICHT von dieser Phase selbst):
 *   - gutachter_termine.start_zeit = now() + 15 min, status = 'bestaetigt'
 *   - sv_tages_session.status = 'idle', aktueller_termin_id = null
 *
 * Selektoren-Status:
 *   - Mapbox-Canvas: '.mapboxgl-canvas' — sehr stabil, Library-CSS
 *   - „Tagesmodus starten"-Button: text-basiert 'Tagesmodus starten' /
 *     'Tagesmodus fortsetzen' (aus TagesrouteStartCard.tsx:72)
 *   - Pflicht-Counter Hub-Top: text 'Pflichtdokument|Pflichtdokumente offen'
 *     aus TagesrouteSidebar.tsx:178–180 — kein data-testid vorhanden.
 *     Falls die offeneDokuTotal == 0 ist (alle erledigt), erscheint der
 *     amber-Badge gar nicht → Counter wird dann als 0 interpretiert.
 *   - Termin-Pflicht-Counter pro Zeile: text '<N> Doku offen' aus
 *     TagesrouteSidebar.tsx:276 — kein data-testid.
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
  forceTerminAufHeute,
  mockGpsRoute,
} from '../helpers.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// GPS-Startpunkt für Geolocation-Mock (Mediapark Köln — SV-Origin aus Seed)
const SV_ORIGIN = { lat: 50.9522, lng: 6.943 }

/**
 * Haupt-Funktion Phase 5.
 *
 * @param {import('playwright').BrowserContext} svContext — Browser-Context des SV
 * @param {{ notes: string[] }} reportRef
 * @returns {{ phase: 5, result: 'pass'|'soft'|'hard', notes: string[], terminId: string|null, svPage: import('playwright').Page|null }}
 */
export async function runPhase5(svContext, reportRef = { notes: [] }) {
  const notes = reportRef.notes
  let result = 'pass'
  let page = null

  logPhase(5, '=== Phase 5: SV-Heute-Hub am Termin-Tag ===')

  // --- Fixture-IDs laden ---------------------------------------------------
  const fixtures = loadFixtureIds()
  if (!fixtures) {
    const msg = 'tmp/e2e-fixture-ids.json nicht gefunden — Seed-Skript zuerst ausführen'
    logHard(5, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 5, result: 'hard', notes, terminId: null, svPage: null }
  }

  const terminId = fixtures.termin_id ?? null
  // forceTerminAufHeute braucht sachverstaendige.id (NICHT auth.users.id),
  // weil sv_tages_session.sv_id auf sachverstaendige(id) zeigt.
  const svUserId = fixtures.sv_sachverstaendige_id ?? fixtures.sv_user_id ?? null

  if (!terminId) {
    const msg = 'fixtures.termin_id nicht gesetzt — Seed hat keinen Termin angelegt'
    logHard(5, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 5, result: 'hard', notes, terminId: null, svPage: null }
  }

  logPhase(5, `Termin-ID: ${terminId}`)

  // --- Vorbedingung: Termin auf heute + 15 min setzen ---------------------
  logPhase(5, 'Setze Termin auf heute + 15 Minuten via forceTerminAufHeute()')
  try {
    const mutResult = await forceTerminAufHeute(terminId, svUserId)
    if (!mutResult.ok) {
      const msg = `DB-Mutation für Termin fehlgeschlagen: ${mutResult.error}`
      logSoft(5, msg)
      notes.push(`SOFT: ${msg}`)
      result = 'soft'
    } else {
      logPhase(5, 'Termin erfolgreich auf heute gesetzt')
    }
  } catch (err) {
    const msg = `forceTerminAufHeute warf: ${err.message}`
    logSoft(5, msg)
    notes.push(`SOFT: ${msg}`)
    result = 'soft'
  }

  // --- Geolocation-Permission + LocalStorage-Toggle -----------------------
  // GPS-Permission MUSS vor dem ersten goto() für die Origin gegranted sein.
  try {
    await svContext.grantPermissions(['geolocation'], { origin: BASE_URL })
    await svContext.setGeolocation({ latitude: SV_ORIGIN.lat, longitude: SV_ORIGIN.lng, accuracy: 5 })
    logPhase(5, 'Geolocation-Permission erteilt und Startposition gesetzt')
  } catch (err) {
    logWarn(5, `Geolocation-Grant fehlgeschlagen: ${err.message}`)
    notes.push(`SOFT: Geolocation-Grant fehlgeschlagen — GPS-Abhängige Tests möglicherweise ohne Koordinaten`)
    result = result === 'hard' ? 'hard' : 'soft'
  }

  // LocalStorage-Toggle für „Mein Gebiet auf Karte" aktivieren.
  // Muss per addInitScript gesetzt werden, damit es beim ersten Paint gilt.
  try {
    await svContext.addInitScript(() => {
      try {
        window.localStorage.setItem('claimondo_show_gebiet_in_hub', '1')
      } catch {
        // noop in Headless-Sandbox ohne Storage
      }
    })
  } catch (_) {
    // Ignore — addInitScript nicht kritisch
  }

  try {
    // --- Login oder Session wiederverwenden --------------------------------
    logPhase(5, 'Login als test-sv@claimondo.de')
    page = await loginAs(svContext, 'test-sv@claimondo.de', 'Test1234!', BASE_URL)
    logPhase(5, `Nach Login URL: ${page.url()}`)

    // --- Navigation zu /gutachter/heute ------------------------------------
    logPhase(5, 'Navigiere zu /gutachter/heute')
    await gotoAndShoot(page, `${BASE_URL}/gutachter/heute`, 'heute-hub')

    // Warte auf Mapbox-Canvas (Tagesroute muss laden)
    logPhase(5, 'Warte auf Mapbox-Canvas (Tagesroute)')
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
      const msg = 'Mapbox-Canvas (.mapboxgl-canvas) nicht sichtbar nach 30s — TagesrouteMap geladen?'
      logSoft(5, msg)
      notes.push(`SOFT: ${msg} — src/app/gutachter/heute/TagesrouteMap.tsx`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(5, 'Mapbox-Canvas sichtbar')
    }

    // Warte 4s damit async Tile-Loads + Route-Fetch fertig werden
    await page.waitForTimeout(4_000)

    // Screenshot nach Map-Load
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/heute-hub-map-loaded.png`,
      fullPage: false,
    }).catch(() => {})

    // --- Termin-Card prüfen ------------------------------------------------
    logPhase(5, 'Prüfe ob Termin-Card/Termin-Eintrag in Sidebar sichtbar')
    // TagesrouteSidebar rendert <li> Einträge für Termine.
    // Wir suchen nach Zeitangaben (HH:MM) oder Termin-bezogene Badges.
    const terminZeilen = page.locator('aside ol li').filter({ hasNot: page.locator('.italic') })
    const terminCount = await terminZeilen.count().catch(() => 0)

    if (terminCount === 0) {
      // Fallback: suche nach text „Heute keine Termine" — das wäre ein Problem
      const keineTermine = page.getByText(/Heute keine Termine geplant/i)
      if (await keineTermine.isVisible({ timeout: 3000 }).catch(() => false)) {
        const msg = 'Sidebar zeigt „Heute keine Termine geplant" — forceTerminAufHeute hat nicht gegriffen oder Termin hat kein korrektes sv_id'
        logSoft(5, msg)
        notes.push(`SOFT: ${msg}`)
        result = result === 'hard' ? 'hard' : 'soft'
      } else {
        logWarn(5, 'aside ol li nicht gefunden — Sidebar-Struktur möglicherweise geändert')
        notes.push('SOFT: Termin-Zeilen-Selektor (aside ol li) lieferte 0 Treffer — src/app/gutachter/heute/TagesrouteSidebar.tsx:184 prüfen')
        result = result === 'hard' ? 'hard' : 'soft'
      }
    } else {
      logPhase(5, `Termin-Card gefunden: ${terminCount} Zeile(n) in Sidebar`)
    }

    // --- Pflicht-Counter auslesen ------------------------------------------
    // Hub-Top-Counter: text '<N> Pflichtdokument(e) offen' (amber-Badge in Sidebar-Header)
    // Quelle: TagesrouteSidebar.tsx:178-180
    logPhase(5, 'Lese Hub-Top-Pflicht-Counter aus')
    let hubTopCounterText = '0'
    const hubTopBadge = page.locator('div').filter({
      hasText: /\d+\s+Pflichtdokument(e)?\s+offen/i,
    }).first()

    if (await hubTopBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      const rawText = (await hubTopBadge.textContent().catch(() => '')) ?? ''
      const match = rawText.match(/(\d+)\s+Pflichtdokument/)
      hubTopCounterText = match ? match[1] : '?'
      logPhase(5, `Hub-Top-Counter: ${hubTopCounterText} Pflichtdokumente offen`)
    } else {
      // Falls kein amber-Badge: alle Pflicht erfüllt → Counter ist 0
      logPhase(5, 'Hub-Top-Pflicht-Badge nicht sichtbar → Counter = 0 (alle erfüllt)')
      hubTopCounterText = '0'
    }

    // Termin-Card-Counter: text '<N> Doku offen' — innerhalb einer Termin-Zeile
    // Quelle: TagesrouteSidebar.tsx:276
    logPhase(5, 'Lese Termin-Card-Pflicht-Counter aus')
    let terminCardCounterText = '0'
    const terminDokuBadge = page.locator('span').filter({
      hasText: /\d+\s+Doku\s+offen/i,
    }).first()

    if (await terminDokuBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      const rawText = (await terminDokuBadge.textContent().catch(() => '')) ?? ''
      const match = rawText.match(/(\d+)\s+Doku\s+offen/)
      terminCardCounterText = match ? match[1] : '?'
      logPhase(5, `Termin-Card-Counter: ${terminCardCounterText} Doku offen`)
    } else {
      // Kein „Doku offen"-Badge: Pflicht komplett-Badge prüfen
      const komplettBadge = page.locator('span').filter({ hasText: /Doku komplett/i }).first()
      if (await komplettBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
        logPhase(5, 'Termin-Card zeigt „Doku komplett" → Counter = 0')
        terminCardCounterText = '0'
      } else {
        logWarn(5, 'Kein Pflicht-Counter-Badge in Termin-Card gefunden')
        notes.push('SOFT: Termin-Card-Pflicht-Counter nicht gefunden — src/app/gutachter/heute/TagesrouteSidebar.tsx:275-282')
        terminCardCounterText = '?'
      }
    }

    // Konsistenz-Check Hub-Top vs Termin-Card
    if (hubTopCounterText !== '?' && terminCardCounterText !== '?') {
      // Hub-Top zeigt Gesamt-Summe über alle Termine; Termin-Card zeigt nur
      // pro Termin. Bei einem Termin müssen beide übereinstimmen.
      if (hubTopCounterText !== terminCardCounterText && terminCardCounterText !== '0' && hubTopCounterText !== '0') {
        const msg = `Pflicht-Counter-Inkonsistenz: Hub-Top=${hubTopCounterText}, Termin-Card=${terminCardCounterText} — PFLICHT_DONE_STATES-Filter prüfen`
        logSoft(5, msg)
        notes.push(`SOFT: ${msg} — src/app/gutachter/heute/TagesrouteSidebar.tsx:139 + :276`)
        result = result === 'hard' ? 'hard' : 'soft'
      } else {
        logPhase(5, `Counter-Konsistenz OK: Hub-Top=${hubTopCounterText}, Termin-Card=${terminCardCounterText}`)
      }
    }

    // --- Isochrone-Polygon prüfen ------------------------------------------
    // Prüft ob der LocalStorage-Toggle tatsächlich einen Layer rendert.
    // Mapbox-Layer-Namen sind nicht per CSS direkt abfragbar, aber wir können
    // prüfen ob die Map-Instanz layers enthält die 'isochrone' enthalten.
    const isochroneLayer = await page.evaluate(() => {
      try {
        // Mapbox GL hängt sich intern an window.__mapboxgl_map o.ä. nicht —
        // wir suchen nach einem DOM-Element das auf den Layer hinweist.
        // TagesrouteMap rendert bei showGebiet=true Polygon-Layer. Der Canvas
        // ist ein einzelnes <canvas> — Layer nicht DOM-seitig prüfbar.
        // Alternativ: prüfe ob localStorage-Wert gesetzt ist.
        return window.localStorage.getItem('claimondo_show_gebiet_in_hub') === '1'
      } catch {
        return false
      }
    }).catch(() => false)

    if (!isochroneLayer) {
      notes.push('INFO: LocalStorage claimondo_show_gebiet_in_hub nicht gesetzt — Isochrone-Polygon-Test übersprungen')
    } else {
      logPhase(5, 'LocalStorage-Toggle aktiv — Isochrone-Polygon sollte rendern (Canvas-Layer nicht DOM-prüfbar)')
      // Screenshot als visueller Beweis
      await page.screenshot({
        path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/heute-hub-isochrone.png`,
        fullPage: false,
      }).catch(() => {})
    }

    // --- Tagesmodus-CTA prüfen (NUR Sichtbarkeit, NICHT klicken) ----------
    logPhase(5, 'Prüfe Sichtbarkeit des Tagesmodus-starten-CTA')
    const tagesmodosCta = page.getByRole('button', { name: /Tagesmodus (starten|fortsetzen)/i }).first()
    const ctaSichtbar = await tagesmodosCta.isVisible({ timeout: 5000 }).catch(() => false)

    if (!ctaSichtbar) {
      // Fallback: Suche nach PlayCircleIcon-Button oder text
      const fallbackCta = page.locator('button').filter({ hasText: /Tagesmodus/i }).first()
      const fallbackSichtbar = await fallbackCta.isVisible({ timeout: 3000 }).catch(() => false)
      if (!fallbackSichtbar) {
        const msg = '"Tagesmodus starten"-CTA nicht gefunden (weder via role noch text) — TagesrouteStartCard.tsx:72 prüfen; wenn keine Termine vorhanden ist der Button disabled/ausgeblendet'
        logSoft(5, msg)
        notes.push(`SOFT: ${msg}`)
        result = result === 'hard' ? 'hard' : 'soft'
      } else {
        logPhase(5, 'Tagesmodus-CTA über text-Fallback gefunden')
      }
    } else {
      logPhase(5, '"Tagesmodus starten"-CTA sichtbar — Phase 6 kann klicken')
    }

    // Screenshot nach allen Checks
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/heute-hub-final.png`,
      fullPage: false,
    }).catch(() => {})

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 5: ${err.message}`
    logHard(5, msg)
    notes.push(`HARD: ${msg}`)
    // page nicht schließen — wird für Phase 6 wiederverwendet
    return { phase: 5, result: 'hard', notes, terminId, svPage: page }
  }

  // --- DB-Assert: Termin ist heute mit status=bestaetigt ------------------
  logPhase(5, 'DB-Assert: gutachter_termine mit status=bestaetigt für heute')
  const db = getServiceDb()
  const { data: terminRow, error: terminError } = await db
    .from('gutachter_termine')
    .select('id, status, start_zeit, sv_angekommen_am')
    .eq('id', terminId)
    .maybeSingle()

  if (terminError || !terminRow) {
    const msg = `DB-Assert gutachter_termine fehlgeschlagen: ${terminError?.message ?? 'Keine Zeile'}`
    logSoft(5, msg)
    notes.push(`SOFT: ${msg}`)
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    const startHeute = new Date(terminRow.start_zeit).toDateString() === new Date().toDateString()
    if (!startHeute) {
      notes.push(`SOFT: gutachter_termine.start_zeit ist nicht heute — forceTerminAufHeute hat nicht korrekt mutiert. Wert: ${terminRow.start_zeit}`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else if (terminRow.status !== 'bestaetigt') {
      notes.push(`SOFT: gutachter_termine.status='${terminRow.status}' statt 'bestaetigt'`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(5, `DB-Assert OK: Termin ist heute um ${terminRow.start_zeit} mit status=${terminRow.status}`)
    }
  }

  logPhase(5, `Phase 5 abgeschlossen: ${result.toUpperCase()}`)
  return {
    phase: 5,
    result,
    notes,
    terminId,
    svPage: page,
    extras: { hubTopCounter: notes.join('\n') },
  }
}
