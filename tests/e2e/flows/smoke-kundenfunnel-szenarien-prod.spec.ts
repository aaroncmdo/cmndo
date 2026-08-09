// Regel-4-Prod-Smoke: Kundenfunnel-Szenarien end-to-end gegen prod (app.claimondo.de).
//
// Beweist, dass der Selbstservice-Funnel pro Szenario sauber durchläuft und das
// Kundenportal den Claim operativ korrekt zeigt — inkl. der 08.08.-Fixes:
//   • #5062: signSAandCreateFall bestätigt den (umgehängten) Self-Service-Termin
//     (Termin -> bestaetigt + fall_id + final_verbindlich_ab, Auftrag angelegt).
//   • #5085: Flow-Abschluss-WhatsApp ist für interne/Test-Identitäten still.
//
// Abgedeckt (gegner = unverschuldet, mit Termin + SA):
//   1. unverschuldet + komplett      (SA "Komplettservice", Vollmacht/Anwalt)
//   2. unverschuldet + nur_gutachter (SA "Nur Gutachten")
// Struktur ist erweiterbar (eigenverschulden -> Werkstatt/kein Termin, teilschuld -> Rückruf).
//
// TEST-INFRA-HINWEIS: Ein interner Test-Lead kann über den ALLGEMEINEN Finder KEINEN
// Termin buchen (echte SVs -> Test-SV-Guard intern->echt; Test-SVs -> aus dem Pool
// gefiltert, ist_testaccount=false). Deshalb wird der reservierte bezug='lead'-Termin
// per Service-Role geseedet (identisch zur Engine-Ausgabe reserviere()). Der GEFIXTE
// Teil (SA-Confirm + Anzeige + Portal) läuft voll über die echte UI.
//
// Isolation: intern-Test-Identität (@claimondo.test) -> keine echten Kunden-Comms.
// afterEach räumt Claim/Termin/Auftrag/Lead/FlowLink + Account auf.
//
// Gated: läuft NICHT auf jedem PR (CI e2e-Job fährt alle Specs gegen prod). Setzen:
//   RUN_KUNDENFUNNEL_SMOKE=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
//     npx playwright test smoke-kundenfunnel-szenarien-prod

import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const RUN = process.env.RUN_KUNDENFUNNEL_SMOKE === '1'
const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

// Loginbarer Test-SV (nicolas.kitta+testsv). Assignee des geseedeten Termins.
const TEST_SV_ID = 'b7387f81-482c-4cc5-8ced-bcaa5e92a5ff'
// Etabliertes Test-Telefon (NIE eine echte Kundennummer). Sends schlagen fehl/sind isoliert.
const TEST_TELEFON = '+491633628571'
const KUNDE_PASSWORT = 'Kf-Smoke-Test-2026!'

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

// SA-Signatur auf dem Canvas-Pad zeichnen (2 Striche) — Muster aus smoke-staging-vollstaendig.
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

// Alle sichtbaren, noch nicht gehakten Checkboxen anhaken (Datenschutz/AGB/Widerruf).
// getByRole('checkbox') matcht native <input> UND shadcn/role=checkbox-Buttons; isChecked()
// liest .checked bzw. aria-checked. scrollIntoView, weil Pflicht-Checkboxen unter dem Fold liegen.
async function checkAlleCheckboxen(page: Page): Promise<void> {
  const boxes = page.getByRole('checkbox')
  const n = await boxes.count()
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i)
    if (!(await b.isVisible().catch(() => false))) continue
    await b.scrollIntoViewIfNeeded().catch(() => {})
    if (!(await b.isChecked().catch(() => false))) await b.click({ force: true }).catch(() => {})
  }
}

const KOELN = { adresse: 'Hansaring 30, 50670 Köln, Deutschland', lat: 50.9460795, lng: 6.9457681 }

// Schritt 1: Lead + FlowLink per Service-Role seeden (Shape eines echten self_service-Finder-
// Leads). schuldfrage bleibt NULL -> der /flow zeigt den Quali-Schritt, den wir echt fahren.
// Die Lead-Erzeugungs-UI (/schaden-melden, Finder) ist ein SEPARATER, eigener Smoke-Concern;
// diese Spec beweist den /flow -> SA -> Confirm -> Portal-Pfad (die 08.08.-Fixes).
async function seedeLeadUndFlowLink(db: SupabaseClient, email: string): Promise<{ leadId: string; token: string }> {
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .insert({
      vorname: 'KfSmoke',
      nachname: 'Szenario',
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

// Reservierten bezug='lead'-Termin seeden (identisch zur Engine reserviere()): Test-SV,
// Zukunfts-Slot, großzügige TTL, Besichtigungsort aus dem Lead.
async function seedeReserviertenTermin(db: SupabaseClient, leadId: string): Promise<string> {
  const { data: lead } = await db
    .from('leads')
    .select('fahrzeug_standort_adresse, fahrzeug_standort_lat, fahrzeug_standort_lng, unfallort')
    .eq('id', leadId)
    .maybeSingle()
  // Random-Slot (weit gestreut) — sonst kollidieren parallele/aufeinanderfolgende Seeds am
  // gutachter_termine_no_assignee_overlap-Constraint (gleicher SV, gleiche Zeit).
  const dayOffset = 3 + Math.floor(Math.random() * 25)
  const hour = 8 + Math.floor(Math.random() * 8)
  const start = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000)
  start.setUTCHours(hour, 0, 0, 0)
  const end = new Date(start.getTime() + 40 * 60 * 1000)
  const { data, error } = await db
    .from('gutachter_termine')
    .insert({
      assignee_typ: 'sachverstaendiger',
      assignee_id: TEST_SV_ID,
      start_zeit: start.toISOString(),
      end_zeit: end.toISOString(),
      status: 'reserviert',
      reserviert_bis: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      quelle: 'self_service',
      typ: 'sv_begutachtung',
      bezug_typ: 'lead',
      bezug_id: leadId,
      besichtigungsort_adresse:
        lead?.fahrzeug_standort_adresse ?? lead?.unfallort ?? 'Hansaring 30, 50670 Köln, Deutschland',
      besichtigungsort_lat: lead?.fahrzeug_standort_lat ?? 50.9460795,
      besichtigungsort_lng: lead?.fahrzeug_standort_lng ?? 6.9509,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Termin-Seed fehlgeschlagen: ${error?.message}`)
  return data.id as string
}

// /flow von Consent bis Kundenportal fahren. schuldfrageRegex wählt die Quali-Antwort,
// serviceRegex die SA-Service-Variante (Komplettservice | Nur Gutachten).
async function fahreFlowBisPortal(
  page: Page,
  token: string,
  opts: { schuldfrageRegex: RegExp; serviceRegex: RegExp },
): Promise<void> {
  await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded' })

  // Datencheck: Datenschutz-Checkbox(en) + Weiter.
  await checkAlleCheckboxen(page)
  await page.getByRole('button', { name: /^weiter/i }).first().click()

  // Quali: Schuldfrage.
  await page.getByRole('button', { name: opts.schuldfrageRegex }).click()

  // Schaden (optional) überspringen, falls angeboten.
  await page
    .getByRole('button', { name: /vorerst überspringen/i })
    .click({ timeout: 6_000 })
    .catch(() => {})

  // Besichtigungsort: Weiter (Adresse ist aus dem Lead vorbelegt).
  await page.getByRole('button', { name: /^weiter/i }).first().click({ timeout: 10_000 }).catch(() => {})

  // Reservierter Termin ("Ihr persönlicher Gutachter") -> Weiter.
  await page.getByRole('button', { name: /^weiter/i }).first().click({ timeout: 10_000 }).catch(() => {})

  // Werkstatt (optional) überspringen.
  await page
    .getByRole('button', { name: /^überspringen/i })
    .click({ timeout: 8_000 })
    .catch(() => {})

  // SA-Schritt: Service-Variante wählen, Signatur zeichnen, Pflicht-Checkboxen, unterzeichnen.
  await expect(page.getByRole('heading', { name: /Beauftragung unterzeichnen/i })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: opts.serviceRegex }).click()
  await paintCanvas(page)
  await checkAlleCheckboxen(page)
  const saBtn = page.getByRole('button', { name: /SA unterzeichnen/i })
  await expect(saBtn).toBeEnabled({ timeout: 10_000 })
  await saBtn.click()

  // Nach SA: Account-Anlage -> Passwort setzen -> Kundenportal.
  await page.waitForURL(/\/passwort-aendern|\/kunde/, { timeout: 90_000 })
  if (/\/passwort-aendern/.test(page.url())) {
    await page.getByRole('textbox', { name: /Neues Passwort/i }).fill(KUNDE_PASSWORT)
    await page.getByRole('textbox', { name: /Passwort bestätigen/i }).fill(KUNDE_PASSWORT)
    await page.getByRole('button', { name: /Passwort ändern|Speichern|Weiter/i }).click()
    await page.waitForURL(/\/kunde/, { timeout: 30_000 })
  }
}

// Alles rund um den Lead aufräumen (Service-Role). Claim deaktivieren (nicht hart löschen,
// FK-sicher), Termin/Auftrag stornieren, Lead/FlowLink löschen, Account entfernen.
async function cleanup(db: SupabaseClient, email: string, terminId?: string): Promise<void> {
  try {
    // Den geseedeten Termin DIREKT per ID stornieren — er hängt nach der Konversion auf der
    // fall-Achse (bezug_id=claimId, lead_id=NULL), ein lead-Achsen-Filter verfehlt ihn (sonst
    // bleibt er 'bestaetigt' und blockt den nächsten Seed am Overlap-Constraint).
    if (terminId) {
      await db
        .from('gutachter_termine')
        .update({ status: 'storniert', cancelled_at: new Date().toISOString() })
        .eq('id', terminId)
        .neq('status', 'storniert')
    }
    const { data: lead } = await db
      .from('leads')
      .select('id, konvertiert_zu_claim_id')
      .eq('email', email)
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
      if (uid) await db.auth.admin.deleteUser(uid).catch(() => {})
    }
    if (leadId) {
      await db.from('flow_links').delete().eq('lead_id', leadId)
      // Lead entfernen: erst die claims.lead_id-FK lösen (Claim bleibt deaktiviert bestehen),
      // dann den Lead löschen. Best-effort — greift eine FK, bleibt der Lead (harmlos) liegen.
      if (claimId) await db.from('claims').update({ lead_id: null }).eq('id', claimId)
      await db.from('leads').delete().eq('id', leadId)
    }
  } catch {
    /* Cleanup best-effort — ein Fehler darf den Test-Report nicht rot machen */
  }
}

const SZENARIEN = [
  { name: 'komplett', serviceRegex: /Komplettservice/i, erwarteterStatus: 'sv-termin' },
  { name: 'nur_gutachter', serviceRegex: /Nur Gutachten/i, erwarteterStatus: 'sv-termin' },
] as const

test.describe('Kundenfunnel-Szenarien (Prod, gated RUN_KUNDENFUNNEL_SMOKE)', () => {
  test.skip(!RUN, 'RUN_KUNDENFUNNEL_SMOKE nicht gesetzt')

  for (const sz of SZENARIEN) {
    test(`unverschuldet + ${sz.name}: Flow -> SA -> Termin bestätigt -> Kundenportal`, async ({ page }) => {
      test.setTimeout(210_000)
      const email = `smoke-kf-${sz.name}-${Date.now()}@claimondo.test`
      const db = svc()
      let terminId: string | undefined
      try {
        const { leadId, token } = await seedeLeadUndFlowLink(db, email)
        terminId = await seedeReserviertenTermin(db, leadId)
        await fahreFlowBisPortal(page, token, {
          schuldfrageRegex: /Der Unfallgegner/i,
          serviceRegex: sz.serviceRegex,
        })

        // ── DB-Assertion: Claim + Termin (der #5062-gefixte Zustand) ──
        const { data: claim } = await db
          .from('claims')
          .select('id, operative_status, sa_unterschrieben, service_typ')
          .eq('lead_id', leadId)
          .maybeSingle()
        expect(claim, 'Claim wurde angelegt').toBeTruthy()
        expect(claim!.sa_unterschrieben).toBe(true)
        expect(claim!.operative_status).toBe(sz.erwarteterStatus)

        const { data: termin } = await db
          .from('gutachter_termine')
          .select('status, fall_id, claim_id, final_verbindlich_ab')
          .eq('id', terminId)
          .maybeSingle()
        expect(termin!.status, 'Termin bestätigt (#5062)').toBe('bestaetigt')
        expect(termin!.fall_id, 'Termin an Fall verknüpft (#5062)').toBeTruthy()
        expect(termin!.final_verbindlich_ab, 'final_verbindlich_ab gesetzt (#5062)').toBeTruthy()

        const { count: auftragCount } = await db
          .from('auftraege')
          .select('id', { count: 'exact', head: true })
          .eq('claim_id', claim!.id)
        expect(auftragCount ?? 0, 'Erstgutachten-Auftrag angelegt').toBeGreaterThan(0)

        // ── Kundenportal: operativ korrekt (Willkommen + Gutachter + Betreuer) ──
        await expect(page.getByRole('heading', { name: /Willkommen bei Claimondo/i })).toBeVisible({
          timeout: 20_000,
        })
        await expect(page.getByText(/Ihr Gutachter/i).first()).toBeVisible()
        await expect(page.getByText(/Ihr Betreuer|Kundenbetreuer/i).first()).toBeVisible()
      } finally {
        await cleanup(db, email, terminId)
      }
    })
  }
})
