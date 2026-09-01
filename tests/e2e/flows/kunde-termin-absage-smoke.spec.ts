import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Regel-4-Prod-Smoke fuer die Kunden-Terminabsage (#5819).
//
// OPERATIVES SOLL (aus der Fachlogik hergeleitet, NICHT aus dem Code gelesen):
//
//   Ein Kunde hat einen Besichtigungstermin und merkt, dass er ihn nicht wahrnehmen kann.
//   Er sagt ab — im Portal per Klick, oder unterwegs, indem er seinem KI-Assistenten die
//   Fall-Referenz aus seinem Claimondo-Link nennt. Danach gilt, auf BEIDEN Wegen gleich:
//
//     1. Der Termin ist fuer ihn sichtbar erledigt — die Terminkarte fuehrt ihn nicht
//        mehr als anstehend.
//     2. Der Slot ist wieder frei; er bleibt nicht fuer einen Kunden blockiert, der
//        nicht kommt.
//     3. Das Team erfaehrt davon, OHNE nachsehen zu muessen: in der Queue liegt eine
//        dringende Aufgabe mit Fallnummer, Grund und urspruenglichem Zeitpunkt.
//     4. In der Fallakte steht, wann und warum abgesagt wurde — spaeter nachvollziehbar.
//     5. Sagt er versehentlich zweimal ab, passiert beim zweiten Mal nichts Zusaetzliches.
//        Insbesondere landet KEINE zweite Aufgabe im Team: eine doppelte Absage ist ein
//        Bedienfehler, keine zweite Nachricht.
//
//   ⭐ Punkt 5 ist der Grund, warum der Token-Weg ueberhaupt idempotent sein muss: ein
//   Assistent, der auf eine unklare Antwort hin nachfasst, darf das Dispatch-Team nicht
//   doppelt alarmieren. Bei einem Menschen im Portal waere das eine Randnotiz; bei einem
//   Werkzeug, das ein Modell aufruft, ist es der Normalfall.
//
// AUFBAU — geseedet wird nur der AUSGANGSZUSTAND (ein Kunde MIT Termin, den ein
// vorgelagerter Buchungsflow erzeugt haette). Die Absage selbst ist auf Weg A ein echter
// UI-Klick und auf Weg B ein echter HTTP-Aufruf gegen die oeffentliche Route.
//
//   Vorher:  node --env-file=.env.local scripts/smoke/termin-absage-seed.mjs
//   Lauf:    RUN_TERMIN_ABSAGE_SMOKE=1 npx playwright test tests/e2e/flows/kunde-termin-absage-smoke.spec.ts
//   Danach:  node --env-file=.env.local scripts/smoke/termin-absage-seed.mjs --clean
//
// Opt-in (nie in CI): RUN_TERMIN_ABSAGE_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY + TEST_PASSWORT.

const APP = process.env.GOLDEN_APP_URL ?? 'https://app.claimondo.de'

type Fall = {
  leadId: string
  claimId: string
  claimNummer: string | null
  token: string
  terminId: string
  terminStart: string
  email: string
}

// e2e-toplevel-fs: gekapselt — fehlt der Seed, skippt der Test, statt beim Import die
// gesamte Playwright-Collection zu sprengen.
let seed: { portal?: Fall; token?: Fall } | null = null
try {
  seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.termin-absage-seed.json'), 'utf8'))
} catch {
  /* nicht geseedet */
}

test.skip(!process.env.RUN_TERMIN_ABSAGE_SMOKE, 'set RUN_TERMIN_ABSAGE_SMOKE=1 (läuft echt gegen Prod)')

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

/** Was das Team von der Absage mitbekommt — Task + Timeline, aus der DB gelesen. */
async function teamSpur(claimId: string) {
  const db = admin()
  const [tasks, timeline, termin] = await Promise.all([
    db.from('tasks').select('id, titel, prioritaet, empfaenger_rolle, beschreibung').eq('fall_id', claimId).eq('typ', 'termin_absage'),
    db.from('timeline').select('id, titel').eq('fall_id', claimId).eq('typ', 'termin'),
    db.from('gutachter_termine').select('status, cancelled_at, notiz_kunde').eq('bezug_id', claimId).eq('bezug_typ', 'fall').maybeSingle(),
  ])
  return { tasks: tasks.data ?? [], timeline: timeline.data ?? [], termin: termin.data }
}

test('Soll A: Kunde sagt im Portal ab — Termin weg, Team informiert, Akte hat den Eintrag', async ({ page }) => {
  const f = seed?.portal
  test.skip(!f, 'Seed fehlt — vorher termin-absage-seed.mjs laufen lassen')
  const pw = process.env.TEST_PASSWORT
  test.skip(!pw, 'TEST_PASSWORT nicht gesetzt')

  // Ausgangszustand pruefen, bevor geklickt wird: der Termin IST aktiv. Ohne das
  // beweist ein „danach abgesagt" nichts — er koennte es vorher schon gewesen sein.
  const vorher = await teamSpur(f!.claimId)
  expect(vorher.termin?.status, 'Ausgangszustand: Termin ist aktiv').toBe('bestaetigt')
  expect(vorher.tasks.length, 'Ausgangszustand: noch keine Absage-Aufgabe').toBe(0)

  await login(page, f!.email, pw!)
  await page.goto(`${APP}/kunde/faelle/${f!.claimId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')

  // Der Absage-Button fragt per window.confirm nach — ohne Handler haengt der Lauf.
  page.on('dialog', (d) => d.accept())

  const absagen = page.getByRole('button', { name: /absagen/i }).first()
  await expect(absagen, 'Soll 1: der Kunde findet einen Absage-Knopf').toBeVisible({ timeout: 20_000 })
  await absagen.click()

  // Auf die Wirkung warten, nicht auf eine feste Zeit: der Status in der DB ist die
  // Tatsache, die Anzeige ist ihre Darstellung.
  await expect
    .poll(async () => (await teamSpur(f!.claimId)).termin?.status, { timeout: 30_000, intervals: [1000, 2000, 3000] })
    .toBe('abgesagt')

  const nachher = await teamSpur(f!.claimId)
  expect(nachher.termin?.cancelled_at, 'Soll 2: Zeitpunkt der Absage ist festgehalten').toBeTruthy()

  expect(nachher.tasks.length, 'Soll 3: genau EINE Aufgabe fuer das Team').toBe(1)
  expect(nachher.tasks[0].prioritaet, 'Soll 3: dringend — der Slot verfaellt sonst ungenutzt').toBe('dringend')
  expect(nachher.tasks[0].empfaenger_rolle, 'Soll 3: Dispatch disponiert Besichtigungen').toBe('dispatch')
  expect(nachher.tasks[0].beschreibung, 'Soll 3: der urspruengliche Zeitpunkt steht drin').toContain('War geplant')

  expect(nachher.timeline.length, 'Soll 4: Eintrag in der Fallakte').toBeGreaterThan(0)

  // Soll 1 auf der Oberflaeche: nach dem Neuladen fuehrt die Karte den Termin nicht
  // mehr als anstehend. Am Verhalten gemessen (sichtbarer Text), nicht am Markup.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: /absagen/i }), 'Soll 1: kein Absage-Knopf mehr').toHaveCount(0)
})

test('Soll B: Absage per Fall-Referenz (KI-Assistent) wirkt genauso — und doppelt schadet nicht', async ({ request }) => {
  const f = seed?.token
  test.skip(!f, 'Seed fehlt — vorher termin-absage-seed.mjs laufen lassen')

  const vorher = await teamSpur(f!.claimId)
  expect(vorher.termin?.status, 'Ausgangszustand: Termin ist aktiv').toBe('bestaetigt')
  expect(vorher.tasks.length, 'Ausgangszustand: noch keine Absage-Aufgabe').toBe(0)

  // Echte Eingabe: Token + Grund, wie ein Assistent sie uebergeben wuerde.
  const res = await request.post(`${APP}/api/v1/termin-stornieren`, {
    data: { token: f!.token, grund: 'Bin krank geworden' },
  })
  expect(res.status(), 'Route antwortet').toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.storniert, 'beim ersten Aufruf wird wirklich abgesagt').toBe(true)
  expect(body.war_geplant, 'die Antwort nennt den urspruenglichen Zeitpunkt').toBeTruthy()

  const nachher = await teamSpur(f!.claimId)
  expect(nachher.termin?.status, 'Soll 2: derselbe Endzustand wie im Portal').toBe('abgesagt')
  expect(nachher.termin?.notiz_kunde, 'der Grund ist gespeichert').toContain('krank')
  expect(nachher.tasks.length, 'Soll 3: genau EINE Aufgabe').toBe(1)
  expect(nachher.tasks[0].beschreibung, 'Soll 3: die Herkunft ist erkennbar').toContain('API')
  expect(nachher.timeline.length, 'Soll 4: Eintrag in der Fallakte').toBeGreaterThan(0)

  // Soll 5: zweiter Aufruf — meldet den Zustand, aendert aber nichts.
  const zweite = await request.post(`${APP}/api/v1/termin-stornieren`, { data: { token: f!.token } })
  expect(zweite.status()).toBe(200)
  const zweiteBody = await zweite.json()
  expect(zweiteBody.storniert, 'Soll 5: der zweite Aufruf sagt nicht erneut ab').toBe(false)

  const danach = await teamSpur(f!.claimId)
  expect(danach.tasks.length, 'Soll 5: KEINE zweite Aufgabe im Team').toBe(1)
})

test('Eine unbekannte Referenz verraet nicht, ob sie existiert', async ({ request }) => {
  // Gegenprobe zum Instrument: dieselbe Route, absichtlich falscher Token. Antwortet sie
  // hier 404, dann war das 200 oben eine Aussage ueber den Fall — und nicht darueber,
  // dass die Route alles durchwinkt.
  const res = await request.post(`${APP}/api/v1/termin-stornieren`, {
    data: { token: 'gibt-es-nicht-xyz1234567' },
  })
  expect(res.status()).toBe(404)
  const body = await res.json()
  expect(body.error).toBe('not_found')
})
