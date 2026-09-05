// Regel-4-Prod-Smoke: B2C-Lead-Copy im GERENDERTEN Text (05.09.2026, Branch kitta/copy-audit-b2c-lead-copy).
//
// Soll: Ein Geschaedigter sieht auf Startseite, Stadtseite, im Check und in der Schadenmeldung
// zuerst, was er bekommt (eigener Gutachter, 0 Euro, Termin in unter 48 Stunden, Rueckruf in
// 15 Minuten) und nirgends Zahlen ohne Beleg ("2.000+", "8 Mio."). Das Rueckruf-Formular heisst,
// was es ist (Rueckruf), nicht "Schaden melden". Der Check fuehrt mit echten Klicks zur
// Auswertung, deren Text die Partnerkanzlei als handelnde Instanz nennt.
//
// Gemessen wird innerText (was ein Mensch sieht), plus die Meta-Description der Schadenmeldung.
// Positivkontrolle: derselbe Messpfad findet einen injizierten Vorher-Satz.
//
// Run: PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test service-pitch-b2c-lead-copy --project=marketing
import { test, expect, type Page } from '@playwright/test'

const UNBELEGT = /2\.000\+|2,000\+|8 Mio|€8M|8 mln|8 млн|8 مليون|4–6 Monate Branchen/

async function sichtbarerText(page: Page, pfad: string): Promise<string> {
  const res = await page.goto(pfad, { waitUntil: 'domcontentloaded' })
  expect(res?.status(), `${pfad} muss erreichbar sein`).toBe(200)
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  let last = -1
  for (let i = 0; i < 10; i++) {
    const len = await page.evaluate(() => (document.body.innerText || '').length)
    if (len === last && len > 500) break
    last = len
    await page.waitForTimeout(600)
  }
  return page.evaluate(() => document.body.innerText || '')
}

test.describe('B2C-Lead-Copy auf prod (gerendert)', () => {
  test('Startseite: Hero nennt eigenen Gutachter, 0 Euro und 48 Stunden; Formular heisst Rueckruf', async ({ page }) => {
    const text = await sichtbarerText(page, '/')
    expect(text).toContain('Ihr eigener Gutachter. 0 € für Sie.')
    expect(text).toContain('Termin in unter 48 Stunden')
    expect(text).toContain('Rückruf anfordern – wir sagen Ihnen, was Ihnen zusteht')
    expect(text).toContain('Kostenlosen Rückruf anfordern')
    expect(text).toContain('Sie entscheiden nach dem Gespräch')
    expect(text).not.toMatch(UNBELEGT)
    expect(text).not.toContain('Schaden melden in 30 Sekunden')
  })

  for (const pfad of ['/kfz-gutachter/koeln', '/vorteile', '/kfzgutachter-lp', '/en', '/tr']) {
    test(`${pfad}: keine unbelegten Zahlen im sichtbaren Text`, async ({ page }) => {
      const text = await sichtbarerText(page, pfad)
      expect(text.length).toBeGreaterThan(500)
      expect(text).not.toMatch(UNBELEGT)
    })
  }

  test('Stadtseite Koeln: Hero-Subheadline ohne Verb-Reihung, mit Partnerkanzlei', async ({ page }) => {
    const text = await sichtbarerText(page, '/kfz-gutachter/koeln')
    expect(text).toContain('Ihr unabhängiger Gutachter kommt zu Ihnen, meist in unter 48 Stunden.')
    expect(text).not.toContain('führen die Versicherungs-Verhandlung')
    expect(text).toContain('Termin in unter 48 Stunden. Der Gutachter kommt zu Ihnen.')
  })

  test('/check: drei echte Klicks bis zur Auswertung, Rueckruf-Box mit 15-Minuten-Zusage', async ({ page }) => {
    await page.goto('/check', { waitUntil: 'domcontentloaded' })
    for (const name of [/Noch unklar/, /Vor weniger als 1 Woche/, /Nein, noch nicht/]) {
      const knopf = page.getByRole('button', { name }).first()
      await knopf.waitFor({ state: 'visible', timeout: 20_000 })
      await knopf.click()
    }
    await expect(page.getByRole('heading', { name: /Da ist oft mehr drin/ })).toBeVisible({ timeout: 20_000 })
    const text = await page.evaluate(() => document.body.innerText || '')
    expect(text).toContain('Unsere Partnerkanzlei prüft den Hergang und sichert Ihre Ansprüche')
    expect(text).toContain('Jetzt kostenlos prüfen lassen, was Ihnen zusteht')
    expect(text).toContain('Ein Berater ruft Sie in 15 Minuten an')
    expect(text).not.toContain('wir klären sie mit Anwalt')
  })

  test('/schaden-melden: Untertitel, Optionstext und Meta-Description', async ({ page }) => {
    const text = await sichtbarerText(page, '/schaden-melden')
    expect(text).toContain('Dort wählen Sie den Gutachter-Termin und unterschreiben die Vollmacht')
    expect(text).toContain('Das klären wir gemeinsam mit Ihnen und unserer Partnerkanzlei.')
    expect(text).not.toContain('unseren Anwälten')
    const meta = await page.locator('meta[name="description"]').getAttribute('content')
    expect(meta).toContain('sicheren Link per WhatsApp oder E-Mail')
  })

  test('Positivkontrolle: injizierter Vorher-Satz wird vom selben Messpfad gefunden', async ({ page }) => {
    await sichtbarerText(page, '/')
    await page.evaluate(() => {
      const p = document.createElement('p')
      p.textContent = 'Über 2.000+ vermittelte Schadensfälle und 8 Mio. €+ Schadensersatz durchgesetzt.'
      document.body.appendChild(p)
    })
    const text = await page.evaluate(() => document.body.innerText || '')
    expect(text).toMatch(UNBELEGT)
  })
})
