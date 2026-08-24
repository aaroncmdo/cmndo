#!/usr/bin/env node
// Migration-File-Drift-Bremse (check:migration-files).
//
// Faengt die Gegenrichtung der ueblichen Twin-Drift: eine Migration ist in
// supabase_migrations.schema_migrations GETRACKT und auf prod appliziert, aber ihr File
// fehlt im Repo. Nach Regel 2 laeuft DDL ueber apply_migration — also zuerst auf prod,
// das File kommt erst danach. Bleibt Schritt 4 aus, ist das Schema nicht mehr
// reproduzierbar.
//
// Warum das nicht kosmetisch ist (19.08. ZWEIMAL an einem Tag, 7 Files):
// Fehlende Files sind additiv und stuerzen den Supabase-Preview-Replay nicht sofort ab —
// bis eine SPAETERE Migration eines der fehlenden Objekte anfasst. Dann stirbt der Replay
// mit 42P01, und zwar auf JEDEM PR mit Migrations-Diff, nicht nur beim Verursacher.
// PRs ohne SQL zeigen `skipping` und sehen unauffaellig aus; der Schaden wandert
// unbemerkt von Lane zu Lane.
//
// Modi:
//   (default)  --warn             : listet fehlende Files, exit 0 (Dev-Ergonomie/CI-Sichtbarkeit)
//   --ratchet                     : exit 1 wenn NEUE fehlende ggue. Baseline
//   --update-baseline             : schreibt Baseline auf den aktuellen Stand
//
// Die Baseline traegt die bekannten, bewusst folgenlosen Luecken (siehe JSON-`note`).
//
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Ohne ENV wird uebersprungen (exit 0) — lokal ohne Secrets soll nichts rot werden.
// Backing-RPC: public.audit_migration_versions() (service_role-only, read-only).
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'migration-files-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  // Bewusst exit 0: ein uebersprungener Check darf keinen roten Build erzeugen.
  // ⚠ Das Skip steht NUR hier im Log — im Statusfeld sieht es aus wie "bestanden".
  console.log('⏭  check:migration-files uebersprungen — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.')
  process.exit(0)
}

const db = createClient(url, key, { auth: { persistSession: false } })

// ⚠ PostgREST deckelt JEDE Antwort bei 1000 Zeilen — auch die einer set-returning RPC,
// und ohne jede Fehlermeldung. Die RPC selbst hat kein LIMIT; der Deckel sitzt davor.
//
// Warum das hier toedlich war: `audit_migration_versions()` sortiert `ORDER BY version`,
// also lieferte der einzelne Aufruf die 1000 AELTESTEN Migrationen — und liess die
// NEUESTEN weg. Genau dort entstehen fehlende Files. Am 20.08. gemessen: 1236 getrackt,
// 1000 gesehen, 236 im blinden Fleck (11.07.–19.08.). Der Check meldete "0 ohne File",
// obwohl 2 fehlten — beide lagen im ungesehenen Rest.
//
// ⭐ Das Instrument war also nicht kaputt, sondern TEILBLIND — und teilblind meldet
// Entwarnung, nicht Fehler. Die Positiv-Kontrolle unten fing nur den Totalausfall
// (0 Zeilen); "genau voll" sah aus wie ein gueltiges Ergebnis.
const SEITE = 1000
const data = []
for (let von = 0; ; von += SEITE) {
  const { data: seite, error } = await db.rpc('audit_migration_versions').range(von, von + SEITE - 1)
  if (error) {
    console.error('[migration-files] RPC audit_migration_versions() fehlgeschlagen:', error.message)
    process.exit(mode === 'ratchet' ? 1 : 0)
  }
  data.push(...seite)
  // Eine NICHT volle Seite ist der einzige verlaessliche Beweis, dass es nichts mehr gibt.
  if (seite.length < SEITE) break
  if (data.length > 100_000) {
    console.error('[migration-files] > 100.000 Zeilen — Abbruch (Endlosschleife?). Instrument pruefen.')
    process.exit(mode === 'ratchet' ? 1 : 0)
  }
}

// Positiv-Kontrolle: eine leere Liste heisst hier "RPC kaputt", nicht "keine Migrationen".
if (data.length === 0) {
  console.error('[migration-files] RPC lieferte 0 Versionen — das kann nicht stimmen. Instrument pruefen.')
  process.exit(mode === 'ratchet' ? 1 : 0)
}

const repoVersionen = new Set(
  execSync('git ls-files "supabase/migrations/*.sql"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((p) => p.replace(/^supabase\/migrations\//, '').split('_')[0]),
)

const fehlend = data
  .filter((m) => !repoVersionen.has(m.version))
  .map((m) => `${m.version}_${m.name}`)
  .sort()

const baseline = existsSync(BASELINE_PATH)
  ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).versions ?? [])
  : []

if (mode === 'update') {
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        note:
          'Getrackte Migrationen OHNE File im Repo. Der Ratchet blockt NEUE. Eintragen nur mit ' +
          'Begruendung, WARUM die Luecke folgenlos ist — sonst gehoert das File nachgezogen ' +
          '(Statement steht in supabase_migrations.schema_migrations.statements, md5-Abgleich machen).',
        count: fehlend.length,
        versions: fehlend,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`[migration-files] Baseline aktualisiert: ${fehlend.length} Eintraege -> ${BASELINE_PATH}`)
  process.exit(0)
}

const neu = fehlend.filter((f) => !baseline.includes(f))

if (fehlend.length > 0 && mode === 'warn') {
  for (const f of fehlend) {
    const bekannt = baseline.includes(f) ? ' (Baseline)' : ' <<< NEU'
    console.warn(`[migration-files] getrackt, aber kein File im Repo: ${f}${bekannt}`)
  }
}

console.log(
  `[migration-files] ${data.length} getrackt, ${repoVersionen.size} Files, ${fehlend.length} ohne File (Baseline ${baseline.length}), ${neu.length} neu.`,
)

if (mode === 'ratchet' && neu.length > 0) {
  console.error(
    `\n[migration-files] ✖ ${neu.length} getrackte Migration(en) ohne File im Repo:\n` +
      neu.map((f) => `   - ${f}`).join('\n') +
      '\n\nSo behebst du das (Regel 2, Schritt 4 nachholen):\n' +
      "   1. Statement holen:  select statements[1] from supabase_migrations.schema_migrations where version='<V>';\n" +
      '   2. Datei anlegen:    supabase/migrations/<V>_<name>.sql  (Inhalt 1:1)\n' +
      "   3. Gegenpruefen:     md5 der Datei == md5(statements[1])  — Laenge allein reicht NICHT\n" +
      '   4. Committen.\n\n' +
      'Ist die Luecke nachweislich folgenlos (Objekt existiert gar nicht), stattdessen:\n' +
      '   npm run check:migration-files -- --update-baseline   + Begruendung im PR.\n',
  )
  process.exit(1)
}

process.exit(0)
