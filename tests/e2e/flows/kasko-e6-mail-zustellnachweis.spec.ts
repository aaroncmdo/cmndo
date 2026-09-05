// Kasko-Werkstattbindung E6: die Bindungs-Mail wurde WIRKLICH ZUGESTELLT — belegt durch Resend.
//
// OPERATIVES SOLL (vor dem Code formuliert, Regel 4 Schritt 1):
//   Ein selbstverschuldeter Kunde mit Kasko nennt im FlowLink Versicherer und Tarif, bestaetigt die
//   Angabe und landet auf der ehrlichen Endseite. Die Bindungs-Mail geht raus UND kommt beim
//   Empfaenger-Server an. „Rausgegangen" ist nicht dasselbe wie „angekommen": ein Tippfehler in der
//   Kundenadresse sieht in unserer Oberflaeche identisch aus wie eine erfolgreiche Zustellung.
//
// WARUM DIESE SPEC NEBEN kasko-e6-mail-abnahme-inbox.spec.ts EXISTIERT:
//   Die Schwester-Spec liest die Mail per IMAP aus dem Postfach — sie beweist den INHALT, braucht dafuer
//   aber Postfach-Zugangsdaten und skippt ohne sie. Diese Spec beweist die ZUSTELLUNG und braucht kein
//   Postfach: Resend meldet den Zustellstatus per Webhook, und seit dem Zustellnachweis-PR traegt
//   email_log.status ihn ein (vorher standen 542 Mails aus 30 Tagen auf 'sent' und KEINE auf zugestellt).
//   Die beiden Nachweise sind komplementaer: Inhalt vs. Ankunft.
//
// ⚠ SCHREIBT EINEN ECHTEN LEAD AUF PROD und loest eine echte Mail aus -> steht in MANUELLE_LIVE_SMOKES
// (playwright.config.ts) und wird von CI nie eingesammelt. Der Lead wird in afterEach geloescht
// (afterEach, NICHT finally: bei Test-Timeout laeuft ein finally nicht mehr).
//
// Lauf (Zugangsdaten in .env.local, nie im Repo — das Repo ist oeffentlich):
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/kasko-e6-mail-zustellnachweis.spec.ts

import { test, expect, type Page } from '@playwright/test'
import { ZIEL } from '../lib/ziel'
import { abnahmeAdresse } from '../lib/abnahme-inbox'
import { loescheLeadMitAnhang, seedeLeadUndFlowLink, serviceClient } from '../lib/seed-lead-flowlink'

const MARKE = 'HUK-COBURG'
const TARIF = 'Classic SELECT'
const TEMPLATE = 'kasko_werkstattbindung_kunde'

/** Zustaende, nach denen sich nichts mehr aendert — bei ihnen lohnt kein weiteres Warten. */
const TERMINAL = new Set(['delivered', 'bounced', 'complained', 'failed'])

async function consentUndWeiter(page: Page): Promise<void> {
  for (const cb of await page.getByRole('checkbox').all()) {
    if (!(await cb.isChecked())) await cb.check()
  }
  await page.getByRole('button', { name: /^weiter/i }).first().click()
}

// Rollenbasiert (getByRole/getByText), keine data-testids — prod deployt von main, testids liegen oft
// nur auf staging (regel4-smoke). `exact` beim Tarif: „Classic" ist ein eigener, FREIER Tarif; ein
// Teilstring-Match waere die Fehlklick-Falle, die den ganzen Nachweis umdreht.
async function waehleMarkeUndTarif(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Kaskoversicherung wählen/i }).click()
  await page.getByPlaceholder('Versicherung suchen …').fill(MARKE)
  await page.getByRole('option', { name: new RegExp(MARKE) }).first().click()
  await page.getByText(TARIF, { exact: true }).click()
}

test.describe('Kasko E6-Mail: Zustellung durch Resend belegt (Regel-4-Nachweis ohne Postfach-Zugang)', () => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY fehlt (Seed des Ausgangszustands)')
  test.setTimeout(8 * 60_000)

  let aufraeumen: { leadId: string; email: string } | null = null
  test.afterEach(async () => {
    if (!aufraeumen) return
    const { leadId, email } = aufraeumen
    aufraeumen = null
    await loescheLeadMitAnhang(serviceClient(), leadId, email)
  })

  test('gebundener Tarif -> Bindungs-Mail erreicht den Empfaenger-Server (email_log.status = delivered)', async ({
    page,
  }) => {
    const db = serviceClient()
    const email = abnahmeAdresse(`e6-zustell-${Date.now()}`)
    const seed = await seedeLeadUndFlowLink(db, { email })
    aufraeumen = { leadId: seed.leadId, email }

    // ── FlowLink per UI: Consent -> „Ich selbst" -> Kasko ja -> Marke/Tarif -> Bestaetigen ──────────
    await page.goto(`${ZIEL}/flow/${seed.token}`, { waitUntil: 'domcontentloaded' })
    await consentUndWeiter(page)
    await page.getByRole('button', { name: /^Ich selbst/i }).click()
    await page.getByRole('button', { name: /Ja, ich habe eine Kaskoversicherung/i }).click()
    await waehleMarkeUndTarif(page)
    await page.getByRole('button', { name: /^Ja, das ist mein Tarif$/ }).click()

    await expect(page.getByRole('heading', { name: /Kasko-Tarif enthält eine Werkstattbindung/ })).toBeVisible({
      timeout: 60_000,
    })

    // ── Schritt 1: die Mail wurde ueberhaupt protokolliert ──────────────────────────────────────
    // Ohne diesen Zwischenschritt waere ein ausbleibendes 'delivered' nicht unterscheidbar von
    // „es wurde nie eine Mail erzeugt" — zwei voellig verschiedene Befunde.
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('email_log')
            .select('id')
            .eq('empfaenger', email)
            .eq('template', TEMPLATE)
          return (data ?? []).length
        },
        { timeout: 120_000, message: `Kein email_log-Eintrag (template=${TEMPLATE}) fuer ${email}` },
      )
      .toBe(1)

    // ── Schritt 2: Resend meldet die Zustellung ─────────────────────────────────────────────────
    // Gewartet wird bis zu einem TERMINALEN Status, nicht blind bis 'delivered'. Ein Bounce (Postfach
    // existiert nicht) waere sonst ein 4-Minuten-Timeout ohne Aussage statt eines klaren Befunds.
    let endStatus = 'unbekannt'
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('email_log')
            .select('status')
            .eq('empfaenger', email)
            .eq('template', TEMPLATE)
            .maybeSingle()
          endStatus = (data?.status as string) ?? 'unbekannt'
          return TERMINAL.has(endStatus)
        },
        {
          timeout: 240_000,
          message:
            'Kein terminaler Zustellstatus. Entweder ist der Resend-Webhook nicht deployed, oder das ' +
            'Webhook-Ziel im Resend-Dashboard zeigt nicht auf /api/webhooks/resend.',
        },
      )
      .toBe(true)

    // 'bounced' heisst hier fast immer: das Abnahme-Postfach existiert nicht (siehe docs/abnahme-inbox.md).
    // Das ist ein echter Befund und keine Test-Huerde — genau diese Klasse war vorher unsichtbar.
    expect(endStatus, `Zustellstatus fuer ${email} war '${endStatus}' statt 'delivered'`).toBe('delivered')
  })
})
