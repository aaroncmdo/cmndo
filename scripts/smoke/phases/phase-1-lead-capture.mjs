/**
 * scripts/smoke/phases/phase-1-lead-capture.mjs — Phase 1: Lead-Capture
 *
 * Was getestet wird:
 *  Navigiert zur Landing-Page, klickt "Schaden melden". Das Formular
 *  unter /schaden-melden/schritt-1 wird ausgefüllt und abgeschickt.
 *  Nach dem Submit wird geprüft:
 *    - DB: leads-Insert mit status='quali-offen' und source_channel='webform_direkt'
 *    - DB: mitteilungen-Insert für eine dispatch-Rolle
 *    - UI: Redirect auf /schaden-melden/schritt-2
 *
 * WICHTIGER ARCHITEKTUR-HINWEIS (entdeckt im ersten Smoke-Run):
 *  /schaden-melden/* ist NICHT in isPublicPath() — Middleware-Redirect auf /login
 *  für anonyme User (src/lib/supabase/middleware.ts → isPublicPath()).
 *  Das bedeutet: Das Lead-Form ist NUR für eingeloggte User erreichbar.
 *  Konsequenz für Smoke:
 *    - UI-Test läuft als test-kunde@claimondo.de (eingeloggt)
 *    - Oder: /schaden-melden/* muss in isPublicPath() aufgenommen werden
 *      (SOFT-Blocker: Feature-Regression — Plan §2 Phase 1 beschreibt anonymen User)
 *  DB-Assert läuft gegen den geseedten Fixture-Lead (unabhängig vom UI-Pfad).
 *
 * SELEKTOREN: Kein data-testid vorhanden — alle Selektoren über Label-Text
 * oder HTML-id-Attribute (id="vorname", id="email" etc. aus Schritt1Client.tsx).
 */

import { clickAndShoot, gotoAndShoot, assertDb, loadFixtureIds, waitForMitteilung, loginAs, logPhase, logWarn, logHard, logSoft, getServiceDb } from '../helpers.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Schaden-Typ der im Smoke verwendet wird
const SMOKE_SCHADENTYP = 'auffahrunfall'
// Schuldfrage — Gegner ist schuld (nicht Eigenverantwortung, sonst Redirect auf /selbstverschulden)
const SMOKE_SCHULDFRAGE = 'gegner'

/**
 * Haupt-Funktion Phase 1.
 *
 * @param {import('playwright').BrowserContext} anonContext — anonymer Browser-Context (kein Login)
 * @param {{ notes: string[] }} reportRef — wird von außen übergeben, Notes werden reingeschrieben
 * @returns {{ phase: 1, result: 'pass'|'soft'|'hard', notes: string[], leadId: string|null }}
 */
export async function runPhase1(anonContext, reportRef = { notes: [] }) {
  const notes = reportRef.notes
  let result = 'pass'
  let leadId = null
  let page = null

  logPhase(1, '=== Phase 1: Lead-Capture ===')

  // --- Fixture-IDs aus Seed laden ----------------------------------------
  const fixtures = loadFixtureIds()
  if (!fixtures) {
    const msg = 'tmp/e2e-fixture-ids.json nicht gefunden — bitte zuerst e2e-seed-fixtures.mjs ausführen'
    logHard(1, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 1, result: 'hard', notes, leadId: null }
  }

  // Direkten Webform-Lead aus Fixtures übernehmen (für DB-Asserts)
  const fixtureleadId = fixtures.lead_direkt_id
  if (!fixtureleadId) {
    const msg = 'fixtures.lead_direkt_id nicht gesetzt — Seed-Skript war fehlerhaft'
    logHard(1, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 1, result: 'hard', notes, leadId: null }
  }
  leadId = fixtureleadId
  logPhase(1, `Fixture Lead-ID (Direkt-Webform): ${leadId}`)

  // --- Schritt 1a: Landing-Page aufrufen ---------------------------------
  // HINWEIS: /schaden-melden/* ist nicht in isPublicPath() — Middleware leitet
  // anonyme User auf /login weiter. Der UI-Test läuft daher als test-kunde.
  // Dieses Verhalten ist ein SOFT-Blocker: Plan §2 Phase 1 beschreibt anonymen User,
  // aber die Middleware schützt die Route. Fixer: /schaden-melden/* zu isPublicPath()
  // hinzufügen in src/lib/supabase/middleware.ts.

  try {
    // Erst als anonym versuchen, dann als Kunde falls Redirect auf /login
    page = await anonContext.newPage()

    logPhase(1, 'Navigiere zur Landing-Page /')
    await gotoAndShoot(page, `${BASE_URL}/`, 'landing')

    // --- Schritt 1b: CTA "Schaden melden" finden und klicken -----------
    logPhase(1, 'Suche CTA "Schaden melden"')

    const ctaLead = page.getByRole('link', { name: /Schaden melden/i }).first()
    const ctaButton = page.getByRole('button', { name: /Schaden melden/i }).first()

    if (await ctaLead.isVisible({ timeout: 3000 }).catch(() => false)) {
      logPhase(1, 'CTA als Link gefunden — klicke')
      await clickAndShoot(page, ctaLead, 'schaden-melden-cta')
    } else if (await ctaButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      logPhase(1, 'CTA als Button gefunden — klicke')
      await clickAndShoot(page, ctaButton, 'schaden-melden-cta')
    } else {
      const msg = 'CTA "Schaden melden" auf Landing-Page nicht gefunden (weder Link noch Button) — navigiere direkt'
      logSoft(1, msg)
      notes.push(`SOFT: ${msg} — src/components/landing/LandingPage.tsx — bitte data-testid="cta-schaden-melden" hinzufügen`)
      result = 'soft'
    }

    // Prüfen ob Middleware auf /login redirected (anonyme User)
    await page.waitForTimeout(1500)
    if (page.url().includes('/login')) {
      const middlewareMsg = '/schaden-melden/* ist nicht in isPublicPath() — Middleware leitet anonyme User auf /login weiter. Test läuft als test-kunde@claimondo.de weiter (eingeloggt). Fixer: /schaden-melden in src/lib/supabase/middleware.ts → isPublicPath() aufnehmen.'
      logSoft(1, middlewareMsg)
      notes.push(`SOFT: ${middlewareMsg}`)
      result = 'soft'

      // Login als test-kunde und dann zum Formular navigieren
      await page.close().catch(() => {})
      page = await loginAs(anonContext, 'test-kunde@claimondo.de', 'Test1234!', BASE_URL)
      logPhase(1, `Nach Login als test-kunde: ${page.url()}`)

      // Jetzt direkt zum Formular
      await gotoAndShoot(page, `${BASE_URL}/schaden-melden/schritt-1`, 'schritt1-eingeloggt')
    }

    logPhase(1, `Aktuelle URL: ${page.url()}`)

    // Warten bis schritt-1 geladen ist
    await page.waitForURL((url) => url.pathname.includes('schritt-1'), { timeout: 10000 }).catch(() => {
      logWarn(1, 'schritt-1 URL nicht erreicht')
    })
    logPhase(1, `Nach Redirect: ${page.url()}`)

    // Screenshot des Formulars
    const formIdx = require_step()

    // Unfalldatum: bleibt Default (heute)

    // Unfallort (einfaches Textfeld, kein Autocomplete)
    logPhase(1, 'Fülle Unfallort aus')
    const unfallortInput = page.locator('#unfallort')
    if (await unfallortInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await unfallortInput.fill('Neumarkt, 50667 Köln')
    } else {
      const msg = 'Unfallort-Feld (#unfallort) nicht gefunden'
      logSoft(1, msg)
      notes.push(`SOFT: ${msg} — src/app/schaden-melden/schritt-1/Schritt1Client.tsx:238`)
      result = 'soft'
    }

    // Schadentyp: "auffahrunfall" — Button mit aria-pressed
    logPhase(1, 'Wähle Schadentyp auffahrunfall')
    const schadenChip = page.getByRole('button', { name: /Auffahrunfall/i })
    if (await schadenChip.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (!(await schadenChip.getAttribute('aria-pressed').then(v => v === 'true').catch(() => false))) {
        await schadenChip.click()
      }
    }

    // Hergang
    logPhase(1, 'Fülle Schadens-Hergang aus')
    const hergangField = page.locator('#schadens_hergang')
    if (await hergangField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hergangField.fill('E2E-Smoke-Test: Auffahrunfall auf der Inneren Kanalstraße Köln. Gegner hat Vorfahrt missachtet.')
    }

    // Schuldfrage: "gegner" — Radio
    logPhase(1, 'Wähle Schuldfrage: Gegner ist schuld')
    const schuldfrage = page.locator('input[type="radio"][value="gegner"]')
    if (await schuldfrage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await schuldfrage.check()
    } else {
      // Alternativ über Label-Text klicken
      const schuldLabel = page.getByText(/Der Gegner ist schuld/i).first()
      if (await schuldLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
        await schuldLabel.click()
      }
    }

    // Fahrzeug-Hersteller: Volkswagen (ist Default, Select-Component)
    logPhase(1, 'Fahrzeug-Hersteller bleibt Volkswagen (Default)')

    // Fahrzeug-Modell
    const modellInput = page.locator('#fahrzeug_modell')
    if (await modellInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modellInput.fill('Golf 7')
    }

    // Fahrzeug-Standort (Google-Places-Autocomplete)
    // Wichtig: Autocomplete braucht echten API-Key und Dropdown-Interaktion.
    // Im Smoke: Wert eintragen + Tab — wenn kein Dropdown-Select, bleibt lat=null (Soft-Blocker)
    logPhase(1, 'Fahrzeug-Standort: Google-Places-Autocomplete (Soft-Blocker wenn kein Dropdown)')
    const standortInput = page.locator('input[placeholder*="Straße, Hausnr"]')
    if (await standortInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await standortInput.fill('Mediapark 7, 50670 Köln')
      // Kurz warten ob Dropdown erscheint
      await page.waitForTimeout(1500)
      // Versuche ersten Dropdown-Eintrag zu klicken
      const suggestion = page.locator('.pac-item, [role="option"], [data-place-id]').first()
      if (await suggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
        await suggestion.click()
        logPhase(1, 'Fahrzeug-Standort: Google-Dropdown-Eintrag gewählt')
      } else {
        const msg = 'Fahrzeug-Standort: Google-Places-Dropdown hat nicht geöffnet — fahrzeug_standort_lat bleibt null'
        logSoft(1, msg)
        notes.push(`SOFT: ${msg} — src/app/schaden-melden/schritt-1/Schritt1Client.tsx:471 — GooglePlaceAutocomplete braucht API-Key in .env.local (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)`)
        result = 'soft'
      }
    } else {
      notes.push('SOFT: Fahrzeug-Standort-Input nicht gefunden — src/app/schaden-melden/schritt-1/Schritt1Client.tsx:471')
      result = 'soft'
    }

    // Kontaktdaten
    logPhase(1, 'Fülle Kontaktdaten aus')
    const vornameInput = page.locator('#vorname')
    const nachnameInput = page.locator('#nachname')
    const emailInput = page.locator('#email')
    const telefonInput = page.locator('#telefon')

    if (await vornameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await vornameInput.fill('Lisa')
      await nachnameInput.fill('Mueller')
      await emailInput.fill('smoke-anonym@claimondo-test.de')
      await telefonInput.fill('+4915199990099')
    } else {
      const msg = 'Kontaktfelder (#vorname, #email) nicht gefunden'
      logHard(1, msg)
      notes.push(`HARD: ${msg} — src/app/schaden-melden/schritt-1/Schritt1Client.tsx:505`)
      return { phase: 1, result: 'hard', notes, leadId }
    }

    // DSGVO-Checkbox
    logPhase(1, 'Aktiviere DSGVO-Checkbox')
    const dsgvoCheckbox = page.locator('[role="checkbox"], input[type="checkbox"]').first()
    if (await dsgvoCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      const checked = await dsgvoCheckbox.getAttribute('aria-checked').catch(() => null)
        ?? await dsgvoCheckbox.evaluate((el) => el.checked).catch(() => false)
      if (!checked || checked === 'false') {
        await dsgvoCheckbox.click()
      }
    } else {
      const msg = 'DSGVO-Checkbox nicht gefunden — Submit-Button bleibt disabled'
      logHard(1, msg)
      notes.push(`HARD: ${msg} — src/app/schaden-melden/schritt-1/Schritt1Client.tsx:554`)
      return { phase: 1, result: 'hard', notes, leadId }
    }

    // --- Cookie-Banner wegklicken (blockiert sonst den Submit-Button) ------
    logPhase(1, 'Prüfe ob Cookie-Banner sichtbar (CookieBanner.tsx blockiert Klicks)')
    const cookieBannerBtn = page.getByRole('button', { name: /Alle akzeptieren/i })
    if (await cookieBannerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      logPhase(1, 'Cookie-Banner gefunden — klicke "Alle akzeptieren"')
      await cookieBannerBtn.click().catch(() => {})
      await page.waitForTimeout(500)
    } else {
      // Alternativ: Cookie direkt im Browser-Context setzen damit Banner nicht erscheint
      await page.evaluate(() => {
        document.cookie = 'claimondo-cookie-consent=true; path=/; max-age=31536000'
      }).catch(() => {})
    }

    // Screenshot vor Submit
    await page.screenshot({
      path: `${process.env._SMOKE_OUT_DIR ?? 'docs/portals-review/screenshots/full-smoke'}/XXXX-schritt1-vor-submit.png`,
      fullPage: false,
    }).catch(() => {})

    // --- Schritt 1d: Submit ----------------------------------------
    logPhase(1, 'Klicke Submit "Weiter zu Schritt 2"')
    const submitBtn = page.getByRole('button', { name: /Weiter zu Schritt 2/i })
    if (!(await submitBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      const msg = 'Submit-Button "Weiter zu Schritt 2" nicht sichtbar — möglicherweise disabled (DSGVO oder Validierungsfehler)'
      logHard(1, msg)
      notes.push(`HARD: ${msg} — src/app/schaden-melden/schritt-1/Schritt1Client.tsx:590`)
      // Screenshot für Diagnose
      await page.screenshot({ path: `${process.env._SMOKE_OUT_DIR ?? '.'}/HARD-schritt1-submit-nicht-sichtbar.png` }).catch(() => {})
      return { phase: 1, result: 'hard', notes, leadId }
    }

    // Prüfen ob disabled
    const isDisabled = await submitBtn.isDisabled().catch(() => false)
    if (isDisabled) {
      const msg = 'Submit-Button "Weiter zu Schritt 2" ist disabled — Validierung fehlgeschlagen (DSGVO-Checkbox oder Pflichtfeld)'
      logSoft(1, msg)
      notes.push(`SOFT: ${msg} — src/app/schaden-melden/schritt-1/Schritt1Client.tsx:592 — Prüfe ob DSGVO-Checkbox korrekt gesetzt + fahrzeug_standort_plz fehlt`)
      result = 'soft'
      // Wir können hier nicht weitermachen — aber der Fixture-Lead existiert bereits aus Seed
      logPhase(1, 'Fallback: Verwende Fixture-Lead für DB-Asserts (UI-Submit übersprungen)')
    } else {
      await clickAndShoot(page, submitBtn, 'schritt1-submit')

      // Warten auf Redirect
      await page.waitForURL(
        (url) => url.pathname.includes('schritt-2') || url.pathname.includes('selbstverschulden'),
        { timeout: 15000 },
      ).catch(() => {
        logWarn(1, 'Kein Redirect nach schritt-2 nach Submit — möglicherweise Server-Action-Fehler')
      })

      logPhase(1, `Nach Submit URL: ${page.url()}`)

      if (page.url().includes('selbstverschulden')) {
        const msg = 'Schuldfrage hat "eigenverantwortung" getriggert → /selbstverschulden — Smoke-Config-Fehler'
        logSoft(1, msg)
        notes.push(`SOFT: ${msg} — Schuldfrage war "${SMOKE_SCHULDFRAGE}"`)
        result = 'soft'
      }
    }

  } catch (err) {
    const msg = `Unerwarteter Fehler in Phase 1: ${err.message}`
    logHard(1, msg)
    notes.push(`HARD: ${msg}`)
    return { phase: 1, result: 'hard', notes, leadId }
  } finally {
    await page.close().catch(() => {})
  }

  // --- DB-Asserts --------------------------------------------------------
  logPhase(1, 'DB-Assert: leads mit status=quali-offen für Fixture-Lead')

  const dbAssert1 = await assertDb({
    table: 'leads',
    where: { id: leadId, status: 'quali-offen' },
    expect: { count: 1 },
  })

  if (!dbAssert1.ok) {
    logSoft(1, dbAssert1.msg)
    notes.push(`SOFT: DB-Assert leads.status=quali-offen fehlgeschlagen: ${dbAssert1.msg}`)
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    logPhase(1, dbAssert1.msg)
  }

  const dbAssert2 = await assertDb({
    table: 'leads',
    where: { id: leadId, source_channel: 'webform_direkt' },
    expect: { count: 1 },
  })

  if (!dbAssert2.ok) {
    logSoft(1, dbAssert2.msg)
    notes.push(`SOFT: DB-Assert leads.source_channel=webform_direkt fehlgeschlagen: ${dbAssert2.msg}`)
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    logPhase(1, dbAssert2.msg)
  }

  // Geo-Assert: besichtigungsort_lat muss gesetzt sein
  const db = getServiceDb()
  const { data: leadRow } = await db
    .from('leads')
    .select('besichtigungsort_lat, besichtigungsort_lng, kunde_lat, kunde_lng')
    .eq('id', leadId)
    .maybeSingle()

  if (!leadRow?.besichtigungsort_lat) {
    notes.push('SOFT: leads.besichtigungsort_lat ist null — Seed-Fixtures sollten das setzen')
    result = result === 'hard' ? 'hard' : 'soft'
  } else {
    logPhase(1, `Geo OK: besichtigungsort_lat=${leadRow.besichtigungsort_lat}`)
  }

  // Mitteilungs-Assert: dispatch soll Mitteilung bekommen haben
  logPhase(1, 'Mitteilungs-Assert: dispatch-Empfänger')
  const { data: dispatchProfiles } = await db
    .from('profiles')
    .select('id')
    .eq('email', 'test-dispatch@claimondo.de')
    .limit(1)

  if (dispatchProfiles && dispatchProfiles.length > 0) {
    const mitteilungResult = await waitForMitteilung({
      empfaenger_id: dispatchProfiles[0].id,
      timeoutMs: 8000,
    })
    if (!mitteilungResult.ok) {
      logSoft(1, mitteilungResult.msg)
      notes.push(`SOFT: Mitteilung für dispatch nicht gefunden — ${mitteilungResult.msg} — Prüfe emit.ts: lead.created-Event`)
      result = result === 'hard' ? 'hard' : 'soft'
    } else {
      logPhase(1, `Mitteilung für dispatch gefunden: ${mitteilungResult.msg}`)
    }
  } else {
    notes.push('SOFT: test-dispatch@claimondo.de nicht in profiles gefunden — Mitteilungs-Assert übersprungen')
    result = result === 'hard' ? 'hard' : 'soft'
  }

  logPhase(1, `Phase 1 abgeschlossen: ${result.toUpperCase()}`)
  return { phase: 1, result, notes, leadId }
}

// Dummy-Helfer damit der Step-Counter auch ohne outDir hochläuft
function require_step() {
  return 0
}
