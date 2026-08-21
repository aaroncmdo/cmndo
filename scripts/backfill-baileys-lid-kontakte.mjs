#!/usr/bin/env node
// Backfill: LID -> echte Telefonnummer in nachrichten.empfaenger_kontakt.
//
// HINTERGRUND
// WhatsApp hat 2026 auf LID-JIDs ("<lid>@lid") umgestellt. Der Baileys-Service
// extrahierte bis 21.08.2026 stumpf remoteJid.split('@')[0] und schickte damit
// die LID als vermeintliche Telefonnummer an /api/baileys/inbound. Ergebnis:
// 200 von 200 inbound-WhatsApp-Nachrichten tragen eine LID statt einer Nummer
// -> niemand kann den Absender zurueckrufen, und matchInboundToFall (matcht auf
// die letzten 9 Ziffern) findet nie einen Fall.
//
// Der Service ist gefixt (resolvePhoneFromJid). Dieses Script repariert den
// Altbestand: es ersetzt die LID durch die echte Nummer aus dem persistierten
// LID-Mapping-Store des Baileys-Auth-States.
//
// MAPPING BESCHAFFEN (auf dem VPS):
//   cd /opt/claimondo-baileys/source/services/baileys/auth_info_baileys
//   for f in lid-mapping-*_reverse.json; do L=${f#lid-mapping-}; L=${L%_reverse.json}; \
//     echo "\"$L\": $(cat $f),"; done
//   -> als { "<lid>": "<telefonnummer>", ... } speichern
//
// NUTZUNG
//   node --env-file=.env.local scripts/backfill-baileys-lid-kontakte.mjs --map <pfad.json>
//   node --env-file=.env.local scripts/backfill-baileys-lid-kontakte.mjs --map <pfad.json> --apply
//
// Ohne --apply laeuft nur die Simulation (kein Write). Mit --apply wird VOR dem
// ersten Write ein Backup aller betroffenen Zeilen als JSON abgelegt.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const mapIdx = args.indexOf('--map')
if (mapIdx === -1 || !args[mapIdx + 1]) {
  console.error('Fehlt: --map <pfad-zur-lid-map.json>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file=.env.local?)')
  process.exit(1)
}

const lidMap = JSON.parse(readFileSync(args[mapIdx + 1], 'utf8'))
const db = createClient(url, key, { auth: { persistSession: false } })

// PostgREST liefert ohne .range() nur 1000 Zeilen — hier blockweise, damit der
// Bestand auch dann vollstaendig erfasst wird, wenn er spaeter waechst.
async function alleSeiten(build) {
  const SEITE = 500
  let von = 0
  const alles = []
  for (;;) {
    const { data, error } = await build().range(von, von + SEITE - 1)
    if (error) throw new Error(`Lesen fehlgeschlagen: ${error.message}`)
    alles.push(...(data ?? []))
    if (!data || data.length < SEITE) break
    von += SEITE
  }
  return alles
}

const zeilen = await alleSeiten(() =>
  db
    .from('nachrichten')
    .select('id, empfaenger_kontakt, created_at, nachricht')
    .eq('kanal', 'whatsapp')
    .eq('richtung', 'inbound')
    .order('created_at', { ascending: true }),
)

console.log(`inbound-WhatsApp-Nachrichten gesamt: ${zeilen.length}`)

// Alle bekannten echten Nummern — die Werte der Map. Ein Kontakt, der hier
// drinsteht, IST bereits eine Telefonnummer (z.B. die eigene Baileys-Nummer
// 4915153608515, 13-stellig und damit formal nicht von einer LID zu trennen).
const bekannteNummern = new Set(Object.values(lidMap))

const zuAendern = []
const nichtAufloesbar = []
for (const z of zeilen) {
  const kontakt = String(z.empfaenger_kontakt ?? '')
  // Device-Suffix abschneiden: "184387391979625:17" -> "184387391979625"
  const lid = kontakt.split(':')[0]
  if (!/^[0-9]{13,15}$/.test(lid)) continue
  if (bekannteNummern.has(lid)) continue
  const pn = lidMap[lid]
  if (!pn) {
    nichtAufloesbar.push({ id: z.id, kontakt })
    continue
  }
  if (pn === kontakt) continue
  zuAendern.push({ id: z.id, alt: kontakt, neu: pn, created_at: z.created_at })
}

console.log(`aufloesbar:       ${zuAendern.length}`)
console.log(`nicht aufloesbar: ${nichtAufloesbar.length}`)
if (nichtAufloesbar.length) {
  const lids = [...new Set(nichtAufloesbar.map((n) => n.kontakt.split(':')[0]))]
  console.log(`  betroffene LIDs: ${lids.join(', ')}`)
  console.log('  (kein Mapping im Auth-State — bleiben unveraendert)')
}

if (!APPLY) {
  console.log('\n--- SIMULATION (kein Write). Erste 10: ---')
  for (const z of zuAendern.slice(0, 10)) console.log(`  ${z.alt} -> ${z.neu}  (${z.created_at})`)
  console.log('\nMit --apply scharf schalten.')
  process.exit(0)
}

const stempel = new Date().toISOString().replace(/[:.]/g, '-')
const backupPfad = `scripts/.backfill-lid-kontakte-backup-${stempel}.json`
writeFileSync(backupPfad, JSON.stringify(zuAendern, null, 2))
console.log(`\nBackup: ${backupPfad}`)

let ok = 0
let fehler = 0
for (const z of zuAendern) {
  // .select() erzwingt die Row-Rueckgabe — ein Update, das 0 Zeilen trifft,
  // meldet sonst error === null und saehe wie Erfolg aus.
  const { data, error } = await db
    .from('nachrichten')
    .update({ empfaenger_kontakt: z.neu })
    .eq('id', z.id)
    .select('id')
  if (error || !data || data.length === 0) {
    fehler++
    console.error(`  FEHLER ${z.id}: ${error?.message ?? '0 Zeilen getroffen'}`)
    continue
  }
  ok++
}

console.log(`\nfertig: ${ok} aktualisiert, ${fehler} fehlgeschlagen`)
process.exit(fehler > 0 ? 1 : 0)
