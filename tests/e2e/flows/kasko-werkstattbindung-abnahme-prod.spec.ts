// Regel-4-/Regel-5-Abnahme-Smoke: Kasko-Werkstattbindung Phase 1 (#5857) gegen prod.
//
// Operatives Soll (Abnahme-Session, aus der Fachlogik formuliert, VOR dem Code-Lesen):
//   Ein selbstverschuldeter Kasko-Kunde nennt Versicherer + Tarif. Gebunden -> ehrliche Endseite
//   (Marke, Tarif, Sanktion, Versicherer-Kontakt, naechste Schritte, Rueckruf, Mail), KEINE Werkstatt.
//   Frei -> Werkstatt-Strecke wie bisher. Unklar -> Hinweis, Werkstatt-Strecke, Dispatch-Aufgabe.
//   Gilt an JEDEM Eingang (FlowLink, Embed-Finder, Kunde-Portal); Re-Visit zeigt das Ergebnis;
//   Dispatch sieht/korrigiert Tarif+Bindung (Lead UND Claim); Admin sieht die Wissensbasis.
//
// Alles per UI ab dem Ausgangszustand. DB-Seed NUR fuer den Ausgangszustand (Lead + FlowLink, wie ihn
// ein vorgelagerter Kanal erzeugt haette) — Muster aus smoke-kundenfunnel-szenarien-prod.spec.ts.
// Gemessen wird am DB-Zustand (expect.poll), nicht am Toast.
//
// Lauf (Worktree, Node >= 20):
//   RUN_KASKO_WB_ABNAHME=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//     node --env-file=.env.local --env-file=<smoke.env> node_modules/@playwright/test/cli.js test \
//     kasko-werkstattbindung-abnahme-prod --project=chromium --reporter=line --retries=0 --workers=1
//
// Isolation: @claimondo.test = interne Identitaet (ist_interne_email=true) -> keine Kunden-WhatsApp;
// die E6-Mail geht an eine nicht existierende Domain (Bounce), der email_log-Eintrag ist der Nachweis.

import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { computeTotp } from '../lib/totp.mjs'
import { basicAuthFehlt, basicAuthFuerZiel } from '../lib/ziel'

const RUN = process.env.RUN_KASKO_WB_ABNAHME === '1'
const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
// Nur staging liegt hinter nginx-Basic-Auth (ziel.ts) — im Journey-Gate laeuft T1/T2 gegen staging.
test.use({ httpCredentials: basicAuthFuerZiel() })
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const SHOTS = process.env.ABNAHME_SHOTS_DIR ?? 'test-results/abnahme-kwb'
const TEST_TELEFON = '+491633628571'
const KUNDE_PASSWORT = 'Kf-Smoke-Test-2026!'
const HUK_MARKE_ID = '99bec874-c6dd-4563-8365-b7575df89ed1'
const HUK_SCHADEN_TEL = '0800 2485445'

const KOELN = { adresse: 'Hansaring 30, 50670 Köln, Deutschland', lat: 50.9460795, lng: 6.9457681 }

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {})
}

async function checkAlleCheckboxen(page: Page): Promise<void> {
  const boxes = page.getByRole('checkbox')
  await boxes.first().waitFor({ state: 'visible', timeout: 20_000 })
  const n = await boxes.count()
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i)
    if (!(await b.isVisible().catch(() => false))) continue
    await b.scrollIntoViewIfNeeded().catch(() => {})
    if (!(await b.isChecked().catch(() => false))) await b.click({ force: true }).catch(() => {})
  }
}

// Ausgangszustand: Lead + FlowLink (Shape eines self_service-Leads). schuldfrage NULL -> Quali echt fahren.
async function seedeLeadUndFlowLink(db: SupabaseClient, email: string): Promise<{ leadId: string; token: string }> {
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .insert({
      vorname: 'Abnahme',
      nachname: 'KaskoWB',
      email,
      telefon: TEST_TELEFON,
      service_typ: 'komplett',
      source_channel: 'self_service',
      status: 'neu',
      qualifizierungs_phase: 'erstkontakt',
      schadentyp: 'auffahrunfall',
      sprache: 'de',
      fahrzeug_standort_adresse: KOELN.adresse,
      fahrzeug_standort_lat: KOELN.lat,
      fahrzeug_standort_lng: KOELN.lng,
      besichtigungsort_adresse: KOELN.adresse,
      besichtigungsort_lat: KOELN.lat,
      besichtigungsort_lng: KOELN.lng,
    })
    .select('id')
    .single()
  if (leadErr || !lead) throw new Error(`Lead-Seed fehlgeschlagen: ${leadErr?.message}`)
  const token = randomBytes(16).toString('hex')
  const { error: flErr } = await db.from('flow_links').insert({
    token,
    lead_id: lead.id,
    service_typ: 'komplett',
    sprache: 'de',
    status: 'aktiv',
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (flErr) throw new Error(`FlowLink-Seed fehlgeschlagen: ${flErr.message}`)
  return { leadId: lead.id as string, token }
}

// /flow bis zur Tariffrage: Consent -> "Ich selbst" -> "Ja, Kasko".
async function flowBisTariffrage(page: Page, token: string): Promise<void> {
  await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded' })
  await checkAlleCheckboxen(page)
  await page.getByRole('button', { name: /^weiter/i }).first().click()
  await page.getByRole('button', { name: /^Ich selbst/i }).click()
  await page.getByRole('button', { name: /Ja, ich habe eine Kaskoversicherung/i }).click()
  await expect(
    page.getByRole('heading', { name: /Bei welcher Versicherung ist Ihr Fahrzeug kaskoversichert/i }),
  ).toBeVisible({ timeout: 25_000 })
}

async function waehleMarke(page: Page, marke: string): Promise<void> {
  await page.getByRole('button', { name: /Kaskoversicherung wählen/i }).click()
  await page.getByPlaceholder('Versicherung suchen …').fill(marke)
  await page.getByRole('option', { name: marke, exact: true }).click()
}

async function login(page: Page, email: string, password: string, totpSecret?: string): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20_000 })
  if (page.url().includes('/login/2fa')) {
    if (!totpSecret) throw new Error(`${email}: 2FA-Challenge ohne TOTP-Secret`)
    await page.fill('input[autocomplete="one-time-code"]', computeTotp(totpSecret))
    await page.getByRole('button', { name: /Bestätigen/ }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  }
}

async function leadZeile(db: SupabaseClient, leadId: string) {
  const { data } = await db
    .from('leads')
    .select(
      'status, disqualifiziert, disqualifiziert_grund_key, freie_werkstattwahl, werkstattbindung_quelle, eigene_versicherung_marke_id, eigene_versicherung_name, eigene_kasko_tarif_id, eigene_kasko_tarif_name, abrechnungsweg, konvertiert_zu_claim_id',
    )
    .eq('id', leadId)
    .maybeSingle()
  return data as Record<string, unknown> | null
}

// Alles rund um einen Lead aufraeumen (Service-Role). Muster aus dem Kundenfunnel-Driver + tasks.
async function cleanupLead(db: SupabaseClient, email: string): Promise<void> {
  try {
    const { data: lead } = await db.from('leads').select('id, konvertiert_zu_claim_id').eq('email', email).maybeSingle()
    const leadId = lead?.id as string | undefined
    const claimId = lead?.konvertiert_zu_claim_id as string | undefined
    if (claimId) {
      await db.from('tasks').delete().eq('claim_id', claimId)
      await db
        .from('claims')
        .update({ ist_aktiv: false, deaktiviert_am: new Date().toISOString(), deaktiviert_grund: 'testfall' })
        .eq('id', claimId)
      const { data: claim } = await db.from('claims').select('geschaedigter_user_id').eq('id', claimId).maybeSingle()
      const uid = claim?.geschaedigter_user_id as string | undefined
      if (uid) {
        await db.from('mitteilungen').delete().eq('empfaenger_id', uid)
        await db.from('notification_deliveries').delete().eq('recipient_user_id', uid)
        await db.from('claim_parties').update({ user_id: null }).eq('user_id', uid)
        await db.from('claims').update({ geschaedigter_user_id: null }).eq('geschaedigter_user_id', uid)
        const del = await db.auth.admin.deleteUser(uid).catch((e: unknown) => ({ error: e }))
        if (del && 'error' in del && del.error) console.warn('[cleanup] deleteUser fehlgeschlagen:', uid, del.error)
      }
    }
    if (leadId) {
      await db.from('tasks').delete().eq('entity_id', leadId)
      await db.from('tasks').delete().eq('lead_id', leadId)
      await db.from('flow_links').delete().eq('lead_id', leadId)
      await db.from('admin_termine').delete().eq('lead_id', leadId)
      if (claimId) await db.from('claims').update({ lead_id: null }).eq('id', claimId)
      const { error } = await db.from('leads').delete().eq('id', leadId)
      if (error) console.warn('[cleanup] Lead bleibt liegen:', leadId, error.message)
    }
  } catch (e) {
    console.warn('[cleanup] Fehler (best-effort):', e)
  }
}

// Kunde-Portal-Claim (Schaden melden) aufraeumen: Claim deaktivieren, Lead loesen/loeschen, Vehicle-Stub weg.
async function cleanupPortalClaim(db: SupabaseClient, claimId: string): Promise<void> {
  try {
    const { data: c } = await db.from('claims').select('lead_id, vehicle_id').eq('id', claimId).maybeSingle()
    await db.from('tasks').delete().eq('claim_id', claimId)
    await db
      .from('claims')
      .update({ ist_aktiv: false, deaktiviert_am: new Date().toISOString(), deaktiviert_grund: 'testfall', lead_id: null, vehicle_id: null })
      .eq('id', claimId)
    const leadId = c?.lead_id as string | null
    if (leadId) {
      await db.from('tasks').delete().eq('entity_id', leadId)
      await db.from('flow_links').delete().eq('lead_id', leadId)
      await db.from('admin_termine').delete().eq('lead_id', leadId)
      await db.from('leads').delete().eq('id', leadId)
    }
    const vehicleId = c?.vehicle_id as string | null
    if (vehicleId) await db.from('vehicles').delete().eq('id', vehicleId)
  } catch (e) {
    console.warn('[cleanupPortalClaim] Fehler (best-effort):', e)
  }
}

// Bewusst NICHT serial: nur T6 haengt an T2 (skippt sauber, wenn T2 fehlt). Ein roter T1 darf die
// uebrigen Eingaenge nicht mitreissen — jeder Eingang ist ein eigener Befund.
test.describe('Abnahme Kasko-Werkstattbindung Phase 1 (prod, gated RUN_KASKO_WB_ABNAHME)', () => {
  test.skip(!RUN, 'RUN_KASKO_WB_ABNAHME nicht gesetzt')
  test.skip(basicAuthFehlt(), 'Ziel ist staging, aber STAGING_BASIC_AUTH_USER/PASS fehlen — sichtbar skippen statt 401 als Produktfehler')

  let aufraeumen: string[] = []
  // T2-Zustand (frei -> Claim) wird von T6 (Dispatch-Override) weiterverwendet und erst dort aufgeraeumt.
  // ⚠ Playwright startet nach einem FEHLGESCHLAGENEN Test einen neuen Worker — Modul-State ist dann weg
  // (Lauf 3: T5 rot -> T6 sah t2=null -> skip, und afterAll raeumte T2 nicht auf). Deshalb zusaetzlich
  // als Datei persistiert; T6/afterAll lesen sie, wenn der Speicher leer ist.
  const T2_STATE = `${SHOTS}/t2-state.json`
  let t2: { email: string; leadId: string; claimId: string } | null = null
  let portalClaimId: string | null = null
  function t2Lesen(): typeof t2 {
    if (t2) return t2
    try {
      return JSON.parse(readFileSync(T2_STATE, 'utf8'))
    } catch {
      return null
    }
  }
  function t2Schreiben(v: typeof t2) {
    t2 = v
    mkdirSync(SHOTS, { recursive: true })
    if (v) writeFileSync(T2_STATE, JSON.stringify(v))
    else rmSync(T2_STATE, { force: true })
  }

  test.afterEach(async () => {
    const db = svc()
    const emails = aufraeumen
    aufraeumen = []
    for (const email of emails) await cleanupLead(db, email)
  })

  test.afterAll(async () => {
    const db = svc()
    const rest = t2Lesen()
    if (rest) {
      await cleanupLead(db, rest.email)
      t2Schreiben(null)
    }
    if (portalClaimId) await cleanupPortalClaim(db, portalClaimId)
  })

  // ── T1 · FlowLink gebunden: HUK-COBURG -> Classic SELECT -> Endseite + Rueckruf + Mail; Re-Visit ──
  test('T1 FlowLink gebunden: HUK Classic SELECT -> Endseite, Rückruf, Mail, DB, Re-Visit', async ({ page }) => {
    test.setTimeout(240_000)
    const email = `abnahme-kwb-gebunden-${Date.now()}@claimondo.test`
    aufraeumen.push(email)
    const db = svc()
    const { leadId, token } = await seedeLeadUndFlowLink(db, email)

    await flowBisTariffrage(page, token)
    await shot(page, 't1-01-tariffrage')
    await waehleMarke(page, 'HUK-COBURG')
    await expect(page.getByRole('heading', { name: /Welchen Tarif haben Sie bei HUK-COBURG/i })).toBeVisible({ timeout: 20_000 })
    await shot(page, 't1-02-tarifliste')
    // Mess-Punkt UX: Ein Klick auf die Karte entscheidet sofort (keine Bestaetigung) — Stand ohne #-Bestaetigungs-PR.
    await page.getByText('Classic SELECT', { exact: true }).click()

    const endseite = page.getByRole('heading', { name: /Ihr Kasko-Tarif enthält eine Werkstattbindung/i })
    await expect(endseite).toBeVisible({ timeout: 30_000 })
    // Messfalle 2: nach dem Ergebnis rendert revalidatePath die Seite ueber das Re-Visit-Gate neu
    // („Wird geladen …"). Erst warten, bis der Ladezustand weg ist, dann messen — mit Auto-Wait.
    await expect(page.getByText('Wird geladen …')).toHaveCount(0, { timeout: 30_000 })
    await expect(endseite).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/HUK-COBURG · Tarif „Classic SELECT“/), 'Tarifzeile Marke · Tarif').toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(HUK_SCHADEN_TEL).first(), 'Versicherer-Kontakt (Schaden-Hotline aus versicherungen)').toBeVisible()
    await expect(page.getByText(/Kürzung auf 85 %/), 'HUK-Sanktionstext aus kasko_wb_konditionen').toBeVisible()
    await expect(page.getByText(/Partnerwerkstatt/).first(), 'Partnernetz').toBeVisible()
    await shot(page, 't1-03-endseite')
    // UX-Messung: welche Handlungen bietet die Endseite? (Erwartung Soll: Rueckruf + Korrekturweg)
    const buttons = await page.getByRole('button').allInnerTexts()
    const links = await page.getByRole('link').allInnerTexts()
    console.log('[T1] Endseite Buttons:', JSON.stringify(buttons), 'Links:', JSON.stringify(links))
    const hatKorrekturweg = [...buttons, ...links].some((t) => /zurück|ändern|korrigieren|nicht mein/i.test(t))
    console.log('[T1] Korrekturweg auf der Endseite vorhanden:', hatKorrekturweg)

    // Rueckruf anfordern (E2)
    await page.getByRole('button', { name: /Rückruf anfordern/i }).click()
    await expect(page.getByText(/Danke – wir rufen Sie zurück/i)).toBeVisible({ timeout: 20_000 })
    await shot(page, 't1-04-rueckruf')

    // DB: Lead-Entscheidung + Herkunft + Disqualifikation
    await expect
      .poll(async () => (await leadZeile(db, leadId))?.werkstattbindung_quelle, { timeout: 20_000 })
      .toBe('tarif')
    const lead = (await leadZeile(db, leadId))!
    console.log('[T1] Lead:', JSON.stringify(lead))
    expect(lead.freie_werkstattwahl, 'gebunden').toBe(false)
    expect(lead.eigene_versicherung_marke_id).toBe(HUK_MARKE_ID)
    expect(lead.eigene_versicherung_name).toBe('HUK-COBURG')
    expect(lead.eigene_kasko_tarif_name).toBe('Classic SELECT')
    expect(lead.disqualifiziert, 'Lead disqualifiziert').toBe(true)
    expect(lead.disqualifiziert_grund_key).toBe('werkstattbindung')

    // Rueckruf in der Dispatch-Queue
    await expect
      .poll(
        async () => {
          const { count } = await db.from('admin_termine').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('typ', 'rueckruf')
          return count ?? 0
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0)

    // Re-Visit: Endseite, nicht die Frage, nicht der Gutachter-Text
    await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Wird geladen …')).toHaveCount(0, { timeout: 30_000 })
    await expect(endseite).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/HUK-COBURG · Tarif „Classic SELECT“/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /Bei welcher Versicherung/i })).toHaveCount(0)
    await shot(page, 't1-05-revisit')

    // E6-Mail: fuer @claimondo.test NICHT messbar — sendEmail (lib/email/google/client.ts, Send-Isolation
    // 2026-07-03) unterdrueckt im Live-Modus rein interne/Test-Empfaenger VOR dem email_log-Insert.
    // Lauf 2 haette daraus fast den Fehlbefund „Mail still" gemacht (Klasse aus audit-kundenfluss:
    // Send-Isolation gemessen statt Produkt). Gemessen wird deshalb die Isolation selbst (0 Zeilen =
    // korrekt); die Zustellung an echte Kunden bleibt „verdrahtet, nicht gelaufen" und steht so in der Abnahme.
    await page.waitForTimeout(5_000)
    const { data: mailZeilen } = await db
      .from('email_log')
      .select('status, template, fehler, created_at')
      .eq('empfaenger', email)
      .eq('template', 'kasko_werkstattbindung_kunde')
    console.log('[T1] email_log fuer interne Test-Adresse', email, ':', JSON.stringify(mailZeilen ?? []))
    test.info().annotations.push({
      type: 'nicht-nachweisbar',
      description: 'E6-Mail: Send-Isolation unterdrueckt interne Test-Adressen ohne email_log-Eintrag; Zustellung an echte Kunden hier nicht messbar (braucht externe Test-Inbox).',
    })
    expect.soft((mailZeilen ?? []).length, 'Send-Isolation: interne Test-Adresse erzeugt keinen email_log-Eintrag').toBe(0)
  })

  // ── T2 · FlowLink frei: Classic -> Werkstatt-Strecke -> Portal; Claim traegt Antwort ──
  test('T2 FlowLink frei: HUK Classic -> Werkstatt-Strecke -> Kundenportal, Claim trägt Bindung', async ({ page }) => {
    test.setTimeout(300_000)
    const email = `abnahme-kwb-frei-${Date.now()}@claimondo.test`
    const db = svc()
    const { leadId, token } = await seedeLeadUndFlowLink(db, email)
    t2Schreiben({ email, leadId, claimId: '' })

    await flowBisTariffrage(page, token)
    await waehleMarke(page, 'HUK-COBURG')
    await expect(page.getByRole('heading', { name: /Welchen Tarif haben Sie bei HUK-COBURG/i })).toBeVisible({ timeout: 20_000 })
    await page.getByText('Classic', { exact: true }).click()

    // Frei -> KEINE Endseite; naechster Step erscheint (Schaden-Aufnahme / Werkstatt-Liste / Account)
    await expect(page.getByRole('heading', { name: /Ihr Kasko-Tarif enthält eine Werkstattbindung/i })).toHaveCount(0)
    // Die Action schreibt in ZWEI Schritten (erst Quali-Pfad -> freie_werkstattwahl, dann Tariffelder ->
    // werkstattbindung_quelle). Lauf 2 las dazwischen (fww=true, quelle=null). Auf den LETZTEN Write pollen.
    await expect
      .poll(
        async () => {
          const z = await leadZeile(db, leadId)
          console.log('[T2] Lead-Poll:', JSON.stringify({ fww: z?.freie_werkstattwahl, quelle: z?.werkstattbindung_quelle, tarif: z?.eigene_kasko_tarif_name }))
          return z?.werkstattbindung_quelle
        },
        { timeout: 30_000 },
      )
      .toBe('tarif')
    const lead1 = (await leadZeile(db, leadId))!
    expect(lead1.freie_werkstattwahl, 'frei').toBe(true)
    console.log('[T2] Lead nach Tarifwahl:', JSON.stringify(lead1))
    expect(lead1.werkstattbindung_quelle).toBe('tarif')
    expect(lead1.eigene_kasko_tarif_name).toBe('Classic')
    expect(lead1.disqualifiziert).not.toBe(true)
    await shot(page, 't2-01-nach-classic')

    // Zwischenstrecke bis Account (Muster Kundenfunnel-Driver)
    for (let i = 0; i < 3; i++) {
      const naechster = page.getByRole('button', { name: /kann die Werkstatt frei wählen|vorerst überspringen/i }).first()
      try {
        await naechster.waitFor({ state: 'visible', timeout: 8_000 })
      } catch {
        break
      }
      await naechster.click()
    }
    await page.getByRole('button', { name: /^überspringen$/i }).first().click({ timeout: 10_000 }).catch(() => {})
    await page.waitForURL(/\/passwort-aendern|\/kunde/, { timeout: 90_000 })
    if (/\/passwort-aendern/.test(page.url())) {
      await page.getByRole('textbox', { name: /Neues Passwort/i }).fill(KUNDE_PASSWORT)
      await page.getByRole('textbox', { name: /Passwort bestätigen/i }).fill(KUNDE_PASSWORT)
      await page.getByRole('button', { name: /Passwort ändern|Speichern|Weiter/i }).click()
      await page.waitForURL(/\/kunde/, { timeout: 30_000 })
    }
    await shot(page, 't2-02-portal')

    // Claim: Antwort kopiert (Konversion)
    let claimId = ''
    await expect
      .poll(
        async () => {
          const { data } = await db.from('claims').select('id').eq('lead_id', leadId).maybeSingle()
          claimId = (data?.id as string) ?? ''
          return claimId
        },
        { timeout: 30_000 },
      )
      .not.toBe('')
    t2Schreiben({ email, leadId, claimId })
    const { data: claim } = await db
      .from('claims')
      .select('abrechnungsweg, freie_werkstattwahl, werkstattbindung_quelle, eigene_kasko_tarif_name, eigene_versicherung_name')
      .eq('id', claimId)
      .maybeSingle()
    console.log('[T2] Claim:', JSON.stringify(claim))
    expect(claim!.abrechnungsweg).toBe('kasko')
    expect(claim!.freie_werkstattwahl, 'Claim: frei kopiert').toBe(true)
    expect(claim!.werkstattbindung_quelle).toBe('tarif')
    expect(claim!.eigene_kasko_tarif_name).toBe('Classic')

    // Fallakte: Werkstatt-Finder statt Tariffrage. Direkt nach dem Passwort-Redirect navigiert der Client
    // noch selbst (Lauf 5: net::ERR_ABORTED) — erst zur Ruhe kommen lassen, dann einmal wiederholen.
    await page.waitForLoadState('networkidle').catch(() => {})
    try {
      await page.goto(`${APP}/kunde/faelle/${claimId}`, { waitUntil: 'domcontentloaded' })
    } catch {
      await page.waitForTimeout(3_000)
      await page.goto(`${APP}/kunde/faelle/${claimId}`, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByRole('heading', { name: /Werkstatt finden/i }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Dein Kasko-Tarif/i)).toHaveCount(0)
    await shot(page, 't2-03-fallakte-finder')
  })

  // ── T3 · FlowLink unbekannt: "weiss nicht" -> Marker "kann nicht pruefen" -> Hinweis -> weiter; Task; Re-Visit ohne Frage ──
  test('T3 FlowLink unklar: Tarif unbekannt -> Marker-Frage -> Hinweis -> Werkstatt-Strecke + Dispatch-Task', async ({ page }) => {
    test.setTimeout(240_000)
    const email = `abnahme-kwb-unklar-${Date.now()}@claimondo.test`
    aufraeumen.push(email)
    const db = svc()
    const { leadId, token } = await seedeLeadUndFlowLink(db, email)

    await flowBisTariffrage(page, token)
    await waehleMarke(page, 'HUK-COBURG')
    await expect(page.getByRole('heading', { name: /Welchen Tarif haben Sie bei HUK-COBURG/i })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /Ich weiß es nicht/i }).click()
    await expect(page.getByRole('heading', { name: /Steht auf Ihrem Versicherungsschein einer dieser Zusätze/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('„SELECT“', { exact: true })).toBeVisible()
    await shot(page, 't3-01-marker')
    await page.getByRole('button', { name: /Ich kann das gerade nicht prüfen/i }).click()
    await expect(page.getByRole('heading', { name: /Bitte prüfen Sie Ihren Versicherungsschein/i })).toBeVisible({ timeout: 30_000 })
    await shot(page, 't3-02-unklar-hinweis')

    await expect
      .poll(async () => (await leadZeile(db, leadId))?.werkstattbindung_quelle, { timeout: 20_000 })
      .toBe('unbekannt')
    const lead = (await leadZeile(db, leadId))!
    console.log('[T3] Lead:', JSON.stringify(lead))
    expect(lead.freie_werkstattwahl, 'unbekannt = NULL').toBeNull()
    expect(lead.disqualifiziert).not.toBe(true)

    // Dispatch-Aufgabe (E3)
    await expect
      .poll(
        async () => {
          const { data } = await db.from('tasks').select('status, empfaenger_rolle, task_code').eq('entity_id', leadId).eq('task_code', 'kasko_werkstattbindung_klaeren')
          console.log('[T3] tasks:', JSON.stringify(data))
          return (data ?? []).length
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0)

    // Weiter -> Werkstatt-Strecke
    await page.getByRole('button', { name: /Verstanden – weiter zur Werkstatt/i }).click()
    await expect(page.getByRole('button', { name: /kann die Werkstatt frei wählen|vorerst überspringen|^überspringen$|^weiter/i }).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 't3-03-weiter')

    // Re-Visit: die Tariffrage darf NICHT erneut kommen (Step-Bedingung quelle != null)
    await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(4_000)
    await expect(page.getByRole('heading', { name: /Bei welcher Versicherung/i })).toHaveCount(0)
    await shot(page, 't3-04-revisit')
  })

  // ── T4 · FlowLink Freitext + Marker ja: Marke nicht dabei -> generische Frage -> gebunden ohne Rechtstraeger ──
  test('T4 FlowLink Freitext: Versicherung nicht dabei -> Marker ja -> Endseite mit GDV-Default', async ({ page }) => {
    test.setTimeout(200_000)
    const email = `abnahme-kwb-freitext-${Date.now()}@claimondo.test`
    aufraeumen.push(email)
    const db = svc()
    const { leadId, token } = await seedeLeadUndFlowLink(db, email)

    await flowBisTariffrage(page, token)
    await page.getByRole('button', { name: /Meine Versicherung ist nicht dabei/i }).click()
    await page.getByPlaceholder('Name der Versicherung').fill('Abnahme Testversicherung')
    await page.getByRole('button', { name: /^Weiter$/i }).click()
    await expect(page.getByRole('heading', { name: /Enthält Ihr Vertrag einen Werkstattbindungs-Baustein/i })).toBeVisible({ timeout: 15_000 })
    await shot(page, 't4-01-generische-marker-frage')
    await page.getByRole('button', { name: /Ja, das steht auf meinem Schein/i }).click()
    await expect(page.getByRole('heading', { name: /Ihr Kasko-Tarif enthält eine Werkstattbindung/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Wird geladen …')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByText(/80 %/).first(), 'GDV-Default-Sanktion').toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Abnahme Testversicherung/).first()).toBeVisible()
    expect(await page.locator('a[href^="tel:"]').count(), 'ohne Rechtsträger keine Hotline').toBe(0)
    await shot(page, 't4-02-endseite-gdv')

    await expect
      .poll(async () => (await leadZeile(db, leadId))?.werkstattbindung_quelle, { timeout: 20_000 })
      .toBe('marker')
    const lead = (await leadZeile(db, leadId))!
    console.log('[T4] Lead:', JSON.stringify(lead))
    expect(lead.freie_werkstattwahl).toBe(false)
    expect(lead.eigene_versicherung_marke_id).toBeNull()
    expect(lead.eigene_versicherung_name).toBe('Abnahme Testversicherung')
    expect(lead.disqualifiziert_grund_key).toBe('werkstattbindung')
  })

  // ── T6 · Dispatch (angemeldet): Override gebunden auf T2-Lead -> Lead UND Claim; Kunde sieht Bindungs-Card ──
  test('T6 Dispatch-Override: Tarif Classic SELECT -> gebunden auf Lead+Claim, Kunde sieht Bindungs-Card', async ({ browser }) => {
    test.setTimeout(240_000)
    const zustand = t2Lesen()
    test.skip(!zustand || !zustand.claimId, 'T2-Zustand fehlt (T2 nicht gelaufen oder rot)')
    const db = svc()
    const { email, leadId, claimId } = zustand!

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await login(page, 'test-dispatch@claimondo.de', process.env.TEST_DISPATCH_PASSWORD ?? '', process.env.TEST_DISPATCH_TOTP_SECRET)
      await page.goto(`${APP}/dispatch/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await shot(page, 't6-01-lead-detail')
      const body = await page.locator('body').innerText()
      console.log('[T6] Badge-Texte:', body.match(/Kasko[^\n]{0,120}/g))
      console.log('[T6] Hinweis-Banner:', body.match(/Achtung:[^\n]{0,160}/g))
      // Das Lead-Formular ist in Tabs (Kontakt · Schaden · Unfall · Fahrzeug · Schuld · …); das Kasko-Feld
      // liegt in der Sektion „Schuld" (onboarding_felder, nur bei schuldfrage=eigenverantwortung).
      await page.getByRole('button', { name: /^Schuld$/ }).or(page.getByRole('tab', { name: /^Schuld$/ })).first().click()
      await shot(page, 't6-01b-tab-schuld')
      // Feld: Tarif-Select (aria-label "Kasko-Tarif") auf Classic SELECT -> Bindung automatisch gebunden + persist
      const tarifSelect = page.getByLabel('Kasko-Tarif')
      await expect(tarifSelect).toBeVisible({ timeout: 30_000 })
      await tarifSelect.selectOption({ label: /Classic SELECT — Werkstattbindung/ as unknown as string }).catch(async () => {
        const opts = await tarifSelect.locator('option').allInnerTexts()
        const idx = opts.findIndex((o) => /^Classic SELECT/.test(o))
        const val = await tarifSelect.locator('option').nth(idx).getAttribute('value')
        await tarifSelect.selectOption(val!)
      })
      await shot(page, 't6-02-override')

      await expect
        .poll(async () => (await leadZeile(db, leadId))?.freie_werkstattwahl, { timeout: 30_000 })
        .toBe(false)
      const lead = (await leadZeile(db, leadId))!
      console.log('[T6] Lead nach Override:', JSON.stringify(lead))
      expect(lead.werkstattbindung_quelle).toBe('dispatcher')
      expect(lead.eigene_kasko_tarif_name).toBe('Classic SELECT')
      await expect
        .poll(
          async () => {
            const { data } = await db.from('claims').select('freie_werkstattwahl, werkstattbindung_quelle').eq('id', claimId).maybeSingle()
            console.log('[T6] Claim:', JSON.stringify(data))
            return data?.freie_werkstattwahl
          },
          { timeout: 30_000 },
        )
        .toBe(false)
    } finally {
      await ctx.close()
    }

    // Kunde sieht die Bindungs-Card statt des Finders
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    try {
      await login(page2, email, KUNDE_PASSWORT)
      await page2.goto(`${APP}/kunde/faelle/${claimId}`, { waitUntil: 'domcontentloaded' })
      await page2.waitForLoadState('networkidle').catch(() => {})
      await expect(page2.getByText(/Ihr Kasko-Tarif enthält eine Werkstattbindung/i)).toBeVisible({ timeout: 30_000 })
      await expect(page2.getByRole('heading', { name: /Werkstatt finden/i })).toHaveCount(0)
      await shot(page2, 't6-03-kunde-bindungs-card')
    } finally {
      await ctx2.close()
    }
    await cleanupLead(db, email)
    t2Schreiben(null)
  })

  // ── T5 · Embed-Werkstatt-Finder (anonym): Kasko gebunden -> keine Werkstatt, Rueckruf-Kontakt, Lead disqualifiziert ──
  // Zwei Varianten: Telefon ist im Kontakt-Schritt optional — der versprochene Rueckruf muss in beiden entstehen
  // (Lauf 3: ohne Telefon 0 Rueckrufe -> Ursache offen, deshalb Positivkontrolle MIT Telefon).
  for (const variante of [
    { name: 'ohne Telefon', telefon: '' },
    { name: 'mit Telefon', telefon: TEST_TELEFON },
  ]) {
  test(`T5 Embed-Werkstatt-Finder (${variante.name}): Kasko gebunden -> kein Werkstatt-Angebot, Rückruf-Kontakt, Lead ohne Werkstatt`, async ({ page }) => {
    test.setTimeout(240_000)
    const email = `abnahme-kwb-embed-${Date.now()}@claimondo.test`
    aufraeumen.push(email)
    const db = svc()

    await page.goto(`${APP}/embed/werkstatt-finder`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    // Der Standort-Step rendert ZWEI gleichnamige Adressfelder (Layout-Varianten, eines unsichtbar) —
    // strict mode bricht sonst. Nur das sichtbare nehmen.
    const adresse = page.getByPlaceholder('Adresse eingeben…').locator('visible=true').first()
    await expect(adresse).toBeVisible({ timeout: 20_000 })
    console.log('[T5] Adressfelder gesamt:', await page.getByPlaceholder('Adresse eingeben…').count())
    await adresse.fill('Hansaring 30, Köln')
    const vorschlag = page.locator('.pac-item, [role="option"]').first()
    await vorschlag.waitFor({ state: 'visible', timeout: 15_000 })
    await vorschlag.click()
    await shot(page, 't5-01-standort')
    const weiter = page.getByRole('button', { name: /^Weiter/i })
    await expect(weiter).toBeEnabled({ timeout: 15_000 })
    await weiter.click()

    await page.getByPlaceholder('z. B. BMW').fill('VW')
    await weiter.click()
    await page.getByRole('button', { name: /^Karosserie$/i }).click()
    await weiter.click()

    // Abrechnung: Kasko -> Tariffrage inline (kompakt)
    await page.getByRole('button', { name: /Über meine Kaskoversicherung/i }).click()
    await expect(page.getByRole('heading', { name: /Bei welcher Versicherung ist Ihr Fahrzeug kaskoversichert/i })).toBeVisible({ timeout: 20_000 })
    await expect(weiter, 'Weiter erst mit Antwort').toBeDisabled()
    await waehleMarke(page, 'HUK-COBURG')
    await page.getByText('Classic SELECT', { exact: true }).click()
    await expect(page.getByText(/Ihr Tarif enthält eine Werkstattbindung/i)).toBeVisible({ timeout: 15_000 })
    await shot(page, 't5-02-abrechnung-gebunden')
    await expect(weiter).toBeEnabled()
    await weiter.click()

    // Kontakt: Rueckruf-Formular statt Werkstatt-Anfrage
    await expect(page.getByText(/Wir vermitteln in diesem Fall keine Werkstatt/i)).toBeVisible({ timeout: 15_000 })
    // UX-Messung (Befund A, Lauf 3): Text sagt „keine Werkstatt", darunter stehen Werkstaetten mit „Auswaehlen".
    const auswaehlen = await page.getByRole('button', { name: /^Auswählen$/ }).count()
    const absendenLabel = await page.getByRole('button', { name: /Anfrage absenden|Werkstatt anfragen/i }).first().innerText()
    console.log(`[T5 ${variante.name}] Werkstatt-„Auswählen"-Buttons im gebundenen Kontakt-Schritt:`, auswaehlen, '· Absende-Button:', JSON.stringify(absendenLabel))
    expect.soft(auswaehlen, 'gebunden: keine Werkstatt zur Auswahl anbieten (Text verspricht es)').toBe(0)
    await page.getByPlaceholder('Vorname').fill('Abnahme')
    await page.getByPlaceholder('Nachname').fill('Embed')
    await page.getByPlaceholder('E-Mail').fill(email)
    if (variante.telefon) await page.getByPlaceholder('Telefon (optional)').fill(variante.telefon)
    await shot(page, `t5-03-kontakt-${variante.telefon ? 'mit' : 'ohne'}-telefon`)
    await page.getByRole('button', { name: /Anfrage absenden|Werkstatt anfragen/i }).first().click()

    // Weiterleitung in den /flow -> Bindungs-Endseite (Re-Visit-Gate), ggf. nach Consent
    await page.waitForURL(/\/flow\//, { timeout: 60_000 })
    const endseite = page.getByRole('heading', { name: /Ihr Kasko-Tarif enthält eine Werkstattbindung/i })
    try {
      await endseite.waitFor({ state: 'visible', timeout: 20_000 })
    } catch {
      await checkAlleCheckboxen(page).catch(() => {})
      await page.getByRole('button', { name: /^weiter/i }).first().click({ timeout: 5_000 }).catch(() => {})
      await expect(endseite).toBeVisible({ timeout: 30_000 })
    }
    await expect(page.getByText('Wird geladen …')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByText(/HUK-COBURG · Tarif „Classic SELECT“/)).toBeVisible({ timeout: 30_000 })
    await shot(page, 't5-04-flow-endseite')

    // DB: Lead ohne Werkstatt, disqualifiziert, Rueckruf, Mail
    let leadId = ''
    await expect
      .poll(
        async () => {
          const { data } = await db.from('leads').select('id').eq('email', email).maybeSingle()
          leadId = (data?.id as string) ?? ''
          return leadId
        },
        { timeout: 20_000 },
      )
      .not.toBe('')
    const { data: lead } = await db
      .from('leads')
      .select('reparatur_werkstatt_id, disqualifiziert, disqualifiziert_grund_key, freie_werkstattwahl, werkstattbindung_quelle, eigene_kasko_tarif_name, source_channel, schuldfrage, eigene_versicherung')
      .eq('id', leadId)
      .maybeSingle()
    console.log(`[T5 ${variante.name}] Lead:`, JSON.stringify(lead))
    expect(lead!.reparatur_werkstatt_id, 'keine Werkstatt zugewiesen').toBeNull()
    expect(lead!.freie_werkstattwahl).toBe(false)
    expect(lead!.werkstattbindung_quelle).toBe('tarif')
    expect(lead!.disqualifiziert_grund_key).toBe('werkstattbindung')
    // Rueckruf (Review K1: „der Kontakt-Schritt verspricht einen Rueckruf -> real anlegen"). Instrumentiert:
    // alle admin_termine des Leads (ohne typ-Filter) + Dispatcher-Mitteilung, damit ein 0 erklaerbar ist.
    let rueckrufe = 0
    for (let i = 0; i < 10 && rueckrufe === 0; i++) {
      const { count } = await db.from('admin_termine').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('typ', 'rueckruf')
      rueckrufe = count ?? 0
      if (rueckrufe === 0) await page.waitForTimeout(2_000)
    }
    const { data: alleTermine } = await db.from('admin_termine').select('typ, status, titel').eq('lead_id', leadId)
    const { data: mitteilungen } = await db.from('mitteilungen').select('kategorie, titel').eq('kontext_id', leadId)
    console.log(`[T5 ${variante.name}] admin_termine:`, JSON.stringify(alleTermine ?? []), '· mitteilungen:', JSON.stringify(mitteilungen ?? []))
    expect(rueckrufe, `Rückruf in der Dispatch-Queue (${variante.name})`).toBeGreaterThan(0)
    // E6-Mail: fuer @claimondo.test nicht messbar (Send-Isolation, siehe T1) — bewusst keine Assertion.
  })
  }

  // ── T7 · Kunde-Portal (angemeldet): Schaden melden (Vollkasko) -> Tariffrage-Card -> gebunden -> Bindungs-Card ──
  test('T7 Kunde-Portal: Schaden melden (Vollkasko) -> Tarif-Card statt Finder -> gebunden -> Bindungs-Card', async ({ page }) => {
    test.setTimeout(300_000)
    test.skip(!process.env.TEST_KUNDE_PASSWORD, 'TEST_KUNDE_PASSWORD leer (CI: aus SMOKE_KUNDE_PASS gemappt) — sichtbar skippen statt Login-Fehler als Produktfehler')
    const db = svc()
    await login(page, 'smoke-kunde@claimondo.de', process.env.TEST_KUNDE_PASSWORD ?? '')
    await page.goto(`${APP}/kunde/schaden-melden`, { waitUntil: 'domcontentloaded' })
    const kennzeichen = `K-WB ${100 + Math.floor(Math.random() * 900)}`
    await page.getByLabel('Kennzeichen').fill(kennzeichen)
    await page.getByPlaceholder('TT.MM.JJJJ').fill('01.09.2026')
    await page.getByLabel('PLZ des Schadenorts').fill('50667')
    await page.locator('#hergang').fill('Abnahme-Smoke Kasko-Werkstattbindung: beim Rangieren an einen Poller gefahren.')
    await page.getByLabel('Wie ist der Schaden entstanden?').selectOption('vollkasko')
    await shot(page, 't7-01-schaden-melden')
    await page.getByRole('button', { name: /^Schaden melden$/i }).click()
    await page.waitForURL(/\/kunde\/faelle\/[0-9a-f-]+/, { timeout: 90_000 })
    portalClaimId = page.url().match(/\/kunde\/faelle\/([0-9a-f-]+)/)![1]
    console.log('[T7] Claim:', portalClaimId)
    await page.waitForLoadState('networkidle').catch(() => {})

    const { data: c0 } = await db.from('claims').select('abrechnungsweg, freie_werkstattwahl, werkstattbindung_quelle, lead_id').eq('id', portalClaimId).maybeSingle()
    console.log('[T7] Claim nach Meldung:', JSON.stringify(c0))

    // Tariffrage-Card VOR dem Finder
    await expect(page.getByText(/Dein Kasko-Tarif/i)).toBeVisible({ timeout: 40_000 })
    await expect(page.getByRole('heading', { name: /Werkstatt finden/i })).toHaveCount(0)
    const body = await page.locator('body').innerText()
    console.log('[T7] Anrede-Mix Card: "Dein Kasko-Tarif" + "Ihr Fahrzeug":', /Dein Kasko-Tarif/.test(body) && /Ihr Fahrzeug kaskoversichert/.test(body))
    await shot(page, 't7-02-tarif-card')
    await waehleMarke(page, 'HUK-COBURG')
    await page.getByText('Classic SELECT', { exact: true }).click()
    await expect(page.getByText(/Ihr Kasko-Tarif enthält eine Werkstattbindung/i)).toBeVisible({ timeout: 40_000 })
    await expect(page.getByRole('heading', { name: /Werkstatt finden/i })).toHaveCount(0)
    await shot(page, 't7-03-bindungs-card')

    const { data: c1 } = await db.from('claims').select('freie_werkstattwahl, werkstattbindung_quelle, eigene_kasko_tarif_name, lead_id').eq('id', portalClaimId).maybeSingle()
    console.log('[T7] Claim nach Tarif:', JSON.stringify(c1))
    expect(c1!.freie_werkstattwahl).toBe(false)
    expect(c1!.werkstattbindung_quelle).toBe('tarif')
    if (c1!.lead_id) {
      const lead = await leadZeile(db, c1!.lead_id as string)
      console.log('[T7] Lead-Spiegel:', JSON.stringify(lead))
      expect(lead?.freie_werkstattwahl, 'Lead gespiegelt').toBe(false)
    }
  })

  // ── T8 · Admin (angemeldet): Wissensbasis-Liste ──
  test('T8 Admin: /admin/einstellungen/kasko-tarife zeigt 72 Marken, HUK optional mit Marker SELECT', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page, 'test-admin@claimondo.de', process.env.TEST_ADMIN_PASSWORD ?? '', process.env.TEST_ADMIN_TOTP_SECRET)
    await page.goto(`${APP}/admin/einstellungen/kasko-tarife`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByText(/Kasko-Tarife · Werkstattbindung/i)).toBeVisible({ timeout: 30_000 })
    const rows = page.getByRole('row')
    await expect.poll(async () => rows.count(), { timeout: 20_000 }).toBe(73)
    const huk = rows.filter({ hasText: 'HUK-COBURG' }).first()
    const hukText = await huk.innerText()
    console.log('[T8] HUK-Zeile:', hukText.replace(/\s+/g, ' '))
    expect(hukText).toMatch(/optional/)
    expect(hukText).toMatch(/SELECT/)
    expect(hukText).toMatch(/3\s*\/\s*3/)
    await shot(page, 't8-01-admin-liste')
  })

  // ── T9 · Marketing-Einbettung (anonym): der Embed ist von der Marketing-Seite erreichbar ──
  test('T9 Marketing: /schaden-melden/selbstverschulden verweist auf den Embed-Werkstatt-Finder', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('https://claimondo.de/schaden-melden/selbstverschulden', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    const iframes = page.locator('iframe[src*="embed/werkstatt-finder"]')
    const links = page.locator('a[href*="embed/werkstatt-finder"]')
    const nI = await iframes.count()
    const nL = await links.count()
    console.log('[T9] iframes:', nI, 'links:', nL, 'status:', page.url())
    await shot(page, 't9-01-marketing-selbstverschulden')
    expect(nI + nL, 'Embed von der Marketing-Seite erreichbar').toBeGreaterThan(0)
  })
})
