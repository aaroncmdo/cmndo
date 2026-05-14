#!/usr/bin/env node
// AAR-907: Mechanischer Sweep rounded-(sm|md|lg|xl) → rounded-ios-* in src/.
// Respektiert Token-Audit-Skip-Header. Word-Boundary-safe Regex.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files "src/**/*.tsx" "src/**/*.ts"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const RE = /\brounded-(sm|md|lg|xl)\b/g

let totalReplacements = 0
const touchedFiles = []

for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (/Token-Audit-Skip/i.test(content.slice(0, 400))) continue

  let count = 0
  const next = content.replace(RE, (match, size) => {
    count++
    return `rounded-ios-${size}`
  })

  if (count > 0) {
    writeFileSync(file, next)
    touchedFiles.push({ file, count })
    totalReplacements += count
  }
}

touchedFiles.sort((a, b) => b.count - a.count)
console.log(`Sweep fertig: ${totalReplacements} Replacements in ${touchedFiles.length} Files.`)
console.log('Top-15 Files:')
for (const { file, count } of touchedFiles.slice(0, 15)) {
  console.log(`  ${count.toString().padStart(4)}× ${file}`)
}
