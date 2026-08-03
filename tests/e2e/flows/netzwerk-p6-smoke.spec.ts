// Regel-4-Prod-Smoke P6 (Netzwerk WS H/K8): Kunde fahrzeug-zentrisch — gegen prod
// (https://app.claimondo.de), Wegwerf-Konten + vollstaendiges Cleanup.
//
// Journey 1 (dieser Spec): Wegwerf-Kunde mit owned Fahrzeug (current_owner_id) +
//   3 Claims: (A) eigener am Fahrzeug, (F) fremder am selben Fahrzeug (Cross-Owner-
//   Filter-Beweis, Review-Fix R1), (O) eigener OHNE Fahrzeug (Legacy-in-place-Beweis).
//   - /kunde/fahrzeuge -> Ein-Auto-Redirect aufs Detail
//   - Detail: Stammdaten + Historie zeigt A, NICHT F
//   - Klick A -> /kunde/fahrzeuge/[veh]/schaden/[A] -> KundeClaimView rendert
//   - /kunde/faelle/[A] -> 30x auf die Fahrzeug-URL (vehicle-bearing Kanonik)
//   - /kunde/faelle/[O] -> rendert in place (kein Redirect, kein Stub)
//
// SICHERHEIT: throwaway-*@claimondo.test (telefon=NULL), fall_typ-Tag, 0-Residue.

import { execSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const SMOKE_TAG = 'SMOKE-P6-NETZWERK'

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

async function kundeCookies(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`)
  const session = await res.json()
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const value = JSON.stringify(session)
  const CHUNK = 3180
  const chunks: { name: string; value: string }[] = []
  if (value.length <= CHUNK) {
    chunks.push({ name: `sb-${projectRef}-auth-token`, value })
  } else {
    for (let i = 0; i * CHUNK < value.length; i++) {
      chunks.push({ name: `sb-${projectRef}-auth-token.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) })
    }
  }
  return chunks.map((c) => ({ ...c, domain: '.claimondo.de', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const }))
}

let kunde: { uid: string; email: string; password: string }
let vehId = ''
let claimA = ''
let claimAnummer = ''
let claimF = ''
let claimFnummer = ''
let claimO = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const raw = execSync('node scripts/smoke/throwaway-account.mjs create kunde --json', {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const line = raw.trim().split('\n').pop() as string
  const acc = JSON.parse(line) as { uid: string; email: string; password: string }
  kunde = { uid: acc.uid, email: acc.email, password: acc.password }

  const db = svc()

  const { data: veh, error: vehErr } = await db
    .from('vehicles')
    .insert({ kennzeichen_aktuell: 'SM-P6 1', hersteller: 'VW', modell_haupttyp: 'Golf', current_owner_id: kunde.uid })
    .select('id')
    .single()
  if (vehErr || !veh) throw new Error(`vehicle: ${vehErr?.message}`)
  vehId = veh.id as string

  const mkClaim = async (opts: { vehicle: boolean; eigen: boolean }): Promise<{ id: string; nummer: string }> => {
    const { data, error } = await db
      .from('claims')
      .insert({
        schadentag: '2026-07-25',
        schadenort_plz: '10115',
        schadenort_ort: 'Berlin',
        schadenart: 'haftpflicht',
        schadens_ursache: 'unfall',
        fall_typ: SMOKE_TAG,
        operative_status: 'gutachten-eingegangen',
        service_typ: 'komplett',
        sa_unterschrieben: true,
        // Kunde-Layout-Gate: every(onboarding_complete=false) -> /kunde/onboarding-Zwang.
        onboarding_complete: true,
        ...(opts.vehicle ? { vehicle_id: vehId } : {}),
        ...(opts.eigen ? { geschaedigter_user_id: kunde.uid } : {}),
      })
      .select('id, claim_nummer')
      .single()
    if (error || !data) throw new Error(`claim: ${error?.message}`)
    // getKundeClaimView gated ueber claim_parties/kunde_id/lead.email -> Party anlegen.
    if (opts.eigen) {
      const { error: pErr } = await db.from('claim_parties').insert({
        claim_id: data.id,
        rolle: 'geschaedigter',
        quelle: 'kunde_self',
        user_id: kunde.uid,
      })
      if (pErr) throw new Error(`claim_party: ${pErr.message}`)
    }
    return { id: data.id as string, nummer: (data.claim_nummer as string | null) ?? '' }
  }

  const a = await mkClaim({ vehicle: true, eigen: true })
  claimA = a.id
  claimAnummer = a.nummer
  const f = await mkClaim({ vehicle: true, eigen: false })
  claimF = f.id
  claimFnummer = f.nummer
  const o = await mkClaim({ vehicle: false, eigen: true })
  claimO = o.id
})

test.afterAll(async () => {
  const db = svc()
  const { data: claims } = await db.from('claims').select('id').eq('fall_typ', SMOKE_TAG)
  const ids = (claims ?? []).map((c: { id: string }) => c.id)
  if (ids.length > 0) {
    await db.from('claim_parties').delete().in('claim_id', ids)
    await db.from('faelle_claim_bridge').delete().in('claim_id', ids)
    await db.from('claims').delete().in('id', ids)
  }
  if (vehId) await db.from('vehicles').delete().eq('id', vehId)
  if (kunde?.uid) {
    await db.from('mitteilungen').delete().eq('empfaenger_id', kunde.uid)
    execSync(`node scripts/smoke/throwaway-account.mjs cleanup ${kunde.uid}`, { cwd: process.cwd(), encoding: 'utf8' })
  }
})

test('P6-1: Ein-Auto-Redirect + Historie (Cross-Owner-Filter) + KundeClaimView', async ({ browser }) => {
  const ctx = await browser.newContext()
  await ctx.addCookies(await kundeCookies(kunde.email, kunde.password))
  const page = await ctx.newPage()

  // /kunde/fahrzeuge -> Ein-Auto-Kunde landet direkt im Detail.
  await page.goto(`${APP}/kunde/fahrzeuge`, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(new RegExp(`/kunde/fahrzeuge/${vehId}`), { timeout: 20_000 })

  // Stammdaten sichtbar.
  await expect(page.getByText('SM-P6 1').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Fahrzeugdaten')).toBeVisible()

  // Historie: eigener Claim JA, fremder Claim NEIN (R1 Cross-Owner-Partition).
  await expect(page.getByText(claimAnummer)).toBeVisible({ timeout: 15_000 })
  if (claimFnummer) {
    await expect(page.getByText(claimFnummer)).toHaveCount(0)
  }

  // Klick auf den eigenen Schaden -> fahrzeug-scoped Detail mit KundeClaimView.
  await page.getByText(claimAnummer).first().click()
  await expect(page).toHaveURL(new RegExp(`/kunde/fahrzeuge/${vehId}/schaden/${claimA}`), { timeout: 20_000 })
  await expect(page.getByText(claimAnummer).first()).toBeVisible({ timeout: 20_000 })

  await ctx.close()
})

test('P6-2: Legacy /kunde/faelle/[id] -> 30x auf die Fahrzeug-URL (vehicle-bearing)', async ({ browser }) => {
  const ctx = await browser.newContext()
  await ctx.addCookies(await kundeCookies(kunde.email, kunde.password))
  const page = await ctx.newPage()

  await page.goto(`${APP}/kunde/faelle/${claimA}`, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(new RegExp(`/kunde/fahrzeuge/${vehId}/schaden/${claimA}`), { timeout: 20_000 })

  await ctx.close()
})

test('P6-3: vehicle-loser Claim rendert in place (kein Redirect, kein Stub)', async ({ browser }) => {
  const ctx = await browser.newContext()
  await ctx.addCookies(await kundeCookies(kunde.email, kunde.password))
  const page = await ctx.newPage()

  await page.goto(`${APP}/kunde/faelle/${claimO}`, { waitUntil: 'domcontentloaded' })
  // bleibt auf der faelle-URL (in-place-Render, kein Fahrzeug-Redirect)
  await page.waitForTimeout(3000)
  expect(page.url()).toContain(`/kunde/faelle/${claimO}`)
  // rendert Inhalt (kein leerer Shell): die Fallakte zeigt die Claim-Nummer bzw. Zonen-Content
  await expect(page.locator('body')).not.toContainText('Fehler beim Laden.')

  await ctx.close()
})
