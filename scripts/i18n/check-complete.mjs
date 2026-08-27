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

// Marketing hat einen EIGENEN i18n-Baum (eigener Top-Level-Build). Duplikat-Guard
// UND Completeness pruefen jetzt beide — jeder Baum gegen sein EIGENES de.json.
//
// Bis 27.08.2026 lief die Completeness bewusst nur ueber die App, mit der
// Begruendung "Marketing pflegt seine Locales unabhaengig". Unabhaengig gepflegt
// heisst aber nicht ungeprueft: in der Luecke liefen 4 Keys auf, die auf
// /ar/check, /pl/check und /ru/check live den rohen Key-Pfad rendern
// (check.foto_check.heading/.text/.button + check.lead_heading_alt — eine
// komplette CTA-Karte und eine Formular-Ueberschrift). next-intl hat hier
// keinen Fallback: i18n/request.ts laedt genau eine Locale-Datei, ohne Merge
// mit de. Getrennte Baeume, getrennte Quellen — aber beide in sich vollstaendig.
const MARKETING_DIR = path.resolve(__dirname, '../../claimondo-marketing/i18n/messages')

/**
 * Findet Duplikat-Keys auf ALLEN Objekt-Ebenen im ROHTEXT. JSON.parse verschluckt
 * Duplikate still (der letzte gewinnt) — genau deshalb braucht es einen Raw-Scan.
 * String-bewusst: ICU-Platzhalter-Klammern ("Hallo {name}") verfaelschen nichts.
 * Anlass: de.json (Marketing) trug 3 tote Duplikat-Bloecke; jeder maschinelle
 * JSON-Roundtrip dedupliziert still und patcht sonst den falschen Block (16.07.).
 */
function findDuplicateKeys(raw) {
  const dups = []
  const stack = [] // pro Objekt: { counts: Map<key,n>, at: string }
  let inStr = false
  let esc = false
  let str = ''
  let lastStr = null
  let lastKey = '' // Key, unter dem das naechste Objekt haengt (fuer den Pfad)
  const pathOf = () => stack.map((s) => s.at).filter(Boolean).join('.') || '(root)'
  for (const ch of raw) {
    if (inStr) {
      if (esc) { esc = false; str += ch; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = false; lastStr = str; continue }
      str += ch
      continue
    }
    if (ch === '"') { inStr = true; str = ''; continue }
    if (ch === ':') { // lastStr war ein KEY des aktuellen Objekts
      if (lastStr !== null && stack.length) {
        const top = stack[stack.length - 1]
        top.counts.set(lastStr, (top.counts.get(lastStr) ?? 0) + 1)
        lastKey = lastStr
        lastStr = null
      }
      continue
    }
    if (ch === '{') { stack.push({ counts: new Map(), at: stack.length ? lastKey : '' }); continue }
    if (ch === '}') {
      const top = stack.pop()
      for (const [k, n] of top.counts) if (n > 1) dups.push({ key: k, n, at: pathOf() ? `${pathOf()}.${top.at}`.replace(/^\(root\)\.?/, '') || '(top-level)' : top.at })
    }
  }
  return dups
}

let failed = false
for (const [label, dir] of [['app', DIR], ['marketing', MARKETING_DIR]]) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const dups = findDuplicateKeys(fs.readFileSync(path.join(dir, file), 'utf8'))
    if (dups.length) {
      failed = true
      console.error(`[i18n] ${label}/${file}: ${dups.length} Duplikat-Key(s)`)
      for (const d of dups.slice(0, 10)) console.error(`  "${d.key}" ${d.n}x (in ${d.at || '(top-level)'})`)
    }
  }
}
if (failed) {
  console.error('[i18n] Duplikat-Guard FEHLGESCHLAGEN — JSON.parse nimmt still den letzten Block; tote Bloecke sind Merge-/Tooling-Fallen.')
  process.exit(1)
}
console.log('[i18n] Duplikat-Guard: alle Locales (app + marketing) duplikatfrei.')

for (const [label, dir] of [['app', DIR], ['marketing', MARKETING_DIR]]) {
  const load = (loc) => JSON.parse(fs.readFileSync(path.join(dir, `${loc}.json`), 'utf8'))
  const sourceKeys = new Set(flatKeys(load(SOURCE)))

  for (const loc of TARGETS) {
    const locKeys = new Set(flatKeys(load(loc)))
    const missing = [...sourceKeys].filter((k) => !locKeys.has(k))
    const extra = [...locKeys].filter((k) => !sourceKeys.has(k))
    if (missing.length || extra.length) {
      failed = true
      console.error(`[i18n] ${label}/${loc}: ${missing.length} fehlend, ${extra.length} ueberzaehlig`)
      if (missing.length)
        console.error(`  fehlend: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`)
      if (extra.length)
        console.error(`  extra:   ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ' …' : ''}`)
    } else {
      console.log(`[i18n] ${label}/${loc}: OK (${locKeys.size} Keys)`)
    }
  }
}

if (failed) {
  console.error('[i18n] Key-Completeness FEHLGESCHLAGEN')
  process.exit(1)
}
console.log('[i18n] Alle Locales vollstaendig.')
