// Regel-4-Waechter: zeigt das Vorschaubild (`og:image`) auf etwas, das es GIBT?
//
// WARUM ES DIESEN TEST GIBT: Am 28.08.2026 im nginx-Log gezaehlt — `/og-default.png`
// wurde **405-mal** angefragt und lieferte jedes Mal 404. Die Datei existierte nie im
// `public/`-Ordner, wurde aber in 30 Dateien referenziert, darunter `layout.tsx` (gilt
// damit fuer JEDE Seite) und `jsonld.ts`.
//
// ⭐ Der Fehler war seit Wochen bekannt — in EINER Datei stand sogar ein Kommentar
// daneben („das frueher hier hardcodierte /og-default.png existiert nicht (404)"). Nur
// wurde er dort behoben und in den 29 anderen nicht. Genau dafuer ist ein Waechter da:
// eine Einzelkorrektur ohne Waechter schuetzt nur die eine Datei.
//
// Ein totes og:image ist teuer und dabei unsichtbar: jede geteilte Seite (WhatsApp,
// LinkedIn, Slack) zeigt eine leere Vorschau, und die 404-Seite liefert 182 KB HTML
// statt eines Bildes. Es faellt nirgends auf — kein Build bricht, keine Seite sieht
// anders aus, kein Log ausser dem Zugriffslog vermerkt es.
//
// Run: CI=1 npx playwright test og-image-erreichbar --project=chromium

import { test, expect } from '@playwright/test'

const MARKETING = process.env.MARKETING_BASE_URL ?? 'https://claimondo.de'

// Je eine Seite pro Metadaten-Quelle: layout.tsx (greift ueberall), eine Seite mit
// eigenem `openGraph`-Block, und eine mit dynamisch erzeugten Metadaten.
const SEITEN = ['/', '/vorteile', '/kfz-gutachter/kosten']

for (const pfad of SEITEN) {
  test(`${pfad}: og:image ist erreichbar und ein Bild`, async ({ page, request }) => {
    const res = await page.goto(`${MARKETING}${pfad}`, { waitUntil: 'domcontentloaded' })
    expect(res?.status(), 'Seite muss erreichbar sein').toBe(200)

    const url = await page.getAttribute('meta[property="og:image"]', 'content')
    expect(url, `${pfad}: kein og:image im HTML`).toBeTruthy()

    // Absolut machen — Next gibt je nach Konfiguration relativ oder absolut aus.
    const ziel = url!.startsWith('http') ? url! : `${MARKETING}${url}`

    const bild = await request.get(ziel)
    expect(bild.status(), `${pfad}: og:image ${ziel} liefert ${bild.status()}`).toBe(200)

    // ⚠ Der Statuscode allein reicht NICHT: eine Next-404-Seite antwortet zwar mit 404,
    // aber eine falsch konfigurierte Route koennte auch 200 mit HTML liefern. Ein
    // Vorschaubild, das in Wahrheit eine HTML-Seite ist, ist genauso kaputt — nur
    // schwerer zu sehen. Deshalb den Content-Type mitpruefen.
    const typ = bild.headers()['content-type'] ?? ''
    expect(typ, `${pfad}: og:image ist kein Bild, sondern "${typ}"`).toMatch(/^image\//)
  })
}
