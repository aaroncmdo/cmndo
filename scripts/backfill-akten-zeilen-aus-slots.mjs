#!/usr/bin/env node
/**
 * Einmaliger Backfill zu PR #5722: legt fuer belegte Pflicht-Slots die fehlende
 * `fall_dokumente`-Zeile an.
 *
 * ANLASS: `convert-lead-to-fall` zog nur `unfallfotos` nach `fall_dokumente` nach; alles
 * andere blieb allein im Slot. Der Code-Fix greift ab der naechsten Konversion — die
 * Bestandsfaelle brauchen diesen Lauf.
 *
 * ADDITIV: legt nur an, aendert und loescht nichts. Ueberspringt jeden Slot, dessen Datei
 * nicht im Storage liegt (eine Akten-Zeile ohne Datei waere schlimmer als keine) und jeden
 * Pfad, der schon in der Akte steht (Slot-Aliase zeigen auf dieselbe Datei).
 *
 *   node --env-file=.env.local scripts/backfill-akten-zeilen-aus-slots.mjs          # Vorschau
 *   node --env-file=.env.local scripts/backfill-akten-zeilen-aus-slots.mjs --apply  # schreiben
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

/**
 * Spiegelt storagePfadAusUrl aus src/lib/dokumente/sync-lead-zu-pflicht.ts
 * (ein .mjs kann das TS-Modul nicht importieren — bei Aenderungen dort mitziehen).
 */
function storagePfadAusUrl(u) {
  if (!u) return null
  // Form 1: alle drei Supabase-Varianten, wie in @/lib/storage/url parseStorageUrl.
  const m = u.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/)
  if (m) {
    if (m[1] !== 'fall-dokumente') return null   // anderer Bucket = nicht unsere Datei
    try { return decodeURIComponent(m[2]) } catch { return m[2] }
  }
  // Form 2: bereits ein Storage-Pfad. Mit Host = fremde URL, daraus nichts raten.
  const ohne = u.split('?')[0].split('#')[0]
  if (!ohne || /^[a-z]+:\/\//i.test(ohne)) return null
  const p = ohne.replace(/^\/+/, '')
  return p.includes('/') ? p : null
}

const { data: slots, error: slotErr } = await db
  .from('pflichtdokumente')
  .select('id, fall_id, dokument_typ, status, dokument_url')
  .in('status', ['hochgeladen', 'geprueft'])
  .not('dokument_url', 'is', null)
if (slotErr) { console.error('Slots nicht lesbar:', slotErr.message); process.exit(1) }
console.log(`${slots.length} belegte Slot(s) gepruerft\n`)

const anzulegen = []
const uebersprungen = []

for (const s of slots) {
  // Manche Slots haengen an claim_id statt fall_id — ohne fall_id gibt es keine Akte,
  // an die sich eine Zeile haengen liesse.
  if (!s.fall_id) { uebersprungen.push([s.dokument_typ, 'kein fall_id am Slot']); continue }
  const pfad = storagePfadAusUrl(s.dokument_url)
  if (!pfad) { uebersprungen.push([s.dokument_typ, 'keine verwertbare URL']); continue }

  const { data: da, error: daErr } = await db
    .from('fall_dokumente').select('id').eq('fall_id', s.fall_id).eq('storage_path', pfad).limit(1)
  if (daErr) { console.error('Aktenbestand nicht lesbar:', daErr.message); process.exit(1) }
  if (da.length > 0) continue   // schon da — inkl. Alias-Faelle

  // Datei muss existieren, sonst zeigt die Zeile ins Leere.
  const ordner = pfad.slice(0, pfad.lastIndexOf('/'))
  const datei = pfad.slice(pfad.lastIndexOf('/') + 1)
  const { data: obj } = await db.storage.from('fall-dokumente').list(ordner, { search: datei, limit: 1 })
  const treffer = (obj ?? []).find((o) => o.name === datei)
  if (!treffer) { uebersprungen.push([s.dokument_typ, `Datei fehlt im Storage: ${pfad}`]); continue }

  anzulegen.push({
    fall_id: s.fall_id,
    pflichtdokument_id: s.id,
    dokument_typ: s.dokument_typ,
    storage_path: pfad,
    original_filename: datei,
    mime_type: treffer.metadata?.mimetype ?? null,
    groesse_bytes: treffer.metadata?.size ?? null,
    uploaded_by_kunde: true,
    beschreibung: 'Vor der Fall-Anlage hochgeladen (Backfill #5722)',
    hochgeladen_am: new Date().toISOString(),
  })
}

for (const [typ, grund] of uebersprungen) console.log(`  uebersprungen  ${typ}: ${grund}`)
console.log(`\n${anzulegen.length} Zeile(n) anzulegen:`)
for (const a of anzulegen) console.log(`  ${a.dokument_typ.padEnd(16)} ${a.groesse_bytes} B  ${a.storage_path}`)

if (!APPLY) { console.log('\n(Vorschau — mit --apply schreiben)'); process.exit(0) }
if (anzulegen.length === 0) { console.log('\nnichts zu tun'); process.exit(0) }

const { data: ins, error: insErr } = await db.from('fall_dokumente').insert(anzulegen).select('id')
if (insErr) { console.error('\nINSERT fehlgeschlagen:', insErr.message); process.exit(1) }
console.log(`\n${ins.length} Zeile(n) angelegt`)

// Zurueckholen statt dem Erfolg vertrauen.
let offen = 0
for (const a of anzulegen) {
  const { data } = await db.from('fall_dokumente').select('id')
    .eq('fall_id', a.fall_id).eq('storage_path', a.storage_path).limit(1)
  if (!data || data.length === 0) { console.error(`  NICHT angekommen: ${a.storage_path}`); offen++ }
}
console.log(offen === 0 ? 'Alle Zeilen verifiziert.' : `${offen} Zeile(n) NICHT verifiziert.`)
process.exit(offen === 0 ? 0 : 1)
