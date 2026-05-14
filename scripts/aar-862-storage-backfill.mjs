// AAR-862 — Storage-Backfill: bestehende Files auf claims/{claim_id}/<segment>/...
//
// Strategie pro File:
//   1. Source-Pfad aus fall_dokumente.storage_path lesen
//   2. Ziel-Pfad aus claim_id + dokument_typ ableiten (Mapping unten)
//   3. Download via service_role, Upload unter neuem Pfad
//   4. Alten Pfad löschen
//   5. fall_dokumente.storage_path auf neuen Wert updaten
//
// Idempotent: Files die schon unter claims/... liegen werden geskippt.
// Verbose-Logs damit nachvollziehbar; --dry-run zum trockenen Lauf.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAIN_REPO = path.resolve(__dirname, '../../../../')

// .env.local aus Main-Repo laden
config({ path: path.join(MAIN_REPO, '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const BUCKET = 'fall-dokumente'
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Pfad-Mapping: alte Top-Level-Segmente → neue claims/{claim_id}/<segment>/<file>
//   kunde-uploads/<uid>/<fall_id>/<rest>           → claims/<claim_id>/{pflicht|kunde-nachreichung}/<rest>
//   gutachter-dateien/<fall_id>/<rest>             → claims/<claim_id>/sv/<rest> (gutachten kategorie → gutachten/)
//   sa-dokumente/<fall_id>/<rest>                  → claims/<claim_id>/sa/<rest>
//   claim/<claim_id>/signed/<rest>                 → claims/<claim_id>/sa/<rest> (alter Singular-Pfad)
//
// Wenn dokument_typ nicht zu Mapping passt → 'sonstiges'-Segment.
function buildTargetPath(row) {
  const { storage_path, claim_id, dokument_typ } = row
  if (!claim_id) return null

  const fileName = storage_path.split('/').pop()
  if (!fileName) return null

  if (storage_path.startsWith(`claims/${claim_id}/`)) {
    return null // schon migriert
  }

  if (storage_path.startsWith('claim/')) {
    // Alter Singular-Pfad mit signed/ → sa/
    return `claims/${claim_id}/sa/${fileName}`
  }
  if (storage_path.startsWith('sa-dokumente/')) {
    return `claims/${claim_id}/sa/${fileName}`
  }
  if (storage_path.startsWith('gutachter-dateien/')) {
    const segment = dokument_typ === 'gutachten' ? 'gutachten' : 'sv'
    return `claims/${claim_id}/${segment}/${fileName}`
  }
  if (storage_path.startsWith('kunde-uploads/')) {
    // Slot aus dokument_typ ableiten — 'kunde-nachreichung' bleibt separat,
    // alle anderen Slots werden Pflicht-Uploads
    const segment = dokument_typ === 'kunde-nachreichung'
      ? 'kunde-nachreichung'
      : `pflicht/${dokument_typ ?? 'sonstiges'}`
    return `claims/${claim_id}/${segment}/${fileName}`
  }
  // Unbekanntes Schema → in sonstiges/ ablegen
  return `claims/${claim_id}/sonstiges/${fileName}`
}

async function migrateOne(row) {
  const target = buildTargetPath(row)
  if (!target) {
    console.log(`  ⤳ skip (kein Mapping oder schon migriert): ${row.storage_path}`)
    return { skipped: true }
  }
  if (target === row.storage_path) {
    console.log(`  ⤳ skip (Pfad identisch): ${row.storage_path}`)
    return { skipped: true }
  }

  console.log(`  ${row.storage_path}`)
  console.log(`    → ${target}`)

  if (DRY_RUN) return { migrated: false, dryRun: true }

  // Download
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(row.storage_path)
  if (dlErr) {
    console.error(`    ✗ download fail: ${dlErr.message}`)
    return { error: dlErr.message }
  }

  // Upload zum neuen Pfad — Content-Type aus DB-Eintrag, fallback auf blob.type
  const buffer = Buffer.from(await blob.arrayBuffer())
  const contentType = row.mime_type || blob.type || 'application/octet-stream'
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(target, buffer, { contentType, upsert: false })
  if (upErr) {
    console.error(`    ✗ upload fail: ${upErr.message}`)
    return { error: upErr.message }
  }

  // DB-Eintrag updaten
  const { error: updErr } = await supabase
    .from('fall_dokumente')
    .update({ storage_path: target })
    .eq('id', row.id)
  if (updErr) {
    console.error(`    ✗ db update fail: ${updErr.message} — Datei steht jetzt unter beiden Pfaden!`)
    return { error: updErr.message, leak: true }
  }

  // Alten Pfad löschen
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.storage_path])
  if (rmErr) {
    console.warn(`    ⚠ alter Pfad nicht gelöscht: ${rmErr.message} — manuell prüfen`)
  }

  console.log('    ✓ migriert')
  return { migrated: true }
}

async function main() {
  console.log(`AAR-862 Storage-Backfill ${DRY_RUN ? '[DRY-RUN]' : '[LIVE]'}`)
  console.log(`Bucket: ${BUCKET}`)

  const { data: rows, error } = await supabase
    .from('fall_dokumente')
    .select('id, fall_id, claim_id, storage_path, dokument_typ, mime_type')
    .is('geloescht_am', null)
    .order('hochgeladen_am', { ascending: true })

  if (error) {
    console.error('Query fail:', error.message)
    process.exit(1)
  }

  console.log(`${rows.length} Rows in fall_dokumente (nicht gelöscht)\n`)

  const stats = { migrated: 0, skipped: 0, errors: 0 }
  for (const row of rows) {
    const result = await migrateOne(row)
    if (result.migrated) stats.migrated++
    else if (result.skipped) stats.skipped++
    else if (result.error) stats.errors++
  }

  console.log(`\nFertig. ${stats.migrated} migriert, ${stats.skipped} geskippt, ${stats.errors} Fehler.`)
}

main().catch((err) => {
  console.error('✗ Backfill gescheitert:', err)
  process.exit(1)
})
