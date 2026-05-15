// 15.05.2026: Tiefen-Audit aller no-unused-vars in src/.
// Für jede Stelle: File, Line, Variable-Name, Kategorie-Heuristik.
//
// Input: ESLint JSON via stdin (npx eslint src --format json)
// Output: JSON-Liste mit Kategorie-Tags zur weiteren Triage.
//
// Heuristik-Klassifikation:
//   - "import":   var von `import ... from ...`
//   - "prop":     destructured aus Function-Params (Component-Props)
//   - "useState": const [_, setX] = useState(...) — Setter ungenutzt
//   - "useRouter": const router = useRouter() — ungenutzt
//   - "callback": const fn = useCallback/useMemo — ungenutzt
//   - "local":    const x = ... (sonstige lokale var)
//   - "param":    Function-Parameter
//   - "loop":     Loop-Variable
//
// Plus Kontext (3 Zeilen vor + nach).

import { readFileSync, existsSync } from 'fs'
import { resolve, sep } from 'path'

const eslintOut = JSON.parse(readFileSync(0, 'utf8'))
const root = process.cwd()

const items = []
for (const f of eslintOut) {
  const rel = f.filePath.replace(root, '').replace(/^[/\\]/, '')
  if (!rel.startsWith('src')) continue // nur Production-Code
  const lines = existsSync(f.filePath) ? readFileSync(f.filePath, 'utf8').split('\n') : []
  for (const m of f.messages) {
    if (m.ruleId !== '@typescript-eslint/no-unused-vars') continue
    const lineIdx = m.line - 1
    const ctx = lines.slice(Math.max(0, lineIdx - 3), lineIdx + 4)
    const varName = m.message.match(/^'([^']+)'/)?.[1] ?? '?'
    const line = lines[lineIdx] ?? ''
    let category = 'local'
    // Above (line-1) für Kontext
    const above = lines[lineIdx - 1] ?? ''
    // Heuristiken
    if (line.match(/^\s*import\b/)) category = 'import'
    else if (line.match(/^\s*['"`]use (client|server)['"`]/)) category = 'directive'
    else if (above.match(/useState\b/) && line.includes(varName)) category = 'useState'
    else if (line.match(/useRouter\(\)/) || (line.includes(varName) && above.includes('useRouter'))) category = 'useRouter'
    else if (line.match(/useCallback|useMemo/)) category = 'callback'
    else if (line.match(/^\s*function\s|\(([^)]*\b\w+\b[^)]*)\)\s*=>/)) category = 'param'
    else if (line.match(/^\s*const\s+(\[|\{|\w+)/)) category = 'local'
    items.push({
      file: rel.replace(/\\/g, '/'),
      line: m.line,
      var: varName,
      msg: m.message,
      category,
      code: line.trim().slice(0, 200),
      context: ctx.map((l, i) => `${m.line - 3 + i}: ${l}`).join('\n'),
    })
  }
}

// Pro Kategorie counten
const counts = {}
for (const i of items) counts[i.category] = (counts[i.category] ?? 0) + 1
console.error(`Total: ${items.length}, Categories:`, counts)

// JSON output für weitere Verarbeitung
process.stdout.write(JSON.stringify(items, null, 2))
