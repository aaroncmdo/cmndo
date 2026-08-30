// Regel-4-Waechter: tragen die Seiten, die KI-Crawler tatsaechlich lesen, einen
// buchbaren Termin — mit der URL als sichtbarem TEXT?
//
// WARUM DIESE SEITEN: Der nginx-Zugriffslog (25.–27.08.2026) zeigt, welche Seiten
// ChatGPT & Co. von SELBST holen. Die Stadtseiten gehoeren NICHT dazu — die werden nur
// aufgerufen, wenn ein Nutzer die URL ausdruecklich nennt. Gelesen werden die
// Fachseiten: /haftpflicht/*, /wissen/*, /decoder/*, /schadensreport-2026.
//
// Genau die trugen bis #5652/#5667 null Termine. Die gesamte Buchbarkeit lag auf den
// Seiten, die ein Modell von allein nie ansteuert.
//
// Run: CI=1 npx playwright test termine-auf-ki-seiten --project=chromium

import { test, expect } from '@playwright/test'

const MARKETING = process.env.MARKETING_BASE_URL ?? 'https://claimondo.de'
const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.claimondo.de'

// ⚠ SERIELL, und mit mehr Zeit je Test.
//
// Am 30.08. gemessen: dieselbe Anfrage an `/` brauchte zwischen **1,4 s und 20,5 s** —
// isoliert 6 von 6 gruen, im vollen Lauf (8 Tests parallel) aber sporadisch rot. Nicht
// der Test schwankt, sondern die Antwortzeit des Servers; acht gleichzeitige Requests
// druecken die groesste Seite (464 KB) ueber den 30-s-Default.
//
// Serieller Lauf ist hier ohnehin richtig: Der Waechter misst einen FREMDEN, produktiven
// Server. Ihn mit acht parallelen Abrufen zu belegen verfaelscht die eigene Messung und
// belastet prod ohne Not. Kostet ~15 s mehr Laufzeit — ein Waechter, der sporadisch
// grundlos rot ist, kostet mehr: er wird weggeklickt statt gelesen.
test.describe.configure({ mode: 'serial' })
test.setTimeout(60_000)

// Je eine Seite pro Einbaustelle — nicht alle 18, das waere Laufzeit ohne Erkenntnis.
const SEITEN = [
  // ⭐ Die STARTSEITE fehlte hier bis zum 28.08. — und genau deshalb blieb ihr Mangel
  // unentdeckt: Sie lieferte 464 KB HTML ohne eine einzige buchbare Tatsache (keine
  // Uhrzeit, keine URL im Text). Der VerfuegbarkeitStreifen war da, aber seine URL
  // steckte im `href` und seine Zeitangabe war ein blosses Datum.
  //
  // Ein Waechter, der die wichtigste Seite auslaesst, ist genau so viel wert wie der
  // Deeplink-Smoke, der `schadenart` nie an eine URL haengte.
  { pfad: '/', quelle: 'Startseite' },
  { pfad: '/haftpflicht/wertminderung', quelle: 'SpokeCtaBand (18 Seiten)' },
  { pfad: '/kfz-gutachter/vermittlungsportale-vergleich', quelle: 'RatgeberStaedteSection (9 Seiten)' },
  { pfad: '/decoder/reparatur-unwirtschaftlich', quelle: 'decoder/[slug]' },
  { pfad: '/schadensreport-2026', quelle: 'Report-Seite' },
  // ⭐ Nachgezogen 28.08., zweite Runde derselben Luecke. Beide trugen eine Uhrzeit
  // (bzw. gar nichts), aber KEINE buchbare URL:
  //
  //   /kfz-gutachter   ist laut zweier ChatGPT-Laeufe vom 24.08. GENAU die Seite, die ein
  //                    Modell bei „Kfz-Gutachter <Stadt>" oeffnet — es zitierte sie, nicht
  //                    die Stadtseite. Sie nutzt den VerfuegbarkeitStreifen, dessen URL im
  //                    `href` steckt.
  //   /versicherer/*   13 Seiten, die die qualifizierteste Frage ueberhaupt bedienen
  //                    („<Versicherer> Schaden melden" = Schaden da, Gegner bekannt) und
  //                    weder Uhrzeit noch URL trugen.
  { pfad: '/kfz-gutachter', quelle: 'Pillar-Seite — was ein LLM bei „Kfz-Gutachter <Stadt>" oeffnet' },
  { pfad: '/versicherer/huk-coburg-allgemeine', quelle: 'versicherer/[slug] (13 Seiten)' },
  // Die Uebersicht selbst war die EINZIGE ihrer Art ohne Termin-Band: /wissen, /decoder
  // und /sachverstaendige binden dafuer SpokeCtaBand ein, /versicherer nie.
  { pfad: '/versicherer', quelle: 'Versicherer-Uebersicht (SpokeCtaBand nachgezogen)' },
]

for (const { pfad, quelle } of SEITEN) {
  test(`${pfad} traegt einen buchbaren Termin — ${quelle}`, async ({ request }) => {

    // ⚠ Die rohe HTTP-Antwort, KEIN Browser-DOM.
    //
    // Erste Fassung: `page.innerText('body')` — sah den Block nicht, weil er unterhalb
    // des Viewports lag und innerText nur GERENDERTES Layout liefert. Vier Seiten wurden
    // als „Block FEHLT" gemeldet, obwohl er auf allen vieren stand.
    //
    // Zweite Fassung: `page.content()` nach `waitUntil: 'domcontentloaded'` — behob das,
    // war aber FLAKY. Am 30.08. gesehen: Startseite erst rot, im Retry gruen. Grund ist
    // das Streaming — der Termin-Block haengt in einem <Suspense>, und
    // `domcontentloaded` feuert, bevor der Stream durch ist. Gegenprobe: 12 von 12
    // curl-Abrufen trugen den Block. Also kein Produktfehler, sondern ein Messfehler.
    //
    // Jetzt: die vollstaendige HTTP-Antwort. Genau das liest ein Crawler — er fuehrt
    // kein JS aus, wartet auf kein Hydration-Event und scrollt nicht. Damit ist der Test
    // zugleich praeziser (echte Crawler-Sicht) und stabil (kein Browser-Timing).
    const res = await request.get(`${MARKETING}${pfad}`)
    expect(res.status(), 'Seite muss erreichbar sein').toBe(200)
    const text = (await res.text())
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')

    // Kein Termin frei (Nacht, Feiertag, Netz leer) → nichts zu pruefen. Bewusst skip
    // statt rot: die Abwesenheit eines Termins ist kein Defekt, und ein regelmaessig
    // grundlos roter Waechter wird weggeklickt statt gelesen.
    //
    // ⚠ Die Bedingung haengt an der DATENLAGE (Termin-API), NICHT mehr am Text der Seite.
    //
    // Vorher stand hier `!text.includes('Nächste freie Vor-Ort-Termine')` — also genau
    // das, was der Test beweisen soll. Eine Seite OHNE den Block wurde dadurch
    // uebersprungen statt rot: sie sah aus wie „gerade kein Termin frei". Am 28.08. beim
    // Aufnehmen von /versicherer/[slug] gesehen — die Seite tauchte im Lauf gar nicht
    // auf, obwohl ihr der Block fehlte. Ein spaeter entfernter Block waere genauso
    // stillschweigend durchgegangen. (Vgl. „Zwischenzustaende, die wie Erfolg aussehen".)
    //
    // Jetzt: liefert die API einen Termin, MUSS die Seite ihn zeigen.
    const api = await request.get(`${APP}/api/v1/gutachter-termine?ort=K%C3%B6ln`)
    const termineDa =
      api.ok() && (((await api.json()) as { gutachter?: Array<{ termine?: unknown[] }> })
        .gutachter ?? []).some((g) => (g.termine ?? []).length > 0)
    test.skip(
      !termineDa,
      'Termin-API liefert gerade keinen freien Slot — nichts zu pruefen',
    )

    // Die URL muss als TEXT dastehen. Im href allein erreicht sie kein LLM: das Web-Tool
    // ersetzt `<a href>` durch eine nummerierte Referenz und verliert den Zielwert.
    //
    // ⭐ Seit dem 28.08. wird die BUCHBARE URL erwartet, nicht mehr die Stadtseite.
    // Zuvor stand hier `/kfz-gutachter/<slug>` — ein Modell konnte den Termin damit zwar
    // nennen, aber nicht buchbar machen: der Nutzer landete auf der Stadtseite und musste
    // erneut suchen. Der Log zeigte 3.110 erfolgreiche Inhaltsabrufe von `ChatGPT-User`,
    // ganz oben genau diese Fachseiten — also dort, wo der Umweg wehtut. (Die Zahl zaehlt
    // nur 200er auf echte Seiten; die rohe Trefferzahl enthielt Assets und Scan-Rauschen
    // mit gefaelschtem User-Agent.)
    //
    // Bewusst STRENGER als „irgendeine URL": `sv=` und `slot=` muessen dran sein, sonst
    // ist es kein Deeplink, sondern wieder ein Zwischenschritt. Genau diese Unschaerfe hat
    // beim schadenart-Parameter drei Tage gekostet — ein Test findet nur, wonach er greift.
    expect(
      text,
      'die BUCHBARE URL muss als Fliesstext dastehen (mit sv= und slot=), nicht nur im href',
    ).toMatch(/https:\/\/claimondo\.de\/gutachter-finden\?[^\s]*sv=[^\s]*slot=/)

    // Und eine Uhrzeit — ein Termin ohne Zeit ist keine Terminangabe.
    expect(text, 'der Termin muss eine Uhrzeit nennen').toMatch(/\d{1,2}:\d{2} Uhr/)
  })
}
