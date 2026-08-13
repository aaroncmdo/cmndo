import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Regel-4-Prod-Smoke fuer Ops-Test Lane F3 (#5191) — Warte-Zustaende erzeugen keine Aufgabe.
//
// OPERATIVES SOLL (aus der Fachlogik, NICHT aus dem Code):
//   Im Claim erscheint die Aufgabe „Termin bestätigen" NUR, wenn es einen bestaetigungs-
//   beduerftigen Zeitpunkt gibt. Ein WARTE-Zustand erzeugt keine Aufgabe — sonst fordert die
//   Oberflaeche eine Handlung, fuer die es gar kein Objekt gibt:
//     * angefragt  = die Anfrage liegt bei der Werkstatt, sie hat noch nicht geantwortet
//                    (prod: alle 7 solchen Zeilen haben WEDER wunschtermin NOCH bestaetigter_termin)
//     * reserviert = SV-Termin vor der automatischen Bestaetigung — der Kunde tut nichts
//   Handlungspflichtig ist der Kunde erst, wenn die Gegenseite ihm den Ball zuspielt:
//     werkstatt_vorschlag | gegenvorschlag | anruf_erbeten.
//
// ⚠ ZUR EINORDNUNG (13.08.): F3 galt als „nicht ausloesbar — 0 Termine in allen fuenf Status".
// Das war eine FEHLMESSUNG. prod fuehrt durchgehend `reparatur_termine` mit status='angefragt'
// (7 Zeilen, aelteste seit 08.08., also auch am Messtag vorhanden) + 1x 'anruf_erbeten'.
// Beide Soll-Haelften haben also Bestand; der Smoke ist moeglich. Siehe
// memory/COORDINATION-ops-test-regel4-solls-und-verifikation.md.
//
// AUFBAU — der Uebergang dazwischen ist ein ECHTER UI-Klick, kein geseedeter Zustand:
//   1. Seed (Ausgangszustand) + Termin auf 'angefragt'  -> Kunde: KEINE Aufgabe
//   2. Werkstatt schlaegt per UI einen Termin vor         -> Status wird werkstatt_vorschlag
//   3. Kunde: Aufgabe „Termin bestätigen" IST da
//
// Vorher:  node scripts/smoke/reparatur-weg-e2e-seed.mjs --weg=haftpflicht
// (haftpflicht, damit das KVA-Gate den Vorschlag in Schritt 2 nicht blockt — das ist Lane E.)
//
// Opt-in (nie in CI): RUN_F3_TERMIN_AUFGABE_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'

// e2e-toplevel-fs: gekapselt — fehlt der Seed, skippt der Test statt die Collection zu sprengen.
let seed: {
  claimId?: string
  werkstattEmail?: string
  werkstattPw?: string
  kundeEmail?: string
  kundePw?: string
} | null = null
try {
  seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-weg-e2e-seed.json'), 'utf8'))
} catch {
  /* nicht geseedet */
}

test.skip(!process.env.RUN_F3_TERMIN_AUFGABE_SMOKE, 'set RUN_F3_TERMIN_AUFGABE_SMOKE=1 (läuft echt gegen Prod)')

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function login(page: Page, email: string, pw: string) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

/** Re-render-fester Klick — der WunschterminPicker ersetzt seine Chips (s. Lane-E-Smoke). */
async function klickeStabil(page: Page, selector: string, label: string, timeout = 30_000) {
  await expect(async () => {
    const el = page.locator(`${selector} >> visible=true`).first()
    await el.scrollIntoViewIfNeeded({ timeout: 3_000 })
    await el.click({ timeout: 5_000 })
  }, label).toPass({ timeout })
}

function naechsterWerktagChip(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.`
}

/** Sichtbarer Text der Kunden-Fallakte (die Aufgaben-Zone rendert dort). */
async function fallakteText(page: Page, claimId: string): Promise<string> {
  await page.goto(`${APP}/kunde/faelle/${claimId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2_500) // Hydration — sonst liefert der Text 0 Treffer
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
}

test('Soll: „Termin bestätigen" erscheint erst, wenn es einen Zeitpunkt zu bestätigen gibt', async ({
  page,
}) => {
  test.setTimeout(240_000)
  test.skip(!seed?.claimId, 'Seed fehlt — vorher: node scripts/smoke/reparatur-weg-e2e-seed.mjs --weg=haftpflicht')
  const claimId = seed!.claimId!
  const db = admin()

  // ── 1) Ausgangszustand: Anfrage liegt bei der Werkstatt, KEIN Zeitpunkt ────────────────
  // Genau die prod-Konstellation: status='angefragt', weder wunschtermin noch bestaetigter.
  // Das ist ein AUSGANGSZUSTAND (den die Werkstatt-Vermittlung erzeugt haette), kein
  // Zustandsuebergang des geprueften Solls — Schritt 2 unten ist der echte Uebergang.
  const { data: ws } = await db.from('claims').select('reparatur_werkstatt_id').eq('id', claimId).maybeSingle()
  await db.from('reparatur_termine').delete().eq('claim_id', claimId)
  const { error: insErr } = await db.from('reparatur_termine').insert({
    claim_id: claimId,
    werkstatt_id: ws?.reparatur_werkstatt_id,
    status: 'angefragt',
    wunschtermin: null,
    bestaetigter_termin: null,
  })
  expect(insErr, 'Ausgangszustand angefragt gesetzt').toBeNull()

  await login(page, seed!.kundeEmail!, seed!.kundePw!)
  const warte = await fallakteText(page, claimId)
  console.log(`[f3] Warte-Zustand (angefragt): ${warte.slice(0, 220)}`)

  // KERN VON F3: kein Zeitpunkt => keine Aufforderung. Vorher stand hier „Termin bestätigen",
  // obwohl es gar nichts zu bestaetigen gab.
  expect(warte, 'Warte-Zustand erzeugt KEINE Aufgabe „Termin bestätigen"').not.toMatch(/Termin bestätigen/i)

  // ── 2) Echter Uebergang per UI: die Werkstatt spielt den Ball zurueck ──────────────────
  const wsPage = await page.context().browser()!.newPage()
  try {
    await login(wsPage, seed!.werkstattEmail!, seed!.werkstattPw!)
    await wsPage.goto(`${APP}/werkstatt/auftraege/${claimId}`, { waitUntil: 'domcontentloaded' })
    await wsPage.waitForTimeout(2_000)
    await klickeStabil(wsPage, 'button:has-text("Termin vorschlagen")', 'Button „Termin vorschlagen"')
    await klickeStabil(wsPage, `button:has-text("${naechsterWerktagChip()}")`, 'Datums-Chip')
    await klickeStabil(wsPage, 'button:text-is("11:00")', 'Zeit-Chip 11:00')
    await klickeStabil(wsPage, 'button:has-text("Vorschlag senden")', 'Button „Vorschlag senden"')

    // Am DB-Zustand messen, nicht am fluechtigen Toast (Lane-E-Lehre).
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('reparatur_termine')
            .select('status')
            .eq('claim_id', claimId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          return data?.status ?? null
        },
        { timeout: 20_000, message: 'Werkstatt-Vorschlag angekommen' },
      )
      .toBe('werkstatt_vorschlag')
  } finally {
    await wsPage.close()
  }

  // ── 3) Jetzt liegt der Ball beim Kunden -> die Aufgabe MUSS erscheinen ─────────────────
  const nachVorschlag = await fallakteText(page, claimId)
  console.log(`[f3] Nach Werkstatt-Vorschlag: ${nachVorschlag.slice(0, 220)}`)
  expect(nachVorschlag, 'jetzt gibt es einen Zeitpunkt => Aufgabe erscheint').toMatch(/Termin bestätigen/i)

  console.log('[f3] ✓ angefragt => keine Aufgabe · werkstatt_vorschlag => Aufgabe da')
})
