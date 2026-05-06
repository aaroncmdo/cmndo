// Konvertiert die per Drive-txt-Export heruntergeladenen Legal-Texte
// (src/content/legal/*.txt) zu einfachem Markdown:
//   - erste Zeile  -> # Title
//   - "§ N ..."    -> ## § N ...
//   - leerzeilen werden eingefuegt zwischen Bloecken
//
// Nach Lauf bleibt nur die .md-Variante uebrig.

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/content/legal'
const FILES = ['agb', 'datenschutz', 'impressum', 'nutzungsbedingungen']

for (const name of FILES) {
  const txtPath = join(DIR, `${name}.txt`)
  const raw = readFileSync(txtPath, 'utf8').replace(/﻿/g, '').replace(/\r\n/g, '\n')
  const lines = raw.split('\n').map((l) => l.trim()).filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))

  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      out.push('')
      continue
    }
    if (i === 0) {
      out.push(`# ${line}`)
      out.push('')
      continue
    }
    if (/^§\s*\d+/.test(line)) {
      // Section heading
      if (out[out.length - 1] !== '') out.push('')
      out.push(`## ${line}`)
      out.push('')
      continue
    }
    out.push(line)
  }

  // Doppelte Leerzeilen kollabieren
  const md = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  writeFileSync(join(DIR, `${name}.md`), md, 'utf8')
  unlinkSync(txtPath)
  console.log(`✓ ${name}.md (${md.length} bytes)`)
}
