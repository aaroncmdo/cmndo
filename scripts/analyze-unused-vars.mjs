// 15.05.2026: Liest ESLint-JSON-Output und gruppiert no-unused-vars
// nach Patterns für Tiefen-Audit (echtes Dead-Code vs Bug-induziert).

import { readFileSync } from 'fs'

const data = JSON.parse(readFileSync(0, 'utf8'))
const items = []
for (const f of data) {
  const file = f.filePath.split(/[\\/]/).slice(-3).join('/')
  for (const m of f.messages) {
    if (m.ruleId === '@typescript-eslint/no-unused-vars') {
      items.push({ file, line: m.line, msg: m.message })
    }
  }
}

console.log('Total no-unused-vars:', items.length)
console.log('')

// Pattern-Klassifizierung: Import? Function-Param? Type-Definition?
const buckets = { import: [], param: [], destructure: [], local: [], type: [], other: [] }
for (const i of items) {
  const m = i.msg
  if (/'[A-Z][^']*' is defined.*never used/.test(m) && /import/i.test(m)) buckets.import.push(i)
  else if (m.includes('is defined but never used') && /args option/.test(m)) buckets.param.push(i)
  else if (m.includes('is assigned a value but never used')) buckets.local.push(i)
  else if (m.match(/'[a-z_]+' is defined but never used/)) buckets.param.push(i)
  else if (m.includes('is defined but never used')) buckets.import.push(i)
  else buckets.other.push(i)
}

for (const [name, list] of Object.entries(buckets)) {
  console.log(`\n=== ${name.toUpperCase()} (${list.length}) ===`)
  list.slice(0, 10).forEach((i) => console.log(`  ${i.file}:${i.line} — ${i.msg.slice(0, 120)}`))
  if (list.length > 10) console.log(`  ... +${list.length - 10} more`)
}
