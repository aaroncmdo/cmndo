// Regel-4-Prod-Smoke: Kein fixes Overlay verdeckt einen CTA, ein Formularfeld oder eine
// Wizard-Antwort (Design-Aufnahme 05.09.2026, impeccable, PR kitta/copy-audit-design-d1).
//
// Soll: Wer landet, kann den ersten Knopf drücken. Auf 390x844 liegt der Hero-CTA der
// Startseite nicht unter der Kontaktleiste; im /check-Wizard sind alle vier Antworten
// tippbar; auf 1280x720 (die haeufigste Laptop-Klasse) und 1440x900 deckt weder die
// Kontaktleiste noch das ProvenExpert-Siegel Name/Telefon/PLZ oder den Absende-Knopf des
// Lead-Formulars auf der Stadtseite Koeln. Die Footer-Ueberschriften springen nicht mehr
// von h2 auf h4 (war auf 244 von 267 gemessenen Seiten der einzige Heading-Sprung).
//
// Gemessen wird das VERHALTEN: document.elementFromPoint() auf drei Punkten jedes Ziels —
// dieselbe Messung, mit der die Blockaden gefunden wurden (C:/pwtool/overlay-precise.mjs).
// Vorher (04./05.09., prod): Startseite mobil 1 verdeckt, Koeln laptop 3, /check mobil 1.
//
// Positivkontrolle: ein kuenstliches fixes Element wird ueber den CTA gelegt — derselbe
// Messpfad muss es als Blocker melden, sonst beweist eine Null nichts.
//
// Run: PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test service-pitch-overlays-klickbar --project=marketing
import { test, expect, type Page } from '@playwright/test'

type Blockade = { ziel: string; durch: string }

/** Ziele, die an drei Punkten von etwas anderem als sich selbst getroffen werden. */
async function verdeckteZiele(page: Page, selektoren: string[]): Promise<Blockade[]> {
  return page.evaluate((sels) => {
    const fixedAncestor = (el: Element | null) => {
      for (let e = el as HTMLElement | null; e && e !== document.body; e = e.parentElement) {
        const pos = getComputedStyle(e).position
        if (pos === 'fixed' || pos === 'sticky') return e
      }
      return null
    }
    const name = (e: Element) =>
      e.tagName.toLowerCase() +
      (typeof (e as HTMLElement).className === 'string' && (e as HTMLElement).className
        ? '.' + (e as HTMLElement).className.trim().split(/\s+/).slice(0, 3).join('.')
        : '')
    const out: { ziel: string; durch: string }[] = []
    for (const el of document.querySelectorAll<HTMLElement>(sels.join(','))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // Unter dem sticky Header (65 px) liegt beim Scrollen jedes Element einmal — das ist
      // normales Scrollen, kein Overlay-Fehler. Gemessen wird nur, was frei im Viewport steht.
      if (r.top < 70) continue
      const label = (el.innerText || el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50)
      const punkte: [number, number][] = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + 10, r.top + r.height / 2],
        [r.right - 10, r.top + r.height / 2],
      ]
      for (const [x, y] of punkte) {
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue // ausserhalb: nicht messbar
        const hit = document.elementFromPoint(x, y)
        if (!hit || el.contains(hit) || hit.contains(el)) continue
        const fa = fixedAncestor(hit)
        if (!fa) continue
        out.push({ ziel: label, durch: name(fa) })
        break
      }
    }
    return out
  }, selektoren)
}

async function laden(page: Page, pfad: string) {
  await page.goto(pfad, { waitUntil: 'load' })
  await page.waitForTimeout(3000) // Kontaktleiste + Siegel + Hydration
}

test.describe('Startseite 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('Hero-CTAs liegen nicht unter der Kontaktleiste', async ({ page }) => {
    await laden(page, '/')
    const cta = page.getByRole('link', { name: /Lassen Sie uns mit der Versicherung reden/ })
    await cta.waitFor({ state: 'visible', timeout: 20_000 })
    await cta.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    expect(await verdeckteZiele(page, ['[data-tracking$="-hero"]', '[data-tracking^="hero-"]'])).toEqual([])
  })

  test('Positivkontrolle: ein kuenstliches Overlay wird als Blocker erkannt', async ({ page }) => {
    await laden(page, '/')
    const cta = page.getByRole('link', { name: /Lassen Sie uns mit der Versicherung reden/ })
    await cta.scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-tracking="hero-wizard-cta"]')!
      const r = el.getBoundingClientRect()
      const deckel = document.createElement('div')
      deckel.id = 'smoke-deckel'
      deckel.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:99999;background:rgba(255,0,0,.3)`
      document.body.appendChild(deckel)
    })
    const treffer = await verdeckteZiele(page, ['[data-tracking="hero-wizard-cta"]'])
    expect(treffer.map((t) => t.durch)).toContain('div')
  })
})

test.describe('/check 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('alle vier Antworten sind tippbar (Kontaktleiste weicht)', async ({ page }) => {
    await laden(page, '/check')
    await page.getByRole('button', { name: /Der Unfallgegner/ }).waitFor({ state: 'visible', timeout: 20_000 })
    expect(await verdeckteZiele(page, ['[data-sticky-bar-avoid] button'])).toEqual([])
  })
})

// Breiten aus der Prod-Messung vom 05.09.: das ProvenExpert-Siegel verdeckte Felder auf
// 768, 1280 und (auf der Stadtseite) 1440; mobil traf es die LP. Seit dem Wechsel auf
// `pointer-events: none` (globals.css) ist es ueberall sichtbar und faengt keine Klicks —
// deshalb pruefen wir jetzt die ganze Reihe, nicht nur die zwei Laptop-Klassen.
for (const vp of [
  { name: 'mobil 390x844', width: 390, height: 844 },
  { name: 'tablet 768x1024', width: 768, height: 1024 },
  { name: 'laptop 1280x720', width: 1280, height: 720 },
  { name: 'desktop 1440x900', width: 1440, height: 900 },
]) {
  test.describe(`Stadtseite Koeln ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('Lead-Formular: Felder und Absenden liegen frei', async ({ page }) => {
      await laden(page, '/kfz-gutachter/koeln')
      const submit = page.locator('[data-tracking^="lead-form"] button[type="submit"]').first()
      await submit.waitFor({ state: 'visible', timeout: 20_000 })
      // In Etappen scrollen: die Kollision entsteht beim Scrollen, nicht nur beim Laden.
      for (const y of [0, 200, 400, 600, 800]) {
        await page.evaluate((v) => window.scrollTo(0, v), y)
        await page.waitForTimeout(500)
        const treffer = await verdeckteZiele(page, [
          '[data-tracking^="lead-form"] input',
          '[data-tracking^="lead-form"] button[type="submit"]',
        ])
        expect(treffer, `scrollY=${y}`).toEqual([])
      }
    })
  })
}

test('Heading-Reihenfolge ohne Sprung — der Footer meldet sich als h2, nicht als h4', async ({ page }) => {
  await laden(page, '/faq')
  const { spruenge, footerEbenen } = await page.evaluate(() => {
    const sichtbar = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(sichtbar)
    const spruenge: string[] = []
    let prev = 0
    for (const h of hs) {
      const l = Number(h.tagName[1])
      if (prev && l > prev + 1) spruenge.push(`h${prev}→h${l} "${(h.textContent || '').trim().slice(0, 30)}"`)
      prev = l
    }
    const footerEbenen = [...document.querySelectorAll('footer h1,footer h2,footer h3,footer h4,footer h5,footer h6')].map((h) => h.tagName)
    return { spruenge, footerEbenen }
  })
  expect(footerEbenen.length, 'der Footer muss Spaltenueberschriften haben').toBeGreaterThan(0)
  expect(footerEbenen.filter((e) => e === 'H4')).toEqual([])
  expect(spruenge).toEqual([])
})
