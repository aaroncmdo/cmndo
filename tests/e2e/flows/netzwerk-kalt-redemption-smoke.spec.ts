// Regel-4-Prod-Smoke (#4994 SV+Makler, #5010 Flotte): Kalt-Einladungs-Redemption —
// gegen prod, Wegwerf-Konten, 0 Residue. Beweist das Wiring end-to-end:
//   Einladung (Token-Injection, P1-Muster) -> /{rolle}/registrieren?einladung=<token>
//   -> Formular-Submit -> Account entsteht -> Einladung 'eingeloest' + Auto-Kante
//   'angenommen' (Einlader <-> neues Profil).
// Flotte (j08-Soll-Delta #5010): /flotte/registrieren ist der NEUE Self-Signup-Flow
// (ensureFirma + Flottenmanager-Kern); Firmenname MUSS mit 'Throwaway-Flotte-' beginnen,
// damit throwaway-account.mjs cleanup die firmen-Row mit abraeumt.
//
// SICHERHEIT: Einlader = throwaway-Werkstatt; neue Accounts mit throwaway-*@claimondo.test
// (Mail-Domain tot) + Drama-Telefonnummer +49 30 23125 011 (P1-Muster — Formular-Pflicht,
// aber kein SMS-Versand in diesen Flows). Falls die neue Team-WA-Registrierungs-Notif
// mitdeployt ist: interne Empfaenger, erwartet, unkritisch.

import { execSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

function mintToken(): { token: string; hash: string; prefix: string } {
  const token = randomBytes(24).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  return { token, hash, prefix: hash.slice(0, 8) }
}

const RUN = Date.now().toString(36)
const SV_EMAIL = `throwaway-redemp-sv-${RUN}@claimondo.test`
const MAKLER_EMAIL = `throwaway-redemp-makler-${RUN}@claimondo.test`
const FLOTTE_EMAIL = `throwaway-redemp-flotte-${RUN}@claimondo.test`
const FLOTTE_FIRMA = `Throwaway-Flotte-Redemp-${RUN}` // Praefix = cleanup-Pattern (s. Header)
const TEL = '+49 30 23125 011' // Drama-Nummer (P1-Muster)

let einlader: { uid: string }
let tokenSv = ''
let tokenMakler = ''
let tokenFlotte = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const raw = execSync('node scripts/smoke/throwaway-account.mjs create werkstatt --json', {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const acc = JSON.parse(raw.trim().split('\n').pop() as string) as { uid: string }
  einlader = { uid: acc.uid }

  const db = svc()
  const mkEinladung = async (email: string, zielRolle: string): Promise<string> => {
    const t = mintToken()
    const { error } = await db.from('netzwerk_einladungen').insert({
      einlader_id: einlader.uid,
      email,
      ziel_rolle: zielRolle,
      token_hash: t.hash,
      token_lookup_prefix: t.prefix,
    })
    if (error) throw new Error(`einladung ${zielRolle}: ${error.message}`)
    return t.token
  }
  tokenSv = await mkEinladung(SV_EMAIL, 'sachverstaendiger')
  tokenMakler = await mkEinladung(MAKLER_EMAIL, 'makler')
  tokenFlotte = await mkEinladung(FLOTTE_EMAIL, 'flottenmanager')
})

test.afterAll(async () => {
  const db = svc()
  // Kanten + Einladungen der throwaway-Profile
  const { data: prof } = await db.from('profiles').select('id').like('email', 'throwaway-redemp-%')
  const pids = (prof ?? []).map((p: { id: string }) => p.id)
  const alle = [...pids, einlader?.uid].filter(Boolean) as string[]
  if (alle.length) {
    await db.from('netzwerk_verbindungen').delete().in('anfrager_id', alle)
    await db.from('netzwerk_verbindungen').delete().in('empfaenger_id', alle)
    await db.from('mitteilungen').delete().in('empfaenger_id', alle)
  }
  await db.from('netzwerk_einladungen').delete().in('email', [SV_EMAIL, MAKLER_EMAIL, FLOTTE_EMAIL])
  // Neue Accounts + Einlader via throwaway-cleanup (per Email bzw. uid)
  for (const ref of [SV_EMAIL, MAKLER_EMAIL, FLOTTE_EMAIL, einlader?.uid].filter(Boolean) as string[]) {
    try {
      execSync(`node scripts/smoke/throwaway-account.mjs cleanup ${ref}`, { cwd: process.cwd(), encoding: 'utf8' })
    } catch { /* best effort — makler-Rows haengen ggf. an eigener Kette */ }
  }
  // Netz unter dem cleanup-Script: firmen-Row des Flotten-Self-Signups (idempotent,
  // no-op wenn das Script sie ueber firmen_flotten_konten bereits mitgenommen hat).
  await db.from('firmen').delete().eq('name', FLOTTE_FIRMA)
})

async function pollRedemption(
  db: SupabaseClient,
  email: string,
): Promise<{ profilId: string } | null> {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const { data: einl } = await db
      .from('netzwerk_einladungen')
      .select('status, eingeloest_profil_id')
      .eq('email', email)
      .maybeSingle()
    const e = einl as { status?: string; eingeloest_profil_id?: string | null } | null
    if (e?.status === 'eingeloest' && e.eingeloest_profil_id) {
      const { data: kante } = await db
        .from('netzwerk_verbindungen')
        .select('status')
        .eq('anfrager_id', einlader.uid)
        .eq('empfaenger_id', e.eingeloest_profil_id)
        .maybeSingle()
      if ((kante as { status?: string } | null)?.status === 'angenommen') {
        return { profilId: e.eingeloest_profil_id }
      }
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  return null
}

async function fillByLabel(page: Page, label: RegExp, value: string): Promise<void> {
  await page.getByLabel(label).first().fill(value)
}

test('Redemption SV: Registrierung mit ?einladung -> eingeloest + Auto-Kante', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${APP}/sv/registrieren?einladung=${tokenSv}`, { waitUntil: 'domcontentloaded' })

  // Suche-Schritt -> "Neu eintragen"
  await page.getByRole('button', { name: /Neu eintragen/i }).click({ timeout: 20_000 })

  // Neu-Formular (paket-Default basic -> keine Firmendaten-Pflicht)
  await fillByLabel(page, /Vorname \*/, 'Smoke')
  await fillByLabel(page, /Nachname \*/, 'RedempSV')
  // ^-Anker: /Adresse/ wuerde auch "E-Mail-Adresse" matchen (Treiber-Fund 1. Lauf —
  // die Strasse landete im E-Mail-Feld).
  await fillByLabel(page, /^E-Mail-Adresse \*/, SV_EMAIL)
  await fillByLabel(page, /^Telefonnummer \*/, TEL)
  await fillByLabel(page, /^Adresse \(Straße/, 'Hansaring 10, Köln')

  await page.getByRole('button', { name: 'Registrierung absenden' }).click()

  const res = await pollRedemption(svc(), SV_EMAIL)
  expect(res, 'SV-Einladung eingeloest + Kante angenommen').not.toBeNull()
})

test('Redemption Makler: Registrierung mit ?einladung -> eingeloest + Auto-Kante', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${APP}/makler/registrieren?einladung=${tokenMakler}`, { waitUntil: 'domcontentloaded' })

  await fillByLabel(page, /Firma \*/, 'Smoke Redemp Makler UG')
  await fillByLabel(page, /Vorname \*/, 'Smoke')
  await fillByLabel(page, /Nachname \*/, 'RedempMakler')
  await fillByLabel(page, /E-Mail \*/, MAKLER_EMAIL)
  await fillByLabel(page, /Telefon \*/, TEL)

  // Rechtsform ist ein Select mit Pflicht (falls vorhanden waehlen)
  const rechtsform = page.getByLabel(/Rechtsform/).first()
  if (await rechtsform.isVisible().catch(() => false)) {
    await rechtsform.selectOption({ index: 1 }).catch(() => {})
  }

  // Einwilligungs-Checkbox(en) (Partnerprogramm-Consent — 2. Lauf-Fund: ohne sie
  // blockt "Bitte bestaetigen Sie die Einwilligung").
  for (const cb of await page.locator('input[type="checkbox"]:visible').all()) {
    const checked = await cb.isChecked().catch(() => true)
    if (!checked) await cb.check().catch(() => {})
  }

  await page.getByRole('button', { name: 'Kostenlos registrieren' }).click()

  const res = await pollRedemption(svc(), MAKLER_EMAIL)
  expect(res, 'Makler-Einladung eingeloest + Kante angenommen').not.toBeNull()
})

test('Redemption Flotte (#5010): Registrierung mit ?einladung -> eingeloest + Auto-Kante', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${APP}/flotte/registrieren?einladung=${tokenFlotte}`, {
    waitUntil: 'domcontentloaded',
  })

  // Public-Erreichbarkeit: kein Auth-Redirect (Middleware-Whitelist '/flotte/registrieren')
  await expect(page).toHaveURL(/\/flotte\/registrieren/)

  await fillByLabel(page, /Firmenname \*/, FLOTTE_FIRMA)
  await fillByLabel(page, /Vorname/, 'Smoke') // Label: "Vorname (Ansprechpartner) *"
  await fillByLabel(page, /^E-Mail \*/, FLOTTE_EMAIL)

  await page.getByRole('button', { name: 'Kostenlos registrieren' }).click()

  const res = await pollRedemption(svc(), FLOTTE_EMAIL)
  expect(res, 'Flotten-Einladung eingeloest + Auto-Kante angenommen').not.toBeNull()

  // Self-Signup-Substanz: Firma (quelle-Snapshot) + Flotten-Konto existieren
  const db = svc()
  const { data: firma } = await db.from('firmen').select('id').eq('name', FLOTTE_FIRMA).maybeSingle()
  expect(firma, 'firmen-Row aus ensureFirma').not.toBeNull()
  const { data: konto } = await db
    .from('firmen_flotten_konten')
    .select('status')
    .eq('firma_id', (firma as { id: string }).id)
    .maybeSingle()
  expect((konto as { status?: string } | null)?.status, 'firmen_flotten_konten aktiv').toBe('aktiv')
})

test('Anon-Guard: /flotte-Portal bleibt hinter dem Login-Gate', async ({ page }) => {
  await page.goto(`${APP}/flotte`, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login/)
})
