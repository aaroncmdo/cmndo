// stumme-waechter-skip: manueller Prod-Smoke fuer #5958. Loggt sich mit echten prod-Konten ein;
// im nightly waere das taeglicher Laerm. Kommando steht im PR und im Abnahme-Blatt.
//
// SOLL (memory/abnahmen/2026-09-09-support-meldungen-ansicht.md, Abschnitt 1c;
// Aaron 09.09.2026 "dann geh das an"):
//
//   1. Ein ADMIN oeffnet /admin/support und sieht die Meldungen aus dem Hilfe-Widget —
//      mit Wortlaut, Melder, Rolle, Seite und Zeitpunkt.
//   2. Eine Meldung OHNE Linear-Ticket ist als solche erkennbar und wirkt nicht wie ein Fehler.
//   3. Ein NICHT-Admin (Makler) kommt nicht auf die Seite.
//   4. ANONYM landet auf /login.
//
// Gemessen wird am VERHALTEN: sichtbarer Text der geladenen Seite (innerText, nicht Markup)
// und die End-URL nach dem Guard-Redirect — nicht der Statuscode allein.
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const RUN = process.env.RUN_SUPPORT_ANSICHT === '1'
const RUN_LANGTEXT = process.env.RUN_SUPPORT_LANGTEXT === '1'
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'
const ZIEL = `${BASE}/admin/support`

const KONTEN = {
  admin: { email: 'test-admin@claimondo.de', pass: process.env.TEST_ADMIN_PASSWORD ?? 'gaFLpfnd19FssAKUPHOQrimVab0gpYUu' },
  makler: { email: 'test-makler@claimondo.de', pass: process.env.TEST_MAKLER_PASSWORD ?? 'IfJyyoXTh2VAJUXgNgR7WPOn5zUn5tYb' },
}

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/e-?mail/i).first().fill(email)
  await page.getByLabel(/passwort/i).first().fill(pass)
  // ⚠ NICHT button[type=submit].first() — der Logout der Portal-Nav steht im DOM oft VOR dem
  // Seiteninhalt (regel4-smoke).
  await page.getByRole('button', { name: /anmelden|einloggen|login/i }).first().click()
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})
}

test.describe('Support-Meldungen: Ansicht im Admin-Portal (#5958)', () => {
  test.skip(!RUN, 'RUN_SUPPORT_ANSICHT=1 setzen — manueller Prod-Smoke mit echten Logins')
  test.setTimeout(180_000)

  test('A · Admin sieht die Meldungen mit Wortlaut', async ({ page }) => {
    // Ausgangszustand SCHARF stellen: ohne mindestens eine Zeile MIT Text prueft der Test nur
    // die leere Seite und waere gruen ohne Aussage (regel4-smoke, "Vorbedingungen").
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Service-Role-Zugang fehlt (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { count: mitText } = await db
      .from('support_ticket_log')
      .select('id', { count: 'exact', head: true })
      .not('meldung_text', 'is', null)
    console.log(`[A] Zeilen mit Wortlaut in der DB: ${mitText ?? 0}`)

    await login(page, KONTEN.admin.email, KONTEN.admin.pass)
    await page.goto(ZIEL, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})

    const text = await page.locator('body').innerText()
    console.log(`[A] Seitentext: ${text.length} Zeichen`)

    // Die Seite ist erreichbar und zeigt ihre Überschrift.
    expect(text, 'Überschrift muss stehen').toContain('Support-Meldungen')
    // Der Erklärsatz zu fehlendem Wortlaut/Ticket — er verhindert, dass leere Felder wie ein
    // Defekt aussehen, und ist damit Teil des Solls (Abschnitt 1c, Punkt 3).
    expect(text, 'Erklärung zu Wortlaut/Ticket muss stehen').toContain('8. September 2026')
    // Der alte, tote Kanal darf NICHT mehr als leerer Block erscheinen.
    expect(text, 'die leere technische_probleme-Sektion ist raus').not.toContain('Keine Probleme gemeldet')

    if ((mitText ?? 0) > 0) {
      // Mindestens eine Zeile trägt einen Wortlaut → die Tabelle darf nicht leer wirken.
      expect(text, 'bei vorhandenen Zeilen darf die Leer-Meldung nicht erscheinen')
        .not.toContain('Noch keine Meldungen')
      console.log('[A] Tabelle zeigt Meldungen: ✓')
    } else {
      console.log('[A] ⚠ keine Zeile mit Wortlaut in der DB — Leerzustand geprüft, nicht die Tabelle')
    }
  })

  test('B · Makler kommt nicht auf die Seite (Guard-Gegenprobe)', async ({ page }) => {
    await login(page, KONTEN.makler.email, KONTEN.makler.pass)
    await page.goto(ZIEL, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})

    const endUrl = page.url()
    const text = await page.locator('body').innerText()
    console.log(`[B] Makler landet auf: ${endUrl}`)
    expect(endUrl, 'ein Makler darf nicht auf /admin/support bleiben').not.toContain('/admin/support')
    expect(text, 'und keine Meldungen sehen').not.toContain('Support-Meldungen')
  })

  test('C · Anonym landet auf /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto(ZIEL, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    const endUrl = page.url()
    console.log(`[C] Anonym landet auf: ${endUrl}`)
    expect(endUrl).toContain('/login')
  })

  // ── D · Langer Meldungstext bricht die Seite nicht ───────────────────────────────────────
  // Im ersten Abnahmebericht stand dieser Punkt als "verdrahtet, nicht gelaufen": whitespace-
  // pre-wrap + Breitenbegrenzung sind im Code, aber es gab keinen langen Text in den Daten.
  // Dieser Test ERZEUGT einen (ueber die echte Route, nicht per DB-Seed — der Weg gehoert zum
  // Soll) und misst dann das Verhalten der Seite.
  //
  // Gemessen wird am LAYOUT, nicht am Markup: scrollWidth des Bodys gegen die Fensterbreite.
  // "max-w-2xl steht im HTML" beweist nicht, dass der Text auch umbricht.
  test('D · Ein langer Meldungstext sprengt die Seite nicht', async ({ page }) => {
    test.skip(!RUN_LANGTEXT, 'RUN_SUPPORT_LANGTEXT=1 — erzeugt eine echte Meldung auf prod')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Service-Role-Zugang fehlt')
    const db = createClient(url, key, { auth: { persistSession: false } })

    const marker = `LANGTEXT-${Date.now()}`
    // Ein Wort ohne Leerzeichen ist der haertere Fall: normaler Fliesstext bricht von allein,
    // eine lange ungebrochene Kette nur mit break-words.
    const langerText =
      `${marker} — Regel-4-Abnahme, bitte ignorieren. ` +
      'Diese Meldung prueft absichtlich den Umbruch bei sehr langem Inhalt. '.repeat(12) +
      'UNUNTERBROCHENEKETTE' + 'X'.repeat(180)

    await login(page, KONTEN.makler.email, KONTEN.makler.pass)
    const knopf = page.getByRole('button', { name: 'Hilfe und Support öffnen' })
    await expect(knopf).toBeVisible({ timeout: 30_000 })
    const antwort = page.waitForResponse(
      (r) => r.url().includes('/api/support/chat') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )
    await knopf.click()
    const eingabe = page.getByRole('textbox').last()
    await expect(eingabe).toBeVisible({ timeout: 20_000 })
    await eingabe.fill(langerText)
    await eingabe.press('Enter')
    expect((await antwort).status()).toBe(200)

    let zeileId: string | null = null
    await expect.poll(async () => {
      const { data } = await db
        .from('support_ticket_log')
        .select('id, meldung_text')
        .ilike('meldung_text', `%${marker}%`)
        .limit(1)
      zeileId = data?.[0]?.id ?? null
      return zeileId
    }, { timeout: 30_000, message: 'die lange Meldung muss in der DB stehen' }).toBeTruthy()
    console.log(`[D] lange Meldung gespeichert (${langerText.length} Zeichen)`)

    try {
      await login(page, KONTEN.admin.email, KONTEN.admin.pass)
      await page.goto(ZIEL, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})

      const text = await page.locator('body').innerText()
      expect(text, 'der lange Text muss auf der Seite stehen').toContain(marker)

      // DIE eigentliche Messung: laeuft der Body seitlich aus dem Fenster?
      const mass = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      const ueberstand = mass.scrollWidth - mass.clientWidth
      console.log(`[D] Body scrollWidth ${mass.scrollWidth} vs. clientWidth ${mass.clientWidth} → Überstand ${ueberstand}px`)
      expect(ueberstand, 'die Seite darf nicht horizontal scrollen').toBeLessThanOrEqual(2)
    } finally {
      // Residue IMMER weg — auch wenn die Assertion oben scheitert (regel4-smoke: Cleanup
      // gehoert nicht hinter eine Assertion, die den Test abbrechen kann).
      if (zeileId) {
        const { error } = await db.from('support_ticket_log').delete().eq('id', zeileId)
        console.log(`[D] Residue entfernt: ${error ? 'FEHLER ' + error.message : 'ok'}`)
      }
    }
  })
})
