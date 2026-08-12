// Regel-4-Prod-Smoke: Kundenfunnel-Szenarien end-to-end gegen prod (app.claimondo.de).
//
// Beweist, dass der Selbstservice-Funnel pro Szenario sauber durchläuft und das
// Kundenportal den Claim operativ korrekt zeigt — inkl. der 08.08.-Fixes:
//   • #5062: signSAandCreateFall bestätigt den (umgehängten) Self-Service-Termin
//     (Termin -> bestaetigt + fall_id + final_verbindlich_ab, Auftrag angelegt).
//   • #5085: Flow-Abschluss-WhatsApp ist für interne/Test-Identitäten still.
//
// Abgedeckt sind ALLE fünf Leaf-Szenarien der Quali-Weiche:
//   A. unverschuldet + komplett       (Termin + SA "Komplettservice", Vollmacht/Anwalt)
//   B. unverschuldet + nur_gutachter  (Termin + SA "Nur Gutachten")
//   C. eigenverschulden + selbstzahler (Reparatur-Lane: KEIN Termin, KEINE SA)
//   D. eigenverschulden + kasko        (dito, abrechnungsweg='kasko')
//   E. teilschuld                      (Rückruf beim Dispatch: KEIN Claim, KEIN Account)
// A+B decken den von #5062/#5085 gefixten Pfad ab; C-E sind die Kontrast-Lanes, die beweisen,
// dass "kein Termin" dort SOLL ist (und nicht dieselbe Strandung wie im #5012-Bug).
//
// TEST-INFRA-HINWEIS: Ein interner Test-Lead kann über den ALLGEMEINEN Finder KEINEN
// Termin buchen (echte SVs -> Test-SV-Guard intern->echt; Test-SVs -> aus dem Pool
// gefiltert, ist_testaccount=false). Deshalb wird der reservierte bezug='lead'-Termin
// per Service-Role geseedet (identisch zur Engine-Ausgabe reserviere()). Der GEFIXTE
// Teil (SA-Confirm + Anzeige + Portal) läuft voll über die echte UI.
//
// Isolation: intern-Test-Identität (@claimondo.test) -> keine echten Kunden-Comms.
// afterEach räumt Claim/Termin/Auftrag/Rückruf/Lead/FlowLink + Account auf — bewusst dort und
// nicht in einem try/finally, damit das Cleanup auch nach einem Test-Timeout noch läuft.
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
  // WICHTIG: erst auf die erste Checkbox warten. page.goto(waitUntil:'domcontentloaded') wartet
  // NICHT auf die React-Hydration — ein sofortiges count() liefert auf langsamem Prod-Load 0,
  // die Schleife tut nichts, und der (ohne Consent disabled) "Weiter"-Button läuft danach in den
  // Test-Timeout. Genau so ist der selbstzahler-Lauf am 09.08. einmal geflaked.
  await boxes.first().waitFor({ state: 'visible', timeout: 20_000 })
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

// EIGENVERSCHULDEN ("Ich selbst") -> Reparatur-Lane: KEIN Gutachter-Termin, KEINE SA.
// Der Flow endet direkt in der Account-Anlage. Zwei Unter-Varianten hinter der Kasko-Weiche:
//   kasko=true  -> "Ja, ich habe eine Kaskoversicherung" -> abrechnungsweg='kasko'
//   kasko=false -> "Nein, ich zahle die Reparatur selbst" -> abrechnungsweg='selbstzahler'
//
// Empirische Schrittfolge (09.08. auf prod durchgeklickt):
//   selbstzahler: Quali -> Kasko-Weiche -> Schaden(skip) -> Werkstatt-Liste(skip) -> Account
//   kasko:        Quali -> Kasko-Weiche -> Werkstattbindung#1 -> Schaden(skip)
//                 -> Werkstattbindung#2 -> Werkstatt-Liste(skip) -> Account
// Die beiden Werkstattbindungs-Gates sind unterschiedlich formuliert ("Bist du an eine Werkstatt
// deiner Versicherung gebunden?" / "Darfst du die Werkstatt frei wählen?"), bieten aber je genau
// EINE Option mit "kann die Werkstatt frei wählen" (die Gegenoption lautet "...Versicherung
// schreibt die Werkstatt vor"). Deshalb wird die Zwischenstrecke als Schleife gefahren: das
// macht den Driver unabhängig von der Gate-Reihenfolge und -Anzahl.
async function fahreFlowEigenverschulden(
  page: Page,
  token: string,
  opts: { kasko: boolean },
): Promise<void> {
  await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded' })

  // Datencheck: Datenschutz-Checkbox(en) + Weiter.
  await checkAlleCheckboxen(page)
  await page.getByRole('button', { name: /^weiter/i }).first().click()

  // Quali: Schuldfrage -> eigenverantwortung.
  await page.getByRole('button', { name: /Ich selbst/i }).click()

  // Kasko-Weiche (bestimmt den abrechnungsweg).
  await page
    .getByRole('button', {
      name: opts.kasko ? /Ja, ich habe eine Kaskoversicherung/i : /Nein, ich zahle die Reparatur selbst/i,
    })
    .click()

  // Zwischenstrecke: Werkstattbindungs-Gate(s) + optionale Schaden-Aufnahme. Max. 3 Runden
  // (2 Gates + 1 Schaden-Skip); bricht ab, sobald keiner der beiden Buttons mehr erscheint.
  for (let i = 0; i < 3; i++) {
    const naechster = page
      .getByRole('button', { name: /kann die Werkstatt frei wählen|vorerst überspringen/i })
      .first()
    try {
      await naechster.waitFor({ state: 'visible', timeout: 8_000 })
    } catch {
      break
    }
    await naechster.click()
  }

  // Werkstatt-Liste: bewusst überspringen (Wahl ist optional — sonst vermittelt der Dispatch).
  await page
    .getByRole('button', { name: /^überspringen$/i })
    .first()
    .click({ timeout: 10_000 })
    .catch(() => {})

  // Kein Termin, keine SA -> direkt Account-Anlage -> Passwort -> Kundenportal.
  await page.waitForURL(/\/passwort-aendern|\/kunde/, { timeout: 90_000 })
  if (/\/passwort-aendern/.test(page.url())) {
    await page.getByRole('textbox', { name: /Neues Passwort/i }).fill(KUNDE_PASSWORT)
    await page.getByRole('textbox', { name: /Passwort bestätigen/i }).fill(KUNDE_PASSWORT)
    await page.getByRole('button', { name: /Passwort ändern|Speichern|Weiter/i }).click()
    await page.waitForURL(/\/kunde/, { timeout: 30_000 })
  }
}

// TEILSCHULD ("Noch unklar") -> Rückruf beim Dispatch statt Gutachter-Buchung.
// Endet BEWUSST im /flow: kein Claim, kein Account — nur ein offener Rückruf-Task in der
// Dispatch-Queue (admin_termine typ='rueckruf'), den ein Berater abarbeitet.
async function fahreFlowTeilschuld(page: Page, token: string): Promise<void> {
  await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded' })

  await checkAlleCheckboxen(page)
  await page.getByRole('button', { name: /^weiter/i }).first().click()

  // Quali: Schuldfrage -> unklar.
  await page.getByRole('button', { name: /Noch unklar/i }).click()

  // Rückruf-Step. BEWUSST rollenbasiert statt über die data-testids aus FlowRueckrufStep.tsx:
  // prod deployt von `main`, und die testid-Commits liegen (Stand 09.08.) nur auf `staging` —
  // getByTestId lief hier deshalb live ins Leere. Rolle+Text sind versionsunabhängig.
  await page.getByRole('button', { name: /Rückruf anfordern/i }).click()
  await expect(page.getByRole('heading', { name: /Wir rufen dich zurück/i })).toBeVisible({
    timeout: 20_000,
  })
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
      if (uid) {
        // Der Account haengt an mehreren FKs — ohne diese Reihenfolge scheitert deleteUser
        // still (der .catch schluckt es) und JEDER Lauf laesst einen Test-Account auf prod
        // zurueck. Real aufgetreten 12.08.: `mitteilungen_empfaenger_id_fkey` (23503), erzeugt
        // von der in-app-Zustellung des `kunde.account_bereit`-Events (#5205).
        await db.from('mitteilungen').delete().eq('empfaenger_id', uid)
        await db.from('notification_deliveries').delete().eq('recipient_user_id', uid)
        await db.from('claim_parties').update({ user_id: null }).eq('user_id', uid)
        await db.from('claims').update({ geschaedigter_user_id: null }).eq('geschaedigter_user_id', uid)
        const del = await db.auth.admin.deleteUser(uid).catch((e: unknown) => ({ error: e }))
        // Nicht still scheitern lassen: ein Rest faellt sonst erst beim naechsten Audit auf.
        if (del && 'error' in del && del.error) {
          console.warn('[cleanup] deleteUser fehlgeschlagen — Test-Account bleibt auf prod:', uid, del.error)
        }
      }
    }
    if (leadId) {
      await db.from('flow_links').delete().eq('lead_id', leadId)
      // Rückruf-Task des teilschuld-Pfads (admin_termine.lead_id -> FK auf leads) muss VOR
      // dem Lead-Delete weg, sonst bleibt der Lead an der FK hängen.
      await db.from('admin_termine').delete().eq('lead_id', leadId)
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

  // Aufräum-Kontext des laufenden Tests. Das Cleanup MUSS im afterEach hängen, nicht in einem
  // try/finally im Test: bei einem Test-Timeout bricht Playwright den Test-Body ab — der
  // finally-Block läuft dann NICHT mehr und es bleibt Prod-Residue liegen (am 09.08. genau so
  // passiert: ein Lead des geflakten Laufs blieb stehen). afterEach hat ein eigenes Zeitbudget.
  // Tests laufen je Worker seriell, das Modul-Scope-Objekt ist damit race-frei.
  let aufraeumen: { email: string; terminId?: string } | null = null

  test.afterEach(async () => {
    if (!aufraeumen) return
    const { email, terminId } = aufraeumen
    aufraeumen = null
    await cleanup(svc(), email, terminId)
  })

  for (const sz of SZENARIEN) {
    test(`unverschuldet + ${sz.name}: Flow -> SA -> Termin bestätigt -> Kundenportal`, async ({ page }) => {
      test.setTimeout(210_000)
      const email = `smoke-kf-${sz.name}-${Date.now()}@claimondo.test`
      const db = svc()
      aufraeumen = { email }
      {
        const { leadId, token } = await seedeLeadUndFlowLink(db, email)
        const terminId = await seedeReserviertenTermin(db, leadId)
        aufraeumen = { email, terminId }
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
      }
    })
  }

  // ── EIGENVERSCHULDEN: Reparatur-Lane, KEIN Termin/keine SA (von #5062/#5085 unberührt) ──
  for (const variante of [
    { name: 'selbstzahler', kasko: false, abrechnungsweg: 'selbstzahler' },
    { name: 'kasko', kasko: true, abrechnungsweg: 'kasko' },
  ] as const) {
    test(`eigenverschulden + ${variante.name}: Flow -> Werkstatt-Lane -> Kundenportal (ohne Termin)`, async ({
      page,
    }) => {
      test.setTimeout(210_000)
      const email = `smoke-kf-eigen-${variante.name}-${Date.now()}@claimondo.test`
      const db = svc()
      aufraeumen = { email }
      {
        const { leadId, token } = await seedeLeadUndFlowLink(db, email)
        await fahreFlowEigenverschulden(page, token, { kasko: variante.kasko })

        // ── DB-Assertion: Claim liegt in der Reparatur-Lane, NICHT in der SV-Termin-Lane ──
        const { data: claim } = await db
          .from('claims')
          .select('id, operative_status, schuldfrage, abrechnungsweg, sa_unterschrieben')
          .eq('lead_id', leadId)
          .maybeSingle()
        expect(claim, 'Claim wurde angelegt').toBeTruthy()
        expect(claim!.schuldfrage, 'Selbstverschulden erkannt').toBe('eigenverantwortung')
        expect(claim!.abrechnungsweg, 'Abrechnungsweg aus der Kasko-Weiche').toBe(variante.abrechnungsweg)
        // Kein Gutachter-Auftrag -> keine SA, Claim bleibt in der Ersterfassung.
        expect(claim!.sa_unterschrieben, 'Keine SA im Eigenverschulden-Pfad').toBe(false)
        expect(claim!.operative_status).toBe('ersterfassung')

        const { count: terminCount } = await db
          .from('gutachter_termine')
          .select('id', { count: 'exact', head: true })
          .eq('bezug_typ', 'fall')
          .eq('bezug_id', claim!.id)
        expect(terminCount ?? 0, 'Kein SV-Termin in der Reparatur-Lane').toBe(0)

        const { count: auftragCount } = await db
          .from('auftraege')
          .select('id', { count: 'exact', head: true })
          .eq('claim_id', claim!.id)
        expect(auftragCount ?? 0, 'Kein Gutachten-Auftrag in der Reparatur-Lane').toBe(0)

        // ── Kundenportal erreichbar (Account angelegt, Claim sichtbar) ──
        await expect(page).toHaveURL(/\/kunde/, { timeout: 20_000 })
      }
    })
  }

  // ── TEILSCHULD: Rückruf beim Dispatch — bewusst KEIN Claim/Account ──
  test('teilschuld: Flow -> Rückruf angefordert -> Dispatch-Queue (kein Claim)', async ({ page }) => {
    test.setTimeout(150_000)
    const email = `smoke-kf-teil-${Date.now()}@claimondo.test`
    const db = svc()
    aufraeumen = { email }
    {
      const { leadId, token } = await seedeLeadUndFlowLink(db, email)
      await fahreFlowTeilschuld(page, token)

      // ── DB-Assertion: Lead bleibt Lead, Rückruf landet in der Dispatch-Queue ──
      const { data: lead } = await db
        .from('leads')
        .select('schuldfrage, konvertiert_zu_claim_id')
        .eq('id', leadId)
        .maybeSingle()
      expect(lead!.schuldfrage, 'Schuldfrage unklar gespeichert').toBe('unklar')
      expect(lead!.konvertiert_zu_claim_id, 'Kein Claim vor der Haftungsklärung').toBeNull()

      const { data: rueckruf } = await db
        .from('admin_termine')
        .select('typ, status, zugewiesen_an')
        .eq('lead_id', leadId)
        .maybeSingle()
      expect(rueckruf, 'Rückruf-Task angelegt').toBeTruthy()
      expect(rueckruf!.typ).toBe('rueckruf')
      expect(rueckruf!.status, 'Rückruf offen in der Dispatch-Queue').toBe('offen')
      expect(rueckruf!.zugewiesen_an, 'Rückruf einem Dispatcher zugewiesen').toBeTruthy()
    }
  })
})
