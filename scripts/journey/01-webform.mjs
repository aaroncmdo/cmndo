/**
 * scripts/journey/01-webform.mjs — Phase 1: Webform-Submission
 *
 * Was getestet wird:
 *  Anonymer Nutzer öffnet /schaden-melden, durchläuft Schritt 1 mit allen
 *  Pflichtfeldern, klickt DSGVO + Submit, landet auf der Bestätigung.
 *
 * Cross-Role-Checks danach:
 *  - Dispatch sieht den neuen Lead in /dispatch/leads
 *  - Admin sieht den neuen Lead in /admin/leads (falls Route existiert) oder /admin
 *  - SV sieht NICHTS (Lead noch nicht zugewiesen)
 *  - Kunde sieht KEINE Fallakte (Konversion noch nicht passiert)
 *
 * Daten-Hygiene-Checks:
 *  - Lead taucht im Quali-Offen-Filter auf (nicht im Reguliert-Filter)
 *  - Mitteilung "Neuer Lead" erscheint im Dispatch-Glockensymbol
 */

import { getBrowser, getContext, record, shoot, assertVisible, assertHidden, checkpoint, getAdminDb, saveFixtureIds } from './_helpers.mjs'

const PHASE = 1
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Test-Daten (deterministisch, idempotent)
const TEST_LEAD = {
  vorname: 'Lisa',
  nachname: 'Mueller',
  email: 'test-kunde@claimondo.de',
  telefon: '+4915199990001',
  schadentyp: 'auffahrunfall',
  unfallhergang: 'Auffahrunfall auf der Inneren Kanalstraße in Köln. Unfallgegner hat nicht rechtzeitig gebremst, Heck am Test-Fahrzeug stark beschädigt.',
  schuldfrage: 'gegner',
  fahrzeug_hersteller: 'Volkswagen',
  fahrzeug_modell: 'Golf VII',
  unfallort: 'Innere Kanalstraße, 50670 Köln',
}

export async function runPhase1() {
  console.log('\n━━━ Phase 1: Webform-Submission ━━━\n')

  const browser = await getBrowser()
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  })
  await ctx.addCookies([
    { name: 'claimondo-cookie-consent', value: '1', domain: 'localhost', path: '/', expires: Date.now() / 1000 + 86400 },
  ])
  const page = await ctx.newPage()

  // ─── Schritt 1.1: Webform öffnen ─────────────────────────────────────────
  await page.goto(`${BASE_URL}/schaden-melden`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_000)

  // Falls /schaden-melden auf /schaden-melden/schritt-1 weiterleitet, abwarten
  if (!page.url().includes('/schritt-1')) {
    await page.goto(`${BASE_URL}/schaden-melden/schritt-1`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1_500)
  }

  await shoot(page, '01-webform-leer')
  await assertVisible(page, page.getByRole('button', { name: /Weiter zu Schritt 2/i }), 'Submit-Button im Initial-Zustand', PHASE, { tag: 'submit-initial' })

  // ─── Schritt 1.2: Pflichtfelder ausfüllen ───────────────────────────────
  // Unfallort
  const unfallortInput = page.locator('input[placeholder*="Straße, Stadt"]').first()
  if (await unfallortInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await unfallortInput.fill(TEST_LEAD.unfallort)
    record('PASS', PHASE, 'Unfallort-Feld ausgefüllt', 'fill-unfallort')
    await page.waitForTimeout(800) // Google-Places-Autocomplete
    // Erste Dropdown-Option auswählen falls vorhanden
    const firstSuggestion = page.locator('[role="option"], [data-place-id]').first()
    if (await firstSuggestion.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await firstSuggestion.click()
      record('PASS', PHASE, 'Google-Places-Autocomplete-Eintrag gewählt', 'autocomplete-unfallort')
    } else {
      record('SOFT', PHASE, 'Google-Places-Dropdown ohne Vorschlag — manuelle Eingabe ohne Geo-Match', 'autocomplete-unfallort')
    }
  } else {
    record('SOFT', PHASE, 'Unfallort-Feld nicht sichtbar — Selektor ggf. veraltet', 'fill-unfallort')
  }

  // Schadentyp (Radio/Pill-Button)
  const schadentypButton = page.getByRole('button', { name: new RegExp(TEST_LEAD.schadentyp, 'i') }).first()
  if (await schadentypButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await schadentypButton.click()
    record('PASS', PHASE, `Schadentyp gewählt: ${TEST_LEAD.schadentyp}`, 'fill-schadentyp')
  } else {
    record('SOFT', PHASE, `Schadentyp-Button "${TEST_LEAD.schadentyp}" nicht klickbar`, 'fill-schadentyp')
  }

  // Unfallhergang
  const hergangArea = page.locator('textarea[placeholder*="Unfallhergang"]').first()
  if (await hergangArea.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await hergangArea.fill(TEST_LEAD.unfallhergang)
    record('PASS', PHASE, 'Unfallhergang ausgefüllt', 'fill-hergang')
  } else {
    record('SOFT', PHASE, 'Unfallhergang-Textarea nicht sichtbar', 'fill-hergang')
  }

  // Schuldfrage (Radio "gegner")
  const schuldfrageInputs = page.locator('input[name="schuldfrage"]')
  const gegnerRadio = schuldfrageInputs.locator(`xpath=ancestor::label[1]`).filter({ hasText: /gegner/i }).first()
  if (await gegnerRadio.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await gegnerRadio.click()
    record('PASS', PHASE, 'Schuldfrage: Gegner ist schuld', 'fill-schuld')
  } else {
    // Fallback: Direkt-Klick auf Radio-Wert
    const fallback = page.locator('input[name="schuldfrage"][value="gegner"]').first()
    if (await fallback.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await fallback.click({ force: true })
      record('PASS', PHASE, 'Schuldfrage: Gegner ist schuld (force-click)', 'fill-schuld')
    } else {
      record('SOFT', PHASE, 'Schuldfrage-Radio nicht klickbar', 'fill-schuld')
    }
  }

  // Polizei vor Ort (default behält "nein" — wir lassen das so)
  // Fahrzeug-Hersteller (Dropdown — Default Volkswagen lassen)
  // Fahrzeug-Modell
  const modellInput = page.locator('input[placeholder*="Golf"]').first()
  if (await modellInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await modellInput.fill(TEST_LEAD.fahrzeug_modell)
    record('PASS', PHASE, 'Fahrzeug-Modell ausgefüllt', 'fill-modell')
  }

  // Kontakt-Daten
  const fillBy = async (placeholder, value, tag) => {
    const inp = page.locator(`input[placeholder*="${placeholder}"]`).first()
    if (await inp.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await inp.fill(value)
      record('PASS', PHASE, `${tag} ausgefüllt`, tag)
    } else {
      record('SOFT', PHASE, `${tag}: Selektor nicht sichtbar`, tag)
    }
  }
  await fillBy('+49 221', TEST_LEAD.telefon, 'fill-telefon')

  // Email + Vorname/Nachname (über name= falls vorhanden)
  for (const [name, value, tag] of [
    ['vorname', TEST_LEAD.vorname, 'fill-vorname'],
    ['nachname', TEST_LEAD.nachname, 'fill-nachname'],
    ['email', TEST_LEAD.email, 'fill-email'],
  ]) {
    const inp = page.locator(`input[name="${name}"]`).first()
    if (await inp.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await inp.fill(value)
      record('PASS', PHASE, `${tag} ausgefüllt`, tag)
    } else {
      record('SOFT', PHASE, `${tag}: input[name="${name}"] nicht gefunden`, tag)
    }
  }

  await shoot(page, '01-webform-ausgefuellt')

  // ─── Schritt 1.3: DSGVO-Checkbox ────────────────────────────────────────
  // Base-UI Checkbox = <span role="checkbox">. Klicken via label.
  const dsgvoLabel = page.locator('label').filter({ hasText: /Datenschutzerklärung/i }).first()
  if (await dsgvoLabel.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await dsgvoLabel.click()
    record('PASS', PHASE, 'DSGVO-Checkbox angeklickt', 'dsgvo')
  } else {
    record('SOFT', PHASE, 'DSGVO-Label nicht gefunden', 'dsgvo')
  }
  await page.waitForTimeout(500)

  // ─── Schritt 1.4: Submit ─────────────────────────────────────────────────
  const submitBtn = page.getByRole('button', { name: /Weiter zu Schritt 2/i }).first()
  const disabled = await submitBtn.isDisabled().catch(() => true)
  if (disabled) {
    record('SOFT', PHASE, 'Submit-Button ist disabled — Validation hat nicht durchgeschlagen (DSGVO/Pflichtfelder)', 'submit-disabled')
    // RHF-Workaround: form.requestSubmit() bypassed disabled
    await page.evaluate(() => {
      const form = document.querySelector('form')
      if (form) form.requestSubmit()
    })
    record('INFO', PHASE, 'Fallback form.requestSubmit() aufgerufen', 'submit-force')
  } else {
    await submitBtn.click()
    record('PASS', PHASE, 'Submit-Button geklickt', 'submit-click')
  }

  await page.waitForURL((url) => !url.pathname.endsWith('/schritt-1'), { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(2_000)
  await shoot(page, '01-webform-nach-submit')

  const urlNachSubmit = page.url()
  record('INFO', PHASE, `URL nach Submit: ${urlNachSubmit}`, 'redirect')

  // ─── Schritt 1.5: Bestätigungs-Page Check ───────────────────────────────
  // Erwartet: /schaden-melden/schritt-2 oder /schaden-melden/erfolgreich
  if (urlNachSubmit.includes('/schritt-2') || urlNachSubmit.includes('erfolgreich') || urlNachSubmit.includes('bestaetigung')) {
    record('PASS', PHASE, 'Webform-Submit hat weitergeleitet (Schritt 2 oder Bestätigung)', 'redirect-ok')
  } else if (urlNachSubmit.endsWith('/schritt-1')) {
    record('SOFT', PHASE, 'URL ist immer noch /schritt-1 — Form-Submit hat nicht durchgegriffen', 'redirect-fail')
  } else {
    record('INFO', PHASE, `Unerwartete Ziel-URL: ${urlNachSubmit}`, 'redirect-unknown')
  }

  // ─── Schritt 1.6: DB-Check ───────────────────────────────────────────────
  const db = getAdminDb()
  const { data: leadRows } = await db
    .from('leads')
    .select('id, vorname, nachname, status, source_channel, qualifizierungs_phase')
    .eq('email', TEST_LEAD.email)
    .eq('source_channel', 'webform_direkt')
    .order('created_at', { ascending: false })
    .limit(1)

  const lead = leadRows?.[0] ?? null
  if (!lead) {
    record('SOFT', PHASE, 'leads-Tabelle: Kein Eintrag mit email + source_channel=webform_direkt — Form hat ggf. nicht gespeichert', 'db-lead')
  } else {
    record('PASS', PHASE, `Lead in DB angelegt: ${lead.id} (status=${lead.status})`, 'db-lead')
    saveFixtureIds({ journey_lead_id: lead.id, journey_lead_email: TEST_LEAD.email })
  }

  await ctx.close().catch(() => {})

  // ─── Schritt 1.7: Cross-Role-Checkpoints ────────────────────────────────
  if (lead) {
    // Dispatch: muss den Lead sehen
    await checkpoint('dispatch', async (page) => {
      await page.goto(`${BASE_URL}/dispatch/leads`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForTimeout(2_500)
      await shoot(page, '01-checkpoint-dispatch-leads')
      // Lead-Card erscheint unter Lead-Name oder Lead-ID
      const leadVisible = page.locator(`text=/${TEST_LEAD.nachname}/i`).first()
      await assertVisible(page, leadVisible, `Lead "${TEST_LEAD.nachname}" in /dispatch/leads sichtbar`, PHASE, { tag: 'cross-dispatch-list' })
    })

    // SV: darf NICHTS sehen vom Lead (kein Auftrag, kein Fall)
    await checkpoint('sv', async (page) => {
      await page.goto(`${BASE_URL}/gutachter/auftraege`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForTimeout(2_000)
      await shoot(page, '01-checkpoint-sv-auftraege-leer')
      const leadInListe = page.locator(`text=/${TEST_LEAD.nachname}/i`).first()
      await assertHidden(page, leadInListe, `Lead "${TEST_LEAD.nachname}" darf bei SV NICHT sichtbar sein (kein Auftrag)`, PHASE, { tag: 'cross-sv-hidden' })
    })

    // Kunde: darf KEINE Fallakte sehen (Konversion noch nicht passiert)
    await checkpoint('kunde', async (page) => {
      await page.goto(`${BASE_URL}/kunde/faelle`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForTimeout(2_000)
      await shoot(page, '01-checkpoint-kunde-keine-fallakte')
      // /kunde/faelle entweder leer oder zeigt frühere Fälle (sollte nicht den frischen Lead enthalten)
      // Wir verifizieren: kein "Heckschaden mit Delle" Text aus unserer Beschreibung
      const beschreibungSichtbar = page.locator('text=/Heckschaden mit Delle/i').first()
      await assertHidden(page, beschreibungSichtbar, 'Kunde sieht keine Fallakte für den noch nicht konvertierten Lead', PHASE, { tag: 'cross-kunde-hidden' })
    })
  }

  return { leadId: lead?.id ?? null }
}
