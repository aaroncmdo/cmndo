#!/usr/bin/env node
// i18n Render-Check (Strategie B, Ergaenzung zu check-complete.mjs).
//
// check-complete.mjs erzwingt nur Key-PARITAET (gleiche Key-Sets ueber alle 6
// Locales). Es prueft NICHT, ob die WERTE valide ICU sind. Eine kaputte
// Plural-/Select-Syntax, ein umbenannter/fehlender {placeholder} oder ein
// unbalanciertes <tag> rendert mit next-intl nicht den Text, sondern wirft zur
// Laufzeit (IntlError) — also genau dort, wo der Nutzer ihn sieht.
//
// Dieses Script kompiliert + formatiert JEDE Message in JEDER Locale durch die
// gleiche Engine, die next-intl nutzt (intl-messageformat). Faengt:
//   * unbalancierte/ungeschlossene Tags (UNCLOSED_TAG)
//   * kaputte ICU-Plural-/Select-Bloecke (Syntax)
//   * Klammer-Imbalancen in {...}
// Laeuft komplett offline (kein App/DB-Bedarf) und ist damit CI-tauglich.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IntlMessageFormat } from 'intl-messageformat'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MESSAGES_DIR = path.resolve(__dirname, '../../src/i18n/messages')
const LOCALES = ['de', 'en', 'tr', 'pl', 'ru', 'ar']

// Dokumentierte Ausnahmen (analog token-audit-Whitelist): Keys die intl-messageformat
// nicht kompiliert, aber bewusst so bleiben.
//   * wie_es_funktioniert.faqs.5.antwort — enthaelt das LITERALE URL-Muster
//     "/kfz-gutachter/<stadt>" (kein Tag, sondern Platzhalter-Doku). Namespace
//     wie_es_funktioniert ist nach dem Marketing-Split (#2121) in claimondo-marketing
//     ausgelagert und wird in der Main-App nicht via useTranslations konsumiert
//     -> kein Render-/Crash-Risiko hier. Fix gehoert zum Marketing-Owner.
const SKIP = new Set([
  'wie_es_funktioniert.faqs.5.antwort',
])

function flatten(node, prefix = [], acc = {}) {
  if (typeof node === 'string') { acc[prefix.join('.')] = node; return acc }
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) flatten(node[key], [...prefix, key], acc)
  }
  return acc
}

// Liefert Dummy-Argumente, damit format() nicht an FEHLENDEN Werten scheitert
// (wir wollen nur SYNTAX-/Struktur-Fehler sehen, keine "missing value"-Rauschen):
//   * {name}, {count, plural, ...} -> Zahl 2 (passt fuer plural/select/simple)
//   * <tag>...</tag>               -> Identitaets-Handler
function buildArgs(message) {
  const args = {}
  for (const m of message.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)) args[m[1]] = 2
  for (const m of message.matchAll(/<\/?([a-zA-Z][\w-]*)>/g)) args[m[1]] = (parts) => parts
  return args
}

let totalTested = 0
let totalErrors = 0
const errorsByLocale = {}

for (const locale of LOCALES) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`)
  const flat = flatten(JSON.parse(fs.readFileSync(file, 'utf8')))
  let tested = 0
  const errors = []
  for (const [key, message] of Object.entries(flat)) {
    if (typeof message !== 'string') continue
    if (SKIP.has(key)) continue
    tested++
    try {
      new IntlMessageFormat(message, locale).format(buildArgs(message))
    } catch (err) {
      errors.push({ key, message: message.slice(0, 90), err: String(err.message || err).slice(0, 140) })
    }
  }
  totalTested += tested
  totalErrors += errors.length
  errorsByLocale[locale] = errors
  if (errors.length === 0) {
    console.log(`[i18n-render] ${locale}: OK (${tested} Messages)`)
  } else {
    console.error(`[i18n-render] ${locale}: ${errors.length} FEHLER (${tested} getestet)`)
    for (const e of errors) {
      console.error(`    ✗ ${e.key}`)
      console.error(`        err: ${e.err}`)
      console.error(`        msg: ${e.message}`)
    }
  }
}

if (totalErrors === 0) {
  console.log(`[i18n-render] Alle Messages kompilieren — ${totalTested} geprueft, 0 Fehler.`)
  process.exit(0)
} else {
  console.error(`\n[i18n-render] ${totalErrors} Render-Fehler. Diese wuerden next-intl zur Laufzeit werfen.`)
  console.error('[i18n-render] Fix: ICU-Syntax/Plural-Block korrigieren, {placeholder} angleichen, <tag> schliessen — oder (falls bewusst literal + ungenutzt) in SKIP dokumentieren.')
  process.exit(1)
}
