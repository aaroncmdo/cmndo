#!/usr/bin/env node
// AAR-13.05.2026: Drift-Bremse gegen leere Tailwind-Arbitrary-Value-Klassen.
//
// PROBLEM-SKIZZE (ohne Class-Literal damit Tailwind-JIT diesen Kommentar
// nicht selbst als Source pickt): Wenn ein Tailwind-Width-Utility mit
// arbitrary-value gefolgt von einem leeren CSS-var-Aufruf in Kommentaren
// oder Markdown vorkommt, generiert Tailwind eine CSS-Regel mit leerem
// `var()` — das bricht PostCSS-Parser → Dev-Server 500 / Build-Crash.
//
// Bekannte Vorfälle (13.05.2026):
//   1. Drawer.web.tsx Kommentar enthielt das Pattern — JIT picked it up.
//   2. audit-findings.md zitierte das Pattern.
//      Lösung: globals.css @source not Direktiven für docs/.claude/scripts.
//
// Diese Drift-Bremse blockt das Pattern überall in src/**.
//
// Verwendung:
//   node scripts/check-tailwind-arbitrary.mjs        # alle src-Files
//   node scripts/check-tailwind-arbitrary.mjs --staged  # nur staged Files

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const STAGED = process.argv.includes('--staged')

const files = STAGED
  ? execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .filter((f) => f.startsWith('src/'))
  : execSync('git ls-files "src/**/*.tsx" "src/**/*.ts" "src/**/*.css"', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)

// Pattern: Tailwind-arbitrary-value mit leerem oder problematischem Inhalt.
//   - Width-Utility + Bracket-Var-Aufruf ohne Argument → invalid CSS var()
//   - Width-Utility + leeres Bracket → invalid arbitrary-value
//   - Width-Utility + Whitespace-only Bracket → dito
// Erweiterbar wenn weitere Pattern auftauchen.
const PATTERNS = [
  { re: /[a-z][a-z-]*-\[var\(\s*\)\]/g, label: 'leerer var()-Aufruf in arbitrary-value-Klasse' },
  { re: /[a-z][a-z-]*-\[\s*\]/g, label: 'leerer Bracket-Inhalt in arbitrary-value-Klasse' },
]

let hits = 0
for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const { re, label } of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(content)) !== null) {
      const lineNumber = content.slice(0, m.index).split('\n').length
      const line = content.split('\n')[lineNumber - 1].trim().slice(0, 120)
      console.error(`✗ ${file}:${lineNumber} — ${label}`)
      console.error(`    ${line}`)
      console.error(`    matched: ${m[0]}`)
      hits++
    }
  }
}

if (hits > 0) {
  console.error('')
  console.error(`${hits} Tailwind-Empty-Arbitrary-Treffer gefunden.`)
  console.error('Grund: Tailwind v4 JIT scannt das gesamte Projekt nach Klassen-Literalen — auch in Kommentaren.')
  console.error('Ein leerer var()/Bracket-Aufruf generiert invalid CSS und bricht den Build.')
  console.error('Fix: Pattern ohne Bracket-Class-Syntax in Kommentaren umschreiben (Prosa statt Klassen-Literal — Tailwind-JIT scannt sonst Kommentare).')
  process.exit(1)
}

console.log(`✓ ${files.length} Files geprüft, kein leeres Tailwind-Arbitrary-Pattern gefunden.`)
