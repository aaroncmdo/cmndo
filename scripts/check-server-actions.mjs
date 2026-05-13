#!/usr/bin/env node
// AAR-13.05.2026: Drift-Bremse für Server-Actions (Audit Fix 5).
//
// Zwei Regeln, beide stammen aus `docs/12.05.2026/server-actions-pattern-audit.md`:
//
// R1 (ERROR, AAR-664-Falle): Keine Value-Exports aus 'use server'-Files.
//   `export const FOO = …`, `export let`, `export var` aus einer Datei mit
//   `'use server'` am Anfang landet im Client-Bundle als `undefined`. AAR-664
//   hat das mit einem Urgent-Crash bewiesen. Type-Exports (export type) sind OK
//   (TS-erased) — siehe Audit §1.
//
// R2 (WARNING): Mutierende Server-Action ohne revalidatePath in derselben
//   Funktion. Audit §4 hat 40 betroffene Files identifiziert. PRs #876 + Folge
//   ziehen die Top-10/30 nach — neu hinzukommende Server-Actions sollen direkt
//   konform sein.
//
// Verwendung:
//   node scripts/check-server-actions.mjs           # alle 'use server'-Files
//   node scripts/check-server-actions.mjs --staged  # nur staged Files

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const STAGED = process.argv.includes('--staged')

const allFiles = STAGED
  ? execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => f.startsWith('src/'))
  : execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)

// Nur Files mit 'use server' am Anfang prüfen.
const serverFiles = allFiles.filter((f) => {
  try {
    const head = readFileSync(f, 'utf8').slice(0, 200)
    return /^\s*['"]use server['"]\s*[;\n]/m.test(head)
  } catch {
    return false
  }
})

let errors = 0
let warnings = 0

for (const file of serverFiles) {
  const content = readFileSync(file, 'utf8')
  const lines = content.split('\n')

  // ── R1: Value-Exports (export const/let/var) ─────────────────────────────
  // `export type` und `export interface` erlaubt (TS-erased).
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match `export const|let|var <ident>` aber NICHT `export type` / `export interface`.
    if (/^\s*export\s+(const|let|var)\s+\w/.test(line)) {
      console.error(`✗ ERROR ${file}:${i + 1} — Value-Export aus 'use server'-File`)
      console.error(`    ${line.trim().slice(0, 120)}`)
      console.error(`    Grund: Client-Bundle liest 'undefined' (AAR-664-Falle).`)
      console.error(`    Fix: Konstante in Sibling-File 'foo.types.ts' oder 'foo.constants.ts' verschieben.`)
      errors++
    }
  }

  // ── R2: mutierende DB-Operation ohne revalidatePath im Funktionsrumpf ────
  // Heuristik: pro `export async function NAME(...)` schauen wir den Funktions-
  // Rumpf an (von der `{`-Klammer bis zum match-Ende). Wenn dort ein .insert/
  // .update/.delete/.upsert auf .from(...) steht UND kein revalidatePath, dann
  // warn.
  const fnRegex = /export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*{/g
  let m
  while ((m = fnRegex.exec(content)) !== null) {
    const fnName = m[1]
    const bodyStart = m.index + m[0].length - 1 // an der öffnenden `{`
    const bodyEnd = findMatchingBrace(content, bodyStart)
    if (bodyEnd < 0) continue
    const body = content.slice(bodyStart, bodyEnd + 1)
    const hasMutation = /\.from\([^)]+\)\s*\.(insert|update|delete|upsert)\s*\(/.test(body)
    if (!hasMutation) continue
    const hasRevalidate = /\brevalidatePath\s*\(/.test(body)
    if (hasRevalidate) continue
    // Falls die Funktion das Result von einem Helper zurückgibt der wiederum
    // revalidiert (z.B. transitionFallStatus), übersieht die Heuristik das.
    // Akzeptiert — der Audit erlaubt Helper-Pattern. Eigene Mutation in der
    // Action sollte aber direkt revalidaten.
    const lineNumber = content.slice(0, m.index).split('\n').length
    console.error(`⚠ WARN ${file}:${lineNumber} — Server-Action '${fnName}' mutiert DB ohne revalidatePath`)
    console.error(`    Fix: revalidatePath('/passende/route') vor return ergänzen.`)
    console.error(`    Bei Bedarf out-of-scope ausnehmen via Kommentar '// check:no-revalidate <Grund>' direkt vor der Funktion.`)
    warnings++
  }
}

function findMatchingBrace(text, openIndex) {
  let depth = 0
  let inString = null // ' " `
  let inLineComment = false
  let inBlockComment = false
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inLineComment) {
      if (c === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i++ }
      continue
    }
    if (inString) {
      if (c === '\\') { i++; continue }
      if (c === inString) inString = null
      continue
    }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

console.log('')
console.log(`Gescannt: ${serverFiles.length} 'use server'-Files`)
console.log(`R1 (Value-Export-Falle): ${errors} ERRORS`)
console.log(`R2 (Mutation ohne revalidatePath): ${warnings} WARNINGS`)

if (errors > 0) {
  console.error('')
  console.error('R1-Errors müssen behoben werden (AAR-664 = Production-Crash-Risiko).')
  process.exit(1)
}

if (warnings > 0) {
  console.warn('')
  console.warn('R2-Warnings sind Hinweise — bei neuer Server-Action sollte revalidatePath dabei sein.')
  // R2 ist nur Warning, kein non-zero exit.
}
