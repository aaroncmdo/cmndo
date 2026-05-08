/**
 * Injiziert `timeZone: 'Europe/Berlin'` in alle toLocaleDateString /
 * toLocaleTimeString Aufrufe die noch kein timeZone haben.
 * Behandelt auch toLocaleString-Aufrufe mit Datums-/Zeit-Optionen.
 */

import { readFileSync, writeFileSync } from 'fs'
import { globSync } from 'glob'
import path from 'path'

const TZ = `timeZone: 'Europe/Berlin'`

// Erkennt ob ein toLocaleString-Aufruf Datums-/Zeit-Optionen hat
const DATE_TIME_OPTS = /\b(day|month|year|hour|minute|second|weekday|dateStyle|timeStyle)\b/

let totalFiles = 0
let totalChanges = 0

function injectTz(content, filepath) {
  let changed = false
  let result = content

  // 1. toLocaleDateString('de-DE') ohne Optionen
  result = result.replace(
    /\.toLocaleDateString\('de-DE'\)/g,
    () => {
      changed = true
      return `.toLocaleDateString('de-DE', { ${TZ} })`
    }
  )

  // 2. toLocaleDateString('de-DE', { ohne timeZone
  result = result.replace(
    /\.toLocaleDateString\('de-DE',\s*\{(?![^}]*timeZone)/g,
    (match) => {
      changed = true
      return match + ` ${TZ},`
    }
  )

  // 3. toLocaleTimeString('de-DE') ohne Optionen
  result = result.replace(
    /\.toLocaleTimeString\('de-DE'\)/g,
    () => {
      changed = true
      return `.toLocaleTimeString('de-DE', { ${TZ} })`
    }
  )

  // 4. toLocaleTimeString('de-DE', { ohne timeZone
  result = result.replace(
    /\.toLocaleTimeString\('de-DE',\s*\{(?![^}]*timeZone)/g,
    (match) => {
      changed = true
      return match + ` ${TZ},`
    }
  )

  // 5. toLocaleString('de-DE', { mit Datums/Zeit-Optionen aber ohne timeZone
  result = result.replace(
    /\.toLocaleString\('de-DE',\s*\{([^}]*)}/g,
    (match, inner) => {
      if (inner.includes('timeZone')) return match
      if (!DATE_TIME_OPTS.test(inner)) return match
      changed = true
      return match.replace(
        /\.toLocaleString\('de-DE',\s*\{/,
        `.toLocaleString('de-DE', { ${TZ},`
      )
    }
  )

  // 6. toLocaleString('de-DE') ohne Optionen, wenn es auf einem new Date() steht
  // (kein number.toLocaleString)
  result = result.replace(
    /\bnew Date\([^)]*\)\.toLocaleString\('de-DE'\)/g,
    (match) => {
      changed = true
      return match.replace(
        `.toLocaleString('de-DE')`,
        `.toLocaleString('de-DE', { ${TZ} })`
      )
    }
  )

  if (changed) {
    totalFiles++
    const lines = content.split('\n').length
    const changedLines = result.split('\n').filter((l, i) => l !== content.split('\n')[i]).length
    totalChanges += changedLines
    console.log(`  ✓ ${path.relative(process.cwd(), filepath)} (${changedLines} Zeilen)`)
  }
  return result
}

const files = globSync('src/**/*.{ts,tsx}', { cwd: process.cwd() })
console.log(`Prüfe ${files.length} Dateien…\n`)

for (const file of files) {
  const abs = path.resolve(process.cwd(), file)
  const original = readFileSync(abs, 'utf8')
  const fixed = injectTz(original, abs)
  if (fixed !== original) {
    writeFileSync(abs, fixed, 'utf8')
  }
}

console.log(`\nFertig: ${totalFiles} Dateien geändert, ~${totalChanges} Zeilen angepasst`)
