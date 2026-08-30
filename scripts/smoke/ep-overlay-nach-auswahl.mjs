// Misst auf ALLEN Lead-Formularen von claimondo.de, ob die Ortsvorschlagsliste NACH einer
// Auswahl den Absende-Button verdeckt (die Klasse aus PR #5744).
//
// Gemessen wird das VERHALTEN: document.elementFromPoint auf der Button-Mitte — also was ein
// echter Klick treffen wuerde, nicht was im Markup steht. Kein Absenden: es entsteht kein Lead.
//
// Aufruf: node scripts/smoke/ep-overlay-nach-auswahl.mjs [--base=https://claimondo.de]

import { chromium } from 'playwright'

const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '--base=https://claimondo.de').split('=').slice(1).join('=')
const EINGABE = 'Domkloster 4, 50667 Köln'

const SEITEN = [
  { name: 'Startseite',            pfad: '/' },
  { name: 'Stadtseite Köln',       pfad: '/kfz-gutachter/koeln' },
  { name: 'Ads-Landing',           pfad: '/kfzgutachter-lp' },
  { name: 'Anspruchs-Check',       pfad: '/check' },
  { name: 'Mini-Wizard',           pfad: '/schaden-melden' },
]

const browser = await chromium.launch()
const ergebnisse = []

for (const s of SEITEN) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const zeile = { seite: s.name, pfad: s.pfad }
  try {
    await page.goto(BASE + s.pfad, { waitUntil: 'networkidle', timeout: 60_000 })

    // /check versteckt das Formular hinter 3 Fragen — erst durchklicken.
    if (s.pfad === '/check') {
      for (let i = 0; i < 3; i++) {
        const opt = page.locator('button[type="button"]').filter({ hasText: '›' }).first()
        await opt.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
        if (await opt.count()) { await opt.click(); await page.waitForTimeout(700) }
      }
      await page.waitForTimeout(1200)
    }

    // Das Ortsfeld: der Text-Input, der KEIN Name/Telefon ist.
    const ort = page.locator('input[type="text"]:visible, input:not([type]):visible').last()
    if (!(await ort.count())) { zeile.status = 'kein Ortsfeld gefunden'; ergebnisse.push(zeile); await page.close(); continue }

    await ort.click()
    await ort.fill('')
    await ort.type(EINGABE, { delay: 55 })
    await page.waitForTimeout(2500)

    const vorschlaege = page.locator('button[type="button"].text-left')
    zeile.angeboten = await vorschlaege.count()
    if (!zeile.angeboten) { zeile.status = 'keine Vorschlaege'; ergebnisse.push(zeile); await page.close(); continue }

    await vorschlaege.first().click()
    await page.waitForTimeout(1500)
    zeile.offenNachAuswahl = await vorschlaege.count()

    const submit = page.locator('button[type="submit"]:visible').first()
    if (!(await submit.count())) { zeile.status = 'kein Submit-Button'; ergebnisse.push(zeile); await page.close(); continue }

    // ⚠ ZUERST in den sichtbaren Bereich scrollen. Liegt der Button darunter (Startseite:
    // y=915 bei 900px Viewport), liefert elementFromPoint fuer Koordinaten ausserhalb des
    // Viewports NICHTS — und ein leeres Ergebnis liest sich wie "verdeckt". Genau dieser
    // Falschbefund entstand beim ersten Lauf (29.08.).
    await submit.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)

    zeile.treffer = await submit.evaluate((btn) => {
      const r = btn.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { frei: el === btn || btn.contains(el), text: (el?.textContent ?? '').trim().slice(0, 45) }
    })
    zeile.status = zeile.treffer.frei ? 'FREI' : 'VERDECKT'
  } catch (e) {
    zeile.status = 'FEHLER: ' + String(e.message).split('\n')[0].slice(0, 70)
  }
  ergebnisse.push(zeile)
  await page.close()
}

await browser.close()

console.log(`\nOverlay nach Ortswahl — ${BASE}\n`)
for (const r of ergebnisse) {
  const kern = r.status === 'VERDECKT'
    ? `🔴 VERDECKT — Klick traefe "${r.treffer.text}"`
    : r.status === 'FREI' ? '✅ frei' : `⚪ ${r.status}`
  console.log(`  ${r.seite.padEnd(20)} ${String(r.angeboten ?? '-').padStart(2)} angeboten, ${String(r.offenNachAuswahl ?? '-').padStart(2)} nach Auswahl offen   ${kern}`)
}
