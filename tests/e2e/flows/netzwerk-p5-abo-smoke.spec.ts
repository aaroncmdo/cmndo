// Regel-4-Prod-Smoke P5/J8: Netzwerkpartner-Abo — Einstellungen-UI end-to-end gegen prod.
// K15: NIE eine echte Charge — der Checkout wird nur GEMOUNTET (client_secret + Stripe-iframe),
// dann abgebrochen. Wegwerf-SV (telefon=NULL), 0 Residue.
//
// Test 1 (comped-Entitlement-UI): Abo-Row status='comped' (service-role) -> Einstellungen
//   zeigen Status "Aktiv (Partner-Konditionen)" und KEINE Upgrade-CTA, keinen Portal-Button.
// Test 2 (Checkout-Mount): Row weg -> CTA mit Config-Preisen (29,99 EUR) sichtbar ->
//   Klick "Netzwerkpartner werden" -> embedded Stripe-Checkout-iframe mountet (Session
//   live erzeugt, KEINE Zahlung; Session verfaellt nach 24h). Danach: KEINE Abo-Row
//   entstanden (Checkout-Session allein schreibt nichts — Webhook-getrieben).

import { execSync } from 'node:child_process'
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

async function svCookies(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login: ${res.status} ${await res.text()}`)
  const session = await res.json()
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const value = JSON.stringify(session)
  const CHUNK = 3180
  const chunks: { name: string; value: string }[] = []
  if (value.length <= CHUNK) chunks.push({ name: `sb-${projectRef}-auth-token`, value })
  else
    for (let i = 0; i * CHUNK < value.length; i++)
      chunks.push({ name: `sb-${projectRef}-auth-token.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) })
  return chunks.map((c) => ({ ...c, domain: '.claimondo.de', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const }))
}

let sv: { uid: string; email: string; password: string }
let svId = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const raw = execSync('node scripts/smoke/throwaway-account.mjs create sachverstaendiger --json', {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const acc = JSON.parse(raw.trim().split('\n').pop() as string) as { uid: string; email: string; password: string }
  sv = acc
  const db = svc()
  const { data: row } = await db.from('sachverstaendige').select('id').eq('profile_id', sv.uid).maybeSingle()
  if (!row?.id) throw new Error('sachverstaendige-Row fehlt (throwaway)')
  svId = row.id as string
})

test.afterAll(async () => {
  const db = svc()
  if (svId) await db.from('sv_netzwerk_abonnements').delete().eq('sv_id', svId)
  if (sv?.uid) {
    await db.from('mitteilungen').delete().eq('empfaenger_id', sv.uid)
    execSync(`node scripts/smoke/throwaway-account.mjs cleanup ${sv.uid}`, { cwd: process.cwd(), encoding: 'utf8' })
  }
})

test('J8-1: comped-Abo -> Einstellungen zeigen Partner-Status, keine CTA', async ({ browser }) => {
  const db = svc()
  const { error } = await db.from('sv_netzwerk_abonnements').insert({ sv_id: svId, status: 'comped' })
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`comped-Seed: ${error.message}`)

  const ctx = await browser.newContext()
  await ctx.addCookies(await svCookies(sv.email, sv.password))
  const page = await ctx.newPage()
  await page.goto(`${APP}/gutachter/einstellungen`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByText('Aktiv (Partner-Konditionen)')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Netzwerkpartner werden' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Abo verwalten' })).toHaveCount(0)

  await ctx.close()
  await db.from('sv_netzwerk_abonnements').delete().eq('sv_id', svId)
})

test('J8-2: Free -> CTA mit Config-Preis -> embedded Checkout mountet (Abbruch vor Zahlung)', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext()
  await ctx.addCookies(await svCookies(sv.email, sv.password))
  const page = await ctx.newPage()
  await page.goto(`${APP}/gutachter/einstellungen`, { waitUntil: 'domcontentloaded' })

  // CTA sichtbar mit Config-Preis (AB2-Platzhalter 29,99 EUR)
  await expect(page.getByText('29,99')).toBeVisible({ timeout: 20_000 })
  const cta = page.getByRole('button', { name: 'Netzwerkpartner werden' })
  await expect(cta).toBeVisible()
  await cta.click()

  // Embedded Stripe-Checkout mountet (iframe von stripe.com) — DANN SOFORT SCHLUSS (keine Zahlung).
  await expect(page.locator('iframe[src*="stripe.com"], iframe[name^="embedded-checkout"]').first()).toBeVisible({
    timeout: 45_000,
  })
  await ctx.close()

  // Checkout-Session allein erzeugt KEINE Abo-Row (Webhook-getrieben).
  const db = svc()
  const { data } = await db.from('sv_netzwerk_abonnements').select('sv_id').eq('sv_id', svId).maybeSingle()
  expect(data).toBeNull()
})
