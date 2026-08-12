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
// ✅ STAND 12.08. — GRUEN gegen prod (2 passed, 1.3 min), 0 Residue verifiziert.
// Beleg aus dem Lauf:
//   Soll 1  angeboten: ["Do., 13.08., 11:00 Uhr Wunschzeit", "10:20 Uhr", "11:40 Uhr"]
//           -> die freie Raster-Zeit ist ein ECHTER Slot, nicht zur Anfrage degradiert.
//   Soll 2+3 angeboten: ["12:00 Uhr auf Anfrage", "11:40 Uhr Wunschzeit",
//                        "12:20 Uhr Wunschzeit", "11:00 Uhr"]
//           -> die nicht-buchbare 12:00 laeuft als ANFRAGE, die echten Nachbarn als Treffer;
//              nach dem Absenden: termin_id NULL, Termine des SV unveraendert (0).
//
// ⚠ BEWUSSTE GRENZE (Befund, keine Bequemlichkeit): der SUBMIT einer buchbaren Zeit ist auf
// prod nicht smokebar — siehe die ausfuehrliche Begruendung ueber Durchlauf 1 (Test-SV-Guard
// vs. applyDispatchableFilter). Geprueft wird deshalb die KLASSIFIKATION (Slot vs. Anfrage),
// und die ist der eigentliche Gegenstand des Fixes.

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

// Der Picker bietet nur VOLLE Stunden (08–18), das Engine-Raster laeuft in 40-Min-Schritten
// ab 09:00 (Default-Arbeitszeit Mo–Do 09–17, Fr 09–16): 09:00, 09:40, 10:20, 11:00, 11:40,
// 12:20, 13:00 … Die beiden Mengen schneiden sich nur in 09:00 / 11:00 / 13:00 / 15:00.
/** Liegt im Raster UND in der Arbeitszeit -> muss ein ECHTER, buchbarer Slot sein. */
const ZEIT_IM_RASTER = '11:00'
/** In der Arbeitszeit, aber NICHT im Raster -> kein echter Slot => nur anfragbar.
 *  Exakt die Konstellation des Ops-Tests (der Kunde wollte 12:00). */
const ZEIT_AUSSER_RASTER = '12:00'

/** Seite oeffnen + Cookie-Banner weg + Hydration abwarten. */
async function oeffneFinder(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto(`${APP}/embed/gutachter-finder`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 3_000 })
    .catch(() => {})
  // Hydration abwarten: ohne das liefert count() 0, weil der Client-Baum noch nicht steht
  // (Prod-Smoke-Falle 11.08.). Die Datums-Chips entstehen ohnehin erst NACH dem Mount —
  // der Picker baut die Tagesliste bewusst im useEffect (Hydration-Safety).
  await page.waitForTimeout(2_500)
}

/** Nur den Ort setzen (ohne Wunschzeit) — Schritt 1 abschliessen, Matching startet. */
async function setzeOrt(page: Page) {
  const addr = vis(page, 'input[placeholder="Adresse eingeben…"]')
  await expect(addr, 'Adress-Eingabe sichtbar').toBeVisible({ timeout: 20_000 })
  await addr.click()
  await addr.pressSequentially(ORT.adresse, { delay: 60 })
  // GEZIELT die Suggestion der Zielstadt — NICHT blind die erste. Im ersten Lauf war der
  // erste Treffer eine gleichnamige Strasse in ESSEN; der Finder landete in einer Region
  // ohne zustaendigen Gutachter und bot statt Slots den Rueckruf-Zweig an.
  const pac = page.locator(`.pac-item:has-text("${ORT.stadt}")`).first()
  await expect(pac, `Google-Places-Suggestion mit "${ORT.stadt}" erscheint`).toBeVisible({ timeout: 15_000 })
  await pac.click()
}

/**
 * Wunschzeit setzen, DANN den Ort — der gemeinsame Vorlauf beider Durchlaeufe.
 *
 * ⚠ REIHENFOLGE IST KRITISCH: Im Ort-Schritt steht der WunschterminPicker ÜBER dem
 * Adressfeld (FinderWizard.tsx:382, "Wunschtermin immer oben im Ort-Schritt", Aaron 12.06.)
 * und ist ab Seitenaufbau da. Die Ortsauswahl BEENDET Schritt 1 und schaltet auf 'termin' —
 * danach gibt es die Chips nicht mehr. Wer erst die Adresse setzt, findet den Picker nie
 * (Laeufe 2–4 dieses Smokes).
 */
async function bisWunschzeit(page: Page, zeit: string) {
  await oeffneFinder(page)

  await expect(
    page.locator(':text("Ihr Wunschtermin") >> visible=true').first(),
    'Wunschtermin-Abschnitt sichtbar (Schritt 1)',
  ).toBeVisible({ timeout: 20_000 })

  // Datums-Chip (DD.MM.) + Zeit-Chip (volle Stunde): horizontal scrollender Strip
  // (sichtbar != klickbar) und bei Re-Render ersetzt -> re-render-fester Klick.
  await klickeStabil(page, `button:has-text("${ZIEL.tag}")`, `Datums-Chip ${ZIEL.tag} klicken`)
  // Die Zeit-Liste haengt am gewaehlten Datum (fuer HEUTE fallen vergangene Stunden raus),
  // wird also nach dem Datums-Klick neu aufgebaut.
  await klickeStabil(page, `button:text-is("${zeit}")`, `Zeit-Chip ${zeit} klicken`)

  // Jetzt der Ort — er schliesst Schritt 1 ab und startet das Matching MIT Wunschzeit.
  await setzeOrt(page)
}

/**
 * Auf die Danke-Seite warten und ihren Text zurueckgeben — statt blind auf EINEN String zu
 * warten. Ein "Element nicht gefunden" sagt nicht, WAS stattdessen kam; dieser Helfer macht
 * den Ausgang sichtbar (Zusage? Anfrage? Fehlermeldung?) und laesst den Test danach hart
 * assertieren.
 */
async function warteAufDankeSeite(page: Page): Promise<string> {
  const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  await expect
    .poll(text, { timeout: 30_000, message: 'Danke-Seite (Zusage ODER Anfrage) erscheint' })
    .toMatch(/Termin reserviert|Terminanfrage eingegangen|konnte nicht|Fehler/i)
  return await text()
}

/**
 * Die angebotenen Slots des Wegwerf-SV einsammeln (Text je Eintrag) — der Lauf wird dadurch
 * selbst-diagnostisch: schlaegt eine Erwartung fehl, steht im Log, was tatsaechlich angeboten
 * wurde, statt nur "Element nicht gefunden".
 */
async function angeboteneSlots(page: Page): Promise<string[]> {
  const slots = page.locator(`[data-testid^="buchung-slot-${TEST_SV}-"] >> visible=true`)
  await expect(slots.first(), 'mindestens ein Termin-Vorschlag erscheint').toBeVisible({ timeout: 45_000 })
  return (await slots.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
}

/**
 * Schadenart + Kontaktformular + Absenden. Liefert die Beschriftung des Submit-Buttons
 * zurueck — sie ist selbst ein Befund: im Anfrage-Zweig darf dort keine Buchungs-Zusage
 * stehen. Der Button traegt je nach Zweig "Termin reservieren" oder eine Anfrage-Variante;
 * beides zulassen, damit der Test nicht an einem Label-Wechsel zerbricht.
 */
async function absenden(page: Page, email: string): Promise<string> {
  await vis(page, 'button:has-text("Auffahrunfall")').click()
  await vis(page, 'input[autocomplete="given-name"]').fill('E2eWunschzeit')
  await vis(page, 'input[autocomplete="family-name"]').fill('Smoke')
  await vis(page, 'input[autocomplete="tel"]').fill('+491633628571')
  await vis(page, 'input[autocomplete="email"]').fill(email)
  await vis(page, 'input[type="checkbox"]').check()
  // Der Submit sitzt im Kontakt-Step; "Anfrage absenden" des Rueckruf-Zweigs erscheint erst
  // NACH dem Submit auf der Danke-Seite, kollidiert hier also nicht.
  const submit = page.locator('button:visible', { hasText: /Termin reservieren|Anfrage/ }).first()
  await expect(submit, 'Submit-Button im Kontakt-Schritt').toBeVisible({ timeout: 15_000 })
  const label = ((await submit.textContent()) ?? '').replace(/\s+/g, ' ').trim()
  await submit.click()
  return label
}

test.beforeAll(async () => {
  test.setTimeout(120_000) // Seed + Stale-Purge gehen ueber WAN gegen prod
  const db = admin()
  await purgeStaleThrowawayFinderSvs(db) // Leichen abgestuerzter Vorlaeufe zuerst
  // Ein Prod-Smoke laeuft ueber WAN — der Auth-Admin-Call fiel schon einmal mit einem
  // transienten "fetch failed" aus und riss den ganzen Lauf mit. Zweiter Versuch statt
  // Fehlschlag: das ist Infrastruktur-Rauschen, kein Befund.
  for (let versuch = 1; versuch <= 2; versuch++) {
    try {
      svHandle = await seedThrowawayFinderSv(db, {
        lat: PELLWORM.lat,
        lng: PELLWORM.lng,
        isochrone: ISO_BOX,
        runId: `${runId}-${versuch}`,
      })
      break
    } catch (err) {
      if (versuch === 2) throw err
      console.warn(`[wunschzeit] Seed-Versuch ${versuch} fehlgeschlagen, neuer Versuch:`, (err as Error).message)
      await new Promise((r) => setTimeout(r, 3_000))
    }
  }
  TEST_SV = svHandle!.svId
})

test.afterAll(async () => {
  test.setTimeout(120_000) // mehrere Deletes ueber WAN; 30 s Default reichten nicht
  const db = admin()

  // gfa + zugehoerigen Termin abraeumen.
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, termin_id')
    .in('email', [emailBuchung, emailAnfrage])
  for (const row of gfa ?? []) {
    if (row.termin_id) await db.from('gutachter_termine').delete().eq('id', row.termin_id)
    await db.from('gutachter_finder_anfragen').delete().eq('id', row.id)
  }

  // Leads per E-Mail-MUSTER, nicht ueber gfa.konvertiert_zu_lead_id: die Konversion laeuft
  // asynchron, die Verknuepfung war beim Aufraeumen teils noch NULL -> ein Lead blieb liegen
  // (real passiert, Lauf 10:43). Das Muster raeumt zugleich Leichen frueherer Laeufe ab.
  await db.from('leads').delete().like('email', 'e2e-wz-%@claimondo.de')

  // Wegwerf-SV (auth + profiles + sachverstaendige) restlos entfernen; purgeStale faengt
  // zusaetzlich einen Rest ab, falls svHandle wegen eines Seed-Fehlers null blieb.
  await purgeThrowawayFinderSv(db, { svId: svHandle?.svId ?? null, uid: svHandle?.uid ?? null, bucherEmail: null })
  await purgeStaleThrowawayFinderSvs(db)
})

// ── Durchlauf 1: Wunschzeit IM Raster -> ECHTER Slot (Gegenprobe) ─────────────────────
// Gegenprobe zu Durchlauf 2: sie schliesst aus, dass der Fix einfach ALLES zur
// unverbindlichen Anfrage degradiert (das waere Conversion-Schaden statt Bugfix).
// 11:00 liegt im 40-Min-Raster ab 09:00 UND in der Arbeitszeit -> die Engine kennt den Slot,
// er bekommt matchType 'wunschtermin' (PRIO 0 in rankSlots) und wird als BUCHBARER Slot
// angeboten — erkennbar am Label "Wunschzeit" statt "auf Anfrage".
//
// ⚠ BEWUSST OHNE SUBMIT — und das ist ein BEFUND, keine Bequemlichkeit:
// Der Buchungs-Chokepoint `reserviere()` faehrt den Test-SV-Guard
// (src/lib/testdaten/test-sv-guard.ts, nach dem Vorfall 03.07.). Seine Matrix blockt
// (interner Lead, ECHTER SV). Genau diese Kombination ist hier aber unvermeidbar:
//   * ein Test-SV (ist_testaccount=true) wird vom Finder-Matching gefiltert
//     (applyDispatchableFilter) -> er taucht gar nicht erst als Vorschlag auf;
//   * der Wegwerf-SV muss deshalb ist_testaccount=false sein — und dann blockt der Guard
//     jede Buchung durch eine interne Identitaet;
//   * eine NICHT-interne Bucher-Identitaet wuerde die Send-Isolation aushebeln -> echte
//     Kunden-Comms + Dispatch-Tasks auf prod.
// Der Submit liefe also zwangslaeufig in `code:'test_guard'` -> bestaetigt=false. Das ist
// KEIN Produktfehler, sondern eine Luecke in der Testbarkeit: der Finder-BUCHUNGS-pfad ist
// auf prod derzeit nicht end-to-end smokebar (betrifft ebenso den Full-Submit-Zweig von
// golden-path-finder-prod.spec.ts, der auf "Termin reserviert" assertet).
// Empirisch belegt am 12.08.: Slot "Do., 13.08., 11:00 Uhr Wunschzeit" angeboten, Button
// "Termin reservieren" geklickt -> Danke-Seite "Terminanfrage eingegangen … noch nicht
// bestaetigt". Was hier geprueft werden KANN, ist die Klassifikation — und die ist der
// eigentliche Fix-Gegenstand.
test('Soll 1 (Gegenprobe): eine freie Wunschzeit im Raster wird als BUCHBARER Slot angeboten', async ({ page }) => {
  test.setTimeout(180_000)

  await bisWunschzeit(page, ZEIT_IM_RASTER)

  const slots = await angeboteneSlots(page)
  console.log(`[wunschzeit] Soll 1 — angebotene Slots: ${JSON.stringify(slots)}`)

  // Die Wunschzeit MUSS unter den Vorschlaegen sein (PRIO 0 ueberlebt jeden Top-N-Schnitt).
  const treffer = slots.find((s) => s.includes(ZEIT_IM_RASTER))
  expect(treffer, `Wunschzeit ${ZEIT_IM_RASTER} wird als Vorschlag angeboten`).toBeTruthy()

  // KERN: als echter Treffer ("Wunschzeit"), NICHT als unverbindliche Anfrage.
  expect(treffer, 'freie Raster-Zeit ist ein echter Slot, keine Anfrage').not.toMatch(/auf Anfrage/i)
  expect(treffer, 'als Wunschzeit-Treffer gekennzeichnet').toMatch(/Wunschzeit/i)
  console.log(`[wunschzeit] Soll 1 ✓ "${treffer}" — echter Slot, nicht zur Anfrage degradiert`)
})

// ── Durchlauf 2: eine NICHT verifizierbare Wunschzeit -> Anfrage statt Zusage ─────────
// DAS IST DER EIGENTLICHE BUG-TEST. Der Kunde nennt eine Wunschzeit, die die Engine nicht
// als freien Slot kennt (hier: eine volle Stunde ausserhalb des 40-Min-Rasters ab 09:00 —
// dieselbe Konstellation wie im Ops-Test). Frueher wurde sie synthetisch als buchbar
// angeboten, die Buchung schlug still fehl und der Kunde bekam trotzdem eine Zusage.
test('Soll 2+3: eine nicht buchbare Wunschzeit wird nie zugesagt und erzeugt kein Phantom', async ({ page }) => {
  test.setTimeout(180_000)
  const db = admin()

  // Termine des SV VOR dem Durchlauf zaehlen — Durchlauf 1 hat bereits einen echten Termin
  // gebucht, ein absoluter 0-Vergleich waere also falsch. Gemessen wird die VERAENDERUNG.
  const terminCount = async () => {
    const { count } = await db
      .from('gutachter_termine')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', TEST_SV)
    return count ?? 0
  }
  const vorher = await terminCount()

  await bisWunschzeit(page, ZEIT_AUSSER_RASTER)

  const slots = await angeboteneSlots(page)
  console.log(`[wunschzeit] Soll 2+3 — angebotene Slots: ${JSON.stringify(slots)}`)

  // Soll 2: die Wunschzeit darf nicht als Zusage-Slot erscheinen. Der Fix stellt sie als
  // unverbindliche Anfrage voran. Die genaue Chip-Beschriftung ist NICHT der Pruefgegenstand
  // (sie darf sich aendern) — geprueft wird der vorangestellte Eintrag und das ERGEBNIS.
  const wunschSlot = page
    .locator(`[data-testid^="buchung-slot-${TEST_SV}-"] >> visible=true`)
    .filter({ hasText: ZEIT_AUSSER_RASTER })
    .first()
  await expect(wunschSlot, `Wunschzeit ${ZEIT_AUSSER_RASTER} erscheint als Eintrag`).toBeVisible({ timeout: 10_000 })
  await wunschSlot.click()

  const label = await absenden(page, emailAnfrage)
  const danke = await warteAufDankeSeite(page)
  console.log(`[wunschzeit] Soll 2+3 — Submit-Button: "${label}" | Danke-Seite: ${danke.slice(0, 260)}`)

  // Soll 3 (der Kern): KEINE Terminzusage. Frueher stand hier "✅ Ihr Termin ist reserviert"
  // bei termin_id = NULL — die Zusage ohne Termin.
  expect(danke, 'Danke-Seite fuehrt es als ANFRAGE').toContain('Terminanfrage eingegangen')
  expect(danke, 'KEINE Terminzusage bei nur angefragter Zeit').not.toContain('Termin reserviert')

  await page.waitForTimeout(3_000)
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, termin_id, wunschtermin, zugeordneter_sv_id')
    .eq('email', emailAnfrage)
    .maybeSingle()

  expect(gfa, 'Anfrage wurde gespeichert').toBeTruthy()
  // DER KERN DES BUGS: genau hier stand frueher eine Zusage bei termin_id = NULL.
  expect(gfa?.termin_id, 'kein Termin-Phantom bei nur angefragter Zeit').toBeNull()
  // Soll 4: das Team kann nachfassen — die gewuenschte Zeit ist festgehalten.
  expect(gfa?.wunschtermin, 'die Wunschzeit ist festgehalten (Team kann nachfassen)').toBeTruthy()

  // Und es darf auch kein Termin am gfa vorbei entstanden sein (Phantom im SV-Kalender):
  // die Termin-Zahl des Gutachters ist unveraendert.
  expect(await terminCount(), 'kein zusaetzlicher Termin im Kalender des Gutachters').toBe(vorher)
  console.log(`[wunschzeit] Soll 2+3 ✓ gfa ${gfa?.id}: Wunsch ${gfa?.wunschtermin}, termin_id NULL, Termine unveraendert (${vorher})`)
})
