#!/usr/bin/env node
// scripts/kasko-wb/generate-seed-sql.mjs
// JSON -> SQL. Ausgabe wird committed UND ist der Payload fuer apply_migration (Regel 2). Bei einer neuen
// CHECK24-Liste: neue JSON-Datei (Datum im Namen), STAND unten anpassen, neu generieren, neue Migration.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeedSql, validateSeed } from '../lib/kasko-wb-seed.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STAND = process.argv[2] ?? '2026-07-20'
const src = join(HERE, `wissensbasis-${STAND}.json`)
const out = join(HERE, 'seed.generated.sql')

const data = JSON.parse(readFileSync(src, 'utf8'))
const errs = validateSeed(data)
if (errs.length) {
  console.error(`✗ ${errs.length} Fehler in ${src}:\n  ${errs.join('\n  ')}`)
  process.exit(1)
}
const sql = buildSeedSql(data)
writeFileSync(out, sql, 'utf8')
const tarife = data.marken.reduce((n, m) => n + (m.linien?.length ?? 0), 0)
console.log(`✓ ${data.marken.length} Marken, ${sql.split('INSERT INTO public.kasko_tarife').length - 1} Tarifzeilen -> ${out}`)
console.log(`  (Linien: ${tarife}; Konditionen: ${data.marken.filter((m) => m.konditionen).length} + Default)`)
