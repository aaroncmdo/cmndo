// Regel-4-Prod-Smoke P6 Journey 2 (WS E / T10): Netzwerkkarten-Scan -> Gegner-Meldung
// -> Claim mit netzwerk_owner_id = Flotte-Issuer. Gegen prod, Wegwerf-Flotte, 0 Residue.
//
// Ablauf: Wegwerf-Flottenmanager (throwaway flottenmanager: firmen + aktives Konto) +
// Wegwerf-Fahrzeug + gebundene Netzwerkkarte -> ANONYM /schaden/<token> -> Gegner-Wizard
// (6 Steps: Kontakt/Fahrzeug/Hergang/Foto[required]/Unterschrift/Absenden) -> Claim
// entsteht (convertLeadToClaim, vermittler_typ='firmen_flotte') -> DB-Assert:
// claims.netzwerk_owner_id == firmen_flotten_konten.user_id (Insert-Seed + T10-Backstop).
//
// SICHERHEIT: kein Telefon/keine E-Mail im Formular -> keine Sends (Airdrop skippt,
// erstelleVsDispatchTask kein_telefon wird mitgeraeumt). FM-WA: telefon=NULL -> kein Send.

import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

let fm: { uid: string; email: string }
let firmaId = ''
let vehId = ''
let kartenToken = ''
let claimId = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const raw = execSync('node scripts/smoke/throwaway-account.mjs create flottenmanager --json', {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const acc = JSON.parse(raw.trim().split('\n').pop() as string) as { uid: string; email: string }
  fm = { uid: acc.uid, email: acc.email }

  const db = svc()
  const { data: konto } = await db
    .from('firmen_flotten_konten').select('firma_id').eq('user_id', fm.uid).maybeSingle()
  if (!konto?.firma_id) throw new Error('flotten-konto fehlt (throwaway flottenmanager)')
  firmaId = konto.firma_id as string

  const { data: veh, error: vehErr } = await db
    .from('vehicles')
    .insert({ kennzeichen_aktuell: 'SM-P6F 1', hersteller: 'Ford', modell_haupttyp: 'Transit' })
    .select('id')
    .single()
  if (vehErr || !veh) throw new Error(`vehicle: ${vehErr?.message}`)
  vehId = veh.id as string

  const { error: ffErr } = await db.from('flotten_fahrzeuge').insert({ firma_id: firmaId, vehicle_id: vehId })
  if (ffErr) throw new Error(`flotten_fahrzeuge: ${ffErr.message}`)

  kartenToken = `smoke-p6-scan-${randomBytes(8).toString('hex')}`
  const { error: kErr } = await db.from('schadenkarten').insert({
    karten_token: kartenToken,
    status: 'gebunden',
    fahrzeug_id: vehId,
    firma_id: firmaId,
    gebunden_am: new Date().toISOString(),
  })
  if (kErr) throw new Error(`schadenkarte: ${kErr.message}`)
})

test.afterAll(async () => {
  const db = svc()
  if (claimId) {
    await db.from('partner_provisionen').delete().eq('claim_id', claimId)
    await db.from('tasks').delete().eq('claim_id', claimId)
    await db.from('claim_parties').delete().eq('claim_id', claimId)
    await db.from('faelle_claim_bridge').delete().eq('claim_id', claimId)
    // Lead des Gegner-Submits (vehicle-verknuepft)
    await db.from('leads').delete().eq('vehicle_id', vehId)
    await db.from('claims').delete().eq('id', claimId)
  } else {
    await db.from('leads').delete().eq('vehicle_id', vehId)
  }
  if (kartenToken) await db.from('schadenkarten').delete().eq('karten_token', kartenToken)
  if (vehId) {
    await db.from('flotten_fahrzeuge').delete().eq('vehicle_id', vehId)
    await db.from('vehicles').delete().eq('id', vehId)
  }
  if (fm?.uid) {
    await db.from('mitteilungen').delete().eq('empfaenger_id', fm.uid)
    execSync(`node scripts/smoke/throwaway-account.mjs cleanup ${fm.uid}`, { cwd: process.cwd(), encoding: 'utf8' })
  }
})

/** J4-Lehre: Klicks auf 'use client'-Buttons koennen im Hydration-/Disabled-Fenster
 *  verpuffen -> idempotenter Re-Klick-Loop, der den Step-Wechsel asserted. */
async function weiterZu(page: Page, zielStep: number): Promise<void> {
  const ziel = page.getByText(new RegExp(`Schritt ${zielStep} von 6`))
  await expect(async () => {
    if (await ziel.isVisible().catch(() => false)) return
    // exact: 'Weiteres Foto hinzufuegen' wuerde /weiter/i mit-matchen (Foto-Slot!)
    await page.getByRole('button', { name: 'Weiter', exact: true }).click({ timeout: 5000 })
    await expect(ziel).toBeVisible({ timeout: 4000 })
  }).toPass({ timeout: 30_000 })
}

async function drawSignature(page: Page): Promise<void> {
  const canvas = page.locator('canvas').first()
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signatur-Canvas nicht gefunden')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx - 60, cy)
  await page.mouse.down()
  await page.mouse.move(cx - 20, cy - 15, { steps: 5 })
  await page.mouse.move(cx + 20, cy + 15, { steps: 5 })
  await page.mouse.move(cx + 60, cy - 5, { steps: 5 })
  await page.mouse.up()
}

test('P6-Scan: Gegner-Meldung via Netzwerkkarte -> netzwerk_owner_id = Flotte', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${APP}/schaden/${kartenToken}`, { waitUntil: 'domcontentloaded' })

  // Step 1 — Kontakt (nur Name; kein Telefon/keine E-Mail -> keine Sends)
  await page.getByPlaceholder('Vor- und Nachname').fill('Smoke Gegner P6')
  await weiterZu(page, 2)

  // Step 2 — Fahrzeug + Haftpflicht (Kennzeichen reicht)
  await page.getByPlaceholder('z. B. B-AB 1234').fill('B-SM 999')
  await weiterZu(page, 3)

  // Step 3 — Unfallhergang
  await page.locator('textarea').first().fill('Smoke-Test P6: Parkplatzrempler, kein echter Schaden.')
  await weiterZu(page, 4)

  // Step 4 — Fotos (gegner_fahrzeug required)
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'smoke-gegner.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  })
  // Upload-Verarbeitung (compressImage): Thumbnail abwarten, dann weiter (Re-Klick-Loop)
  await page.waitForTimeout(2500)
  await weiterZu(page, 5)

  // Step 5 — Unterschrift
  await drawSignature(page)
  await page.waitForTimeout(500)
  await weiterZu(page, 6)

  // Step 6 — Consent + Absenden
  await page.locator('input[type="checkbox"]').first().check()
  await page.getByRole('button', { name: /schaden absenden/i }).click()

  // Claim-Entstehung pollen (convertLeadToClaim im Submit-Pfad)
  const db = svc()
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline && !claimId) {
    const { data } = await db
      .from('claims')
      .select('id, netzwerk_owner_id, vermittler_typ')
      .eq('vehicle_id', vehId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data?.[0]?.id) {
      claimId = data[0].id as string
      // Kern-Assert: der Karten-Issuer (Flotte) ist netzwerk_owner des Claims.
      expect((data[0] as { netzwerk_owner_id: string | null }).netzwerk_owner_id).toBe(fm.uid)
      expect((data[0] as { vermittler_typ: string | null }).vermittler_typ).toBe('firmen_flotte')
      return
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  throw new Error('Kein Claim binnen 60s entstanden (Gegner-Submit)')
})
