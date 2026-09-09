import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CTA_SA_UNTERSCHREIBEN } from '../lib/ui-texte'
import {
  seedThrowawayFinderSv,
  purgeThrowawayFinderSv,
  purgeStaleThrowawayFinderSvs,
  type ThrowawayFinderSv,
} from '../lib/test-sv'

// Die DURCHGEHENDE Kette: Finder-Buchung -> DERSELBE FlowLink -> Kundenportal.
//
// WARUM diese Spec zusaetzlich zu den beiden bestehenden existiert (Abnahme-Befund 09.09.2026):
// `golden-path-finder-prod` endet bei der Zusage und klickt den FlowLink NIE (`/flow` kommt in
// ihr nullmal vor). `smoke-kundenfunnel-szenarien-prod` faengt beim FlowLink an und SEEDET Lead,
// Token und Terminreservierung per Service-Role. Beide Haelften sind damit belegt — die NAHT
// dazwischen war es nicht. Genau die ist aber der Weg, den jeder echte Interessent geht:
// im Finder buchen, den Link bekommen, dort abschliessen.
//
// Der Unterschied ist nicht kosmetisch. Der geseedete Termin der Funnel-Spec ist ein
// ZUSTANDSUEBERGANG des Solls, kein Ausgangszustand — Regel 4 verlangt fuer solche Schritte
// einen echten Klick. Hier entsteht der Termin durch die Buchung im Finder, und der FlowLink
// findet ihn vor, statt ihn gestellt zu bekommen.
//
// PARTNER-SICHER, vier Ebenen (identisch zu golden-path-finder-prod):
//   1. TRANSIENT: der Gutachter existiert nur waehrend des Laufs und wird danach restlos entfernt.
//   2. OBSKUR: er sitzt auf Pellworm (faehr-isolierte Insel) -> praktisch kein echter Traffic.
//   3. INTERNE IDENTITAET: der Bucher ist @claimondo.de -> Send-Isolation, keine echten Comms.
//   4. OPT-IN: laeuft nur mit RUN_GOLDEN_PATH_PROD=1, nie in CI.
//
// Run:
//   RUN_GOLDEN_PATH_PROD=1 npx playwright test golden-path-finder-flow-prod --workers=1 --reporter=line

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
const KUNDE_PASSWORT = 'Kf-Smoke-Test-2026!'
const PELLWORM = { adresse: 'Tammensiel, 25849 Pellworm', lat: 54.5237, lng: 8.6831 }
const ISO_BOX = [
  { lat: 54.4, lng: 8.53 },
  { lat: 54.4, lng: 8.84 },
  { lat: 54.65, lng: 8.84 },
  { lat: 54.65, lng: 8.53 },
]

test.skip(!process.env.RUN_GOLDEN_PATH_PROD, 'set RUN_GOLDEN_PATH_PROD=1 (läuft echt gegen Prod)')
test.describe.configure({ mode: 'serial' })

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

let svHandle: ThrowawayFinderSv | null = null
let SV_ID = ''
const bucherEmail = `e2e-kette-${Date.now()}@claimondo.de`

// Der Embed rendert den Wizard zweimal (Desktop-Sidebar + Mobile-Sheet); sichtbar ist genau einer.
const vis = (page: Page, selector: string) => page.locator(`${selector} >> visible=true`).first()

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

async function paintCanvas(page: Page): Promise<void> {
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Signatur-Canvas ohne boundingBox')
  const cy = box.y + box.height / 2
  await page.mouse.move(box.x + 30, cy)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, cy - 20, { steps: 8 })
  await page.mouse.move(box.x + box.width * 0.7, cy + 15, { steps: 8 })
  await page.mouse.move(box.x + box.width - 30, cy - 5, { steps: 8 })
  await page.mouse.up()
}

test.beforeAll(async () => {
  const db = admin()
  await purgeStaleThrowawayFinderSvs(db)
  svHandle = await seedThrowawayFinderSv(db, {
    lat: PELLWORM.lat,
    lng: PELLWORM.lng,
    isochrone: ISO_BOX,
    runId: String(Date.now()),
  })
  SV_ID = svHandle.svId
})

test.afterAll(async () => {
  const db = admin()
  // Reihenfolge zaehlt: erst die Konversions-Artefakte (Claim, Konto, Auftrag, Lead, FlowLink),
  // dann der Gutachter. Umgekehrt haengen die FKs.
  try {
    const { data: lead } = await db
      .from('leads')
      .select('id, konvertiert_zu_claim_id')
      .eq('email', bucherEmail)
      .maybeSingle()
    const leadId = lead?.id as string | undefined
    const claimId = lead?.konvertiert_zu_claim_id as string | undefined
    if (claimId) {
      await db
        .from('claims')
        .update({ ist_aktiv: false, deaktiviert_am: new Date().toISOString(), deaktiviert_grund: 'testfall' })
        .eq('id', claimId)
      await db.from('auftraege').update({ storniert_am: new Date().toISOString() }).eq('claim_id', claimId)
      const { data: claim } = await db.from('claims').select('geschaedigter_user_id').eq('id', claimId).maybeSingle()
      const uid = claim?.geschaedigter_user_id as string | undefined
      if (uid) {
        // Ohne diese Reihenfolge scheitert deleteUser still und ein Test-Konto bleibt auf prod
        // liegen (real aufgetreten 12.08.: mitteilungen_empfaenger_id_fkey).
        await db.from('mitteilungen').delete().eq('empfaenger_id', uid)
        await db.from('notification_deliveries').delete().eq('recipient_user_id', uid)
        await db.from('claim_parties').update({ user_id: null }).eq('user_id', uid)
        await db.from('claims').update({ geschaedigter_user_id: null }).eq('geschaedigter_user_id', uid)
        const del = await db.auth.admin.deleteUser(uid).catch((e: unknown) => ({ error: e }))
        if (del && 'error' in del && del.error) {
          console.warn('[kette] deleteUser fehlgeschlagen — Test-Konto bleibt auf prod:', uid, del.error)
        }
      }
      await db.from('claims').update({ lead_id: null }).eq('id', claimId)
    }
    if (leadId) {
      await db.from('flow_links').delete().eq('lead_id', leadId)
      await db.from('admin_termine').delete().eq('lead_id', leadId)
      await db.from('leads').delete().eq('id', leadId)
    }
  } catch {
    /* best effort — der Purge unten faengt den Rest */
  }
  await purgeThrowawayFinderSv(db, { svId: svHandle?.svId ?? null, uid: svHandle?.uid ?? null, bucherEmail })
  await purgeStaleThrowawayFinderSvs(db)
})

test('Kette: Finder-Buchung → derselbe FlowLink → Claim, Auftrag, Kundenportal', async ({ page }) => {
  test.setTimeout(300_000)
  const db = admin()

  // ───────────────────────── Teil 1: im Finder buchen (UI) ─────────────────────────
  await page.goto(`${APP}/embed/gutachter-finder`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 3_000 })
    .catch(() => {})
  await page.waitForTimeout(2_500)

  const addr = vis(page, 'input[placeholder="Adresse eingeben…"]')
  await expect(addr, 'Adress-Eingabe sichtbar').toBeVisible({ timeout: 25_000 })
  await addr.click()
  await addr.pressSequentially(PELLWORM.adresse, { delay: 60 })
  const vorschlag = page.locator('li[role="option"]').first()
  await expect(vorschlag, 'Adress-Vorschlag erscheint').toBeVisible({ timeout: 15_000 })
  await vorschlag.click()

  const slot = vis(page, `[data-testid^="buchung-slot-${SV_ID}-"]`)
  await expect(slot, 'Slot des Wegwerf-Gutachters erscheint').toBeVisible({ timeout: 30_000 })
  await slot.click()

  await vis(page, 'button:has-text("Auffahrunfall")').click()

  await vis(page, 'input[autocomplete="given-name"]').fill('E2eKette')
  await vis(page, 'input[autocomplete="family-name"]').fill('Smoke')
  await vis(page, 'input[autocomplete="tel"]').fill('+491633628571')
  await vis(page, 'input[autocomplete="email"]').fill(bucherEmail)
  await vis(page, 'input[type="checkbox"]').check()

  await expect(vis(page, 'button:has-text("Termin reservieren")'), 'Buchen-Knopf bereit').toBeEnabled()
  await vis(page, 'button:has-text("Termin reservieren")').click()

  const dankeText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  await expect
    .poll(dankeText, { timeout: 30_000, message: 'Danke-Seite erscheint' })
    .toMatch(/Termin (bestätigt|reserviert)|Terminanfrage eingegangen|konnte nicht|Fehler/i)
  expect(await dankeText(), 'echter Slot ⇒ Zusage, nicht nur Anfrage').toMatch(/Termin (bestätigt|reserviert)/i)

  // ── Der Lead und SEIN FlowLink — gelesen, nicht geseedet ──
  // Der Weg ist gfa → konvertiert_zu_lead_id → lead → flow_links (issue-canonical-flowlink.ts).
  // Die Umwandlung laeuft nach dem Absenden weiter, deshalb pollen statt einmal raten: ein
  // fester waitForTimeout(3000) las beim ersten Lauf zuverlaessig ins Leere.
  let leadId = ''
  let token = ''
  await expect
    .poll(
      async () => {
        const { data: gfa } = await db
          .from('gutachter_finder_anfragen')
          .select('id, konvertiert_zu_lead_id, termin_id, zugeordneter_sv_id')
          .eq('email', bucherEmail)
          .maybeSingle()
        if (!gfa?.konvertiert_zu_lead_id) return ''
        leadId = gfa.konvertiert_zu_lead_id as string
        const { data: fl } = await db
          .from('flow_links')
          .select('token')
          .eq('lead_id', leadId)
          .maybeSingle()
        token = (fl?.token as string | undefined) ?? ''
        return token
      },
      { timeout: 45_000, message: 'die Anfrage wird zu Lead + FlowLink — der Kunde bekommt einen Weg zurück' },
    )
    .toBeTruthy()
  console.log(`[kette] Lead ${leadId} → FlowLink ${token.slice(0, 8)}… → Gutachter ${SV_ID}`)

  // ───────────────────── Teil 2: DERSELBE FlowLink, per UI ─────────────────────
  await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })

  await checkAlleCheckboxen(page)
  await page.getByRole('button', { name: /^weiter/i }).first().click()

  // Quali: unverschuldet. Der Finder-Lead trägt keine Schuldfrage, der Schritt kommt also.
  await page
    .getByRole('button', { name: /Die andere Partei|Unfallgegner|nicht ich/i })
    .first()
    .click({ timeout: 15_000 })
    .catch(() => {})

  // Schaden-Details, Besichtigungsort, reservierter Termin, Werkstatt: durchklicken.
  // Jeder Schritt ist optional — welche erscheinen, hängt am Zustand des Leads.
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole('button', { name: /vorerst überspringen|^überspringen$/i })
      .first()
      .click({ timeout: 4_000 })
      .catch(() => {})
    await page.getByRole('button', { name: /^weiter/i }).first().click({ timeout: 6_000 }).catch(() => {})
  }

  // Beauftragung: Variante wählen, unterschreiben.
  await expect(
    page.getByRole('heading', { name: /Beauftragung unterzeichnen/i }),
    'der FlowLink führt bis zur Beauftragung',
  ).toBeVisible({ timeout: 25_000 })
  await page.getByRole('button', { name: /Komplettservice/i }).click()
  await paintCanvas(page)
  await checkAlleCheckboxen(page)
  const saBtn = page.getByRole('button', { name: CTA_SA_UNTERSCHREIBEN })
  await expect(saBtn).toBeEnabled({ timeout: 12_000 })
  await saBtn.click()

  await page.waitForURL(/\/passwort-aendern|\/kunde/, { timeout: 120_000 })
  if (/\/passwort-aendern/.test(page.url())) {
    await page.getByRole('textbox', { name: /Neues Passwort/i }).fill(KUNDE_PASSWORT)
    await page.getByRole('textbox', { name: /Passwort bestätigen/i }).fill(KUNDE_PASSWORT)
    await page.getByRole('button', { name: /Passwort ändern|Speichern|Weiter/i }).click()
    await page.waitForURL(/\/kunde/, { timeout: 40_000 })
  }

  // ───────────────────── Teil 3: der Folgezustand, geprüft ─────────────────────
  const { data: claim } = await db
    .from('claims')
    .select('id, sa_unterschrieben, operative_status, sv_id')
    .eq('lead_id', leadId)
    .maybeSingle()
  expect(claim, 'aus dem Lead ist ein Fall geworden').toBeTruthy()
  expect(claim!.sa_unterschrieben, 'die Beauftragung ist unterschrieben').toBe(true)
  expect(claim!.sv_id, 'der Fall trägt GENAU den im Finder gewählten Gutachter').toBe(SV_ID)

  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, status, assignee_id, bezug_typ, bezug_id, fall_id')
    .eq('assignee_id', SV_ID)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: false })
    .limit(1)
    .maybeSingle()
  expect(termin, 'der im Finder gebuchte Termin existiert noch').toBeTruthy()
  expect(termin!.status, 'und ist nach der Beauftragung bestätigt').toBe('bestaetigt')

  const { count: auftraege } = await db
    .from('auftraege')
    .select('id', { count: 'exact', head: true })
    .eq('claim_id', claim!.id)
  expect(auftraege ?? 0, 'der Gutachter hat einen Auftrag').toBeGreaterThan(0)

  // Kundenportal: der Kunde sieht seinen Fall. Der Text muss GEPOLLT werden — direkt nach dem
  // URL-Wechsel steht erst die Hülle da ("Claimondo"), der Inhalt kommt nach. Ein einmaliges
  // innerText() las beim ersten Lauf genau diese Hülle und meldete einen Fehler, den es nicht gab.
  await expect(page).toHaveURL(/\/kunde/, { timeout: 20_000 })
  await expect
    .poll(async () => (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' '), {
      timeout: 45_000,
      message: 'das Kundenportal rendert den Fall',
    })
    .toMatch(/Gutachter|Sachverständige|Mein Fall|Termin/i)

  console.log(
    `[kette] ✓ Fall ${claim!.id}, Termin ${termin!.id} bestätigt, ${auftraege} Auftrag/Aufträge, Portal erreicht`,
  )
})
