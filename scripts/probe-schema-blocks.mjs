#!/usr/bin/env node
// Probe: prüft die Claimondo-Content-Assets (src/content/claimondo/**/*.md) auf
// korrekt formatierte "## Schema (JSON-LD)"-Blöcke. Repliziert die Regex aus
// src/lib/content/claimondo-mdx.ts::extractSchemaJson, damit wir vor Build sehen,
// welche Files (a) ein gültiges, vom Renderer erkanntes Schema haben, (b) noch
// einen bare ```json-Block ohne Heading tragen (rendert sichtbar + wird ignoriert),
// (c) ungültiges JSON enthalten.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'src', 'content', 'claimondo')
const FOLDERS = ['cornerstones', 'haftpflicht', 'decoder']
const SCHEMA_RE = /##\s+Schema \(JSON-LD\)[\s\S]*?```json\s*([\s\S]*?)```/
const HEADING_RE = /##\s+Schema \(JSON-LD\)/

let ok = 0
const missingHeading = []
const invalidJson = []
const noFenceAtAll = []
let total = 0

for (const folder of FOLDERS) {
  const dir = path.join(ROOT, folder)
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    total++
    const rel = `${folder}/${name}`
    const raw = fs.readFileSync(path.join(dir, name), 'utf8')
    const hasHeading = HEADING_RE.test(raw)
    const hasFence = raw.includes('```json')
    if (!hasHeading) {
      if (hasFence) missingHeading.push(rel)
      else noFenceAtAll.push(rel)
      continue
    }
    const m = raw.match(SCHEMA_RE)
    if (!m) { invalidJson.push(`${rel} (Heading da, aber Regex matcht nicht)`); continue }
    try {
      const parsed = JSON.parse(m[1].trim())
      const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : null
      const types = graph ? graph.map((g) => g['@type']).join('+') : (parsed['@type'] ?? '?')
      if (!graph) { invalidJson.push(`${rel} (kein @graph — nur ${types})`); continue }
      ok++
    } catch (e) {
      invalidJson.push(`${rel} (JSON-Parse-Fehler: ${e.message})`)
    }
  }
}

console.log(`\n=== Schema-Block-Audit (${total} MD-Files) ===`)
console.log(`✅ gültig (## Schema + @graph, JSON ok): ${ok}`)
console.log(`⚠️  bare json-fence ohne Heading (Bug: rendert + ignoriert): ${missingHeading.length}`)
missingHeading.forEach((f) => console.log(`     - ${f}`))
if (invalidJson.length) {
  console.log(`❌ ungültig/unvollständig: ${invalidJson.length}`)
  invalidJson.forEach((f) => console.log(`     - ${f}`))
}
if (noFenceAtAll.length) {
  console.log(`ℹ️  gar kein json-Block: ${noFenceAtAll.length}`)
  noFenceAtAll.forEach((f) => console.log(`     - ${f}`))
}
process.exit(missingHeading.length === 0 && invalidJson.length === 0 ? 0 : 1)
