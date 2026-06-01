#!/usr/bin/env node
// postbuild: kopiert public/ + .next/static/ nach .next/standalone/ —
// `next build` legt dort nur server.js + node_modules + package.json ab, NICHT
// public/ und .next/static/. Ohne diese fehlen CSS, Fonts, Favicon, Bilder.
// Cross-platform (Node fs.cp) — läuft auf Windows-Dev UND Linux-VPS.
// Pattern aus autounfall-io DEPLOY.md §4 + Cluster-LPs.
import { cpSync, existsSync } from 'node:fs'
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
  // Marketing-Content: claimondo-mdx liest .md zur Laufzeit ueber process.cwd()/content.
  // Standalone-cwd = .next/standalone -> Content muss mitkopiert werden.
  { from: join(root, 'content'), to: join(standalone, 'content') },
]

for (const { from, to } of jobs) {
  if (!existsSync(from)) {
    console.log(`[copy-standalone] ${from} fehlt — skip.`)
    continue
  }
  cpSync(from, to, { recursive: true })
  console.log(`[copy-standalone] ${from} -> ${to}`)
}
console.log('[copy-standalone] fertig.')
