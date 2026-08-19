// Guard fuer CLIENT_NAMESPACES.
//
// Der NextIntlClientProvider serialisiert nur noch die dort gelisteten Namespaces.
// Nutzt eine Client-Komponente einen, der fehlt, wirft next-intl zur Laufzeit
// MISSING_MESSAGE und die UI zeigt den rohen Key — ein Fehler, den weder `next build`
// noch `tsc` faengt, weil er erst beim Rendern im Browser auftritt.
//
// Dieser Test scannt alle `'use client'`-Dateien und vergleicht die tatsaechlich
// genutzten Namespaces mit der Liste. Er laeuft in CI (Job `build` →
// „Marketing-Unit-Tests"), ohne Ratchet: rot blockt sofort.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { CLIENT_NAMESPACES } from './client-namespaces'

const ROOT = join(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'public'])

function sammleQuelldateien(dir: string, acc: string[] = []): string[] {
  for (const eintrag of readdirSync(dir)) {
    if (SKIP_DIRS.has(eintrag)) continue
    const pfad = join(dir, eintrag)
    if (statSync(pfad).isDirectory()) sammleQuelldateien(pfad, acc)
    else if (['.tsx', '.ts'].includes(extname(pfad))) acc.push(pfad)
  }
  return acc
}

function istClientDatei(quelltext: string): boolean {
  // 'use client' muss am Dateianfang stehen (vor allen Imports)
  return /^\s*['"]use client['"]/m.test(quelltext.slice(0, 500))
}

const dateien = sammleQuelldateien(ROOT)
  .map((p) => [p, readFileSync(p, 'utf8')] as const)
  .filter(([, src]) => istClientDatei(src))

describe('CLIENT_NAMESPACES', () => {
  it('deckt jeden Namespace ab, den eine Client-Komponente nutzt', () => {
    const erlaubt = new Set<string>(CLIENT_NAMESPACES)
    const fehlend: string[] = []

    for (const [pfad, src] of dateien) {
      for (const treffer of src.matchAll(/useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const namespace = treffer[1].split('.')[0]
        if (!erlaubt.has(namespace)) {
          fehlend.push(`${relative(ROOT, pfad)} nutzt "${namespace}"`)
        }
      }
    }

    expect(
      fehlend,
      'Diese Namespaces fehlen in i18n/client-namespaces.ts — ohne sie zeigt die UI ' +
        'zur Laufzeit den rohen Key statt des Textes:\n  ' + fehlend.join('\n  '),
    ).toEqual([])
  })

  it('erfasst ueberhaupt Client-Dateien (Positiv-Kontrolle gegen einen toten Scanner)', () => {
    // Ohne diese Pruefung wuerde ein kaputter Scanner (falscher Pfad, geaenderte
    // Direktive) 0 Dateien finden und der Test oben waere still gruen.
    expect(dateien.length).toBeGreaterThan(20)
    const mitUebersetzung = dateien.filter(([, src]) => /useTranslations\(/.test(src))
    expect(mitUebersetzung.length).toBeGreaterThan(5)
  })

  it('enthaelt keinen Namespace, den keine Client-Komponente nutzt', () => {
    // Haelt die Liste klein: was hier steht, wird auf JEDER Seite serialisiert.
    const genutzt = new Set<string>()
    for (const [, src] of dateien) {
      for (const treffer of src.matchAll(/useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        genutzt.add(treffer[1].split('.')[0])
      }
    }
    const ueberfluessig = CLIENT_NAMESPACES.filter((ns) => !genutzt.has(ns))
    expect(
      ueberfluessig,
      'Diese Namespaces stehen in der Liste, werden aber von keiner Client-Komponente ' +
        'genutzt — sie kosten auf jeder Seite Bytes:\n  ' + ueberfluessig.join('\n  '),
    ).toEqual([])
  })
})
