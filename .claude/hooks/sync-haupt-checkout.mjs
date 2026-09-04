#!/usr/bin/env node
// SessionStart-Hook: haelt den HAUPT-Checkout aktuell.
//
// WARUM: Der Haupt-Checkout (das Verzeichnis, in dem jede neue Session startet) stand am
// 04.09.2026 auf `kitta/aar-956-embed-reservierung-rueckruf` mit HEAD vom 11.07. — 971 Commits
// hinter staging, und der Branch existierte NICHT auf origin. Es gab also nichts zu pullen; er
// konnte gar nicht von selbst nachziehen. Gearbeitet wird in `.claude/worktrees/*`, deshalb
// gehoerte dieses Verzeichnis niemandem und niemand hat es bewegt.
//
// Der Schaden ist nicht Datenverlust, sondern FALSCHE MESSUNGEN. Jeder grep/read im
// Haupt-Checkout misst dann einen Monate alten Baum. An einem einzigen Tag sind daraus zwei
// PHANTOM-BEFUNDE entstanden — laengst behobene Fehler, die als aktueller Mangel gemeldet
// wurden (`§ 5 TMG` im Impressum, `[USt-IdNr nicht konfiguriert]` im Kanzlei-PDF). Beide standen
// woertlich da; nur eben im falschen Baum. Aaron 04.09.: "pruef dass der haupt checkout IMMER
// mitgezogen wird das verursacht sonst harte fehler".
//
// WAS ER TUT — und was bewusst NICHT:
//   * Er faehrt `fetch` + `merge --ff-only`, wenn der Haupt-Checkout auf `main`/`staging` steht.
//     `--ff-only` kann per Konstruktion nichts ueberschreiben: bei lokalen Commits, bei
//     kollidierenden ungetrackten Dateien oder bei divergierter Historie bricht git ab.
//   * Steht er auf einem FEATURE-Branch, wird NICHTS bewegt — nur gewarnt. Dort koennte eine
//     andere Session arbeiten; ein Hook darf niemandem den Baum unter den Fuessen wegziehen.
//   * Er blockiert nie: jeder Fehler wird geschluckt, exit immer 0.
//
// ⚠ Beim Aufraeumen am 04.09. blockierten 17 ungetrackte Dateien den Wechsel, weil sie
// inzwischen auf main GETRACKT existieren. 9 davon wichen inhaltlich ab (aeltere Entwuerfe) und
// liegen gesichert unter `stampit-app/backup-haupt-checkout-2026-09-04/`. Genau diese Lage
// meldet der Hook, statt sie zu erzwingen.
//
// Niemals throw, immer exit 0 (ein Hook darf Claude Code nie blockieren).

import { execSync } from 'node:child_process'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Wie lange nach einem fetch nicht erneut gefetcht wird (Netz schonen bei paralleler Fleet). */
const FETCH_THROTTLE_MS = 5 * 60 * 1000
const ZWEIGE = new Set(['main', 'staging'])

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 }).trim()
}
function shOk(cmd, cwd) {
  try { sh(cmd, cwd); return true } catch { return false }
}
function tryS(cmd, cwd) {
  try { return sh(cmd, cwd) } catch { return '' }
}

function main() {
  // Der gemeinsame .git-Ordner liegt IMMER im Haupt-Checkout — auch wenn diese Session in
  // einem Worktree laeuft. Genau so findet der Hook das Verzeichnis, um das es geht.
  const commonDir = tryS('git rev-parse --path-format=absolute --git-common-dir')
  if (!commonDir) return
  const haupt = dirname(commonDir)
  if (!existsSync(join(haupt, '.git'))) return

  // Dry-Run zum Pruefen der Warn-Pfade, ohne den Checkout zu bewegen (Konvention wie
  // load-memory-digest.mjs --dry-branch):
  //   node .claude/hooks/sync-haupt-checkout.mjs --dry-zweig kitta/irgendwas
  const dry = process.argv.indexOf('--dry-zweig')
  const zweig = dry >= 0 ? process.argv[dry + 1] : tryS('git rev-parse --abbrev-ref HEAD', haupt)
  if (!zweig) return

  // Throttle: nicht bei jedem Session-Start eines von fuenf parallelen Fenstern fetchen.
  const stamp = join(commonDir, '.haupt-checkout-sync')
  const frisch = existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < FETCH_THROTTLE_MS
  if (!frisch) {
    shOk('git fetch origin main staging --quiet', haupt)
    try { writeFileSync(stamp, String(Date.now())) } catch {}
  }

  if (!ZWEIGE.has(zweig)) {
    // ⚠ BEWUSST KEIN Commit-Abstand. main und staging tragen durch das Squash-Reparent-Modell
    // absichtlich verschiedene Historien — `rev-list --count` liefert dort vierstellige Zahlen,
    // die NICHTS ueber den Inhalt sagen (AGENTS.md / memory: "git log zwischen main und staging
    // taugt nicht"). Aussagekraeftig ist, wie viele DATEIEN abweichen und wie alt HEAD ist.
    const dateien = tryS(`git diff --name-only HEAD origin/staging`, haupt).split('\n').filter(Boolean).length
    const alter = tryS(`git log -1 --format=%cs HEAD`, haupt) || '?'
    const aufOrigin = tryS(`git ls-remote --heads origin ${zweig}`, haupt) ? 'ja' : 'NEIN'
    return meldung(
      `⚠ **Haupt-Checkout steht auf \`${zweig}\`, nicht auf \`main\`/\`staging\`.**\n` +
      `**${dateien} Dateien** weichen von \`origin/staging\` ab, HEAD ist vom **${alter}**; ` +
      `auf origin existiert der Branch: ${aufOrigin}.\n\n` +
      `Das ist die Konstellation, die am 04.09. zwei Phantom-Befunde erzeugt hat: ` +
      `\`grep\`/\`read\` in \`${haupt}\` messen dann einen veralteten Baum, und ein Fund dort ` +
      `kann laengst behoben sein.\n\n` +
      `**Vor jedem datei-basierten Befund gegenpruefen:** \`git show origin/staging:<pfad>\`. ` +
      `Zum Aufraeumen: \`git -C "${haupt}" checkout main\` (bewegt nichts, wenn ungetrackte ` +
      `Dateien kollidieren — dann meldet git sie namentlich).`,
    )
  }

  const vorher = tryS('git rev-parse HEAD', haupt)
  const ziel = tryS(`git rev-parse origin/${zweig}`, haupt)
  if (!vorher || !ziel || vorher === ziel) return // schon aktuell: still bleiben

  if (shOk(`git merge --ff-only origin/${zweig}`, haupt)) {
    const n = tryS(`git rev-list --count ${vorher}..HEAD`, haupt) || '?'
    return meldung(`Haupt-Checkout (\`${zweig}\`) um **${n} Commits** nachgezogen → \`${ziel.slice(0, 9)}\`.`)
  }

  // ff-only hat abgelehnt — das ist die SICHERE Reaktion, nicht der Fehler. Grund benennen.
  const hinten = tryS(`git rev-list --count HEAD..origin/${zweig}`, haupt) || '?'
  const eigene = tryS(`git rev-list --count origin/${zweig}..HEAD`, haupt) || '?'
  return meldung(
    `⚠ **Haupt-Checkout (\`${zweig}\`) liess sich NICHT nachziehen** — ${hinten} Commits hinten, ` +
    `${eigene} eigene.\n\n` +
    `\`merge --ff-only\` bricht ab, statt etwas zu ueberschreiben. Typische Gruende: eigene ` +
    `Commits auf dem Branch, oder ungetrackte Dateien, die inzwischen getrackt existieren ` +
    `(genau das blockierte am 04.09. den Wechsel — 17 Stueck).\n\n` +
    `Ursache zeigen lassen: \`git -C "${haupt}" merge --ff-only origin/${zweig}\` — git nennt die ` +
    `Dateien beim Namen. **Bis dahin gilt: Datei-Befunde aus diesem Verzeichnis gegen ` +
    `\`origin/${zweig}\` gegenpruefen.**`,
  )
}

function meldung(text) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }),
  )
}

try { main() } catch {}
process.exit(0)
