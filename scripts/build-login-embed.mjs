#!/usr/bin/env node
// AAR-login-embed · L2 — Build-Script
//
// Baut src/embed/login/index.ts als self-contained IIFE nach
// public/embed/claimondo-login.v1.js (+ Alias claimondo-login.js). Vanilla
// (kein Framework) -> deutlich kleiner als Monika. Prueft das gzip-Budget
// (< 8 KB) und exitet 1 bei Ueberschreitung (CI-Gate).
//
// Aufruf: node scripts/build-login-embed.mjs   (bzw. npm run build:embed:login)
// Disjunkt zum Monika-Bundle (monika.v1.js / build-monika.mjs) — kein Konflikt.

import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const entry = resolve(root, 'src/embed/login/index.ts')
const outDir = resolve(root, 'public/embed')
const versioned = resolve(outDir, 'claimondo-login.v1.js')
const alias = resolve(outDir, 'claimondo-login.js')

const BUDGET_GZIP_BYTES = 8 * 1024

mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2017'],
  platform: 'browser',
  outfile: versioned,
  legalComments: 'none',
  banner: { js: '/* Claimondo Login-Embed v1 */' },
})

const built = readFileSync(versioned)
writeFileSync(alias, built) // Alias claimondo-login.js == letzte stabile Version

const raw = built.length
const gz = gzipSync(built).length
const kb = (n) => (n / 1024).toFixed(1) + ' KB'
console.log(`[login-embed] built: ${kb(raw)} raw / ${kb(gz)} gzipped`)
console.log(`[login-embed] -> public/embed/claimondo-login.v1.js + claimondo-login.js`)

if (gz > BUDGET_GZIP_BYTES) {
  console.error(`[login-embed] BUDGET UEBERSCHRITTEN: ${kb(gz)} gzipped > ${kb(BUDGET_GZIP_BYTES)}`)
  process.exit(1)
}
console.log(`[login-embed] gzip-Budget ok (< ${kb(BUDGET_GZIP_BYTES)})`)
