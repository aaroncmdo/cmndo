import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// KFZ-185: Route Smoke-Tests — prüft, dass alle kritischen Routen rendern,
// ohne 500er und ohne in die Fehlergrenze zu fallen.
//
// 21.08.2026 — die Textprüfung war doppelt wirkungslos:
//   1. Sie hing an einem leeren `.catch(() => {})`. Eine Zusicherung, deren
//      Fehlschlag verschluckt wird, ist Dekoration — sie KANN nicht rot werden.
//   2. Sie suchte nach "Application Error". Dieser String kommt im Produktcode
//      NIRGENDS vor (0 Treffer in src/); die Fehlergrenzen rendern deutsch
//      ("Etwas ist schiefgelaufen" / "Da ist etwas schiefgelaufen", siehe
//      src/components/shared/ErrorState.tsx und src/app/error.tsx).
//
// Übrig blieb `status < 500` als einzige lebende Zusicherung. Eine Next.js-
// Fehlergrenze ist aber eine gerenderte SEITE, kein 5xx. Der Absturz vom
// 20.08. auf /admin/aufgaben/alle wäre deshalb selbst dann grün geblieben,
// wenn die Route in der Liste gestanden hätte — sie stand nicht einmal drin.

/** Was die Fehlergrenzen tatsächlich rendern — beide Varianten. */
const FEHLERGRENZE = /etwas (ist )?schiefgelaufen/i

async function erwarteGerendert(page: Page, route: string): Promise<void> {
  const response = await page.goto(route)
  const status = response?.status() ?? 200
  expect(status, `${route} antwortete mit HTTP ${status}`).toBeLessThan(500)

  // Die Fehlergrenze rendert client-seitig — erst auf Ruhe warten, dann prüfen,
  // sonst misst man, bevor der Fehler überhaupt da ist.
  // ⚠ Der catch hängt bewusst NUR am Warten (networkidle läuft auf Seiten mit
  // Polling in den Timeout), NICHT an der Zusicherung darunter. Genau diese
  // Verwechslung hat die Prüfung vorher entwertet.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})

  await expect(
    page.getByText(FEHLERGRENZE),
    `${route} zeigt die Fehlergrenze statt Inhalt`,
  ).toHaveCount(0)
}

const ADMIN_ROUTES = [
  '/admin',
  '/admin/dispatch',
  '/admin/faelle',
  '/admin/sachverstaendige',
  '/admin/kalender',
  '/admin/tasks',
  '/admin/nachrichten',
  '/admin/versicherungen',
  '/admin/finance',
  '/admin/abrechnungen',
  '/admin/organisationen',
  '/admin/communities',
  '/admin/statistiken',
  '/admin/team',
  // 21.08.2026 nachgetragen — alle drei fehlten, obwohl /alle am 20.08. abstürzte.
  '/admin/aufgaben/alle',
  '/admin/aufgaben/meine',
  '/admin/aufgaben/vorschlaege',
  // SV-Leads-Liste. Die Komponenten liegen unter src/app/admin/sv-leads/,
  // die ROUTE ist eine andere — nicht vom Ordnernamen ableiten.
  '/admin/vertrieb/sachverstaendige/leads',
]

const SV_ROUTES = [
  '/gutachter',
  '/gutachter/heute',
  '/gutachter/faelle',
  '/gutachter/gebiet',
  '/gutachter/kalender',
  '/gutachter/abrechnung',
  '/gutachter/statistiken',
  '/gutachter/nachrichten',
]

const PUBLIC_ROUTES = [
  '/login',
  '/datenschutz',
  '/impressum',
  '/passwort-vergessen',
]

// 23.08. nachgetragen: bis dahin deckte dieser Smoke NUR admin/gutachter/public ab.
// Vier Portale hatten gar keine Rollen-Fixture und wurden deshalb NIE geprueft —
// zusammen ~47 Seiten. Ein 500er oder eine leere Shell waere dort niemandem
// aufgefallen. Bewusst eine Auswahl der Kern-Arbeitsflaechen je Portal, nicht jede
// Unterseite: der Smoke soll die Portale abdecken, nicht die Laufzeit sprengen.
// Alle Pfade sind aus `find src/app/<portal> -name page.tsx` abgeleitet, nicht geraten.
const DISPATCH_ROUTES = [
  '/dispatch/dashboard',
  '/dispatch/leads',
  '/dispatch/kalender',
  '/dispatch/rueckrufe',
  '/dispatch/sachverstaendige',
  '/dispatch/karte',
]

const KB_ROUTES = [
  '/mitarbeiter',
  '/mitarbeiter/tasks',
  '/mitarbeiter/termine',
  '/mitarbeiter/reklamationen',
  '/mitarbeiter/nachrichten',
]

// Kunde: bewusst nur Lese-Flaechen. `/kunde/schaden-melden` ist ein Erfassungsweg —
// reines Laden waere zwar harmlos, der Smoke haette dort aber nichts zu beweisen.
const KUNDE_ROUTES = [
  '/kunde',
  '/kunde/chat',
  '/kunde/fahrzeuge',
  '/kunde/profil',
  '/kunde/nachbesichtigung',
]

const KANZLEI_ROUTES = [
  '/kanzlei/mandate',
  '/kanzlei/kanban',
  '/kanzlei/konto',
]

/**
 * Listen prüfen nur die Übersicht. Die Detailansicht ist die andere
 * Risikoklasse: dort werden verschachtelte Beziehungen aufgelöst und
 * Null-Fälle sichtbar. Der Weg dorthin führt über die Liste — kein
 * hartkodiertes Prod-Objekt, das morgen weg sein kann.
 *
 * `praefix` ist am Listen-Code verifiziert, nicht geraten: /admin/faelle
 * verlinkt auf /faelle/<id>, NICHT auf /admin/faelle/<id>.
 */
const DETAIL_WEGE: DetailWeg[] = [
  { liste: '/admin/faelle', praefix: '/faelle/' },
  {
    liste: '/admin/organisationen',
    praefix: '/admin/organisationen/',
    // 23.08. auf prod gemessen: 0 Zeilen in `organisationen`, 0 von 22 SVs mit
    // `organisation_id`, 0 Parent-Accounts. Die Org-Ebene (Buero mit Sub-SVs) wurde nie
    // benutzt — in /admin/organisationen gibt es nicht einmal einen Anlege-Weg; Orgs
    // entstehen nur als Nebenprodukt beim Admin-SV-Anlegen. Eine leere Liste ist hier
    // also der DAUERZUSTAND, kein Verdacht.
    leerErwartet:
      'organisationen ist auf prod dauerhaft leer (0 Zeilen, kein Anlege-Weg in der UI) — ' +
      'Marker: audit-organisationen-struktur-auf-prod-ungenutzt',
  },
  { liste: '/admin/team', praefix: '/admin/team/' },
  { liste: '/admin/versicherungen', praefix: '/admin/versicherungen/' },
]

/** Detail-Links tragen eine UUID; /admin/team/leaderboard ist keine Detailansicht. */
const HAT_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

test.describe('Admin Routes', () => {
  for (const route of ADMIN_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ adminPage }) => {
      await erwarteGerendert(adminPage, route)
    })
  }
})

type DetailWeg = { liste: string; praefix: string; leerErwartet?: string }

/**
 * Ein Detail-Weg: Liste oeffnen, den ersten Detail-Link mit UUID nehmen, Detailansicht
 * pruefen. Als Helfer herausgezogen (23.08.), weil ihn jetzt drei Rollen brauchen —
 * vorher lag die Logik nur im Admin-Block.
 */
async function pruefeDetailWeg(page: Page, { liste, praefix, leerErwartet }: DetailWeg) {
  await erwarteGerendert(page, liste)

  const hrefs = await page
    .locator(`a[href^="${praefix}"]`)
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute('href')).filter((h): h is string => Boolean(h)),
    )
  // Zeilenzahl trennt die beiden Null-Faelle, die sonst identisch aussehen:
  // „Liste leer" vs. „Liste voll, aber ohne Detail-Links" (genau der Bug, den #5529
  // behoben hat). Eine leere Liste rendert einen EmptyState statt einer Tabelle,
  // dort ist die Zahl 0.
  const zeilen = await page.locator('tbody tr').count()
  const detail = hrefs.find((h) => HAT_ID.test(h))

  // Bewusst KEIN test.skip() bei UNERWARTET leerer Liste: die wuerde den Lauf gruen
  // faerben und genau den Beweis unterschlagen, fuer den dieser Test existiert.
  //
  // Ausnahme (23.08.): Wege mit `leerErwartet`, deren Leere gemessen und dokumentiert
  // ist — UND nur solange die Liste nachweislich 0 Zeilen hat. Grund: ein DAUERHAFT
  // roter Waechter verliert seine Signalwirkung; er faerbt jeden nightly rot, ohne je
  // etwas Neues zu sagen, und gewoehnt daran, ueber rote Zeilen hinwegzulesen.
  // ⚠ Selbstheilend: sobald Daten existieren (zeilen > 0), greift die Ausnahme NICHT
  // mehr — fehlende Detail-Links sind dann wieder ein harter Fehler.
  if (!detail && leerErwartet && zeilen === 0) {
    test.skip(true, `${liste}: ${leerErwartet}`)
  }

  expect(
    detail,
    `${liste}: kein Detail-Link nach ${praefix}<uuid> gefunden (${hrefs.length} Links mit diesem Präfix, ${zeilen} Tabellenzeilen) — Detailansicht nicht prüfbar`,
  ).toBeTruthy()
  if (!detail) return

  await erwarteGerendert(page, detail)
}

test.describe('Admin Detailansichten (über die Liste, nicht über feste IDs)', () => {
  for (const weg of DETAIL_WEGE) {
    test(`${weg.liste} → erste Detailansicht rendert`, async ({ adminPage }) => {
      await pruefeDetailWeg(adminPage, weg)
    })
  }
})

// 23.08.: Detail-Wege gab es bis dahin NUR fuer admin. Die Detailansicht ist laut
// Kommentar oben „die andere Risikoklasse" — verschachtelte Beziehungen, Null-Faelle —
// und genau die blieb in den uebrigen Portalen ungeprueft.
// Beide Praefixe sind am Listen-Code verifiziert, nicht abgeleitet:
//   /dispatch/leads   -> <Link href={`/dispatch/leads/${lead.id}`}>   (LeadsViewToggle.tsx:422)
//   /gutachter/faelle -> <Link href={`/gutachter/fall/${f.fall_id}`}> (die Liste verlinkt auf
//                        /gutachter/fall/, NICHT auf /gutachter/faelle/)
test.describe('Dispatch Detailansichten', () => {
  for (const weg of [{ liste: '/dispatch/leads', praefix: '/dispatch/leads/' }]) {
    test(`${weg.liste} → erste Detailansicht rendert`, async ({ dispatchPage }) => {
      await pruefeDetailWeg(dispatchPage, weg)
    })
  }
})

test.describe('Gutachter Detailansichten', () => {
  for (const weg of [{
    liste: '/gutachter/faelle',
    praefix: '/gutachter/fall/',
    // 23.08. nachgemessen, als dieser Weg beim ersten Lauf rot war — es ist KEIN Defekt:
    // die Seite zeigt ausschliesslich Faelle IN REGULIERUNG. Schritt 2 der Query filtert
    // ueber `kanzlei_faelle` (page.tsx:71-83), ihr EmptyState heisst woertlich „Noch keine
    // Faelle in Regulierung." Der Test-SV hat zwar 1 Auftrag mit
    // `gutachten_final_freigegeben` (aus dem nightly), aber 0 Eintraege in
    // `kanzlei_faelle` — also ist die leere Liste fachlich korrekt.
    // ⚠ Selbstheilend: sobald ein Fall des Test-SV in Regulierung geht, prueft der Weg
    // wieder scharf.
    leerErwartet:
      '/gutachter/faelle zeigt nur Faelle in Regulierung (Filter ueber kanzlei_faelle); ' +
      'der Test-SV hat aktuell keinen — 0 Eintraege gemessen',
  }]) {
    test(`${weg.liste} → erste Detailansicht rendert`, async ({ svPage }) => {
      await pruefeDetailWeg(svPage, weg)
    })
  }
})

test.describe('Gutachter Routes', () => {
  for (const route of SV_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ svPage }) => {
      // SV-Routen leiten ggf. auf /gutachter/willkommen um, wenn nicht onboarded —
      // das ist kein Fehler, deshalb prüft erwarteGerendert nur auf 5xx + Fehlergrenze.
      await erwarteGerendert(svPage, route)
    })
  }
})

test.describe('Public Routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ page }) => {
      await erwarteGerendert(page, route)
    })
  }
})

test.describe('Dispatch Routes', () => {
  for (const route of DISPATCH_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ dispatchPage }) => {
      await erwarteGerendert(dispatchPage, route)
    })
  }
})

test.describe('Kundenbetreuer Routes', () => {
  for (const route of KB_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ kbPage }) => {
      await erwarteGerendert(kbPage, route)
    })
  }
})

test.describe('Kunde Routes', () => {
  for (const route of KUNDE_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ kundePage }) => {
      await erwarteGerendert(kundePage, route)
    })
  }
})

test.describe('Kanzlei Routes', () => {
  for (const route of KANZLEI_ROUTES) {
    test(`GET ${route} → renders without error`, async ({ kanzleiPage }) => {
      await erwarteGerendert(kanzleiPage, route)
    })
  }
})
