#!/usr/bin/env node
/**
 * Baut den Claimondo-Unfallguide aus docs/unfallguide/unfallguide.html nach
 * claimondo-marketing/public/downloads/claimondo-unfallguide.pdf.
 *
 *   node scripts/build-unfallguide.mjs            # bauen + pruefen
 *   node scripts/build-unfallguide.mjs --check    # nur die bestehende PDF pruefen
 *
 * Warum ueberhaupt ein Skript: die ausgelieferte Fassung war ein Handbau ohne
 * Quelle im Repo. Beim naechsten Textfix (oder bei den Uebersetzungen) haette
 * es nichts zu aendern gegeben. Ab hier ist die HTML die Wahrheit.
 *
 * Die Pruefungen unten sind KEINE Kosmetik - jede faengt einen Fehler, der in
 * der Vorfassung real ausgeliefert wurde:
 *   - Seitenzahl        (die Fassung im Repo hatte 8 statt 5)
 *   - Telefon-Links     (der Weg zum Kunden)
 *   - Web-Link          (war nur ueber einen unsichtbaren QR erreichbar)
 *   - Ueberlappungen    (Fuss auf Seite 4 lag uebereinander)
 *   - Fremdschriften    (Stern/Pfeil fielen auf Segoe UI zurueck)
 */
// @playwright/test, nicht 'playwright': nur ersteres steht in der package.json.
// Ein Import auf 'playwright' waere eine unlisted dependency und blockt check:knip.
import { chromium } from '@playwright/test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..')
const QUELLE = join(wurzel, 'docs/unfallguide/unfallguide.html')
const ZIEL = join(wurzel, 'claimondo-marketing/public/downloads/claimondo-unfallguide.pdf')

const SOLL = {
  seiten: 6,
  telefon: 'tel:+4915153608515',
  telefonMin: 7,
  webLink: 'claimondo.de/gutachter-finden',
  // Zustellgewicht, keine willkuerliche Zahl: der Guide geht per Link und per
  // Messenger raus. Bei 4 Seiten waren 900 kB die Grenze; mit 6 Seiten und dem
  // Titelfoto sind rund 1 MB normal. Reisst es diese Grenze, ist meist ein Bild
  // unkomprimiert hereingerutscht (so geschehen: PNG statt JPEG -> 2,5 MB).
  maxBytes: 1200 * 1024,
}

/**
 * Jede lokal referenzierte Datei muss existieren. Ohne diese Pruefung wird aus
 * einem verschobenen Logo still ein leerer Kasten: Chromium rendert ein fehlendes
 * <img> ohne Fehler, und im fertigen PDF sieht das aus wie Absicht. Der Guide
 * referenziert die Marke bewusst aus claimondo-marketing/public/, damit er der
 * Marke folgt — dieser Preis dafuer ist die Pruefung hier.
 */
function assetsPruefen() {
  const html = readFileSync(QUELLE, 'utf8')
  const refs = [...html.matchAll(/\bsrc="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^(https?:|data:|#)/.test(s))
  const fehlend = refs.filter((r) => !existsSync(join(dirname(QUELLE), r)))
  if (fehlend.length) {
    throw new Error(
      `Referenzierte Datei(en) fehlen — das PDF haette an dieser Stelle ein Loch:\n` +
        fehlend.map((f) => `  - ${f}`).join('\n'),
    )
  }
  console.log(`Assets   ${refs.length} referenziert, alle vorhanden`)

  // titelbild.jpg ist aus dem Markenbild abgeleitet (PNG -> JPEG, sonst 2,5 MB).
  // Aendert sich das Original, muss die Ableitung nachgezogen werden — sonst
  // traegt der Guide still ein veraltetes Titelbild.
  const herkunft = join(dirname(QUELLE), 'titelbild-quelle.txt')
  if (existsSync(herkunft)) {
    const erwartet = /^md5\s*:\s*([0-9a-f]{32})/m.exec(readFileSync(herkunft, 'utf8'))?.[1]
    const original = join(wurzel, 'claimondo-marketing/public/brand/hero-unfall-frau.png')
    if (erwartet && existsSync(original)) {
      const ist = createHash('md5').update(readFileSync(original)).digest('hex')
      if (ist !== erwartet) {
        throw new Error(
          'Das Markenbild brand/hero-unfall-frau.png hat sich geaendert — titelbild.jpg ' +
            'ist veraltet.\n  neu ableiten und die md5 in titelbild-quelle.txt nachziehen.\n' +
            `  erwartet ${erwartet}\n  ist      ${ist}`,
        )
      }
      console.log('Titelbild aus dem Markenbild abgeleitet, md5 stimmt')
    }
  }
}

async function bauen() {
  if (!existsSync(QUELLE)) throw new Error(`Quelle fehlt: ${QUELLE}`)
  assetsPruefen()
  const browser = await chromium.launch()
  try {
    const seite = await browser.newPage()
    await seite.goto(pathToFileURL(QUELLE).href, { waitUntil: 'networkidle' })
    // Ohne dieses Warten rendert Chromium gelegentlich in der Ersatzschrift.
    await seite.evaluate(() => document.fonts.ready)

    // Im Browser pruefen, NICHT hinterher im PDF: hier ist der Ueberlauf noch
    // messbar. Im PDF hat overflow:hidden ihn schon weggeschnitten - abgeschnittener
    // Inhalt sieht dort aus wie nicht vorhandener Inhalt.
    const befund = await seite.evaluate(() => ({
      montserrat: document.fonts.check('700 31pt Montserrat'),
      ueberlauf: [...document.querySelectorAll('.seite')].flatMap((el, i) =>
        el.scrollHeight > el.clientHeight + 1
          ? [{ seite: i + 1, ueber: el.scrollHeight - el.clientHeight }]
          : [],
      ),
    }))
    if (!befund.montserrat) {
      throw new Error(
        'Montserrat nicht geladen — Chromium wuerde das ganze Dokument in der ' +
          'Systemschrift setzen. Netzzugang zu fonts.googleapis.com pruefen.',
      )
    }
    if (befund.ueberlauf.length) {
      const l = befund.ueberlauf.map((u) => `Seite ${u.seite} um ${u.ueber}px`).join(', ')
      throw new Error(`Inhalt laeuft ueber das Blatt hinaus: ${l}`)
    }

    const pdf = await seite.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    })
    writeFileSync(ZIEL, pdf)
    console.log(`gebaut  ${ZIEL}  (${pdf.length.toLocaleString('de-DE')} Bytes)`)
  } finally {
    await browser.close()
  }
}

/** Minimaler PDF-Leser: reicht fuer Seitenzahl, Links und Schriftnamen. */
function pdfLesen(pfad) {
  const roh = readFileSync(pfad)
  const txt = roh.toString('latin1')
  return {
    bytes: roh.length,
    seiten: (txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
    uris: [...txt.matchAll(/\/URI\s*\(([^)]*)\)/g)].map((m) => m[1]),
    schriften: [...new Set([...txt.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-,_]+)/g)].map((m) => m[1]))],
  }
}

function pruefen() {
  const fehler = []
  if (!existsSync(ZIEL)) {
    console.error(`FEHLT: ${ZIEL}`)
    process.exit(1)
  }
  const p = pdfLesen(ZIEL)

  if (p.seiten !== SOLL.seiten) fehler.push(`Seitenzahl ${p.seiten}, erwartet ${SOLL.seiten}`)

  const tel = p.uris.filter((u) => u.startsWith('tel:'))
  if (tel.length < SOLL.telefonMin) fehler.push(`nur ${tel.length} Telefon-Links, erwartet >= ${SOLL.telefonMin}`)
  const falscheNummer = tel.filter((u) => u !== SOLL.telefon)
  if (falscheNummer.length) fehler.push(`fremde Telefonnummer: ${[...new Set(falscheNummer)].join(', ')}`)

  if (!p.uris.some((u) => u.includes(SOLL.webLink))) fehler.push(`Web-Link auf ${SOLL.webLink} fehlt`)

  // Der Stern und der Pfeil sind Inline-SVG. Taucht hier eine Systemschrift auf,
  // hat ein neu eingefuegtes Zeichen kein Glyph in Montserrat und ist still
  // ersetzt worden - auf einem anderen Rechner sieht das Dokument dann anders aus.
  // Nur ein Zusatzsignal, KEINE bestandene Pruefung: Chromium legt die Schrift-
  // objekte komprimiert ab, dieser Regex-Scan findet dann gar nichts. Ein leeres
  // Ergebnis heisst also "nichts gesehen", nicht "sauber". Die belastbare
  // Pruefung ist document.fonts.check() im Browser (siehe bauen()).
  const fremd = p.schriften.filter((f) => !/Montserrat/i.test(f))
  if (fremd.length) fehler.push(`Fremdschrift eingebettet: ${fremd.join(', ')} (fehlendes Glyph in Montserrat?)`)

  if (p.bytes > SOLL.maxBytes) fehler.push(`${p.bytes} Bytes, Grenze ${SOLL.maxBytes}`)

  console.log(`\ngeprueft ${ZIEL}`)
  console.log(`  Seiten        ${p.seiten}`)
  console.log(`  Telefon-Links ${tel.length}`)
  console.log(`  Web-Links     ${p.uris.filter((u) => u.startsWith('http')).length}`)
  console.log(`  Schriften     ${p.schriften.join(', ') || '(nicht auslesbar - komprimiert; Montserrat wurde im Browser geprueft)'}`)
  console.log(`  Groesse       ${p.bytes.toLocaleString('de-DE')} Bytes`)

  if (fehler.length) {
    console.error('\nFEHLGESCHLAGEN:')
    for (const f of fehler) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nalle Pruefungen bestanden')
}

const nurPruefen = process.argv.includes('--check')
if (!nurPruefen) await bauen()
pruefen()
