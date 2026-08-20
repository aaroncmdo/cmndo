// Prueft die PR-Nummern im Memory-Index gegen GitHub und meldet Zeilen, die einen
// laengst gemergten PR als "offen" fuehren.
//
// WARUM: Der Index ist die Datei, die JEDE Session als Erstes liest. Steht dort
// "#5027: Aaron merge" und der PR ist seit Wochen gemergt, wartet eine Session auf
// etwas, das passiert ist — oder sucht Arbeit, die es nicht gibt. Am 20.08. traf das
// auf 8 von 8 genannten PRs zu (16 Nummern geprueft, ALLE gemergt).
//
// Bewusst KEIN CI-Gate: der Index liegt ausserhalb des Repos (~/.claude/projects/…)
// und `gh` braucht ein Login. Das hier ist ein lokales Werkzeug fuer die Index-Pflege.
//
// Aufruf:
//   node scripts/check-memory-pr-status.mjs            # Standardpfad
//   node scripts/check-memory-pr-status.mjs <pfad.md>
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STANDARD = join(
  homedir(),
  '.claude/projects/C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2/memory/MEMORY.md',
)
const pfad = process.argv[2] ?? STANDARD

if (!existsSync(pfad)) {
  console.log(`[memory-pr] Index nicht gefunden: ${pfad} — uebersprungen.`)
  process.exit(0)
}

const zeilen = readFileSync(pfad, 'utf8').split(/\r?\n/)

// Nur Zeilen, die einen PR als offen/wartend fuehren.
const OFFEN_MUSTER = /\b(offen|Aaron[- ]Merge|Aaron merge|wartet|pending)\b/i
// ⚠ Ohne diesen Ausschluss meldet das Werkzeug seine eigenen Korrekturen als Befund:
// eine Zeile wie "#5027 GEMERGT … offen nur noch Regel 4" enthaelt BEIDE Woerter.
// Beim Selbsttest 20.08. waren 3 von 3 Treffern genau solche Fehlalarme — ein Pruefer,
// der bereits erledigte Zeilen anmahnt, wird nach dem zweiten Mal ignoriert.
const ERLEDIGT_MUSTER = /GEMERGT|gemergt/
const kandidaten = []
zeilen.forEach((zeile, i) => {
  if (!OFFEN_MUSTER.test(zeile)) return
  if (ERLEDIGT_MUSTER.test(zeile)) return
  const nummern = [...zeile.matchAll(/#(\d{4,5})\b/g)].map((m) => m[1])
  if (nummern.length) kandidaten.push({ nr: i + 1, zeile, nummern })
})

if (!kandidaten.length) {
  console.log('[memory-pr] Keine Zeile fuehrt einen PR als offen. Nichts zu pruefen.')
  process.exit(0)
}

// Status einmal je PR abfragen (mehrere Zeilen koennen denselben PR nennen).
const cache = new Map()
function status(pr) {
  if (cache.has(pr)) return cache.get(pr)
  let s = 'UNBEKANNT'
  try {
    s = execFileSync('gh', ['pr', 'view', pr, '--json', 'state', '--jq', '.state'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // gh nicht eingeloggt / PR nicht auffindbar -> nicht als Befund werten
  }
  cache.set(pr, s)
  return s
}

const treffer = []
for (const k of kandidaten) {
  const gemergt = k.nummern.filter((n) => status(n) === 'MERGED')
  if (gemergt.length) treffer.push({ ...k, gemergt })
}

if (!treffer.length) {
  console.log(`[memory-pr] OK — ${kandidaten.length} Zeile(n) mit PR-Bezug, keine davon nennt einen gemergten PR als offen.`)
  process.exit(0)
}

console.log(`[memory-pr] ${treffer.length} Zeile(n) fuehren einen GEMERGTEN PR als offen:\n`)
for (const t of treffer) {
  console.log(`  Zeile ${t.nr}: #${t.gemergt.join(', #')} ist gemergt`)
  console.log(`    ${t.zeile.trim().slice(0, 150)}`)
}
console.log(`
⚠ "PR gemergt" heisst NICHT "Aufgabe erledigt" — bei mehreren Eintraegen steht dahinter
  noch ein Regel-4-Smoke oder Folgearbeit. Nur die Merge-Wartestellung ist erledigt.
  Zeile korrigieren, nicht blind loeschen.`)
// Kein exit(1): das ist ein Hinweis-Werkzeug, kein Gate.
