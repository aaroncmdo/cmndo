#!/usr/bin/env node
// postbuild: kopiert public/ + .next/static/ nach .next/standalone/ —
// `next build` legt dort nur server.js + node_modules + package.json ab, NICHT
// public/ und .next/static/. Ohne diese fehlen CSS, Fonts, Favicon, Bilder.
// Cross-platform (Node fs.cp) — laeuft auf Windows-Dev UND Linux-VPS.
// Lektion autounfall-io DEPLOY.md §4.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standalone = join(root, '.next', 'standalone')

if (!existsSync(standalone)) {
  console.log('[copy-standalone] .next/standalone fehlt — output:"standalone" gesetzt? Skip.')
  process.exit(0)
}

const jobs = [
  { from: join(root, 'public'), to: join(standalone, 'public') },
  { from: join(root, '.next', 'static'), to: join(standalone, '.next', 'static') },
]

for (const { from, to } of jobs) {
  if (!existsSync(from)) {
    console.log(`[copy-standalone] ${from} fehlt — skip.`)
    continue
  }
  // CLEAN copy (08n-Ruecklaeufer): cpSync MERGED nur — Alt-Staende/Strays im
  // Ziel ueberleben und mischen sich mit neuen Build-Hashes (Symptom: HTML 200,
  // /assets/* 500 auf dem Standalone-Server). Ziel vorher loeschen.
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
  console.log(`[copy-standalone] ${from} -> ${to}`)
}
console.log('[copy-standalone] fertig.')
