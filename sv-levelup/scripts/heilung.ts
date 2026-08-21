/**
 * Bestandsheilung der Lead-Discovery.
 *
 *   npm run heilung                # Trockenlauf — zeigt nur, was zu tun waere
 *   npm run heilung -- --schreiben # SCHARF: loescht Ausland, traegt Orte nach
 *
 * ⚠ Der Trockenlauf ist ABSICHT der Vorgabewert. Dieser Lauf LOESCHT Zeilen —
 * er darf nicht versehentlich starten.
 *
 * ⚠ Anders als Discovery und Anreicherung kostet dieser Lauf NICHTS: er fragt
 * keine fremde Schnittstelle, er raeumt nur auf, was schon da ist.
 */
import { createClient } from '@supabase/supabase-js'
import type { Db } from '../lib/anreicherung/schreiben'
import { loescheAusland, planeHeilung, trageOrtNach, type HeilZeile } from '../lib/discovery/heilung'

const args = process.argv.slice(2)
const schreiben = args.includes('--schreiben')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.')
  process.exit(1)
}

const db = createClient(url, key) as unknown as Db

/**
 * Alle Zeilen holen — seitenweise.
 *
 * ⚠ PostgREST liefert ohne `range` hoechstens 1.000 Zeilen. Bei 2.740 Leads
 * saehe ein einzelner Abruf aus wie ein vollstaendiger Bestand und heilte
 * stillschweigend nur das erste Drittel.
 */
async function holeAlle(): Promise<HeilZeile[]> {
  const seite = 1000
  const alle: HeilZeile[] = []

  for (let von = 0; ; von += seite) {
    const { data, error } = await db
      .from('sv_leads')
      .select('id,firma,adresse,ort')
      .eq('quelle', 'places_discovery')
      .order('id', { ascending: true })
      .range(von, von + seite - 1)

    if (error) {
      console.error('Bestand nicht lesbar:', error.message)
      process.exit(1)
    }

    const zeilen = (data ?? []) as unknown as HeilZeile[]
    alle.push(...zeilen)
    if (zeilen.length < seite) break
  }

  return alle
}

async function main() {
  console.log(`\n  Modus         ${schreiben ? 'SCHARF — loescht und schreibt' : 'Trockenlauf (aendert nichts)'}\n`)

  const zeilen = await holeAlle()
  const plan = planeHeilung(zeilen)

  console.log(`  Gelesen       ${zeilen.length} Discovery-Leads`)
  console.log(`  ├─ in Ordnung       ${plan.inOrdnung}`)
  console.log(`  ├─ Ausland          ${plan.ausland.length}  → loeschen`)
  console.log(`  ├─ Ort nachtragbar  ${plan.nachtragbar.length}`)
  console.log(`  └─ unklar           ${plan.unklar.length}  → bleiben stehen\n`)

  // ⭐ Die Werte ansehen, nicht nur die Zahlen — besonders vor dem Loeschen.
  for (const [titel, liste] of [
    ['LOESCHEN — bitte ansehen', plan.ausland],
    ['Ort nachtragen', plan.nachtragbar],
    ['unklar (bleiben stehen)', plan.unklar],
  ] as const) {
    if (liste.length === 0) continue
    console.log(`  ${titel} (${Math.min(10, liste.length)} von ${liste.length}):`)
    for (const b of liste.slice(0, 10)) {
      const zusatz = b.art === 'ort_nachtragbar' ? `  → ${b.plz} ${b.ort}`
        : b.art === 'unklar' ? `  (${b.grund})` : ''
      console.log(`    ${b.text.slice(0, 88)}${zusatz}`)
    }
    console.log('')
  }

  if (!schreiben) {
    console.log('  Trockenlauf — es wurde nichts geaendert.')
    console.log('  Scharf:  npm run heilung -- --schreiben\n')
    return
  }

  let geloescht = 0
  let nachgetragen = 0
  const fehler: string[] = []

  for (const b of plan.ausland) {
    const r = await loescheAusland(db, b.id)
    if (r.ok) geloescht++
    else fehler.push(`loeschen „${b.text.slice(0, 50)}": ${r.error}`)
  }

  for (const b of plan.nachtragbar) {
    const r = await trageOrtNach(db, b.id, b.plz, b.ort)
    if (r.ok) nachgetragen++
    else fehler.push(`nachtragen „${b.text.slice(0, 50)}": ${r.error}`)
  }

  console.log(`  Geloescht     ${geloescht} von ${plan.ausland.length}`)
  console.log(`  Nachgetragen  ${nachgetragen} von ${plan.nachtragbar.length}`)

  if (fehler.length > 0) {
    console.log(`\n  ${fehler.length} Fehler:`)
    for (const f of fehler.slice(0, 10)) console.log(`    ${f}`)
    if (fehler.length > 10) console.log(`    … und ${fehler.length - 10} weitere`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('\nHeilung abgebrochen:', err)
  process.exit(1)
})
