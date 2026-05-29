// Einmal-Fix: re-encodet Windows-1252-kodierte placeholder-Stubs nach UTF-8.
// Sicher, weil die Stubs reine Kommentar-Marker sind (kein DDL). Idempotent:
// laeuft nur ueber Files, die AKTUELL ungueltiges UTF-8 sind, und verifiziert das Ergebnis.
// Hintergrund + Verifikation: docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const isValidUtf8 = (buf) => {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return true
  } catch {
    return false
  }
}

let fixed = 0
let skipped = 0
for (const name of readdirSync(DIR).filter((n) => n.endsWith('.sql'))) {
  const path = join(DIR, name)
  const buf = readFileSync(path)
  if (isValidUtf8(buf)) {
    skipped++
    continue // schon UTF-8 -> nichts tun
  }
  const text = new TextDecoder('windows-1252').decode(buf) // verlustfrei aus Latin-1
  const out = Buffer.from(text, 'utf-8')
  if (!isValidUtf8(out)) {
    console.error('STILL INVALID:', name)
    process.exitCode = 1
    continue
  }
  writeFileSync(path, out) // CRLF bleibt erhalten (sind ASCII-Bytes)
  fixed++
}
console.log(`re-encoded=${fixed} already-utf8=${skipped}`)
