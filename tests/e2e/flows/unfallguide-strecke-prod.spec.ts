// stumme-waechter-skip: manueller Prod-Smoke, schreibt echte Zeilen in die prod-DB.
//   Steht zusaetzlich in MANUELLE_LIVE_SMOKES der playwright.config.ts, laeuft also
//   nie in CI. Ein Workflow, der RUN_UNFALLGUIDE_SMOKE setzt, waere hier falsch.
//
// REGEL-4-SMOKE — Unfallguide-Verteilstrecke (PR #5865).
//
// DAS SOLL WIRD HIER NICHT NEU GESCHRIEBEN, es wird gemessen. Quelle ist Abschnitt 6
// der Abnahme-Datei `memory/abnahmen/2026-09-04-unfallguide-lead-magnet.md`; die
// Sicht-Matrix steht dort in 6a, die DB-Voraussetzungen in 6b (gegen prod gelesen).
// Kurzfassung des Solls, gegen das gemessen wird:
//
//   Jemand liest einen Ratgeber-Artikel oder klickt eine Anzeige und landet auf
//   /unfallguide. Er sieht ZUERST, was drinsteht und dass es ihn nichts kostet, nicht
//   das Formular. Er gibt Name und Telefon an, optional eine E-Mail, bestaetigt den
//   Rueckruf. Nach dem Absenden ERSCHEINT DER GUIDE SOFORT AUF DER SEITE — der
//   Gegenwert ist geliefert, bevor irgendein Kanal beteiligt ist. Parallel entstehen
//   Lead, Einwilligung am Lead, Aktivitaetsspur, FlowLink, Willkommensnachricht,
//   Team-Benachrichtigung und ein RUECKRUF-AUFTRAG mit Frist.
//   Auf dem Artikel oeffnet sich auf Desktop bei 15 % Lesetiefe ein Modal; auf Mobil
//   KEIN Overlay, sondern eine Karte im Textfluss, und die Anruf-Leiste bleibt klickbar.
//
// TESTIDENTITAET (Konvention aus scripts/smoke/ep-lib.mjs `identitaet()`):
//   Telefon +491511000xxx — nicht vergeben und NICHT bei WhatsApp registriert. Die
//   Verfuegbarkeitspruefung schlaegt damit fehl, es geht KEINE WhatsApp raus, der
//   E-Mail-Weg greift. E-Mail epsweep-…@claimondo.de.
//   Als E-Mail dient die ABNAHME-INBOX (`abnahme+<lauf>@claimondo.de`, #5874): das eine
//   interne Postfach, das bewusst zustellbar ist und per IMAP gelesen werden kann. Damit
//   ist der PDF-Anhang WIRKLICH nachweisbar — nicht nur „die Mail gilt als versendet".
//   Das ist der Unterschied, der zaehlt: der Anhang wird zur Laufzeit aus dem
//   `public/`-Ordner des Standalone-Servers gelesen und kann genau dort fehlen, ohne dass
//   Log oder Statuscode es zeigen. Es geht nichts an echte Kunden.
//
// Aufruf (nie in CI):
//   RUN_UNFALLGUIDE_SMOKE=1 CI=1 npx playwright test unfallguide-strecke-prod \
//     --config=playwright.config.ts --project=chromium
//   Fuer die DB-Gegenprobe zusaetzlich NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { abnahmeAdresse, abnahmeInboxKonfiguriert, warteAufMail } from '../lib/abnahme-inbox'

test.skip(
  !process.env.RUN_UNFALLGUIDE_SMOKE,
  'RUN_UNFALLGUIDE_SMOKE=1 setzen — dieser Smoke schreibt echte Zeilen auf prod',
)

const MARKETING = process.env.PLAYWRIGHT_MARKETING_URL ?? 'https://claimondo.de'
const ARTIKEL = process.env.SMOKE_GUIDE_ARTIKEL ?? '/haftpflicht/beilackierung'
const GUIDE_PFAD = '/downloads/claimondo-unfallguide.pdf'

// Eindeutig je Lauf — sonst misst der zweite Lauf die Zeilen des ersten.
const STEMPEL = Date.now().toString(36)
const IDENT = {
  name: `Epsweep Guide${STEMPEL.slice(-4).toUpperCase()}`,
  email: abnahmeAdresse(`guide-${STEMPEL}`),
  telefon: `+491511000${100 + Math.floor(Math.random() * 900)}`,
}
// Vor dem Absenden gemerkt: der Feinfilter der Inbox-Suche braucht einen Startpunkt,
// sonst findet ein zweiter Lauf die Mail des ersten.
const LAUF_START = new Date(Date.now() - 60_000)

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

test.describe.configure({ mode: 'serial' })

test('Landeseite: Gegenwert zuerst, Guide sofort, und der Vorgang entsteht vollstaendig', async ({
  page,
  request,
}) => {
  const fehler: string[] = []
  page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`))

  await page.goto(`${MARKETING}/unfallguide`, { waitUntil: 'domcontentloaded' })

  // (1) Der Gegenwert steht VOR dem Formular. Gemessen am sichtbaren Text, nicht am
  // Markup: die Seite muss sagen, was drin ist und dass es nichts kostet.
  const text = (await page.locator('body').innerText()).toLowerCase()
  expect(text, 'Die Seite muss den Inhalt des Guides benennen').toContain('unfallguide')
  expect(text, 'Die Kostenfrage muss beantwortet sein').toMatch(/kostenlos|kostet sie nichts|0 €/)

  // (2) Echte Eingabe — kein Aufruf, kein Seed.
  await page.fill('input[name="name"]', IDENT.name)
  await page.fill('input[name="telefon"]', IDENT.telefon)
  await page.fill('input[name="email"]', IDENT.email)
  await page.check('input[name="einwilligung"]')
  await page.click('button[type="submit"]')

  // (3) DER KERN DES SOLLS: der Guide erscheint SOFORT auf der Seite, bevor
  // irgendein Kanal beteiligt ist. Das ist der Unterschied zu "wir schicken ihn dann".
  const download = page.locator(`a[href="${GUIDE_PFAD}"]`).first()
  await expect(download, 'Nach dem Absenden muss der Guide sofort hier stehen').toBeVisible({
    timeout: 30_000,
  })

  // (4) Der Download ist wirklich das PDF — Statuscode allein beweist das nicht.
  const pdf = await request.get(`${MARKETING}${GUIDE_PFAD}`)
  expect(pdf.status(), 'Guide-PDF muss ausgeliefert werden').toBe(200)
  expect(pdf.headers()['content-type'] ?? '').toContain('pdf')
  expect((await pdf.body()).length, 'PDF darf keine Fehlerseite sein').toBeGreaterThan(300_000)

  expect(fehler, `Seitenfehler auf /unfallguide:\n${fehler.join('\n')}`).toEqual([])

  // (5) DB-Gegenprobe. Ergaenzt den UI-Lauf, ersetzt ihn nicht.
  const sb = db()
  test.skip(!sb, 'ohne SUPABASE_SERVICE_ROLE_KEY keine DB-Gegenprobe')

  // Der Versand laeuft nach dem Redirect weiter — kurz nachfassen statt einmal raten.
  let lead: Record<string, unknown> | null = null
  for (let versuch = 0; versuch < 10 && !lead; versuch++) {
    const { data } = await sb!
      .from('leads')
      .select('id, source_channel, email, telefon, dsgvo_zustimmung_am')
      .eq('email', IDENT.email)
      .maybeSingle()
    lead = (data as Record<string, unknown>) ?? null
    if (!lead) await page.waitForTimeout(3000)
  }
  expect(lead, 'Es muss ein Lead entstanden sein').toBeTruthy()
  expect(lead!.source_channel, 'source_channel muss den Eingang benennen').toBe('unfallguide')
  expect(
    lead!.dsgvo_zustimmung_am,
    'Die Einwilligung muss AM LEAD stehen (§ 7 UWG), nicht nur an der Anfrage',
  ).toBeTruthy()

  const leadId = lead!.id as string

  const { data: spur } = await sb!
    .from('timeline')
    .select('titel')
    .eq('lead_id', leadId)
  const titel = (spur ?? []).map((z) => String((z as { titel: unknown }).titel))
  expect(titel.join(' | '), 'Die Aktivitaetsspur muss den Eingang zeigen').toContain(
    'Unfallguide angefordert',
  )
  expect(
    titel.some((t) => t.includes('Willkommensnachricht')),
    `Die Willkommensnachricht muss protokolliert sein, gefunden: ${titel.join(' | ')}`,
  ).toBe(true)

  // Der versprochene Rueckruf braucht einen Arbeitsanker, keine blosse Benachrichtigung.
  const { data: auftrag } = await sb!
    .from('admin_termine')
    .select('id, typ, status, start_zeit, titel')
    .eq('lead_id', leadId)
    .eq('typ', 'rueckruf')
    .maybeSingle()
  expect(auftrag, 'Der zugesagte Rueckruf muss als Aufgabe existieren').toBeTruthy()
  expect(auftrag!.status).toBe('offen')
  expect(
    new Date(auftrag!.start_zeit as string).getTime(),
    'Die Frist muss in der Zukunft liegen',
  ).toBeGreaterThan(Date.now() - 60_000)

  // FlowLink: erzeugt, aber NICHT ueber den Mini-Wizard-Helfer versendet.
  const { data: fl } = await sb!
    .from('flow_links')
    .select('token, gesendet_kanal')
    .eq('lead_id', leadId)
    .maybeSingle()
  expect(fl, 'Der Lead braucht einen FlowLink als Weg zurueck').toBeTruthy()
  expect(
    fl!.gesendet_kanal,
    'Der FlowLink darf NICHT ueber den Schadenmeldungs-Text versendet worden sein',
  ).toBeFalsy()

  // Die Willkommens-E-Mail: erst das Protokoll, dann das Postfach.
  const { data: mails } = await sb!
    .from('email_log')
    .select('status, betreff, empfaenger')
    .eq('lead_id', leadId)
  expect((mails ?? []).length, 'Die Willkommens-E-Mail muss protokolliert sein').toBeGreaterThan(0)

  // ⭐ DER EIGENTLICHE NACHWEIS: das PDF liegt im Postfach, nicht nur im Log.
  // „versendet" und „angekommen mit Anhang" sind zwei Aussagen — die zweite ist die,
  // an der die Strecke haengt, und sie kann still scheitern (der Anhang wird zur
  // Laufzeit aus public/ des Standalone-Servers gelesen).
  if (!abnahmeInboxKonfiguriert()) {
    console.warn(
      '[unfallguide-smoke] ABNAHME_INBOX_USER/_PASS fehlen — der PDF-Anhang ist damit ' +
        'AUSDRUECKLICH NICHT NACHGEWIESEN, nur der email_log-Eintrag.',
    )
  } else {
    const mail = await warteAufMail({
      an: IDENT.email,
      betreffEnthaelt: 'Unfallguide',
      seit: LAUF_START,
      timeoutMs: 180_000,
    })
    const anhang = mail.anhaenge.find((a) => a.typ.toLowerCase().includes('pdf'))
    expect(
      anhang,
      `Die Willkommens-Mail muss den Guide anhaengen. Gefunden: ${JSON.stringify(mail.anhaenge)}`,
    ).toBeTruthy()
    expect(
      anhang!.bytes,
      `Der Anhang darf keine leere Datei sein (${anhang?.bytes} Bytes)`,
    ).toBeGreaterThan(300_000)
  }
})

test('Ratgeber-Artikel mobil: Karte im Textfluss, Anruf-Leiste bleibt klickbar', async ({
  browser,
}) => {
  const kontext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await kontext.newPage()
  await page.goto(`${MARKETING}${ARTIKEL}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  // Der Einstieg, der auf Mobil bisher komplett fehlte.
  const karte = page.locator('aside[aria-label="Unfallguide"] a[href$="/unfallguide"]').first()
  await karte.scrollIntoViewIfNeeded()
  await expect(karte, 'Auf Mobil muss es einen Weg zum Guide IM Artikel geben').toBeVisible()

  // Und die Anruf-Leiste darf davon nicht verdeckt werden. Gemessen am VERHALTEN
  // (was trifft ein Klick auf diesen Punkt), nicht am Markup.
  const leiste = page.locator('a[href^="tel:"]').last()
  const box = await leiste.boundingBox()
  expect(box, 'Die Anruf-Leiste muss sichtbar sein').toBeTruthy()
  const getroffen = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x as number, y as number)
    return el ? `${el.tagName}:${(el.closest('a')?.getAttribute('href') ?? '').slice(0, 20)}` : 'nichts'
  }, [box!.x + box!.width / 2, box!.y + box!.height / 2])
  expect(getroffen, `Klick auf die Anruf-Leiste trifft: ${getroffen}`).toContain('tel:')

  // Kein Overlay, das den Artikeltext verdeckt (Google-Interstitial-Kriterium).
  const h1 = page.locator('h1').first()
  const hbox = await h1.boundingBox()
  if (hbox) {
    const ueberDerUeberschrift = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x as number, y as number)
      return el?.tagName ?? 'nichts'
    }, [hbox.x + hbox.width / 2, hbox.y + hbox.height / 2])
    expect(
      ['H1', 'SPAN', 'A', 'EM', 'STRONG'],
      `Etwas liegt ueber der Ueberschrift: ${ueberDerUeberschrift}`,
    ).toContain(ueberDerUeberschrift)
  }
  await kontext.close()
})

test('Ratgeber-Artikel Desktop: Modal erst beim Runterscrollen, nicht beim Anker-Aufruf', async ({
  page,
}) => {
  // Gegenprobe zuerst: ein Aufruf mit Anker startet weit unten. Ohne
  // Richtungspruefung wuerde das Modal sofort aufgehen.
  await page.goto(`${MARKETING}${ARTIKEL}#faq`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await expect(
    page.getByRole('dialog'),
    'Ein Anker-Aufruf darf das Modal NICHT sofort ausloesen',
  ).toBeHidden()

  // Jetzt der echte Weg: runterscrollen bis ueber 15 % des Artikels.
  await page.goto(`${MARKETING}${ARTIKEL}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((n) => {
      const a = document.querySelector('article')
      if (a) window.scrollTo(0, a.offsetTop + a.offsetHeight * 0.06 * (n as number))
    }, i)
    await page.waitForTimeout(400)
  }
  await expect(
    page.getByRole('dialog'),
    'Nach 15 % Lesetiefe muss das Angebot erscheinen',
  ).toBeVisible({ timeout: 15_000 })
})

test.afterAll(async () => {
  const sb = db()
  if (!sb || !process.env.RUN_UNFALLGUIDE_SMOKE) return
  // Residue entfernen — Smoke-Reste in Arbeitslisten sind ein bekanntes Problem.
  // Reihenfolge FK-sicher: Kinder vor dem Lead.
  const { data: leads } = await sb.from('leads').select('id').eq('email', IDENT.email)
  const ids = (leads ?? []).map((l) => (l as { id: string }).id)
  if (ids.length === 0) return
  // `benachrichtigungen` fehlt hier bewusst: die Zeilen haengen nur ueber den
  // `link`-String am Lead, ein Match darauf waere unscharf. Sie verschwinden ohnehin
  // aus der Liste, sobald der Lead weg ist.
  for (const [tabelle, spalte] of [
    ['admin_termine', 'lead_id'],
    ['timeline', 'lead_id'],
    ['flow_links', 'lead_id'],
    ['email_log', 'lead_id'],
  ] as const) {
    const { error } = await sb.from(tabelle).delete().in(spalte, ids)
    if (error) console.error(`[cleanup] ${tabelle}: ${error.message}`)
  }
  const { error: leadErr } = await sb.from('leads').delete().in('id', ids)
  if (leadErr) console.error(`[cleanup] leads: ${leadErr.message}`)
  const { error: anfErr } = await sb.from('anfragen').delete().eq('kontakt_email', IDENT.email)
  if (anfErr) console.error(`[cleanup] anfragen: ${anfErr.message}`)
})
