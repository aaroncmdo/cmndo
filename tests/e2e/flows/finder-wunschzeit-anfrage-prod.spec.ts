import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  seedThrowawayFinderSv,
  purgeThrowawayFinderSv,
  purgeStaleThrowawayFinderSvs,
  type ThrowawayFinderSv,
} from '../lib/test-sv'

// Regel-4-Prod-Smoke fuer Lane A (Ops-Test 11.08., RC-1) — PR #5176 + #5200.
//
// OPERATIVES SOLL (aus der Fachlogik hergeleitet, NICHT aus dem Code gelesen):
//   Ein Kunde nennt im Gutachter-Finder eine Wunschzeit.
//   1. Ist der Gutachter dann frei UND die Zeit liegt in seiner Arbeitszeit, erscheint sie
//      als BUCHBARER Slot; waehlt er ihn, entsteht ein ECHTER Termin und die Bestaetigung
//      sagt zu ("Termin reserviert").
//   2. Ist der Gutachter BELEGT, darf die Zeit NICHT als buchbarer Slot erscheinen —
//      hoechstens als unverbindliche ANFRAGE.
//   3. Im Anfrage-Fall bekommt der Kunde KEINE Terminzusage, die Danke-Seite zeigt kein
//      Erfolgs-Haekchen, und es entsteht KEIN Termin in der DB — kein Phantom, das den
//      Kalender des Gutachters blockiert.
//   4. Das Team sieht, dass NICHT gebucht wurde, und kann nachfassen.
//
// Der Bug war Punkt 2+3: die Wunschzeit wurde ungeprueft als Slot angeboten (synthetisch
// aus der Wunschstunde gerechnet, ohne Belegung/Arbeitszeit/Raster), die Buchung schlug
// still fehl (`if (!b.ok && !requestModus)` verschluckte den Fehlschlag) und der Kunde
// bekam trotzdem "✅ Ihr Termin ist reserviert" — bei termin_id = NULL.
//
// WARUM 11:00: der Picker bietet nur VOLLE Stunden (08–18), das Engine-Raster laeuft in
// 40-Min-Schritten ab 09:00. Beide Mengen schneiden sich nur in 09/11/13/15 Uhr. 11:00 ist
// die einzige davon, die sicher mitten in der Default-Arbeitszeit (09–17) liegt.
//
// SICHERHEIT (kein Kollateralschaden auf Prod):
//   * Bucher-Identitaet @claimondo.de => istInterneIdentitaet => Send-Isolation (#3709):
//     keine echten Kunden-Comms, kein Dispatch-Task fuers Team.
//   * Dieselbe interne Identitaet schaltet den Test-SV-Fallback frei (findeNahenTestSv,
//     Aaron 24.07.) — echte Kunden erreichen diesen Pfad nie, der Test trifft also
//     garantiert den Test-SV und NIE einen echten Partner.
//   * Folge (bewusst, im Marker begruendet): der WhatsApp-ZUSTELLWEG laesst sich so nicht
//     live pruefen. Geprueft wird stattdessen der erzeugte Nachrichten-INHALT in der DB —
//     und genau der ist der Pruefgegenstand des Fixes ("Anfrage" statt "reserviert").
//     Regel 4 sieht diesen Ersatz ausdruecklich vor (Read-Surface + Live-DB-Verifikation).
//   * afterAll raeumt gfa + Lead + evtl. Termin restlos ab. Cleanup gehoert in afterAll,
//     NICHT in try/finally — ein Timeout ueberlebt kein finally (Prod-Smoke-Falle 11.08.).
//
// Opt-in (nie in CI): RUN_WUNSCHZEIT_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.
//   RUN_WUNSCHZEIT_SMOKE=1 npx playwright test finder-wunschzeit-anfrage-prod
//
// ⚠ STAND 12.08. — NOCH NICHT GRUEN, ein Schritt fehlt (bewusst so committet, damit die
// vier bereits geloesten Huerden nicht nochmal erarbeitet werden muessen):
//   Der Wizard springt nach der Ortsauswahl AUTOMATISCH von Schritt 1 zu Schritt 2. Der
//   WunschterminPicker lebt aber in SCHRITT 1 (FinderWizard.tsx:382 "Ihr Wunschtermin") —
//   beim Klick auf die Chips ist der Wizard schon weiter, die Chips existieren nicht mehr.
//   Zu klaeren: den Picker VOR dem Sprung bedienen (er erscheint erst nach Orts-Eingabe →
//   enges Zeitfenster) ODER ueber "‹ Anderer Ort" zurueck nach Schritt 1 (Ort bleibt gesetzt?).
//   Alles danach (Slot-Klick, Formular, Submit, DB-Asserts) ist ungetestet.
//
// SCHON BEWIESEN in den bisherigen Laeufen (gegen Prod, mit Screenshot belegt):
//   * Der Wegwerf-SV wird als Partner gematcht und liefert Slots.
//   * Die angebotenen Zeiten liegen sauber im 40-MIN-ENGINE-RASTER (12:20 / 13:00 / 13:40 /
//     14:20) — genau das Verhalten, das #5176 herstellen sollte. Der alte synthetische Pfad
//     bot volle Stunden an (prod-Beleg: 39 von 41 self_service-Terminen auf voller Stunde).
//     Starker Indizienbeweis, dass der Fix auf Prod greift — aber KEIN Ersatz fuer den
//     vollstaendigen Durchlauf, denn der Wunschzeit-Zweig selbst ist damit nicht gefahren.
//   * Cleanup traegt: nach jedem Lauf 0 Residue (Wegwerf-SV, gfa, Leads alle weg).

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'

// WEGWERF-SV statt kanonischem Test-SV — im ersten Lauf empirisch bestaetigt:
// Der Embed-Finder filtert `ist_testaccount=false` (applyDispatchableFilter, Befund #6 vom
// 17.07.), der kanonische Test-SV taucht dort also NIE auf ("0 Gutachter in Ihrer Nähe" trotz
// korrekt gesetztem Ort Bremerhaven). Der interne-Tester-Fallback (findeNahenTestSv) rettet das
// hier NICHT: ladeEmbedMatching nimmt gar keine kundenIdentitaet entgegen — die Identitaet wird
// erst im Kontaktformular (Schritt 4) erfasst, das Matching laeuft in Schritt 2. Deshalb ein
// transient geseedeter, ECHTER (ist_testaccount=false) SV, wie in golden-path-finder-prod.
//
// Pellworm: faehr-isolierte Insel (~1200 Ew.) -> praktisch kein echter Finder-Traffic, und keine
// Festland-SV-Isochrone reicht hin. Der Wegwerf-SV kann also keinem echten Kunden begegnen.
const ORT = { adresse: 'Tammensiel 1, 25849 Pellworm', stadt: 'Pellworm' }
// Synthetische Isochrone (parseIsochrone Format A) um die Insel; bleibt offshore, damit kein
// Festland-Standort ins Polygon faellt.
const ISO_BOX = [
  { lat: 54.40, lng: 8.53 },
  { lat: 54.40, lng: 8.84 },
  { lat: 54.65, lng: 8.84 },
  { lat: 54.65, lng: 8.53 },
  { lat: 54.40, lng: 8.53 },
]
const PELLWORM = { lat: 54.5237, lng: 8.6831 }

let TEST_SV = ''
let svHandle: ThrowawayFinderSv | null = null

const runId = String(Date.now())
const emailBuchung = `e2e-wz-buchung-${runId}@claimondo.de`
const emailAnfrage = `e2e-wz-anfrage-${runId}@claimondo.de`

test.skip(!process.env.RUN_WUNSCHZEIT_SMOKE, 'set RUN_WUNSCHZEIT_SMOKE=1 (läuft echt gegen Prod)')
test.describe.configure({ mode: 'serial' })

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

// Der Wizard rendert 2x (Desktop-Sidebar + Mobile-Sheet); auf Desktop ist EINE Instanz sichtbar.
const vis = (page: Page, selector: string) => page.locator(`${selector} >> visible=true`).first()

/**
 * Klick, der einen Re-Render ueberlebt. Jede Auswahl im Wizard stoesst ladeEmbedMatching an;
 * die Chip-Leisten werden dabei ERSETZT — ein Locator, der eben noch sichtbar war, ist beim
 * Klick "detached from the DOM". Locator neu aufloesen + erneut versuchen, statt einmalig zu
 * klicken und am Race zu scheitern.
 */
async function klickeStabil(page: Page, selector: string, label: string, timeout = 45_000) {
  await expect(async () => {
    const el = page.locator(`${selector} >> visible=true`).first()
    await el.scrollIntoViewIfNeeded({ timeout: 3_000 })
    await el.click({ timeout: 5_000 })
  }, label).toPass({ timeout })
}

/**
 * Naechster Werktag (Mo–Fr) ab morgen. Der Chip-Text folgt exakt dem Picker-Format
 * `DD.MM.` (wunschtermin-slots.ts) — "13" allein waere mehrdeutig und wuerde auch den
 * Zeit-Chip "13:00" treffen.
 * Bewusst Mo–Fr, obwohl der Picker auch SAMSTAGE anbietet (er filtert nur Sonntag): am
 * Samstag greift die Default-Arbeitszeit nicht, dort waere die Zeit nie ein echter Slot —
 * genau die Luecke, die #5200 schliesst und die dieser Smoke NICHT mitprueft.
 */
function naechsterWerktag(): { iso: string; tag: string } {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    iso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    tag: `${p(d.getDate())}.${p(d.getMonth() + 1)}.`,
  }
}
const ZIEL = naechsterWerktag()
const ZEIT = '11:00'

/** Ort + Wunschzeit setzen — der gemeinsame Vorlauf beider Durchlaeufe. */
async function bisWunschzeit(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto(`${APP}/embed/gutachter-finder`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 3_000 })
    .catch(() => {})
  // Hydration abwarten: ohne das liefert count() 0, weil der Client-Baum noch nicht steht
  // (Prod-Smoke-Falle 11.08.). Der Datums-Chip erscheint ueberhaupt erst NACH dem Mount —
  // der Picker baut die Tagesliste bewusst erst im useEffect (Hydration-Safety).
  await page.waitForTimeout(2_500)

  const addr = vis(page, 'input[placeholder="Adresse eingeben…"]')
  await expect(addr, 'Adress-Eingabe sichtbar').toBeVisible({ timeout: 20_000 })
  await addr.click()
  await addr.pressSequentially(ORT.adresse, { delay: 60 })
  // GEZIELT die Bremerhaven-Suggestion — NICHT blind die erste. Der erste Treffer war im
  // ersten Lauf eine gleichnamige Strasse in ESSEN; der Finder landete dadurch in einer
  // Region ohne zustaendigen Gutachter und bot statt Slots den Rueckruf-Zweig an
  // ("In Ihrer Nähe ist gerade kein Gutachter online verfügbar").
  const pac = page.locator(`.pac-item:has-text("${ORT.stadt}")`).first()
  await expect(pac, `Google-Places-Suggestion mit "${ORT.stadt}" erscheint`).toBeVisible({ timeout: 15_000 })
  await pac.click()

  // Der WunschterminPicker steht in SCHRITT 1 unter "Ihr Wunschtermin" — also direkt neben
  // der Ortseingabe, NICHT bei den Slots. Er beeinflusst das Ranking in Schritt 2 (leer =
  // naechste freie Termine). Deshalb hier bedienen, BEVOR auf Slots gewartet wird: ein
  // vorgezogenes Warten auf die Slot-Liste laesst den Wizard bereits nach Schritt 2 laufen,
  // wo es die Chips nicht mehr gibt (im 3. Lauf genau so passiert).
  await expect(
    page.locator(':text("Ihr Wunschtermin") >> visible=true').first(),
    'Wunschtermin-Abschnitt in Schritt 1 sichtbar',
  ).toBeVisible({ timeout: 20_000 })

  // Datums-Chip (DD.MM.) + Zeit-Chip (volle Stunde): horizontal scrollender Strip
  // (sichtbar != klickbar) und bei jedem Re-Render ersetzt -> re-render-fester Klick.
  await klickeStabil(page, `button:has-text("${ZIEL.tag}")`, `Datums-Chip ${ZIEL.tag} klicken`)
  // Die Zeit-Liste haengt am gewaehlten Datum (fuer HEUTE fallen vergangene Stunden raus),
  // wird also nach dem Datums-Klick neu aufgebaut.
  await klickeStabil(page, `button:text-is("${ZEIT}")`, `Zeit-Chip ${ZEIT} klicken`)
}

/** Kontaktformular + Absenden. */
async function absenden(page: Page, email: string, buttonText: string) {
  await vis(page, 'button:has-text("Auffahrunfall")').click()
  await vis(page, 'input[autocomplete="given-name"]').fill('E2eWunschzeit')
  await vis(page, 'input[autocomplete="family-name"]').fill('Smoke')
  await vis(page, 'input[autocomplete="tel"]').fill('+491633628571')
  await vis(page, 'input[autocomplete="email"]').fill(email)
  await vis(page, 'input[type="checkbox"]').check()
  await vis(page, `button:has-text("${buttonText}")`).click()
}

test.beforeAll(async () => {
  const db = admin()
  await purgeStaleThrowawayFinderSvs(db) // Leichen abgestuerzter Vorlaeufe zuerst
  svHandle = await seedThrowawayFinderSv(db, {
    lat: PELLWORM.lat,
    lng: PELLWORM.lng,
    isochrone: ISO_BOX,
    runId,
  })
  TEST_SV = svHandle.svId
})

test.afterAll(async () => {
  // Restlos abraeumen — gfa, konvertierte Leads und einen evtl. entstandenen Termin.
  const db = admin()
  for (const email of [emailBuchung, emailAnfrage]) {
    const { data: gfa } = await db
      .from('gutachter_finder_anfragen')
      .select('id, termin_id, konvertiert_zu_lead_id')
      .eq('email', email)
    for (const row of gfa ?? []) {
      if (row.termin_id) await db.from('gutachter_termine').delete().eq('id', row.termin_id)
      if (row.konvertiert_zu_lead_id) await db.from('leads').delete().eq('id', row.konvertiert_zu_lead_id)
      await db.from('gutachter_finder_anfragen').delete().eq('id', row.id)
    }
  }
  // Wegwerf-SV (auth + profiles + sachverstaendige) restlos entfernen; purgeStale faengt
  // zusaetzlich einen Rest ab, falls svHandle wegen eines Seed-Fehlers null blieb.
  await purgeThrowawayFinderSv(db, { svId: svHandle?.svId ?? null, uid: svHandle?.uid ?? null, bucherEmail: null })
  await purgeStaleThrowawayFinderSvs(db)
})

// ── Durchlauf 1: die Wunschzeit ist FREI -> echter Slot, echter Termin ────────────────
test('Soll 1: freie Wunschzeit wird gebucht und der Termin existiert wirklich', async ({ page }) => {
  test.setTimeout(180_000)
  const db = admin()

  await bisWunschzeit(page)

  // Die Wunschzeit ist frei -> sie MUSS als buchbarer Slot des Test-SV erscheinen.
  const slot = vis(page, `[data-testid^="buchung-slot-${TEST_SV}-"]`)
  await expect(slot, 'Slot des Test-SV erscheint').toBeVisible({ timeout: 30_000 })
  await slot.click()

  await absenden(page, emailBuchung, 'Termin reservieren')
  await expect(vis(page, ':text("Termin reserviert")'), 'Zusage "Termin reserviert"').toBeVisible({ timeout: 25_000 })

  await page.waitForTimeout(3_000) // revalidate + gfa.termin_id-Update
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, termin_id, zugeordneter_sv_id')
    .eq('email', emailBuchung)
    .maybeSingle()

  // DER KERN VON SOLL 1: die Zusage darf nicht leer sein — es MUSS ein Termin existieren.
  expect(gfa?.termin_id, 'Zusage gegeben => Termin existiert (kein Phantom)').toBeTruthy()
  expect(gfa?.zugeordneter_sv_id, 'dem Test-SV zugeordnet').toBe(TEST_SV)

  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, start_zeit, status')
    .eq('id', gfa!.termin_id!)
    .maybeSingle()
  expect(termin, 'Termin-Zeile in gutachter_termine vorhanden').toBeTruthy()
  console.log(`[wunschzeit] Soll 1 ✓ gfa ${gfa?.id} -> Termin ${termin?.id} (${termin?.start_zeit})`)
})

// ── Durchlauf 2: dieselbe Zeit ist jetzt BELEGT -> Anfrage statt Zusage ───────────────
test('Soll 2+3: belegte Wunschzeit wird nicht zugesagt und erzeugt kein Termin-Phantom', async ({ page }) => {
  test.setTimeout(180_000)
  const db = admin()

  await bisWunschzeit(page)

  // Soll 2: die belegte Zeit darf NICHT als buchbarer Slot erscheinen. Der Fix bietet sie
  // stattdessen als "auf Anfrage" an. Beide Auspraegungen sind zulaessig (gar nicht
  // anbieten waere ebenfalls korrekt) — verboten ist nur die ZUSAGE.
  const anfrageChip = page.locator(':text("auf Anfrage") >> visible=true').first()
  await expect(anfrageChip, 'belegte Wunschzeit erscheint als Anfrage, nicht als Zusage').toBeVisible({
    timeout: 30_000,
  })
  await anfrageChip.click()

  await absenden(page, emailAnfrage, 'Anfrage')

  // Soll 3: KEINE Terminzusage auf der Danke-Seite.
  await expect(
    page.locator(':text("Termin reserviert")'),
    'KEINE Terminzusage bei nur angefragter Zeit',
  ).toHaveCount(0)

  await page.waitForTimeout(3_000)
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, termin_id, wunschtermin, zugeordneter_sv_id')
    .eq('email', emailAnfrage)
    .maybeSingle()

  expect(gfa, 'Anfrage wurde gespeichert').toBeTruthy()
  // DER KERN DES BUGS: genau hier stand frueher eine Zusage bei termin_id = NULL.
  expect(gfa?.termin_id, 'kein Termin-Phantom bei nur angefragter Zeit').toBeNull()
  expect(gfa?.wunschtermin, 'die Wunschzeit ist festgehalten (Team kann nachfassen)').toBeTruthy()
  console.log(`[wunschzeit] Soll 2+3 ✓ gfa ${gfa?.id}: Wunsch ${gfa?.wunschtermin}, termin_id NULL`)
})
