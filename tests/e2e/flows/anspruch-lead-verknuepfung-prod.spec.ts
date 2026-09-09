// stumme-waechter-skip: Zellen C/E erzeugen einen echten Lead + Kunden-WhatsApp/E-Mail an die eingegebene
//   Nummer — nur manuell mit Aaron-Go (RUN_ANSPRUCH_LEAD_ZELLE_C=1 + SMOKE_CHECK_PHONE). Zellen A/B/D/N laufen ohne Schalter.
//
// Regel-4-Smoke: Anspruchspruefung -> Lead -> Foto-Check-Verknuepfung (PR #5784).
// Soll-Blatt (Massstab, VOR dieser Spec geschrieben):
//   memory/abnahmen/2026-09-09-anspruch-lead-verknuepfung-regel4.md — Abschnitte 1c (Soll), 6 (Matrix), 10 (Kriterien)
//
// Ausgangsbefund (prod 09.09.): anspruch_schaetzungen 72 Zeilen / 0 mit lead_id, davon 9 nach dem Deploy des
// Fixes (05.09.). Diese Spec klaert, ob der Weg technisch durchlaeuft (Zellen A/B/D) — der volle Weg mit echtem
// Lead (Zelle C) braucht Aarons Go, weil der Check-Submit einen FlowLink an die eingegebene Nummer schickt.
//
// Lauf (prod, aus dem Worktree mit node_modules):
//   KEEP_SMOKE_ROWS=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de ABNAHME_SHOTS_DIR=<scratch>/shots \
//   node --env-file=<haupt-checkout>/.env.local --env-file=<scratch>/smoke.env node_modules/@playwright/test/cli.js test \
//     tests/e2e/flows/anspruch-lead-verknuepfung-prod.spec.ts --project=chromium --reporter=line --retries=0 --workers=1 \
//     --output <scratch>/pw-out
//   smoke.env traegt TEST_SV_PASSWORD + TEST_RLS_NOBODY_PASSWORD (Memory reference-internal-test-account-logins, nie ins Repo).
//
// Messregeln (regel4-smoke): Auto-Wait-Assertions statt einmaligem innerText; DB-Zustand statt Toast;
// Session-Token primaer aus der Server-Action-Response, Fallback ueber Zeitfenster + Foto-Anzahl + lead_id
// (Lauf 1: der Capture blieb bei A3 leer, obwohl die Session in der DB stand — das Instrument, nicht das Produkt);
// Positivkontrollen: ohne ?lead= und mit unbekannter UUID muss lead_id NULL sein; derselbe CTA-Locator,
// der bei `gegner` 1 findet, muss bei `unklar` 0 finden.
// Lehren aus Lauf 1: `exact: true` scheitert am Chevron im Accessible Name („Der Unfallgegner ›") -> Praefix-Regex;
// der Einschaetzungs-Step hat ein Pflichtfeld „Erstzulassung (Jahr)" — ohne Eingabe bleibt „Anspruch anzeigen" wirkungslos.

import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLAIMS, LEADS } from '../../../scripts/test-fixtures/ids'

const APP = process.env.PLAYWRIGHT_BASE_URL || 'https://app.claimondo.de'
const MARKETING = process.env.MARKETING_BASE_URL || 'https://claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string | undefined

const FOTO = join(process.cwd(), 'tests/e2e/fixtures/test-schadenfoto.png')
const SHOTS = process.env.ABNAHME_SHOTS_DIR || join(process.cwd(), 'test-results', 'anspruch-lead-shots')
const TOKENS_FILE = join(SHOTS, 'session-tokens.json')

/** Stabiler Fixture-Lead c1: telefon = NULL (keine Comms moeglich); sein Claim c1 hat sv_id NULL -> „darf nicht sehen"-Zelle. */
const LEAD_C1 = LEADS.c1
/** Fixture-Lead c2: telefon = NULL; sein Claim c2 (fbc10002…) gehoert dem Test-SV -> SV-Sicht messbar. */
const LEAD_C2 = LEADS.c2
const CLAIM_C1 = CLAIMS.c1
const CLAIM_C2 = CLAIMS.c2
/** Gueltige UUID-Form, aber kein Lead -> Session muss UNVERKNUEPFT entstehen (Zelle E3 / nobody). */
const UNBEKANNT = '00000000-0000-4000-8000-00000000dead'
const BUCKET = 'fall-dokumente'
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi

const TEST_SV_EMAIL = 'test-sv@claimondo.de'
const TEST_SV_PASSWORD = process.env.TEST_SV_PASSWORD || ''
const NOBODY_EMAIL = 'test-rls-nobody@claimondo.de'
const NOBODY_PASSWORD = process.env.TEST_RLS_NOBODY_PASSWORD || ''

const ZELLE_C_GO = process.env.RUN_ANSPRUCH_LEAD_ZELLE_C === '1'
const SMOKE_PHONE = process.env.SMOKE_CHECK_PHONE || ''

type SchaetzungRow = {
  id: string
  session_token: string
  lead_id: string | null
  foto_pfade: unknown
  positionen: unknown
  erstellt_am: string
}
const SELECT = 'id, session_token, lead_id, foto_pfade, positionen, erstellt_am'
const anzahl = (v: unknown) => (Array.isArray(v) ? v.length : 0)

function admin(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen — --env-file=.env.local?')
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

function merkeToken(token: string) {
  mkdirSync(SHOTS, { recursive: true })
  const alt: string[] = existsSync(TOKENS_FILE) ? JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) : []
  if (!alt.includes(token)) writeFileSync(TOKENS_FILE, JSON.stringify([...alt, token], null, 2))
}
function gemerkteTokens(): string[] {
  return existsSync(TOKENS_FILE) ? JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) : []
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true })
}

async function zeile(db: SupabaseClient, token: string): Promise<SchaetzungRow | null> {
  const { data, error } = await db.from('anspruch_schaetzungen').select(SELECT).eq('session_token', token).maybeSingle()
  if (error) throw new Error(`DB: ${error.message}`)
  return (data as SchaetzungRow | null) ?? null
}

/**
 * Oeffnet das Foto-Tool. Primaer wird der session_token aus der Server-Action-Response (POST auf dieselbe Route,
 * RSC-Payload mit `sessionToken`) abgefangen und gegen die DB aufgeloest. Bleibt der Capture leer (Lauf 1, A3),
 * liefert die Funktion `token: null` und `seit` — dann identifiziert `identifiziereSession` die Zeile ueber
 * Zeitfenster + Foto-Anzahl + erwartete lead_id.
 */
async function oeffneTool(page: Page, db: SupabaseClient, query: string): Promise<{ token: string | null; seit: string }> {
  const seit = new Date(Date.now() - 5_000).toISOString()
  const kandidaten = new Set<string>()
  const capture = page
    .waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/embed/anspruch-pruefen'), { timeout: 45_000 })
    .then((r) => r.text())
    .then((body) => { for (const m of body.matchAll(UUID_RE)) kandidaten.add(m[0].toLowerCase()) })
    .catch(() => {})

  await page.goto(`${APP}/embed/anspruch-pruefen${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // Messfalle 2 (zu frueh gemessen): Ladezustand explizit wegwarten, dann den Foto-Step als Zustandsmarker.
  await expect(page.getByText(/Wird geladen/)).toHaveCount(0, { timeout: 45_000 })
  await expect(page.getByText(/Fotos aufnehmen oder auswählen/)).toBeVisible({ timeout: 45_000 })
  await capture

  if (kandidaten.size > 0) {
    const { data, error } = await db.from('anspruch_schaetzungen').select(SELECT).in('session_token', [...kandidaten])
    if (error) throw new Error(`DB: ${error.message}`)
    const rows = (data ?? []) as SchaetzungRow[]
    if (rows.length === 1) {
      merkeToken(rows[0].session_token)
      test.info().annotations.push({ type: 'session_token', description: `${rows[0].session_token} (per Response-Capture)` })
      return { token: rows[0].session_token, seit }
    }
  }
  test.info().annotations.push({ type: 'capture', description: `Response-Capture ergab ${kandidaten.size} UUID(s), keine eindeutige Session — Fallback ueber Zeitfenster` })
  return { token: null, seit }
}

/** Fallback-Identifikation: Sessions seit `seit` mit genau `fotos` Fotos und der erwarteten lead_id — muss eindeutig sein. */
async function identifiziereSession(db: SupabaseClient, seit: string, erwarteterLead: string | null, fotos: number): Promise<SchaetzungRow> {
  const { data, error } = await db.from('anspruch_schaetzungen').select(SELECT).gte('erstellt_am', seit).order('erstellt_am', { ascending: false }).limit(30)
  if (error) throw new Error(`DB: ${error.message}`)
  const alle = (data ?? []) as SchaetzungRow[]
  const passend = alle.filter((r) => anzahl(r.foto_pfade) === fotos && (r.lead_id ?? null) === erwarteterLead && !gemerkteTokens().includes(r.session_token))
  expect(passend.length, `Fallback: erwartet genau 1 neue Session seit ${seit} mit ${fotos} Foto(s) und lead_id=${erwarteterLead}, gefunden ${passend.length} (gesamt seit: ${alle.length})`).toBe(1)
  merkeToken(passend[0].session_token)
  test.info().annotations.push({ type: 'session_token', description: `${passend[0].session_token} (per Zeitfenster-Fallback)` })
  return passend[0]
}

async function ladeFoto(page: Page) {
  // Der <input type=file> ist per className versteckt — setInputFiles braucht keine Sichtbarkeit (echte Eingabe).
  await page.locator('input[type="file"]').setInputFiles(FOTO)
  await expect(page.getByText(/1 Foto\(s\) hinzugefügt/)).toBeVisible({ timeout: 45_000 })
}

/** Oeffnen + Foto + Session eindeutig identifizieren (Capture oder Fallback). */
async function sessionMitFoto(page: Page, db: SupabaseClient, query: string, erwarteterLead: string | null): Promise<string> {
  const { token, seit } = await oeffneTool(page, db, query)
  await ladeFoto(page)
  if (token) {
    await expect.poll(async () => anzahl((await zeile(db, token))?.foto_pfade), { timeout: 30_000 }).toBe(1)
    return token
  }
  let row: SchaetzungRow | null = null
  await expect.poll(async () => {
    try { row = await identifiziereSession(db, seit, erwarteterLead, 1); return 1 } catch { return 0 }
  }, { timeout: 30_000 }).toBe(1)
  return row!.session_token
}

/** Vision-Analyse -> Einschaetzungs-Step -> Pflichtfeld Erstzulassung -> Ergebnis. Rot hier = Befund am Vision-Kanal oder Rechenweg. */
async function analyseBisErgebnis(page: Page, db: SupabaseClient, token: string, prefix: string) {
  await test.step(`${prefix} · "Schaden analysieren" -> Einschaetzungs-Step`, async () => {
    await page.getByRole('button', { name: /^Schaden analysieren/ }).click()
    const einschaetzung = page.getByText(/Wer hat den Unfall verursacht\?/)
    const fehler = page.getByRole('button', { name: /Ohne Einschätzung fortfahren/ })
    await expect(einschaetzung.or(fehler).first()).toBeVisible({ timeout: 120_000 })
    const fehlerDa = await fehler.count()
    await shot(page, fehlerDa ? `${prefix}-vision-FEHLER` : `${prefix}-einschaetzung`)
    if (fehlerDa) {
      const text = await page.locator('body').innerText()
      test.info().annotations.push({ type: 'befund', description: `Vision-Analyse fehlgeschlagen. Seitentext: ${text.slice(0, 400)}` })
    }
    expect(fehlerDa, 'Vision-Analyse meldete Fehler (Guthaben/Key?)').toBe(0)
    // Nebenbefund Lauf 1: der KI-Text zeigt dem Nutzer ASCII-Umlaute (ue/ae/oe). Hier nur festhalten.
    const erkannt = await page.locator('body').innerText()
    if (/\b(ue|ae|oe)\b|uebermittelt|Flaeche|moeglich|beschaedigt/i.test(erkannt)) {
      test.info().annotations.push({ type: 'nebenbefund', description: 'KI-Erkennungstext enthaelt ASCII-Umlaute (nutzersichtbar)' })
    }
  })
  await test.step(`${prefix} · fahrbereit + Erstzulassung (beide Pflicht, keine Vorauswahl) -> "Anspruch anzeigen" -> positionen > 0 in der DB`, async () => {
    // Lauf 2: „Bitte angeben, ob das Fahrzeug fahrbereit ist" — fahrbereit hat keine Vorauswahl, weiter() bricht sonst ab.
    await page.getByRole('button', { name: /^Ja, fahrbereit/ }).click()
    await page.getByPlaceholder(/z\. B\. 2021/).fill('2019')
    await page.getByRole('button', { name: /^Anspruch anzeigen/ }).click()
    // Fruehwarnung: eine Validierungsmeldung heisst, der Klick hat nichts gespeichert — sofort sichtbar machen statt 60 s zu pollen.
    const meldung = page.getByText(/^Bitte (angeben|eine gültige)/)
    if (await meldung.count()) {
      await shot(page, `${prefix}-validierung`)
      throw new Error(`Einschaetzungs-Step verweigert: ${(await meldung.allInnerTexts()).join(' | ')}`)
    }
    await expect.poll(async () => anzahl((await zeile(db, token))?.positionen), { timeout: 60_000 }).toBeGreaterThan(0)
    await shot(page, `${prefix}-ergebnis`)
  })
}

async function consentWeg(page: Page) {
  // Best effort: ein Consent-Dialog auf claimondo.de darf die Klick-Fragen nicht blocken. Kein Befund, wenn keiner da ist.
  await page.getByRole('button', { name: /Alle akzeptieren|Akzeptieren und weiter|Zustimmen|Einverstanden/i }).first().click({ timeout: 3_000 }).catch(() => {})
}

async function gotoMitRetry(page: Page, url: string) {
  // Lauf 1: ein net::ERR_CONNECTION_TIMED_OUT auf claimondo.de, curl direkt danach 0,15 s -> einmal wiederholen ist kein Verschleiern.
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  } catch (e) {
    test.info().annotations.push({ type: 'retry', description: `goto ${url} fehlgeschlagen (${(e as Error).message.slice(0, 80)}) — Wiederholung` })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }
}

type Schuld = 'gegner' | 'selbst' | 'teils' | 'unklar'
const SCHULD_BUTTON: Record<Schuld, RegExp> = {
  gegner: /^Der Unfallgegner/,
  selbst: /^Ich war \(haupt\)schuld/,
  teils: /^Teils ich, teils der Gegner/,
  // i18n de.json q1_unklar = „Noch unklar" — Lauf 2 riet „Ich weiß es nicht" (Bezeichner nachschlagen, nie raten).
  unklar: /^Noch unklar/,
}

async function checkBisErgebnis(page: Page, schuld: Schuld) {
  await gotoMitRetry(page, `${MARKETING}/check`)
  await consentWeg(page)
  // Praefix-Regex statt exact: der Accessible Name traegt das Chevron („Der Unfallgegner ›"), Lauf 1 scheiterte daran.
  await page.getByRole('button', { name: SCHULD_BUTTON[schuld] }).click({ timeout: 45_000 })
  await page.getByRole('button', { name: /^Vor 1–4 Wochen/ }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Die gegnerische Versicherung will eins schicken/ }).click({ timeout: 15_000 })
}

const fotoCta = (page: Page) => page.locator('a[data-tracking="cta-check-foto-tool"]')

async function loginSv(page: Page) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.fill('input[type="email"], input[name="email"]', TEST_SV_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', TEST_SV_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 })
  expect(page.url(), 'test-sv@ hat 0 MFA-Faktoren (09.09.) — ein /login/2fa-Umweg heisst, jemand hat das geaendert').not.toContain('/login/2fa')
  await page.waitForLoadState('networkidle').catch(() => {})
}

// ---------------------------------------------------------------------------------------------
// Zelle A — Empfaengerseite (app.claimondo.de) am Fixture-Lead c1. Serial: A5 braucht A1.
// ---------------------------------------------------------------------------------------------
test.describe.serial('A · Empfaengerseite: ?lead= verknuepft die Schaetzung mit dem Fixture-Lead c1', () => {
  let db: SupabaseClient
  test.beforeAll(async () => {
    db = admin()
    await raeumeEigeneSessions(db)
    const { count } = await db.from('anspruch_schaetzungen').select('id', { count: 'exact', head: true }).eq('lead_id', LEAD_C1)
    expect(count ?? 0, `Fixture-Lead ${LEAD_C1} traegt schon ${count} fremde Schaetzungen — Vorbedingung verletzt`).toBe(0)
  })

  test('A1 · ?lead=<Fixture-Lead c1> -> Session mit lead_id, Foto an der Session; A4 · Vision + Erstzulassung -> Positionen', async ({ page }) => {
    test.setTimeout(300_000)
    const token = await sessionMitFoto(page, db, `?lead=${LEAD_C1}`, LEAD_C1)
    // Ohne ?schuld= darf der Kontinuitaets-Hinweis NICHT erscheinen (Gegenprobe zu B1).
    await expect(page.getByText(/Weiter aus Ihrer Anspruchs-Prüfung/)).toHaveCount(0)
    await test.step('A1 · lead_id = Fixture-Lead c1 (DB, nicht UI)', async () => {
      expect((await zeile(db, token))?.lead_id).toBe(LEAD_C1)
      await shot(page, 'A1-foto-hochgeladen')
    })
    await analyseBisErgebnis(page, db, token, 'A4')
    await test.step('E1 · "Gutachter beauftragen" reicht die Schaetzung per ?schaetzung=<token> an den Finder durch (zweiter Verknuepfungspfad, Senderseite; kein Submit)', async () => {
      await page.getByRole('button', { name: /^Gutachter beauftragen/ }).click()
      await expect(page).toHaveURL(/\/embed\/gutachter-finder\?/, { timeout: 30_000 })
      const url = new URL(page.url())
      test.info().annotations.push({ type: 'finder_handoff', description: url.pathname + url.search })
      expect(url.searchParams.get('schaetzung'), 'Finder-Handoff traegt den session_token nicht').toBe(token)
      await expect(page.getByText(/Wird geladen/)).toHaveCount(0, { timeout: 45_000 })
      await shot(page, 'E1-finder-mit-schaetzung')
      // Der Finder-Submit wuerde einen Lead + Comms erzeugen -> Empfaengerseite (gfa.schaetzung_session_id, 53/0) ist Zelle E2, Aaron-Go.
    })
  })

  test('A5 · Reload mit ?lead= legt eine zweite, leere Session an — die erste bleibt die brauchbare', async ({ page }) => {
    test.setTimeout(120_000)
    const { token, seit } = await oeffneTool(page, db, `?lead=${LEAD_C1}`)
    const row2 = token ? await zeile(db, token) : await identifiziereSession(db, seit, LEAD_C1, 0)
    expect(row2?.lead_id).toBe(LEAD_C1)
    const { data } = await db.from('anspruch_schaetzungen').select(SELECT).eq('lead_id', LEAD_C1).order('erstellt_am', { ascending: false })
    const rows = (data ?? []) as SchaetzungRow[]
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const neuesteLeer = anzahl(rows[0].positionen) === 0
    const mitPositionen = rows.filter((r) => anzahl(r.positionen) > 0)
    test.info().annotations.push({ type: 'messung', description: `Sessions am Lead c1: ${rows.length}, neueste leer=${neuesteLeer}, mitPositionen=${mitPositionen.length}` })
    expect(neuesteLeer, 'die Reload-Session muss die neueste und leer sein (Marker-Selbstbefund #1)').toBe(true)
    expect(mitPositionen.length, 'A1/A4 muss eine Schaetzung mit Positionen hinterlassen haben').toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------------------------
// Zelle A2/A3 — Positivkontrollen (unabhaengig, kein serial).
// ---------------------------------------------------------------------------------------------
test('A2 · ohne ?lead= -> Session entsteht UNVERKNUEPFT (lead_id NULL)', async ({ page }) => {
  test.setTimeout(120_000)
  const db = admin()
  const token = await sessionMitFoto(page, db, '', null)
  await expect(page.getByText(/Weiter aus Ihrer Anspruchs-Prüfung/)).toHaveCount(0)
  expect((await zeile(db, token))?.lead_id).toBeNull()
  await shot(page, 'A2-ohne-lead')
})

test('A3 · ?lead=<unbekannte UUID> -> Session entsteht UNVERKNUEPFT, kein Fehler (nobody-Zelle)', async ({ page }) => {
  test.setTimeout(120_000)
  const db = admin()
  const token = await sessionMitFoto(page, db, `?lead=${UNBEKANNT}`, null)
  expect((await zeile(db, token))?.lead_id).toBeNull()
  await expect(page.getByText(/Fotos aufnehmen oder auswählen|Foto\(s\) hinzugefügt/)).toBeVisible()
  await shot(page, 'A3-unbekannte-uuid')
})

// ---------------------------------------------------------------------------------------------
// Zelle D — SV-Sicht: Schaetzung am Lead c2 erscheint in der Fallakte von Claim c2 (gehoert dem Test-SV),
// nicht aber bei Claim c1 (sv_id NULL). Serial: D1c/D1d brauchen D1a.
// ---------------------------------------------------------------------------------------------
test.describe.serial('D · SV-Sicht in der Fallakte (Claim c2 des Test-SV)', () => {
  let db: SupabaseClient
  test.beforeAll(async () => {
    db = admin()
    await raeumeEigeneSessions(db)
    const { count } = await db.from('anspruch_schaetzungen').select('id', { count: 'exact', head: true }).eq('lead_id', LEAD_C2)
    expect(count ?? 0, `Fixture-Lead ${LEAD_C2} traegt schon ${count} fremde Schaetzungen — Vorbedingung verletzt`).toBe(0)
  })

  test('D1a · Session am Lead c2 mit Foto + Analyse + Erstzulassung -> Positionen', async ({ page }) => {
    test.setTimeout(300_000)
    const token = await sessionMitFoto(page, db, `?lead=${LEAD_C2}`, LEAD_C2)
    expect((await zeile(db, token))?.lead_id).toBe(LEAD_C2)
    await analyseBisErgebnis(page, db, token, 'D1a')
  })

  test('D1b · Reload legt eine leere zweite Session am Lead c2 an', async ({ page }) => {
    test.setTimeout(120_000)
    const { token, seit } = await oeffneTool(page, db, `?lead=${LEAD_C2}`)
    const row2 = token ? await zeile(db, token) : await identifiziereSession(db, seit, LEAD_C2, 0)
    expect(row2?.lead_id).toBe(LEAD_C2)
    expect(anzahl(row2?.positionen)).toBe(0)
  })

  test('D1c · test-sv@ oeffnet /gutachter/fall/<Claim c2> -> Card „KI-Vorschätzung des Kunden" sichtbar (trotz leerer neuester Session)', async ({ page }) => {
    test.skip(!TEST_SV_PASSWORD, 'TEST_SV_PASSWORD fehlt (smoke.env)')
    test.setTimeout(180_000)
    await loginSv(page)
    await page.goto(`${APP}/gutachter/fall/${CLAIM_C2}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await expect(page.getByText(/Wird geladen/)).toHaveCount(0, { timeout: 45_000 })
    const card = page.getByRole('heading', { name: /^KI-Vorschätzung des Kunden/ })
    await expect(card).toBeVisible({ timeout: 60_000 })
    await card.scrollIntoViewIfNeeded()
    await shot(page, 'D1c-sv-fallakte-c2-mit-vorschau')
    const text = await page.locator('body').innerText()
    test.info().annotations.push({ type: 'messung', description: `Fallakte c2 enthaelt "KI-Vorschätzung": ${/KI-Vorschätzung/.test(text)}; "Unverbindlich": ${/Unverbindlich/.test(text)}` })
  })

  test('D1d · test-sv@ oeffnet /gutachter/fall/<Claim c1> (sv_id NULL) -> keine Fallakte, keine Card (darf nicht sehen)', async ({ page }) => {
    test.skip(!TEST_SV_PASSWORD, 'TEST_SV_PASSWORD fehlt (smoke.env)')
    test.setTimeout(120_000)
    await loginSv(page)
    const resp = await page.goto(`${APP}/gutachter/fall/${CLAIM_C1}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    // Verhalten messen, nicht den Statuscode: Next.js streamt notFound() in einer Server Component als HTTP 200
    // mit 404-UI (Lauf 3d: 200, Seite zeigte „Seite nicht gefunden"). Der Status ist nur Notiz.
    test.info().annotations.push({ type: 'messung', description: `HTTP ${resp?.status()} fuer fremden Claim c1 (Next streamt notFound() als 200 + 404-UI)` })
    await expect(page.getByText(/Seite nicht gefunden/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /^KI-Vorschätzung des Kunden/ })).toHaveCount(0)
    await expect(page.getByText(/Test Geschädigter C1/)).toHaveCount(0)
    await shot(page, 'D1d-sv-fremder-claim-c1')
  })
})

// ---------------------------------------------------------------------------------------------
// Zelle B — Senderseite (claimondo.de/check), OHNE Lead-Submit.
// ---------------------------------------------------------------------------------------------
test('B1 · /check "Der Unfallgegner" -> Ergebnis-CTA ohne lead= -> Klick -> Tool mit vorbelegter Schuldform', async ({ page }) => {
  test.setTimeout(240_000)
  const db = admin()
  await checkBisErgebnis(page, 'gegner')
  const cta = fotoCta(page)
  await expect(cta).toBeVisible({ timeout: 30_000 })
  const href = (await cta.getAttribute('href')) ?? ''
  test.info().annotations.push({ type: 'cta_href', description: href })
  expect(href).toContain('/embed/anspruch-pruefen')
  expect(href).toContain('schuld=unverschuldet')
  // Vor dem Submit existiert kein Lead -> der Ergebnis-CTA darf/kann kein lead= tragen (Soll 1c-4 ist die offene Frage).
  expect(href).not.toMatch(/[?&]lead=/)
  // Das Lead-Formular steht auf derselben Seite unter dem Ergebnis.
  await expect(page.getByLabel('Ihr Name')).toBeVisible()
  await expect(page.getByLabel('Ihre Telefonnummer')).toBeVisible()
  await shot(page, 'B1-ergebnis-mit-cta')

  // Sender -> Empfaenger: der Klick fuehrt ins Tool; ?schuld= wird als Kontinuitaets-Hinweis sichtbar.
  const seit = new Date(Date.now() - 5_000).toISOString()
  await cta.click()
  await expect(page).toHaveURL(/app\.claimondo\.de\/embed\/anspruch-pruefen/, { timeout: 30_000 })
  await expect(page.getByText(/Wird geladen/)).toHaveCount(0, { timeout: 45_000 })
  await expect(page.getByText(/Weiter aus Ihrer Anspruchs-Prüfung/)).toBeVisible({ timeout: 45_000 })
  await ladeFoto(page)
  let row: SchaetzungRow | null = null
  await expect.poll(async () => { try { row = await identifiziereSession(db, seit, null, 1); return 1 } catch { return 0 } }, { timeout: 30_000 }).toBe(1)
  expect(row!.lead_id).toBeNull()
  await shot(page, 'B1-tool-nach-cta')
})

test('B2 · /check "Ich war (haupt)schuld" (Kasko) -> Ergebnis-CTA vorhanden, schuld=selbst, ohne lead=', async ({ page }) => {
  test.setTimeout(120_000)
  await checkBisErgebnis(page, 'selbst')
  const cta = fotoCta(page)
  await expect(cta).toBeVisible({ timeout: 30_000 })
  const href = (await cta.getAttribute('href')) ?? ''
  test.info().annotations.push({ type: 'cta_href', description: href })
  expect(href).toContain('schuld=selbst')
  expect(href).not.toMatch(/[?&]lead=/)
  // Aus result-model.ts GELESEN, hier nicht messbar ohne Submit: die Erfolgsseite zeigt bei `selbst` KEINEN
  // CTA (showRanges nur voll/quote) -> ein Kasko-Kunde bekommt den verknuepften Weg nie. Soll-Frage 3 an Aaron.
  test.info().annotations.push({ type: 'hinweis', description: 'K5: Erfolgs-CTA bei selbst laut result-model.ts nicht vorhanden — Messung nur in Zelle C moeglich' })
  await shot(page, 'B2-kasko-ergebnis')
})

test('B3 · /check "Noch unklar" -> KEIN Foto-CTA (Detektor-Positivkontrolle fuer B1/B2)', async ({ page }) => {
  test.setTimeout(120_000)
  await checkBisErgebnis(page, 'unklar')
  // Ergebnis ist da (Formular sichtbar) — und derselbe Locator, der in B1 traf, findet hier nichts.
  await expect(page.getByLabel('Ihr Name')).toBeVisible({ timeout: 30_000 })
  await expect(fotoCta(page)).toHaveCount(0)
  await shot(page, 'B3-unklar-ohne-cta')
})

// ---------------------------------------------------------------------------------------------
// Zelle N — direkter Tabellenzugriff: anon UND ein angemeldeter Nicht-Berechtigter sehen 0 Zeilen.
// ---------------------------------------------------------------------------------------------
test('N1 · anon-Key liest anspruch_schaetzungen -> 0 Zeilen', async () => {
  test.skip(!ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt in der env')
  const anon = createClient(SUPABASE_URL, ANON_KEY!, { auth: { persistSession: false } })
  const { data, error } = await anon.from('anspruch_schaetzungen').select('id').limit(5)
  test.info().annotations.push({ type: 'messung', description: `anon select: rows=${(data ?? []).length} error=${error?.code ?? '-'} ${error?.message ?? ''}` })
  expect((data ?? []).length).toBe(0)
})

test('N2 · test-rls-nobody@ (angemeldet, keine Rolle) liest anspruch_schaetzungen -> 0 Zeilen', async () => {
  test.skip(!ANON_KEY || !NOBODY_PASSWORD, 'ANON_KEY oder TEST_RLS_NOBODY_PASSWORD fehlt')
  const client = createClient(SUPABASE_URL, ANON_KEY!, { auth: { persistSession: false } })
  const { error: loginErr } = await client.auth.signInWithPassword({ email: NOBODY_EMAIL, password: NOBODY_PASSWORD })
  expect(loginErr, `Login ${NOBODY_EMAIL}: ${loginErr?.message}`).toBeNull()
  const { data, error } = await client.from('anspruch_schaetzungen').select('id').limit(5)
  test.info().annotations.push({ type: 'messung', description: `nobody select: rows=${(data ?? []).length} error=${error?.code ?? '-'} ${error?.message ?? ''}` })
  expect((data ?? []).length).toBe(0)
  await client.auth.signOut().catch(() => {})
})

// ---------------------------------------------------------------------------------------------
// Zelle C — der volle Weg. Erzeugt einen ECHTEN Lead auf prod und schickt einen FlowLink an SMOKE_CHECK_PHONE.
// Nur mit Aaron-Go.
// ---------------------------------------------------------------------------------------------
test('C · /check -> Kontakt absenden -> Erfolgs-CTA MIT lead= -> Tool -> Schaetzung haengt am neuen Lead', async ({ page }) => {
  test.skip(!ZELLE_C_GO || !SMOKE_PHONE, 'Zelle C nur mit RUN_ANSPRUCH_LEAD_ZELLE_C=1 + SMOKE_CHECK_PHONE (erzeugt echten Lead + Kunden-Comms) — Aaron-Go noetig')
  test.setTimeout(300_000)
  const db = admin()
  await checkBisErgebnis(page, 'gegner')
  await page.getByLabel('Ihr Name').fill('Smoke AnspruchLink')
  await page.getByLabel('Ihre Telefonnummer').fill(SMOKE_PHONE)
  // Ort: Google-Places-Autocomplete (controlled, onChange setzt city) -> hidden input name="city"
  await page.getByPlaceholder(/z\. B\. Köln oder 50670/).fill('Köln')
  await page.getByRole('button', { name: /^Kostenlosen Rückruf anfordern/ }).click()
  await expect(page.getByRole('heading', { name: /Danke.*wir melden uns gleich/ })).toBeVisible({ timeout: 60_000 })
  await shot(page, 'C-erfolg')

  const cta = fotoCta(page)
  await expect(cta, 'Erfolgs-CTA fehlt (showRanges bei gegner erwartet true)').toBeVisible({ timeout: 15_000 })
  const href = (await cta.getAttribute('href')) ?? ''
  test.info().annotations.push({ type: 'cta_href', description: href })
  const leadId = new URL(href).searchParams.get('lead')
  expect(leadId, 'Erfolgs-CTA traegt kein lead=').toBeTruthy()

  // Lead-Seite (Befund 1 + Quelle B des PR): schuldfrage + auswertung_unverbindlich am Lead
  const { data: lead } = await db.from('leads').select('id, schuldfrage, auswertung_unverbindlich, unfallort, kunde_plz, telefon').eq('id', leadId!).maybeSingle()
  test.info().annotations.push({ type: 'lead', description: JSON.stringify(lead) })
  expect(lead?.schuldfrage).toBe('gegner')
  expect(lead?.auswertung_unverbindlich).not.toBeNull()

  const seit = new Date(Date.now() - 5_000).toISOString()
  await cta.click()
  await expect(page).toHaveURL(/embed\/anspruch-pruefen/, { timeout: 30_000 })
  await expect(page.getByText(/Wird geladen/)).toHaveCount(0, { timeout: 45_000 })
  await expect(page.getByText(/Weiter aus Ihrer Anspruchs-Prüfung/)).toBeVisible({ timeout: 45_000 })
  await ladeFoto(page)
  let row: SchaetzungRow | null = null
  await expect.poll(async () => { try { row = await identifiziereSession(db, seit, leadId!, 1); return 1 } catch { return 0 } }, { timeout: 30_000 }).toBe(1)
  expect(row!.lead_id).toBe(leadId)
  await shot(page, 'C-tool-verknuepft')
  writeFileSync(join(SHOTS, 'zelle-c-lead.json'), JSON.stringify({ leadId, href, session_token: row!.session_token }, null, 2))
  // Cleanup des Leads (flow_links, tasks, benachrichtigungen, anfragen, schaetzungen) laeuft bewusst getrennt,
  // nachdem Aaron die Zeile gesehen hat — sonst ist der Beleg weg, bevor er ihn prueft.
})

// ---------------------------------------------------------------------------------------------
// Cleanup — eigene Sessions (Zeilen + Fotos im Bucket). Als letzter Test; mit KEEP_SMOKE_ROWS=1 bleibt alles stehen.
// ---------------------------------------------------------------------------------------------
async function raeumeEigeneSessions(db: SupabaseClient) {
  const tokens = gemerkteTokens()
  if (tokens.length === 0) return
  for (const t of tokens) {
    const { data: objs } = await db.storage.from(BUCKET).list(`anspruch/${t}`)
    const pfade = (objs ?? []).map((o) => `anspruch/${t}/${o.name}`)
    if (pfade.length) await db.storage.from(BUCKET).remove(pfade)
  }
  const { error, count } = await db.from('anspruch_schaetzungen').delete({ count: 'exact' }).in('session_token', tokens)
  if (error) throw new Error(`Cleanup: ${error.message}`)
  console.log(`[cleanup] ${count ?? 0} eigene Schaetzungen geloescht (${tokens.length} Tokens)`)
  writeFileSync(TOKENS_FILE, '[]')
}

test('Z · Cleanup eigener Sessions (Zeilen + Fotos)', async () => {
  test.skip(process.env.KEEP_SMOKE_ROWS === '1', 'KEEP_SMOKE_ROWS=1: Zeilen bleiben fuer die Sichtpruefung stehen')
  await raeumeEigeneSessions(admin())
})
