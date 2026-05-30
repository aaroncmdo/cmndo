#!/usr/bin/env node
// AAR-939 · Monika-Embed · Stream 4 — Build-Script
//
// Baut src/embed/monika/index.tsx als self-contained IIFE nach
// public/embed/monika.v1.js (+ Alias monika.js). Preact + Signals werden
// IN das Bundle gebuendelt (esbuild jsx:automatic, jsxImportSource:preact) —
// nichts leckt in den Next-App-Bundle. Prueft das gzip-Budget (< 30 KB) und
// exitet 1 bei Ueberschreitung (CI-Gate).
//
// Aufruf: node scripts/build-monika.mjs   (bzw. npm run build:embed)

import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const entry = resolve(root, 'src/embed/monika/index.tsx')
const outDir = resolve(root, 'public/embed')
const versioned = resolve(outDir, 'monika.v1.js')
const alias = resolve(outDir, 'monika.js')

const BUDGET_GZIP_BYTES = 30 * 1024

mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2017'],
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  outfile: versioned,
  legalComments: 'none',
  banner: { js: '/* Claimondo Monika-Embed v1 — AAR-939 */' },
})

const built = readFileSync(versioned)
writeFileSync(alias, built) // Alias monika.js == letzte stabile Version (Plan Task 5.4)

const raw = built.length
const gz = gzipSync(built).length
const kb = (n) => (n / 1024).toFixed(1) + ' KB'
console.log(`[monika] built: ${kb(raw)} raw / ${kb(gz)} gzipped`)
console.log(`[monika] -> public/embed/monika.v1.js + monika.js`)

if (gz > BUDGET_GZIP_BYTES) {
  console.error(`[monika] BUDGET UEBERSCHRITTEN: ${kb(gz)} gzipped > ${kb(BUDGET_GZIP_BYTES)}`)
  process.exit(1)
}
console.log(`[monika] gzip-Budget ok (< ${kb(BUDGET_GZIP_BYTES)})`)
