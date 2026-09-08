// stumme-waechter-skip: manueller Prod-Smoke fuer #5936. Laeuft bewusst nicht im e2e-Job —
// er loggt sich mit echten prod-Konten ein und oeffnet das Support-Widget; im nightly waere
// das taeglicher Laerm ohne Erkenntnisgewinn. Kommando steht im PR und im Abnahme-Blatt.
//
// SOLL (memory/abnahmen/2026-09-08-support-meldungen-sammelstelle.md, Abschnitt 1c;
// Entscheidung Aaron 06.09.2026 "kunde raus … makler werkstatt flotte rein"):
//
//   1. Ein PARTNER (Makler/Werkstatt/Flotte) sieht den Knopf "Hilfe und Support" und kommt
//      durch — vorher lief er in ein HTTP 403, obwohl der Knopf sichtbar war (~105 Nutzer).
//   2. Ein ENDKUNDE sieht den Knopf nicht mehr. Dahinter liegt ein Werkzeug, das Tickets im
//      Entwicklungs-Backlog anlegt — kein Kundensupport.
//
// Gemessen wird am VERHALTEN: der Statuscode der Route (nicht der Text im Drawer) und die
// Sichtbarkeit des Bedienelements (nicht seine Existenz im Markup).
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const RUN = process.env.RUN_SUPPORT_ROLLEN === '1'
const RUN_SAMMELSTELLE = process.env.RUN_SUPPORT_SAMMELSTELLE === '1'
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'

const KONTEN = {
  makler: { email: 'test-makler@claimondo.de', pass: process.env.TEST_MAKLER_PASSWORD ?? 'IfJyyoXTh2VAJUXgNgR7WPOn5zUn5tYb' },
  kunde: { email: 'smoke-kunde@claimondo.de', pass: process.env.SMOKE_KUNDE_PASS ?? 'PibnEZfmwnSOiG5AMM61mwpmFNjnvC6u' },
}

const SUPPORT_KNOPF = 'Hilfe und Support öffnen'

async function login(page: Page, email: string, pass: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/e-?mail/i).first().fill(email)
  await page.getByLabel(/passwort/i).first().fill(pass)
  // ⚠ NICHT button[type=submit].first() — der Logout der Portal-Nav steht im DOM oft VOR dem
  // Seiteninhalt (regel4-smoke, "button[type=submit].first() klickt ABMELDEN").
  await page.getByRole('button', { name: /anmelden|einloggen|login/i }).first().click()
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})
}

test.describe('Support-Widget: Rollen nach #5936', () => {
  test.skip(!RUN, 'RUN_SUPPORT_ROLLEN=1 setzen — manueller Prod-Smoke mit echten Logins')
  test.setTimeout(180_000)

  test('A · Partner (Makler) sieht den Knopf UND kommt durch (vorher 403)', async ({ page }) => {
    await login(page, KONTEN.makler.email, KONTEN.makler.pass)

    const knopf = page.getByRole('button', { name: SUPPORT_KNOPF })
    await expect(knopf, 'Partner muss den Support-Knopf sehen').toBeVisible({ timeout: 30_000 })
    console.log('[A] Support-Knopf für Makler sichtbar: ✓')

    // Antwort der Route abfangen — DAS ist die eigentliche Messung. Vor #5936 kam hier 403.
    const antwort = page.waitForResponse(
      (r) => r.url().includes('/api/support/chat') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )

    await knopf.click()
    const eingabe = page.getByRole('textbox').last()
    await expect(eingabe).toBeVisible({ timeout: 20_000 })
    await eingabe.fill('Regel-4-Smoke #5936 — bitte ignorieren. Prueft nur, ob die Partner-Rolle zugelassen ist.')
    await eingabe.press('Enter')

    const res = await antwort
    const status = res.status()
    console.log(`[A] POST /api/support/chat → HTTP ${status}`)
    if (status === 403) {
      const body = await res.text().catch(() => '')
      console.log(`[A] 403-Body: ${body.slice(0, 200)}`)
    }
    expect(status, 'Partner darf NICHT mehr in ein 403 laufen').not.toBe(403)
  })

  test('B · Endkunde sieht den Knopf nicht mehr (Gegenprobe)', async ({ page }) => {
    // Der Knopf hing zuletzt nur noch im MOBILEN Drawer — Desktop-Viewport würde ihn
    // ohnehin nicht zeigen und wäre ein wertloser grüner Test.
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, KONTEN.kunde.email, KONTEN.kunde.pass)

    // Drawer/Menü öffnen, falls vorhanden — der Knopf lag darin.
    const menue = page.getByRole('button', { name: /menü|menu|navigation|öffnen/i }).first()
    if (await menue.isVisible().catch(() => false)) {
      await menue.click()
      await page.waitForTimeout(1500)
    }

    const knopf = page.getByRole('button', { name: SUPPORT_KNOPF })
    const sichtbar = await knopf.isVisible().catch(() => false)
    const imMarkup = await knopf.count()
    console.log(`[B] Kunde – Support-Knopf sichtbar: ${sichtbar}, im Markup: ${imMarkup}`)
    expect(sichtbar, 'Ein Endkunde darf den Bugtracker-Knopf nicht mehr sehen').toBe(false)
  })

  // ── C · Sammelstelle (#5941) — erst NACH dem Deploy von meldung_text sinnvoll ────────────
  // SOLL (Blatt 1c, Schritte 4+5): Der Meldungstext liegt dauerhaft in der DB, und eine
  // E-Mail erreicht das Team — BEIDES auch ohne Linear-Key. Gemessen am DB-Wert
  // (support_ticket_log.meldung_text) und am Sendeprotokoll (email_log), nicht an der
  // Bot-Antwort. Der Posteingang selbst ist von hier nicht lesbar; email_log belegt die
  // Annahme durch den Provider (message_id) — das ist die ehrliche Grenze dieses Nachweises.
  test('C · Meldung landet mit Text in der DB UND als Mail im Sendeprotokoll', async ({ page }) => {
    test.skip(!RUN_SAMMELSTELLE, 'RUN_SUPPORT_SAMMELSTELLE=1 — erst nach Deploy von #5941')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Service-Role-Zugang fehlt (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    const db = createClient(url, key, { auth: { persistSession: false } })

    // Eindeutiger Marker: damit die DB-Gegenprobe GENAU diese Meldung findet, nicht irgendeine.
    const marker = `SMOKE-5941-${Date.now()}`
    const text = `Regel-4-Smoke ${marker} — bitte ignorieren. Prüft, ob der Text in der DB und die Mail im Sendeprotokoll ankommt.`

    await login(page, KONTEN.makler.email, KONTEN.makler.pass)
    const knopf = page.getByRole('button', { name: SUPPORT_KNOPF })
    await expect(knopf).toBeVisible({ timeout: 30_000 })

    const antwort = page.waitForResponse(
      (r) => r.url().includes('/api/support/chat') && r.request().method() === 'POST',
      { timeout: 60_000 },
    )
    await knopf.click()
    const eingabe = page.getByRole('textbox').last()
    await expect(eingabe).toBeVisible({ timeout: 20_000 })
    await eingabe.fill(text)
    await eingabe.press('Enter')
    const status = (await antwort).status()
    console.log(`[C] POST /api/support/chat → HTTP ${status}`)
    expect(status).toBe(200)

    // (1) Text in der DB — expect.poll, weil das Protokoll nach der Antwort geschrieben wird.
    let logZeile: { id: string; meldung_text: string | null; linear_issue_id: string | null } | null = null
    await expect.poll(async () => {
      const { data } = await db
        .from('support_ticket_log')
        .select('id, meldung_text, linear_issue_id')
        .ilike('meldung_text', `%${marker}%`)
        .order('created_at', { ascending: false })
        .limit(1)
      logZeile = data?.[0] ?? null
      return logZeile?.meldung_text ?? null
    }, { timeout: 30_000, message: 'meldung_text muss den Marker tragen' }).toContain(marker)
    console.log(`[C] support_ticket_log.meldung_text: ✓ (Linear-Ticket: ${logZeile!.linear_issue_id ?? 'keins — Key fehlt, Text trotzdem da'})`)

    // (2) Mail im Sendeprotokoll — Provider hat angenommen (message_id), kein Fehler.
    let mail: { status: string | null; message_id: string | null; fehler: string | null; empfaenger: string } | null = null
    await expect.poll(async () => {
      const { data } = await db
        .from('email_log')
        .select('status, message_id, fehler, empfaenger, created_at')
        .eq('template', 'support-meldung')
        .order('created_at', { ascending: false })
        .limit(1)
      mail = data?.[0] ?? null
      // Nur Zeilen der letzten 2 Minuten zaehlen — sonst traefe ein alter Eintrag.
      const frisch = mail && Date.now() - new Date((data![0] as any).created_at).getTime() < 120_000
      return frisch ? mail!.message_id : null
    }, { timeout: 45_000, message: 'email_log braucht eine frische support-meldung mit message_id' }).toBeTruthy()
    console.log(`[C] email_log: status=${mail!.status} an=${mail!.empfaenger} fehler=${mail!.fehler ?? 'keiner'}`)
    expect(mail!.fehler, 'Mailversand darf keinen Fehler protokollieren').toBeNull()

    // Residue: die eigene Zeile entfernen — nachgezaehlt in einem ZWEITEN Aufruf (eine CTE
    // saehe ihren eigenen Snapshot; gelernt am 09.09.).
    const { error } = await db.from('support_ticket_log').delete().eq('id', logZeile!.id)
    if (error) console.log(`[C] ⚠ Cleanup fehlgeschlagen: ${error.message}`)
    const { count } = await db.from('support_ticket_log').select('id', { count: 'exact', head: true }).ilike('meldung_text', `%${marker}%`)
    console.log(`[C] Residue nach Cleanup: ${count ?? '?'}`)
  })
})
