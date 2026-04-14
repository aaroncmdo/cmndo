#!/usr/bin/env node
// AAR-105: Pre-Tool Hook - blockiert git commit -m "..." Messages
// die deutsche Wörter mit ASCII-Ersatz (ae/oe/ue/ss) statt Umlauten enthalten.

import { readFileSync } from 'node:fs'

let input
try {
  input = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  process.exit(0)
}

const command = input?.tool_input?.command ?? ''
if (!command.includes('git commit')) process.exit(0)

// Commit-Message aus -m "..." oder -m '...' oder HEREDOC extrahieren
const messages = []
const mFlagRegex = /-m\s+["']([^"']+)["']/g
let m
while ((m = mFlagRegex.exec(command)) !== null) {
  messages.push(m[1])
}
// HEREDOC Variante: cat <<'EOF' ... EOF
const hereRegex = /<<\s*['"]?EOF['"]?\s*\n([\s\S]*?)\nEOF/
const here = command.match(hereRegex)
if (here) messages.push(here[1])

if (messages.length === 0) process.exit(0)

// Verdächtige Patterns - typisch deutsche Wörter mit ASCII-Ersatz
const patterns = [
  { re: /\bfuer\b/i, hint: 'fuer → für' },
  { re: /\bloesch/i, hint: 'loesch → lösch' },
  { re: /\bnaechst/i, hint: 'naechst → nächst' },
  { re: /\baenderung/i, hint: 'aenderung → änderung' },
  { re: /\bueber(weisung|tragung|gabe|pruef|pruf|gang)/i, hint: 'ueber... → über...' },
  { re: /\bgroesse\b/i, hint: 'groesse → größe' },
  { re: /\bstrasse\b/i, hint: 'strasse → straße' },
  { re: /\bmoeglich/i, hint: 'moeglich → möglich' },
  { re: /\bmuess(en|t|ten)\b/i, hint: 'muessen → müssen' },
  { re: /\bfueg(en|t|st)/i, hint: 'fuegen → fügen' },
  { re: /\bfuell/i, hint: 'fuell → füll' },
  { re: /\babschliess/i, hint: 'abschliess → abschließ' },
  { re: /\bgeloescht/i, hint: 'geloescht → gelöscht' },
  { re: /\bgepruef/i, hint: 'gepruef → geprüf' },
  { re: /\bduerf(en|t)/i, hint: 'duerfen → dürfen' },
  { re: /\bkoenn(en|t|st)/i, hint: 'koennen → können' },
  { re: /\bmoegen\b/i, hint: 'moegen → mögen' },
  { re: /\bmoecht/i, hint: 'moecht → möcht' },
  { re: /\bzurueck/i, hint: 'zurueck → zurück' },
  { re: /\bausfuehr/i, hint: 'ausfuehr → ausführ' },
  { re: /\bbestaet/i, hint: 'bestaet → bestät' },
  { re: /\berklaer/i, hint: 'erklaer → erklär' },
  { re: /\bverfueg/i, hint: 'verfueg → verfüg' },
  { re: /\bueberpruef/i, hint: 'ueberpruef → überprüf' },
]

const matches = []
for (const msg of messages) {
  for (const p of patterns) {
    const mm = msg.match(p.re)
    if (mm) matches.push(`"${mm[0]}" (${p.hint})`)
  }
}

if (matches.length > 0) {
  const lines = [
    '',
    'AAR-105 HOOK: Commit-Message enthält ASCII-Ersatz für Umlaute!',
    '',
    `Gefundene Stellen: ${[...new Set(matches)].join(', ')}`,
    '',
    'Bitte echte Umlaute verwenden (ä/ö/ü/ß).',
    'Regel in AGENTS.md Sektion claimondo-language-rules.',
    '',
  ]
  process.stderr.write(lines.join('\n'))
  process.exit(2)
}

process.exit(0)
