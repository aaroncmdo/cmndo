// Kasko-Werkstattbindung E6: Die Bindungs-Mail kommt beim Kunden an — genau einmal.
//
// OPERATIVES SOLL (vor dem Code formuliert, Regel 4 Schritt 1):
//   Ein selbstverschuldeter Kunde mit Kasko nennt im FlowLink Versicherer (HUK-COBURG) und Tarif
//   („Classic SELECT“, Werkstattbindung), bestaetigt die Angabe und landet auf der ehrlichen Endseite.
//   Er bekommt EINE Mail „Ihr Kasko-Tarif: Werkstattbindung – so geht es weiter“ mit dem, was die Bindung
//   fuer ihn bedeutet, und den naechsten Schritten. Oeffnet er den Link erneut, korrigiert seine Angaben
//   und bestaetigt DENSELBEN Tarif, bekommt er KEINE zweite Mail (Review #5864, Befund 8).
//
// WARUM DIESE SPEC EXISTIERT: Bis zum 05.09.2026 war keine Kunden-Mail im Prod-Smoke nachweisbar — die
// Send-Isolation unterdrueckte Test-Adressen vor dem Log. Mit der Abnahme-Inbox (tests/e2e/lib/abnahme-inbox.ts,
// docs/abnahme-inbox.md) wird die Mail hier wirklich zugestellt und abgeholt.
//
// Lauf (Zugangsdaten in .env.local, nie im Repo):
//   PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/kasko-e6-mail-abnahme-inbox.spec.ts
// Ohne ABNAHME_INBOX_USER/PASS skippt die Spec sauber (kein Crash der Collection).

import { test, expect, type Page } from '@playwright/test'
import { ZIEL } from '../lib/ziel'
import { abnahmeAdresse, abnahmeInboxKonfiguriert, warteAufMail, zaehleMails } from '../lib/abnahme-inbox'
import { loescheLeadMitAnhang, seedeLeadUndFlowLink, serviceClient } from '../lib/seed-lead-flowlink'

const MARKE = 'HUK-COBURG'
const TARIF = 'Classic SELECT'
const BETREFF = 'Ihr Kasko-Tarif: Werkstattbindung'

async function consentUndWeiter(page: Page): Promise<void> {
  for (const cb of await page.getByRole('checkbox').all()) {
    if (!(await cb.isChecked())) await cb.check()
  }
  await page.getByRole('button', { name: /^weiter/i }).first().click()
}

// Tariffrage bedienen: Marke suchen, Tarif-Karte waehlen. Rollenbasiert (getByRole/getByText), keine
// data-testids — prod deployt von main, testids liegen oft nur auf staging (regel4-smoke).
async function waehleMarkeUndTarif(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Kaskoversicherung wählen/i }).click()
  await page.getByPlaceholder('Versicherung suchen …').fill(MARKE)
  await page.getByRole('option', { name: new RegExp(MARKE) }).first().click()
  // exact: „Classic“ ist ein eigener (freier) Tarif — Teilstring-Match waere die Fehlklick-Falle.
  await page.getByText(TARIF, { exact: true }).click()
}

test.describe('Kasko E6-Mail ueber die Abnahme-Inbox (Regel-4-Nachweis fuer Kunden-Mails)', () => {
  test.skip(
    !abnahmeInboxKonfiguriert(),
    'ABNAHME_INBOX_USER/ABNAHME_INBOX_PASS nicht gesetzt — Postfach abnahme@claimondo.de, siehe docs/abnahme-inbox.md',
  )
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY fehlt (Seed des Ausgangszustands)')
  test.setTimeout(8 * 60_000)

  let aufraeumen: { leadId: string; email: string } | null = null
  test.afterEach(async () => {
    if (!aufraeumen) return
    const { leadId, email } = aufraeumen
    aufraeumen = null
    await loescheLeadMitAnhang(serviceClient(), leadId, email)
  })

  test('gebunden -> Bindungs-Mail kommt genau einmal; dieselbe Bestaetigung im Gate schickt keine zweite', async ({ page }) => {
    const db = serviceClient()
    const email = abnahmeAdresse(`e6-kasko-${Date.now()}`)
    const seit = new Date(Date.now() - 2 * 60_000)
    const seed = await seedeLeadUndFlowLink(db, { email })
    aufraeumen = { leadId: seed.leadId, email }

    // ── FlowLink: Consent -> Quali „Ich selbst“ -> Kasko ja -> Marke/Tarif -> Bestaetigen ────────────
    await page.goto(`${ZIEL}/flow/${seed.token}`, { waitUntil: 'domcontentloaded' })
    await consentUndWeiter(page)
    await page.getByRole('button', { name: /^Ich selbst/i }).click()
    await page.getByRole('button', { name: /Ja, ich habe eine Kaskoversicherung/i }).click()
    await waehleMarkeUndTarif(page)
    await page.getByRole('button', { name: /^Ja, das ist mein Tarif$/ }).click()

    // Endseite (nach Reload rendert das Re-Visit-Gate die Bindungs-Endseite ohne Stepper).
    const endseite = page.getByRole('heading', { name: /Kasko-Tarif enthält eine Werkstattbindung/ })
    await expect(endseite).toBeVisible({ timeout: 60_000 })

    // DB-Gegenprobe: Lead gebunden + wegen Werkstattbindung disqualifiziert, Herkunft Tarif.
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('leads')
            .select('freie_werkstattwahl, disqualifiziert, disqualifiziert_grund_key, werkstattbindung_quelle, eigene_kasko_tarif_name')
            .eq('id', seed.leadId)
            .single()
          return data
        },
        { timeout: 30_000 },
      )
      .toMatchObject({
        freie_werkstattwahl: false,
        disqualifiziert: true,
        disqualifiziert_grund_key: 'werkstattbindung',
        werkstattbindung_quelle: 'tarif',
        eigene_kasko_tarif_name: TARIF,
      })

    // ── Mail #1: wirklich zugestellt, mit Inhalt ────────────────────────────────────────────────
    const mail = await warteAufMail({ an: email, betreffEnthaelt: BETREFF, seit, timeoutMs: 180_000 })
    expect(mail.subject).toContain(BETREFF)
    const inhalt = `${mail.text}\n${mail.html}`
    expect(inhalt).toContain('So geht es weiter')
    expect(inhalt).toContain('Versicherungsschein')

    // email_log als zweite Spur: genau ein Eintrag fuer diesen Empfaenger, Template E6.
    const { data: logs } = await db
      .from('email_log')
      .select('template, status')
      .eq('empfaenger', email)
    expect((logs ?? []).filter((l) => l.template === 'kasko_werkstattbindung_kunde')).toHaveLength(1)

    // ── Re-Visit: Angaben korrigieren -> derselbe Tarif -> Ja -> Endseite, aber KEINE zweite Mail ──
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(endseite).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: /Angaben korrigieren/ }).click()
    await waehleMarkeUndTarif(page)
    await page.getByRole('button', { name: /^Ja, das ist mein Tarif$/ }).click()
    await expect(endseite).toBeVisible({ timeout: 60_000 })

    // Nicht-Ereignis messen: dem Versand realistisch Zeit geben, dann zaehlen. Positivkontrolle ist
    // Mail #1 oben — dasselbe Werkzeug hat eine Mail gefunden, eine „0“ hier ist also ein Befund.
    await page.waitForTimeout(75_000)
    expect(await zaehleMails({ an: email, betreffEnthaelt: BETREFF, seit })).toBe(1)
    const { data: logsDanach } = await db.from('email_log').select('template').eq('empfaenger', email)
    expect((logsDanach ?? []).filter((l) => l.template === 'kasko_werkstattbindung_kunde')).toHaveLength(1)
  })
})
