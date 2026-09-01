// Regel-4-Prod-Smoke P4 (Netzwerk): SV-Vermittlungs-Flow end-to-end gegen prod.
//
//   Teil A (SV): Wegwerf-SV -> /gutachter/auftraege -> CTA "Partner-Werkstatt vermitteln"
//     -> Formular + Mini-PDF -> Sofort-Claim-Asserts (gutachten-eingegangen, sa=false,
//     onboarding=false, sv_id + netzwerk_owner_id = Wegwerf-SV, KEIN lead_preis_netto,
//     gutachten.fertiggestellt_am gesetzt) + FlowLink-URL aus der Erfolgs-UI.
//   Teil B (Kunde, anonym): FlowLink oeffnen -> SA im Canvas signieren -> sign-into-existing-
//     Asserts (sa=true, onboarding_complete=true, abtretung_pdf gesetzt, operative_status
//     -> 'filmcheck' via resume-AutoPhase, lead_preis_netto gesetzt via nachgeholtem Billing).
//   Teil C (Werkstatt-Wahl quelle='gutachter'): dokumentierter SKIP — braucht die volle
//     Kunde-Account-/Login-Kette; die quelle-Ableitung ist unit-getestet (werkstatt-finder-
//     quelle.test.ts) + invarianten-reviewed. Follow-up-Ausbau.
//
// SICHERHEIT: Wegwerf-SV via throwaway-account.mjs (telefon=NULL); Kunde nur mit
// throwaway-…@claimondo.test-Email (kein Telefon -> keine SMS/WA; Mail-Domain ist tot).
// Cleanup: Claim/Lead/Bridge/Provisions-frei (haftpflicht ohne werkstatt_id -> keine
// Provision) + throwaway-Account.
//
// Lauf: env aus .env.local exportieren, dann
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test netzwerk-p4-sv-vermittlung

import { execSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CTA_SA_UNTERSCHREIBEN } from '../lib/ui-texte'

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const KUNDE_EMAIL = `throwaway-p4kunde-${Date.now().toString(36)}@claimondo.test`

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

async function pollClaimByLeadEmail(
  db: SupabaseClient,
  timeoutMs = 30_000,
): Promise<{ claimId: string; leadId: string } | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data: lead } = await db
      .from('leads').select('id, konvertiert_zu_claim_id').eq('email', KUNDE_EMAIL).maybeSingle()
    const cid = (lead as { konvertiert_zu_claim_id?: string | null } | null)?.konvertiert_zu_claim_id
    if (lead && cid) return { claimId: cid, leadId: (lead as { id: string }).id }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return null
}

/** GoTrue-Password-Grant -> Cookies injizieren (Muster _golden-path-lib.loginContext). */
async function svCookies(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = (await res.json()) as { access_token?: string; refresh_token?: string }
  if (!session.access_token) throw new Error(`SV-Auth fehlgeschlagen: ${JSON.stringify(session)}`)
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const value = encodeURIComponent(JSON.stringify(session))
  // Supabase-SSR-Cookie (base64-los, JSON) — chunked erst >3180 chars; Session passt i.d.R. in 2 Chunks.
  const chunks: { name: string; value: string }[] = []
  const CHUNK = 3180
  if (value.length <= CHUNK) {
    chunks.push({ name: `sb-${projectRef}-auth-token`, value })
  } else {
    for (let i = 0; i * CHUNK < value.length; i++) {
      chunks.push({ name: `sb-${projectRef}-auth-token.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK) })
    }
  }
  return chunks.map((c) => ({ ...c, domain: '.claimondo.de', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const }))
}

async function drawSignature(page: Page): Promise<boolean> {
  const canvas = page.locator('canvas').first()
  if ((await canvas.count().catch(() => 0)) === 0) return false
  await canvas.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  const box = await canvas.boundingBox()
  if (!box) return false
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx - 60, cy - 10)
  await page.mouse.down()
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(cx - 60 + i * 10, cy + Math.sin(i) * 14, { steps: 3 })
  }
  await page.mouse.up()
  return true
}

/** Dedizierter SA-Step-Handler: Service waehlen -> Canvas zeichnen -> Checkboxen -> unterschreiben. */
async function handleSaStep(page: Page): Promise<boolean> {
  // Zwei Render-Varianten: Wizard-SA-Step (echtes heading) + Fokus-Signatur (j03-Delta:
  // FokusSignaturClient rendert den Titel NICHT als heading-Role — Marker ist der
  // Vertrags-CTA ("Beauftragung unterschreiben"); Prod-Snapshot 04.08.).
  const heading = page.getByRole('heading', { name: /Beauftragung unterzeichnen|Sicherungsabtretung/i }).first()
  const fokusCta = page.getByRole('button', { name: CTA_SA_UNTERSCHREIBEN }).first()
  const istSaStep =
    (await heading.isVisible().catch(() => false)) || (await fokusCta.isVisible().catch(() => false))
  if (!istSaStep) return false

  const komplett = page.getByRole('button', { name: /Komplettservice/ }).first()
  if (await komplett.isVisible().catch(() => false)) await komplett.click().catch(() => {})
  await page.waitForTimeout(600)

  for (let scroll = 0; scroll < 6; scroll++) {
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(250)
  }
  for (const cb of await page.locator('input[type="checkbox"]:visible').all()) {
    const checked = await cb.isChecked().catch(() => true)
    if (!checked) await cb.check().catch(() => {})
  }
  const drawn = await drawSignature(page)
  if (!drawn) return false
  for (const cb of await page.locator('input[type="checkbox"]:visible').all()) {
    const checked = await cb.isChecked().catch(() => true)
    if (!checked) await cb.check().catch(() => {})
  }
  const submit = page.getByRole('button', { name: /unterzeichnen|unterschreiben|beauftragen|absenden|abschließen/i }).last()
  await submit.scrollIntoViewIfNeeded().catch(() => {})
  await submit.click().catch(() => {})
  // Server-Roundtrip (signSAandCreateFall) abwarten — der Step wechselt danach.
  await page.waitForTimeout(4000)
  return true
}

test.describe.configure({ mode: 'serial' })

let sv: { uid: string; email: string; password: string } | null = null
let flowLinkUrl: string | null = null
let claimId: string | null = null
let leadId: string | null = null

test.beforeAll(() => {
  const out = execSync('node scripts/smoke/throwaway-account.mjs create sachverstaendiger --json', {
    encoding: 'utf8',
  }).trim().split('\n').pop() as string
  const j = JSON.parse(out) as { uid: string; email: string; password: string }
  sv = { uid: j.uid, email: j.email, password: j.password }
})

test.afterAll(async () => {
  const db = svc()
  try {
    if (claimId) {
      await db.from('partner_provisionen').delete().eq('claim_id', claimId)
      await db.from('gutachten').delete().eq('claim_id', claimId)
      await db.from('faelle_claim_bridge').delete().eq('claim_id', claimId)
      await db.from('fall_dokumente').delete().eq('fall_id', claimId)
      await db.from('flow_links').delete().eq('lead_id', leadId ?? '')
      await db.from('claims').delete().eq('id', claimId)
    }
    if (leadId) await db.from('leads').delete().eq('id', leadId)
    else await db.from('leads').delete().eq('email', KUNDE_EMAIL)
  } catch (err) {
    console.error('[cleanup DB]', err)
  }
  if (sv) {
    try {
      // Cleanup-Learning (31.07.): der SV bekommt im Flow In-App-Mitteilungen — deren FK
      // (mitteilungen_empfaenger_id_fkey) blockt den profiles-/auth-Delete des throwaway-
      // Tools (auth=500). Mitteilungen VOR dem Account-Cleanup raeumen.
      await db.from('mitteilungen').delete().eq('empfaenger_id', sv.uid)
      execSync(`node scripts/smoke/throwaway-account.mjs cleanup ${sv.uid}`, { encoding: 'utf8' })
    } catch (err) {
      console.error('[cleanup sv]', err)
    }
  }
})

test('Teil A — SV legt Vermittlungs-Vorgang an: Sofort-Claim un-onboardet, Effekte aufgeschoben', async ({ browser }) => {
  test.setTimeout(180_000)
  if (!sv) throw new Error('kein Wegwerf-SV')

  const cookies = await svCookies(sv.email, sv.password)
  const ctx = await browser.newContext({ baseURL: APP, serviceWorkers: 'block', viewport: { width: 1440, height: 1100 } })
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()

  await page.goto('/gutachter/auftraege', { waitUntil: 'domcontentloaded' })
  const cta = page.getByRole('button', { name: /Partner-Werkstatt vermitteln/ })
  await expect(cta, 'CTA sichtbar (Audit: UI-Erreichbarkeit, auch im Empty-Branch)').toBeVisible({ timeout: 20_000 })
  await cta.click()

  await page.getByLabel('Vorname').fill('Smoke')
  await page.getByLabel('Nachname').fill('P4Kunde')
  await page.getByLabel('E-Mail').fill(KUNDE_EMAIL)
  await page.getByLabel('Kennzeichen').fill('B-P4 123')
  await page.getByLabel('Unfallort').fill('Berlin')
  await page.getByLabel(/Schadenshöhe/).fill('4321,50')
  await page.getByLabel(/Gutachten \(PDF\)/).setInputFiles({
    name: 'smoke-gutachten.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
  })
  await page.getByRole('button', { name: 'Vorgang anlegen' }).click()

  // Erfolgs-UI liefert den FlowLink (Teil-B-Anker).
  const linkBox = page.locator('div.select-all')
  await expect(linkBox, 'Erfolgs-UI mit FlowLink').toBeVisible({ timeout: 60_000 })
  flowLinkUrl = ((await linkBox.textContent()) ?? '').trim()
  expect(flowLinkUrl).toMatch(/\/flow\/.+/)

  // DB-Asserts: Sofort-Claim-Zustand (Invariante VOR Kunden-SA).
  const db = svc()
  const found = await pollClaimByLeadEmail(db)
  expect(found, 'Lead->Claim konvertiert').not.toBeNull()
  claimId = found!.claimId
  leadId = found!.leadId

  const { data: claim } = await db
    .from('claims')
    .select('operative_status, sa_unterschrieben, onboarding_complete, sv_id, netzwerk_owner_id, lead_preis_netto, abrechnungsweg, service_typ')
    .eq('id', claimId)
    .maybeSingle()
  const c = claim as Record<string, unknown>
  expect(c.operative_status, 'Sofort-Claim in gutachten-eingegangen').toBe('gutachten-eingegangen')
  expect(c.sa_unterschrieben, 'un-signiert geboren').toBe(false)
  expect(c.onboarding_complete, 'un-onboardet geboren').toBe(false)
  expect(c.netzwerk_owner_id, 'J8-Owner-Seed = SV-Profil').toBe(sv.uid)
  expect(c.lead_preis_netto, 'KEIN Billing vor SA (Invariante)').toBeNull()
  expect(c.abrechnungsweg).toBe('haftpflicht')
  expect(c.service_typ).toBe('komplett')

  const { data: g } = await db.from('gutachten').select('fertiggestellt_am, gesamt_schadensbetrag').eq('claim_id', claimId).maybeSingle()
  expect((g as Record<string, unknown> | null)?.fertiggestellt_am, 'Gutachten attached (ohne Transition)').toBeTruthy()
  expect(Number((g as Record<string, unknown> | null)?.gesamt_schadensbetrag)).toBeCloseTo(4321.5, 1)

  await ctx.close()
})

test('Teil B — Kunde signiert SA in den bestehenden Claim: Effekte werden nachgeholt', async ({ browser }) => {
  test.setTimeout(240_000)
  test.skip(!flowLinkUrl || !claimId, 'Teil A lieferte keinen FlowLink')

  const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(flowLinkUrl!, { waitUntil: 'domcontentloaded' })

  // j03-Soll-Delta (04.08., P4-UX-Followup): der anonyme Vermittlungs-Kunde landet DIREKT
  // an der Fokus-Signatur — keine Quali, keine Feststellung (der SV hat alles erfasst).
  // Hartes Soll-Assert VOR der Treiberschleife; die Schleife bedient danach nur noch den
  // SA-Step selbst (Checkboxen/Canvas/Absenden).
  // Marker = Fokus-CTA "Beauftragung unterschreiben" (die Fokus-Ansicht rendert den Titel nicht als
  // heading-Role; disabled bis Checkboxen — toBeVisible reicht als Direkt-Start-Beweis).
  await expect(page.getByRole('button', { name: CTA_SA_UNTERSCHREIBEN }).first()).toBeVisible({
    timeout: 30_000,
  })

  // Durch den Flow bis zur SA treiben. Der Wizard ist heterogen (Quali-Options-Karten,
  // Feststellungs-Steps mit Inputs/Uploads, Skip-Links, Weiter-CTAs) — pro Iteration:
  // Canvas? -> zeichnen+absenden. Sonst: Checkboxen abhaken, Pflicht-Inputs mit Dummies
  // fuellen, Options-Karte klicken (bevorzugt "Unfallgegner" = Haftpflicht-konsistent),
  // sonst Skip-Link, sonst Weiter-CTA. (Seit dem j03-Delta ist das nur noch der
  // Fallback-Treiber fuer den SA-Step — das Direkt-Assert oben ist das Soll.)
  let signed = false
  for (let step = 0; step < 30 && !signed; step++) {
    if (await handleSaStep(page)) {
      signed = true
      break
    }

    // 1) Quali-Karte "Der Unfallgegner" (Haftpflicht-konsistent).
    const unfallgegner = page.getByRole('button', { name: /Unfallgegner/ }).first()
    if (await unfallgegner.isVisible().catch(() => false)) {
      await unfallgegner.click()
      await page.waitForTimeout(1500)
      continue
    }

    // 2) Skip zuerst — optionale Feststellungs-Steps ueberspringen (der SA-Step hat keinen Skip).
    const skip = page.getByRole('button', { name: /überspringen|später hochladen|ohne foto/i }).first()
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      await page.waitForTimeout(1300)
      continue
    }

    // 3) Exakte Ja/Nein-Toggles (z.B. "Vorschäden bekannt?") — Nein = harmloseste Antwort,
    //    danach NICHT continue (derselbe Step braucht noch "Weiter").
    const nein = page.getByRole('button', { name: /^Nein$/ }).first()
    if (await nein.isVisible().catch(() => false)) {
      await nein.click().catch(() => {})
      await page.waitForTimeout(400)
    }

    for (const cb of await page.locator('input[type="checkbox"]:visible').all()) {
      const checked = await cb.isChecked().catch(() => true)
      if (!checked) await cb.check().catch(() => {})
    }
    // Inputs datumssensitiv fuellen ("Smoke" in ein date-Feld -> Server-Fehler, Befund Lauf 1).
    for (const inp of await page.locator('input[type="text"]:visible, input:not([type]):visible, textarea:visible').all()) {
      const val = await inp.inputValue().catch(() => 'x')
      if (val) continue
      const ph = ((await inp.getAttribute('placeholder').catch(() => '')) ?? '') +
        ((await inp.getAttribute('name').catch(() => '')) ?? '') +
        ((await inp.getAttribute('id').catch(() => '')) ?? '')
      const dummy = /datum|zulassung|jahr|\d{2}\.\d{2}|tt\.|jjjj|ez/i.test(ph) ? '01.01.2020' : 'Smoke'
      await inp.fill(dummy).catch(() => {})
    }
    for (const dateInp of await page.locator('input[type="date"]:visible').all()) {
      const val = await dateInp.inputValue().catch(() => 'x')
      if (!val) await dateInp.fill('2026-07-20').catch(() => {})
    }

    const next = page
      .getByRole('button', { name: /^(weiter|los geht|starten|verstanden|jetzt unterschreiben|zur unterschrift|bestätigen|passt|weiter zur)/i })
      .first()
    if (await next.isVisible().catch(() => false)) {
      const enabled = await next.isEnabled().catch(() => false)
      if (enabled) {
        await next.click()
        await page.waitForTimeout(1500)
        continue
      }
    }

    // Letzte Option: irgendeine Options-Karte im Content-Bereich (erste waehlbare).
    const anyOption = page.locator('main button, [role="main"] button, div>button').filter({ hasNotText: /zurück|abbrechen/i }).first()
    if (await anyOption.isVisible().catch(() => false)) {
      await anyOption.click().catch(() => {})
    }
    await page.waitForTimeout(1500)
  }
  await page.screenshot({ path: `test-results/p4-teilB-final-step.png`, fullPage: true }).catch(() => {})
  expect(signed, 'SA-Canvas erreicht + gezeichnet').toBe(true)

  // DB-Asserts (poll — sign-into-existing + resume laufen server-seitig nach dem Submit).
  const db = svc()
  const deadline = Date.now() + 90_000
  let ok = false
  let last: Record<string, unknown> | null = null
  while (Date.now() < deadline && !ok) {
    const { data } = await db
      .from('claims')
      .select('sa_unterschrieben, onboarding_complete, abtretung_pdf, operative_status, lead_preis_netto')
      .eq('id', claimId!)
      .maybeSingle()
    last = data as Record<string, unknown>
    ok = last?.sa_unterschrieben === true
    if (!ok) await new Promise((r) => setTimeout(r, 3000))
  }
  expect(ok, `sign-into-existing: sa_unterschrieben=true (zuletzt: ${JSON.stringify(last)})`).toBe(true)
  expect(last!.onboarding_complete, 'onboarding_complete via applySAToExistingClaim').toBe(true)
  expect(last!.abtretung_pdf, 'Signatur-URL am Claim (nicht verworfen)').toBeTruthy()
  expect(last!.operative_status, 'resume-AutoPhase: gutachten-eingegangen -> filmcheck').toBe('filmcheck')
  expect(last!.lead_preis_netto, 'Billing nachgeholt (lead_preis_netto gesetzt)').not.toBeNull()

  await ctx.close()
})

test.skip('Teil C — Kunde waehlt Partner-Werkstatt (quelle=gutachter)', () => {
  // Braucht Account-Anlage + Kunde-Login + Finder-Interaktion; die quelle-Ableitung ist
  // unit-getestet (werkstatt-finder-quelle.test.ts, 4 Faelle) + invarianten-reviewed.
  // Follow-up: an den golden-path-Kunde-Kontext andocken.
})
