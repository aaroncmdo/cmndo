#!/usr/bin/env node
// Erzeugt den Cover-Teaser der Unfallguide-Landeseite aus dem gebauten PDF.
//
// WAS DAS SOLL
// Seite 2 des Guides wird zweimal ausgegeben: einmal scharf, einmal unscharf.
// Auf der Seite liegen beide deckungsgleich uebereinander, und eine CSS-Maske
// schneidet die scharfe Ebene an einer gerechneten Kante ab. Der Leser liest
// sich ein — und genau dort, wo die beiden wertvollsten Positionen stehen, ist
// Schluss.
//
// WARUM SEITE 2 UND WARUM DIESE KANTE
// Die Seite sagt selbst: „Am seltensten geltend gemacht: Nutzungsausfall und
// Wertminderung. Zusammen oft mehr als die halbe Reparatursumme." Genau diese
// zwei Zeilen liegen hinter der Unschaerfe. Der Cliffhanger steht also nicht
// im Marketing, sondern im Inhalt.
//
// Gemessen mit PyMuPDF am gebauten PDF (nicht geschaetzt):
//
//   Anwalt-Zeile           y 257,4–266,7 pt   = 30,6–31,7 %
//   Nutzungsausfall-Zeile  y 298,6–307,9 pt   = 35,5 %
//
// Daraus die Maske: deckend bis 32 %, Verlauf bis 35,5 %, darunter durchlaessig.
// ⚠ Wer die Guide-Seite umbaut, MUSS diese Werte neu messen. Sie stehen
// zusaetzlich in `app/globals.css` als Custom-Properties — eine Kante, die auf
// der falschen Zeile endet, verschenkt den ganzen Effekt oder verraet zu viel.
//
// WARUM ZWEI DATEIEN STATT `filter: blur()`
// `filter: blur()` auf einem grossen Bild kostet auf schwachen Geraeten jeden
// Frame und flackert beim Scrollen. Zwei vorgerechnete Bilder kosten nichts.
// Zusaetzlich laesst sich die unscharfe Fassung staerker komprimieren — sie
// traegt keine lesbare Schrift mehr.
//
// Aufruf:
//   node scripts/build-guide-teaser.mjs
//   node scripts/build-guide-teaser.mjs --pruefen    (nur messen, nichts schreiben)

import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..')
const PDF = join(wurzel, 'claimondo-marketing/public/downloads/claimondo-unfallguide.pdf')
const ZIEL = join(wurzel, 'claimondo-marketing/public/brand')

/** Welche Seite den Teaser traegt (0-basiert). Seite 2 = die Anspruchsliste. */
const SEITE = 1
/** Skalierung beim Rendern. 3x auf A4 = 1785 px Breite, genug fuer Retina. */
const SKALA = 3
/** Zielbreite der ausgelieferten Bilder. */
const BREITE = 1000
/** Radius der Unschaerfe, relativ zur Zielbreite gerechnet. */
const UNSCHAERFE = 9

const nurPruefen = process.argv.includes('--pruefen')

const python = `
# -*- coding: utf-8 -*-
import io, json, sys
import fitz
from PIL import Image, ImageFilter

PDF, ZIEL, SEITE, SKALA, BREITE, UNSCHAERFE, SCHREIBEN = sys.argv[1:8]
SEITE, SKALA, BREITE, UNSCHAERFE = int(SEITE), int(SKALA), int(BREITE), int(UNSCHAERFE)
SCHREIBEN = SCHREIBEN == "1"

d = fitz.open(PDF)
p = d[SEITE]
H = p.rect.height

# Die Kante wird aus dem TEXT gerechnet, nicht gesetzt: sie muss mitwandern,
# wenn sich das Layout des Guides aendert.
def zeile(t):
    tr = p.search_for(t)
    return (tr[0].y0, tr[0].y1) if tr else None

anwalt = zeile("Anwalt")
nutzung = zeile("Nutzungsausfall")
if not anwalt or not nutzung:
    raise SystemExit("Ankerzeilen nicht gefunden — Layout geaendert? Kante neu bestimmen.")

# Deckend bis kurz unter die letzte lesbare Zeile, durchlaessig ab der ersten
# verborgenen. Der Verlauf liegt genau im Zwischenraum.
deckend = (anwalt[1] + 6) / H
klar = (nutzung[0] - 2) / H

mess = {
  "anwalt_prozent": [round(anwalt[0]/H*100, 1), round(anwalt[1]/H*100, 1)],
  "nutzungsausfall_prozent": round(nutzung[0]/H*100, 1),
  "maske_deckend_prozent": round(deckend*100, 1),
  "maske_klar_prozent": round(klar*100, 1),
}

if SCHREIBEN:
    pix = p.get_pixmap(matrix=fitz.Matrix(SKALA, SKALA))
    roh = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    hoehe = round(BREITE * roh.height / roh.width)
    scharf = roh.resize((BREITE, hoehe), Image.LANCZOS)
    scharf.save(ZIEL + "/guide-teaser-scharf.webp", "WEBP", quality=92, method=6)
    # Die unscharfe Fassung traegt keine lesbare Schrift mehr und darf deutlich
    # staerker komprimiert werden.
    scharf.filter(ImageFilter.GaussianBlur(UNSCHAERFE)).save(
        ZIEL + "/guide-teaser-unscharf.webp", "WEBP", quality=70, method=6)
    mess["groesse"] = [BREITE, hoehe]

print(json.dumps(mess, ensure_ascii=False))
`

if (!existsSync(PDF)) {
  console.error(`PDF fehlt: ${PDF}\nErst \`npm run build:unfallguide\` fahren.`)
  process.exit(1)
}

let roh
try {
  roh = execFileSync(
    'python',
    ['-c', python, PDF, ZIEL, String(SEITE), String(SKALA), String(BREITE), String(UNSCHAERFE), nurPruefen ? '0' : '1'],
    { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
  )
} catch (err) {
  console.error('Rendern fehlgeschlagen:', err.stderr || err.message)
  process.exit(1)
}

const m = JSON.parse(roh.trim().split('\n').pop())

console.log('Guide-Teaser aus Seite ' + (SEITE + 1) + ' des PDF')
console.log(`  letzte lesbare Zeile (Anwalt)   ${m.anwalt_prozent[0]} – ${m.anwalt_prozent[1]} %`)
console.log(`  erste verborgene (Nutzungsausf.) ${m.nutzungsausfall_prozent} %`)
console.log(`  Maske deckend bis                ${m.maske_deckend_prozent} %`)
console.log(`  Maske klar ab                    ${m.maske_klar_prozent} %`)

if (nurPruefen) {
  console.log('\nNur gemessen (--pruefen), nichts geschrieben.')
  process.exit(0)
}

console.log(`  Bildgroesse                      ${m.groesse[0]} x ${m.groesse[1]} px`)
for (const n of ['guide-teaser-scharf.webp', 'guide-teaser-unscharf.webp']) {
  const p = join(ZIEL, n)
  if (!existsSync(p)) {
    console.error(`  FEHLT: ${n}`)
    process.exit(1)
  }
  console.log(`  ${n.padEnd(30)} ${statSync(p).size.toLocaleString('de-DE')} Bytes`)
}

console.log(`
⚠ Die beiden Prozentwerte gehoeren nach app/globals.css:
    --guide-teaser-deckend: ${m.maske_deckend_prozent}%;
    --guide-teaser-klar:    ${m.maske_klar_prozent}%;`)
