import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Regel-4-Prod-Smoke fuer Ops-Test Lane C1 (#5187) — Gutachter-Bindung loesen.
//
// OPERATIVES SOLL (aus der Fachlogik, NICHT aus dem Code):
//   Endet die Qualifizierung in einem Weg OHNE SV-Gutachten (Eigenverschulden ->
//   Selbstzahler, oder die Reparatur-Abzweigung), muss die Bindung an den Gutachter fallen:
//     1. der ueber den Finder reservierte Termin wird freigegeben — sonst blockiert ein
//        Phantom-Termin den Kalender-Slot fuer einen Auftrag, den der Gutachter nie bekommt;
//     2. die SV-Zuordnung auf der Finder-Anfrage wird geloest — sonst zeigt der Dispatcher
//        weiter einen Sachverstaendigen zu einem Lead, der keinen bekommen soll.
//   Der Wunschtermin bleibt als Historie stehen.
//
// WARUM EIN SMOKE: die bisherige Verifikation war „prod-Messung = 0 disqualifizierte Leads
// mit aktivem Termin" — das ist Abwesenheit von Schaden, kein Nachweis der Wirkung. Der
// Smoke ERZEUGT die Bindung und prueft, dass die Quali sie loest.
//
// AUSGANGSZUSTAND (Seed): Wegwerf-Lead + reservierter Termin am Lead + Finder-Anfrage mit
// SV-Zuordnung — genau der Zustand nach einer Finder-Buchung. Der gepruefte UEBERGANG
// (Quali-Antwort) laeuft per echter UI im /flow-Funnel.
//
// ⚠ /flow/<token> loest den Token per Backward-compat auch als LEAD-ID auf
// (flow-token.ts:23) — deshalb braucht der Seed keinen flow_links-Eintrag.
//
// Opt-in (nie in CI): RUN_C1_QUALI_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'
// Kanonischer Test-SV (ist_testaccount=true) — er wird hier nur ZUGEORDNET, nicht gebucht.
const TEST_SV = 'b7387f81-482c-4cc5-8ced-bcaa5e92a5ff'
const MARKER = 'SMOKE-C1-QUALI'

test.skip(!process.env.RUN_C1_QUALI_SMOKE, 'set RUN_C1_QUALI_SMOKE=1 (läuft echt gegen Prod)')

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

let leadId: string | null = null
let terminId: string | null = null
let gfaId: string | null = null

test.afterAll(async () => {
  test.setTimeout(120_000)
  const db = admin()
  if (terminId) await db.from('gutachter_termine').delete().eq('id', terminId)
  if (gfaId) await db.from('gutachter_finder_anfragen').delete().eq('id', gfaId)
  if (leadId) await db.from('leads').delete().eq('id', leadId)
  // Leichen frueherer Laeufe (Marker + >1 h alt) — parallel-sicher.
  const alt = new Date(Date.now() - 3600e3).toISOString()
  await db.from('leads').delete().like('email', 'throwaway-c1-%@claimondo.test').lt('created_at', alt)
})

test('Soll: Quali ohne SV-Gutachten löst Termin UND SV-Zuordnung', async ({ page }) => {
  test.setTimeout(240_000)
  const db = admin()
  const stamp = Date.now().toString(36)

  // ── Ausgangszustand: Lead mit Finder-Bindung (Termin + zugeordneter SV) ───────────────
  const { data: lead, error: lErr } = await db
    .from('leads')
    .insert({
      vorname: 'Smoke',
      nachname: 'C1Quali',
      email: `throwaway-c1-${stamp}@claimondo.test`,
      telefon: null, // Regel 4: keine echten Comms
      status: 'neu',
      unfallort: MARKER, // leads fuehrt den Ort als `unfallort` (kein schadenort_adresse)
    })
    .select('id')
    .single()
  expect(lErr?.message ?? null, 'Lead angelegt').toBeNull()
  leadId = lead!.id as string

  // Der reservierte Termin haengt BEZUG-NATIV am Lead (bezug_typ/bezug_id) — so schreibt
  // ihn die Termin-Engine; ein Legacy-lead_id-Insert wuerde den Validate-Trigger reizen.
  const von = new Date(Date.now() + 3 * 24 * 3600e3)
  von.setUTCHours(9, 0, 0, 0)
  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .insert({
      assignee_typ: 'sachverstaendiger',
      assignee_id: TEST_SV,
      bezug_typ: 'lead',
      bezug_id: leadId,
      start_zeit: von.toISOString(),
      end_zeit: new Date(von.getTime() + 40 * 60_000).toISOString(),
      status: 'reserviert',
      typ: 'sv_begutachtung',
      quelle: 'self_service',
    })
    .select('id')
    .single()
  expect(tErr?.message ?? null, 'reservierter Termin angelegt').toBeNull()
  terminId = termin!.id as string

  const { data: gfa, error: gErr } = await db
    .from('gutachter_finder_anfragen')
    .insert({
      vorname: 'Smoke',
      nachname: 'C1Quali',
      email: `throwaway-c1-${stamp}@claimondo.test`,
      telefon: null,
      konvertiert_zu_lead_id: leadId,
      zugeordneter_sv_id: TEST_SV,
      termin_id: terminId,
      schadenort: MARKER,
      schadentyp: 'Parkschaden', // NOT NULL; Wert aus dem prod-Bestand
    })
    .select('id')
    .single()
  expect(gErr?.message ?? null, 'Finder-Anfrage mit SV-Zuordnung angelegt').toBeNull()
  gfaId = gfa!.id as string
  console.log(`[c1] Ausgangszustand: lead=${leadId} termin=${terminId} (reserviert) gfa.sv=${TEST_SV}`)

  // ── Uebergang per UI: der Kunde beantwortet die Quali ─────────────────────────────────
  await page.goto(`${APP}/flow/${leadId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3_000) // Hydration
  const sicht = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  console.log(`[c1] Flow-Seite: ${sicht.slice(0, 500)}`)

  // Schritt 1 des Flows sind die KONTAKTDATEN („Bitte prüfen und korrigieren Sie Ihre
  // Daten“) — die Quali kommt erst danach. Ohne diesen Durchlauf sucht man die
  // Schuldfrage-Buttons vergeblich.
  const dsgvo = page.locator('input[type="checkbox"] >> visible=true').first()
  if (await dsgvo.count()) await dsgvo.check().catch(() => {})
  await page.locator('button:has-text("Weiter") >> visible=true').first().click()
  await page.waitForTimeout(2_500)
  const qualiSicht = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  console.log(`[c1] Quali-Schritt: ${qualiSicht.slice(0, 420)}`)

  // Eigenverschulden = der Zweig ohne SV-Gutachten. Beschriftung tolerant fassen, damit ein
  // Wording-Wechsel den Test nicht bricht — der Nachweis steht ohnehin in der DB.
  // ⚠ has-text matcht SUBSTRING und case-insensitiv: `has-text("Ich")` traf im ersten Lauf
  // „Die Schuldfrage ist noch n‑ICH‑t eindeutig geklärt“ — also den falschen Zweig
  // („Noch unklar“ führt zum Beraterrückruf und löst die Bindung bewusst NICHT).
  // Deshalb auf den vollen Optionstitel gehen.
  const schuldButton = page.locator('button:has-text("Ich selbst") >> visible=true').first()
  await expect(schuldButton, 'Quali-Antwort „Eigenverschulden" wählbar').toBeVisible({ timeout: 20_000 })
  await schuldButton.click()
  await page.waitForTimeout(2_000)

  // Danach folgt die KASKO-Rueckfrage: „eigene Kaskoversicherung?“. „Nein“ führt auf den
  // SELBSTZAHLER-Weg — der Zweig ohne SV-Gutachten, um den es hier geht. („Ja“ wuerde in die
  // Werkstattbindungs-Frage abbiegen.)
  const kaskoNein = page.locator('button:has-text("Nein, ich zahle die Reparatur selbst") >> visible=true').first()
  if (await kaskoNein.count()) {
    await kaskoNein.click()
    await page.waitForTimeout(2_500)
  }
  console.log(`[c1] nach Klick: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 300)}`)

  // ── KERN: die Bindung MUSS fallen — am DB-Zustand gemessen ────────────────────────────
  await expect
    .poll(
      async () => {
        const { data } = await db.from('gutachter_termine').select('status').eq('id', terminId!).maybeSingle()
        return (data?.status as string | null) ?? null
      },
      { timeout: 25_000, message: 'reservierter Termin wird freigegeben' },
    )
    .not.toBe('reserviert')

  const { data: gfaNach } = await db
    .from('gutachter_finder_anfragen')
    .select('zugeordneter_sv_id, termin_id, wunschtermin')
    .eq('id', gfaId!)
    .maybeSingle()
  expect(gfaNach?.zugeordneter_sv_id, 'SV-Zuordnung ist gelöst').toBeNull()
  expect(gfaNach?.termin_id, 'Termin-Verknüpfung ist gelöst').toBeNull()

  const { data: terminNach } = await db
    .from('gutachter_termine')
    .select('status')
    .eq('id', terminId!)
    .maybeSingle()
  console.log(`[c1] ✓ Termin ${terminNach?.status} · gfa.sv=null · kein Phantom im Kalender`)
})
