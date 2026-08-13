import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Regel-4-Prod-Smoke fuer Ops-Test Lane E (#5196) — KVA-Gate bei Haftpflicht.
//
// OPERATIVES SOLL (aus der Fachlogik, NICHT aus dem Code):
//   Eine Werkstatt kann im HAFTPFLICHT-Fall einen Termin vorschlagen, OHNE dass ein
//   Kostenvoranschlag oder dessen Freigabe vorliegt — dort traegt die gegnerische
//   Versicherung, und die Kostengrundlage ist das Gutachten, nicht der KVA.
//   Bei KASKO/SELBSTZAHLER bleibt das Gate ZU, weil der Kunde dort selbst zahlt.
//
// WARUM DAS ZAEHLT: von 15 prod-Haengern hatten 4 eine Werkstatt — und ALLE VIER waren
// genau von diesem Gate blockiert (16-26 Tage still, CLM-2026-00932/-00939/-00977/-00991).
// Der Fix loest reale Haenger auf, nicht nur einen UI-Blocker.
//
// WARUM EIN UI-SMOKE noetig war: die Read-Surface-Verifikation (12.08.) zeigte, dass die
// Gate-ABLEITUNG kippt — sie beweist nicht, dass die Oberflaeche den Weg freigibt. Das Gate
// sitzt serverseitig in schlageWerkstattTerminVor (auftraege/actions.ts:114), der Button ist
// also IMMER klickbar; entschieden wird beim Absenden. Ein "ist der Button da"-Test waere wertlos.
//
// AUSGANGSZUSTAND (Seed, kein Zustandsuebergang des Solls):
//   node scripts/smoke/reparatur-weg-e2e-seed.mjs --weg=haftpflicht
//   -> Wegwerf-Kunde + Wegwerf-Werkstatt (@claimondo.test, telefon=NULL), Claim
//      vermittelt / kva_erst / VOR KVA. Die GEGENPROBE nutzt denselben Seed ohne --weg.
//
// Opt-in (nie in CI): RUN_WERKSTATT_GATE_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.
//   RUN_WERKSTATT_GATE_SMOKE=1 npx playwright test werkstatt-haftpflicht-gate

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'

// e2e-toplevel-fs: gekapselt — fehlt der Seed, skippt der Test statt die Collection zu sprengen.
let seed: { claimId?: string; werkstattEmail?: string; werkstattPw?: string } | null = null
try {
  seed = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts/smoke/.reparatur-weg-e2e-seed.json'), 'utf8'),
  )
} catch {
  /* nicht geseedet */
}

test.skip(!process.env.RUN_WERKSTATT_GATE_SMOKE, 'set RUN_WERKSTATT_GATE_SMOKE=1 (läuft echt gegen Prod)')

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

/**
 * Klick, der einen Re-Render ueberlebt. Der WunschterminPicker ist DERSELBE wie im
 * Gutachter-Finder: seine Chips liegen in einem horizontalen Scroll-Strip (sichtbar !=
 * klickbar) und werden bei jedem Re-Render ersetzt ("element was detached from the DOM").
 * Siehe memory/BROADCAST-finder-buchung-prod-nicht-smokebar.md.
 */
async function klickeStabil(page: Page, selector: string, label: string, timeout = 30_000) {
  await expect(async () => {
    const el = page.locator(`${selector} >> visible=true`).first()
    await el.scrollIntoViewIfNeeded({ timeout: 3_000 })
    await el.click({ timeout: 5_000 })
  }, label).toPass({ timeout })
}

/** Naechster Werktag als Chip-Text `DD.MM.` — der Picker beschriftet so, NICHT mit `13`. */
function naechsterWerktagChip(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.`
}

/** Termine am Auftrag zaehlen — der harte Beweis, unabhaengig von Toast-Texten. */
async function terminCount(claimId: string): Promise<number> {
  const { count } = await admin()
    .from('reparatur_termine')
    .select('id', { count: 'exact', head: true })
    .eq('claim_id', claimId)
  return count ?? 0
}

// EIN Test, WEG-AWARE: er liest den geseedeten abrechnungsweg und prueft die dazu passende
// Haelfte des Solls. Zweimal fahren beweist die Weiche:
//   node scripts/smoke/reparatur-weg-e2e-seed.mjs --weg=haftpflicht   -> Gate OFFEN, Termin entsteht
//   node scripts/smoke/reparatur-weg-e2e-seed.mjs                     -> Gate ZU,    kein Termin
// (Beide Seeds koennen nicht gleichzeitig existieren — der Seed raeumt seinen Vorgaenger ab.)
test('Soll: das KVA-Gate oeffnet bei Haftpflicht und bleibt bei Selbstzahler zu', async ({ page }) => {
  test.setTimeout(180_000)
  test.skip(!seed?.claimId, 'Seed fehlt — vorher: node scripts/smoke/reparatur-weg-e2e-seed.mjs [--weg=haftpflicht]')
  const claimId = seed!.claimId!

  const { data: claim } = await admin()
    .from('claims')
    .select('abrechnungsweg, reparatur_auftrag_modus, kva_quelle, reparatur_freigegeben_am')
    .eq('id', claimId)
    .maybeSingle()
  const weg = claim?.abrechnungsweg as string | null
  // Die uebrigen Vorbedingungen MUESSEN stimmen, sonst prueft der Test etwas anderes als das
  // Gate (z.B. einen bereits freigegebenen Auftrag, der ohnehin offen waere).
  expect(claim?.reparatur_auftrag_modus, 'Modus kva_erst — sonst greift das Gate gar nicht').toBe('kva_erst')
  expect(claim?.kva_quelle, 'KEIN Kostenvoranschlag vorhanden').toBeNull()
  expect(claim?.reparatur_freigegeben_am, 'KEINE Freigabe vorhanden').toBeNull()
  const erwarteOffen = weg === 'haftpflicht'
  console.log(`[werkstatt-gate] abrechnungsweg=${weg} -> erwartet: Gate ${erwarteOffen ? 'OFFEN' : 'ZU'}`)

  const vorher = await terminCount(claimId)

  await login(page, seed!.werkstattEmail!, seed!.werkstattPw!)
  await page.goto(`${APP}/werkstatt/auftraege/${claimId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2_000) // Hydration — sonst liefert count() 0 (Prod-Smoke-Falle)

  // Selbst-diagnostisch: schlaegt etwas fehl, steht im Log WAS die Seite zeigte.
  const sichtbar = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  console.log(`[werkstatt-gate] Auftragsseite: ${sichtbar.slice(0, 400)}`)

  // Der Aktionsblock haengt an `aktionOffen` (WerkstattAuftragDetail.tsx:103).
  await klickeStabil(page, 'button:has-text("Termin vorschlagen")', 'Button „Termin vorschlagen"')

  // WunschterminPicker: Datums-Chip `DD.MM.` + Zeit-Chip (nur volle Stunden).
  await klickeStabil(page, `button:has-text("${naechsterWerktagChip()}")`, 'Datums-Chip')
  await klickeStabil(page, 'button:text-is("11:00")', 'Zeit-Chip 11:00')
  await klickeStabil(page, 'button:has-text("Vorschlag senden")', 'Button „Vorschlag senden"')

  // KERN — bewusst an der DB gemessen, NICHT am Toast: der Toast ist fluechtig, und ein
  // Body-Text-Match laeuft ins Leere, weil die Sidebar dauerhaft einen Nav-Eintrag
  // „Kostenvoranschlag" traegt (erster Lauf 13.08.: der Poll war sofort erfuellt, bevor
  // ueberhaupt etwas passiert war). Der Terminvorschlag in reparatur_termine ist das
  // eindeutige Signal.
  if (erwarteOffen) {
    await expect
      .poll(() => terminCount(claimId), { timeout: 20_000, message: 'Terminvorschlag entsteht (Gate offen)' })
      .toBeGreaterThan(vorher)
    const { data: t } = await admin()
      .from('reparatur_termine')
      .select('status, wunschtermin')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    expect(t?.status, 'der Vorschlag steht als werkstatt_vorschlag').toBe('werkstatt_vorschlag')
    console.log(`[werkstatt-gate] ✓ HAFTPFLICHT: Gate offen — Termine ${vorher} -> ${await terminCount(claimId)}, ${t?.status} @ ${t?.wunschtermin}`)
  } else {
    // Gegenprobe: das Gate MUSS halten. 8 s Nachlauf, damit ein verzoegerter Write auffiele.
    await page.waitForTimeout(8_000)
    expect(await terminCount(claimId), 'Selbstzahler ohne KVA => KEIN Terminvorschlag').toBe(vorher)
    // Der Blocker muss auch SICHTBAR sein, nicht nur wirken. Die Seite fuehrt ihn als eigene
    // KVA-Sektion („KVA benötigt" + „Kostenvoranschlag hochladen"); der Fehler-Toast selbst ist
    // fluechtig und beim Auslesen meist schon weg. Bewusst NICHT auf „Kostenvoranschlag" allein
    // pruefen — so heisst auch der Sidebar-Nav-Eintrag, der Test waere immer gruen.
    const danach = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
    expect(danach, 'der Blocker wird benannt').toMatch(
      /KVA benötigt|Kostenvoranschlag ausstehend|nicht zur Terminfindung freigegeben/i,
    )
    console.log(`[werkstatt-gate] ✓ SELBSTZAHLER: Gate zu — Termine unveraendert (${vorher})`)
  }
})
