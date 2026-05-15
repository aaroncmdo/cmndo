// 15.05.2026: Erzeugt Markdown-Tabellen pro Kategorie für den unused-vars-Audit.
import { readFileSync, writeFileSync } from 'fs'

const items = JSON.parse(readFileSync('docs/unused-vars-audit-raw.json', 'utf8'))

const byCategory = {}
for (const i of items) {
  byCategory[i.category] = byCategory[i.category] ?? []
  byCategory[i.category].push(i)
}

let md = `# Unused-Vars Audit — staging-HEAD 2026-05-15\n\n`
md += `Generated from \`npx eslint src --format json\` + heuristic classification.\n`
md += `Total: **${items.length}** unused-vars in src/. Distribution:\n\n`

for (const [cat, list] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
  md += `- **${cat}**: ${list.length}\n`
}

const CATEGORY_NOTES = {
  useState: 'useState-Setter ungenutzt — oft Bug (State sollte updated werden, fehlt aber)',
  useRouter: 'useRouter() ungenutzt — oft fehlende Navigation/Refresh-Logic',
  callback: 'useCallback/useMemo ungenutzt — oft Refactor-Rest, kann Performance-Loss sein',
  param: 'Function-Parameter ungenutzt — oft OK (Interface-Konformität), manchmal vergessen-zu-nutzen',
  import: 'Import ungenutzt — meistens harmlos, manchmal Hinweis dass Helper geplant war',
  local: 'Lokale Variable ungenutzt — heterogen, braucht manuelle Triage',
  directive: 'use server/client directive — sollte nie unused sein',
}

for (const [cat, list] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
  md += `\n## ${cat} (${list.length})\n\n`
  md += `_${CATEGORY_NOTES[cat] ?? ''}_\n\n`
  md += `| File:Line | Variable | Code |\n`
  md += `|---|---|---|\n`
  for (const i of list) {
    const code = i.code.replace(/\|/g, '\\|').slice(0, 120)
    md += `| \`${i.file}:${i.line}\` | \`${i.var}\` | \`${code}\` |\n`
  }
}

writeFileSync('docs/15.05.2026/unused-vars-audit.md', md)
console.log(`Written ${md.length} chars to docs/15.05.2026/unused-vars-audit.md`)
