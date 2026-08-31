#!/usr/bin/env node
// Secret-Gate — blockt eingecheckte Zugangsdaten.
//
// Warum es das gibt: Am 31.08.2026 meldete GitGuardian ein Passwort im Repo.
// Verifiziert wurde, dass `test-admin@claimondo.de` mit dem dort lesbaren Passwort
// HTTP 200 gegen die prod-Auth-API lieferte — das Repo ist PUBLIC, also konnte sich
// jeder als Admin auf der Produktivumgebung anmelden. 181 Dateien trugen Klartext-
// Passwoerter. Siehe docs/2026-08-31-secret-leak-postmortem.md.
//
// Baseline ist bewusst NULL (kein Ratchet wie bei knip/component-set): ein Secret
// ist kein technischer Schuldposten, den man abtraegt, sondern ein sofortiger Defekt.
//
// Aufruf:  node scripts/check-secrets.mjs          (exit 1 bei Fund)
//          node scripts/check-secrets.mjs --warn   (immer exit 0, nur Ausgabe)
//
// GRENZE, bewusst und getestet: Dateien mit einem Null-Byte gelten als binaer und werden
// uebersprungen (sonst melden Bilder/Fonts staendig Zufallstreffer). Ein Secret in einer
// Datei, die zusaetzlich ein Null-Byte enthaelt, findet dieses Gate also NICHT. Das schuetzt
// gegen versehentliches Einchecken -- nicht gegen jemanden, der die Pruefung absichtlich
// umgehen will. Fuer letzteres braucht es serverseitiges Scanning (GitGuardian o.ae.).

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const WARN_ONLY = process.argv.includes('--warn')

/** Nur Muster mit sehr geringer Falsch-Positiv-Rate. Ein Gate, das nervt, wird abgeschaltet. */
const MUSTER = [
  { name: 'Private-Key-Block',      re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS Access Key',         re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Token',           re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'Anthropic API Key',      re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API Key',         re: /\bsk-[A-Za-z0-9]{40,}\b/ },
  { name: 'Stripe LIVE Key',        re: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Google API Key',         re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack Token',            re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'JWT (z.B. Supabase-Key)', re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\./ },
  { name: 'DB-URL mit Passwort',    re: /\b(?:postgres|postgresql|mysql|mongodb)(?:\+srv)?:\/\/[^:/@\s]+:[^@/\s]{3,}@/ },
  // Regressionsschutz: exakt die Passwoerter aus dem Vorfall vom 31.08.2026.
  { name: 'Leak-Passwort (31.08.)', re: /Claimondo2026!|Test1234!/ }, // check-secrets-allow
]

/** Binaerdateien + Lockfiles: dort waeren Treffer praktisch immer Rauschen. */
const SKIP_ENDUNG = /\.(png|jpe?g|gif|webp|svg|pdf|ico|woff2?|ttf|eot|mp4|mov|zip|gz)$/i
const SKIP_PFAD = /(^|\/)(node_modules|\.next|dist|build)\//
const SKIP_DATEI = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/

const dateien = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .filter((f) => f && !SKIP_ENDUNG.test(f) && !SKIP_PFAD.test(f) && !SKIP_DATEI.test(f))

const funde = []
for (const datei of dateien) {
  let inhalt
  try {
    // Erst als Buffer lesen und dort auf ein Null-Byte pruefen (Byte 0 == Binaerdatei).
    // Bewusst ueber den Buffer statt ueber einen String-Vergleich: stuende im Quelltext
    // ein LITERALES Null-Byte, truege diese Datei es selbst -- das Gate wuerde sich
    // selbst ueberspringen, und jede Datei mit einem Null-Byte koennte die Pruefung
    // umgehen. Genau der Bug war beim Bau drin; aufgefallen ist er nur, weil sich das
    // Gate in der Positivkontrolle nicht selbst fand.
    const buf = readFileSync(datei)
    if (buf.includes(0)) continue
    inhalt = buf.toString('utf8')
  } catch {
    continue // unlesbar/binaer -> ueberspringen
  }
  const zeilen = inhalt.split('\n')
  for (let i = 0; i < zeilen.length; i++) {
    // Zeilen, die das Gate selbst beschreiben, duerfen die Muster nennen.
    if (zeilen[i].includes('check-secrets-allow')) continue
    for (const m of MUSTER) {
      if (m.re.test(zeilen[i])) funde.push({ datei, zeile: i + 1, muster: m.name })
    }
  }
}

if (funde.length === 0) {
  console.log(`[secrets] OK — ${dateien.length} Dateien geprueft, keine Zugangsdaten gefunden.`)
  process.exit(0)
}

console.error(`[secrets] ${funde.length} moegliche Zugangsdaten im Repo:\n`)
for (const f of funde.slice(0, 50)) {
  // Bewusst OHNE den Treffer-Text: die Ausgabe landet im CI-Log, das oft breiter lesbar ist.
  console.error(`  ${f.datei}:${f.zeile}  [${f.muster}]`)
}
if (funde.length > 50) console.error(`  … und ${funde.length - 50} weitere`)
console.error(`
Was tun:
  1. Wert aus dem Code nehmen -> process.env.<NAME>, ohne Klartext-Fallback.
  2. Den echten Wert als GitHub-Secret hinterlegen (gh secret set <NAME>).
  3. Ist der Wert je gepusht worden, gilt er als kompromittiert -> ROTIEREN.
     Das Repo ist public; Aufraeumen allein reicht nicht.`)

process.exit(WARN_ONLY ? 0 : 1)
