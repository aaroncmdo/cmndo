#!/usr/bin/env node
// Team-Nummern-Gate (Aaron 21.09.2026)
//
//   "nimm fuer alle tests unsere nummern raus, nur das was echt ist soll bei uns ankommen"
//
// Unsere eigenen Mobilnummern standen in 24 Test-, Spec- und Smoke-Dateien. Besonders teuer:
// die neun `scripts/smoke/ep-*.mjs` fuellten `process.env.EP_TELEFON || '<Aarons Nummer>'` in
// echte Formulare — und EP_TELEFON ist nirgends gesetzt, der Fallback war also IMMER aktiv.
// Jeder Smoke-Lauf erzeugte damit einen Lead mit Aarons Nummer; die Folge-WhatsApps kamen auf
// seinem Geraet an und waren von echten Kundenmeldungen nicht zu unterscheiden.
//
// Dieses Gate haelt die Klasse dauerhaft zu: die Team-Nummern duerfen NUR in den Dateien
// stehen, die sie produktiv brauchen (Team-Alarm-Versand). Ueberall sonst: Fehler.
//
// ⭐ Die Nummern stehen NICHT in diesem Skript. Es liest sie aus der Quelle der Wahrheit
//    (WA_TEAM_EMPFAENGER in src/lib/whatsapp/team-notify.ts) — sonst haette der Detektor die
//    Nummern ein weiteres Mal ins oeffentliche Repo geschrieben, also genau das getan, was er
//    verhindern soll. Nebeneffekt: aendert sich die Teamliste, folgt das Gate automatisch.
//
// Lauf:  npm run check:team-nummern            (warn, exit 0)
//        npm run check:team-nummern -- --ratchet   (blockt, exit 1)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RATCHET = process.argv.includes('--ratchet')
const WURZEL = process.cwd()

// Dateien, die die Nummern produktiv brauchen — hier ist ihr Platz, nirgends sonst.
const ERLAUBT = new Set([
  'src/lib/whatsapp/team-notify.ts',
  'src/lib/leads/notify-new-lead.ts',
  'claimondo-marketing/lib/whatsapp/team-notify.ts',
  'claimondo-marketing/lib/leads/notify-new-lead.ts',
  'claimondo-marketing/app/[locale]/kfzgutachter-lp/actions.ts',
  'claimondo-marketing/app/kfzgutachter-lp/actions.ts',
  // Applizierte Migrationen sind unveraenderlich (Regel 2) — historischer Bestand.
  'supabase/migrations/20260603214445_cmm_entity_dupe_candidates_drop_noisy_phone.sql',
])

const QUELLE = 'src/lib/whatsapp/team-notify.ts'
const SCAN_WURZELN = ['src', 'tests', 'scripts', 'claimondo-marketing', 'docs']
const ENDUNGEN = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sql', '.yml', '.yaml']
const UEBERSPRINGEN = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'playwright-report', 'test-results'])

function teamNummern() {
  let quelle
  try {
    quelle = readFileSync(join(WURZEL, QUELLE), 'utf8')
  } catch {
    console.error(`[team-nummern] Quelle nicht lesbar: ${QUELLE}`)
    console.error('[team-nummern] Ohne Quelle der Wahrheit kann das Gate nichts pruefen — fail-closed.')
    process.exit(1)
  }
  const block = quelle.match(/WA_TEAM_EMPFAENGER\s*=\s*\[([^\]]*)\]/)
  if (!block) {
    console.error('[team-nummern] WA_TEAM_EMPFAENGER nicht gefunden — wurde die Konstante umbenannt?')
    console.error('[team-nummern] Fail-closed: lieber ein lauter Fehler als ein stiller blinder Waechter.')
    process.exit(1)
  }
  const nummern = [...block[1].matchAll(/['"`]\s*\+?([0-9 ()/-]{8,})\s*['"`]/g)]
    .map((m) => m[1].replace(/\D/g, ''))
    .filter(Boolean)
  if (nummern.length === 0) {
    console.error('[team-nummern] WA_TEAM_EMPFAENGER ist leer — nichts zu pruefen, das ist verdaechtig.')
    process.exit(1)
  }
  // Der nationale Teil (ohne Laendervorwahl) ist spezifisch genug und findet auch
  // Schreibweisen wie 0163..., 0049163..., +49 163 ... nach dem Ziffern-Strippen.
  return nummern.map((n) => (n.startsWith('49') ? n.slice(2) : n))
}

function* dateien(verzeichnis) {
  let eintraege
  try {
    eintraege = readdirSync(verzeichnis, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of eintraege) {
    if (UEBERSPRINGEN.has(e.name)) continue
    const voll = join(verzeichnis, e.name)
    if (e.isDirectory()) yield* dateien(voll)
    else if (ENDUNGEN.some((x) => e.name.endsWith(x))) yield voll
  }
}

const gesucht = teamNummern()
const treffer = []

for (const wurzel of SCAN_WURZELN) {
  const basis = join(WURZEL, wurzel)
  try {
    if (!statSync(basis).isDirectory()) continue
  } catch {
    continue
  }
  for (const datei of dateien(basis)) {
    const rel = relative(WURZEL, datei).split(sep).join('/')
    if (ERLAUBT.has(rel)) continue
    let inhalt
    try {
      inhalt = readFileSync(datei, 'utf8')
    } catch {
      continue
    }
    inhalt.split(/\r?\n/).forEach((zeile, i) => {
      // Ziffern-Strip pro ZEILE: findet auch die mit Leerzeichen, Klammern oder Bindestrichen
      const ziffern = zeile.replace(/\D/g, '')
      for (const nr of gesucht) {
        if (ziffern.includes(nr)) {
          treffer.push({ rel, zeile: i + 1, text: zeile.trim().slice(0, 110) })
          break
        }
      }
    })
  }
}

if (treffer.length === 0) {
  console.log(`[team-nummern] ${gesucht.length} Team-Nummer(n) geprueft — ausserhalb der ${ERLAUBT.size} erlaubten Dateien: 0 Fundstellen.`)
  process.exit(0)
}

console.log(`[team-nummern] ✖ ${treffer.length} Fundstelle(n) mit einer Team-Nummer ausserhalb der erlaubten Dateien:`)
for (const t of treffer) console.log(`   ${t.rel}:${t.zeile}  ${t.text}`)
console.log('')
console.log('Unsere eigenen Nummern gehoeren NICHT in Tests, Seeds, Specs oder Smoke-Skripte')
console.log('(AGENTS.md Regel 7). Sonst erzeugt jeder Lauf Nachrichten auf echten Geraeten, die')
console.log('von echten Kundenmeldungen nicht zu unterscheiden sind.')
console.log('')
console.log('Stattdessen: telefon = NULL, oder eine Platzhalter-Nummer mit der in Deutschland')
console.log('NICHT vergebenen Vorwahl +49 123 ... — die erkennt istDummyTelefon(), und der')
console.log('WhatsApp-Chokepoint unterdrueckt sie.')
console.log('')
console.log('Braucht eine Datei die Nummern wirklich produktiv? Dann in ERLAUBT aufnehmen —')
console.log('mit Begruendung, nicht stillschweigend.')

process.exit(RATCHET ? 1 : 0)
