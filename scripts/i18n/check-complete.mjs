#!/usr/bin/env node
// CI-Gate: verifiziert, dass alle Locales identische (rekursive) Key-Sets zur
// Quelle de.json haben. Bricht mit Exit 1 ab, wenn eine Locale Keys fehlen oder
// ueberzaehlige Keys hat. Verhindert, dass untersetzte i18n-Keys live gehen
// (next-intl rendert sonst den Key-Pfad statt eines Textes).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.resolve(__dirname, '../../src/i18n/messages')
const SOURCE = 'de'
const TARGETS = ['en', 'tr', 'ar', 'ru', 'pl']

function flatKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatKeys(v, full))
    else keys.push(full)
  }
  return keys
}

const load = (loc) => JSON.parse(fs.readFileSync(path.join(DIR, `${loc}.json`), 'utf8'))
const sourceKeys = new Set(flatKeys(load(SOURCE)))
let failed = false

for (const loc of TARGETS) {
  const locKeys = new Set(flatKeys(load(loc)))
  const missing = [...sourceKeys].filter((k) => !locKeys.has(k))
  const extra = [...locKeys].filter((k) => !sourceKeys.has(k))
  if (missing.length || extra.length) {
    failed = true
    console.error(`[i18n] ${loc}: ${missing.length} fehlend, ${extra.length} ueberzaehlig`)
    if (missing.length)
      console.error(`  fehlend: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`)
    if (extra.length)
      console.error(`  extra:   ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ' …' : ''}`)
  } else {
    console.log(`[i18n] ${loc}: OK (${locKeys.size} Keys)`)
  }
}

if (failed) {
  console.error('[i18n] Key-Completeness FEHLGESCHLAGEN')
  process.exit(1)
}
console.log('[i18n] Alle Locales vollstaendig.')
