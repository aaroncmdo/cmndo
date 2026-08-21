/**
 * CLI der Lead-Discovery (Design-Spec §5.5.2).
 *
 *   npm run discovery                          # Trockenlauf ueber das Vorgabe-Gebiet
 *   npm run discovery -- --gebiet deutschland  # das ganze Land
 *   npm run discovery -- --schreiben           # SCHARF: legt Leads in sv_leads an
 *   npm run discovery -- --max-tiefe 3
 *   npm run discovery -- --gebiet deutschland --schreiben --fortsetzen   # Rest eines abgebrochenen Laufs
 *
 * ⚠ Der Trockenlauf ist ABSICHT der Default — wie bei `npm run anreicherung`.
 * Ein Massenlauf, der von sich aus schreibt, ist ein Massenlauf, den niemand
 * entschieden hat.
 *
 * ⚠ KOSTEN FALLEN AUCH IM TROCKENLAUF AN. Er unterdrueckt das Schreiben, nicht
 * die Abrufe. Ein Trockenlauf ueber Deutschland kostet genauso viel wie ein
 * scharfer.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { holeAdapter } from '../lib/places'
import { entdecke } from '../lib/discovery/lauf'
import { DEUTSCHLAND, MAX_RADIUS_KM, startKacheln, type Kachel } from '../lib/discovery/kacheln'
import { alleSeiten } from '../lib/db/alle-seiten'
import type { BestandsZeile } from '../lib/discovery/schreiben'
import type { Db } from '../lib/anreicherung/schreiben'

const args = process.argv.slice(2)
const hatFlag = (n: string) => args.includes(`--${n}`)
const wert = (n: string) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}

/** Benannte Gebiete — damit ein Testlauf nicht aus Koordinaten bestehen muss. */
const GEBIETE: Record<string, Kachel> = {
  deutschland: DEUTSCHLAND,
  muensterland: { sued: 51.7, west: 6.9, nord: 52.3, ost: 8.0, tiefe: 0 },
  ruhrgebiet: { sued: 51.3, west: 6.6, nord: 51.7, ost: 7.6, tiefe: 0 },
}

const BEGRIFFE = ['Kfz-Sachverständiger', 'Kfz-Gutachter']

/**
 * Wo der Fortschritt liegt.
 *
 * ⚠ Je Gebiet eine eigene Datei. Eine gemeinsame Datei liesse den Rest eines
 * Deutschland-Laufs in einem Ruhrgebiet-Lauf fortsetzen — Kacheln, die gar
 * nicht zum gewaehlten Gebiet gehoeren, und niemand saehe es am Aufruf.
 */
const fortschrittDatei = (gebiet: string) => `.discovery-fortschritt-${gebiet}.json`

const gebietName = wert('gebiet') ?? 'muensterland'
const gebiet = GEBIETE[gebietName]
const schreiben = hatFlag('schreiben')
const maxTiefe = wert('max-tiefe') ? Number(wert('max-tiefe')) : 2
const maxNeu = wert('max-neu') ? Number(wert('max-neu')) : undefined

if (!gebiet) {
  console.error(`Unbekanntes Gebiet „${gebietName}". Bekannt: ${Object.keys(GEBIETE).join(', ')}`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.')
  process.exit(1)
}

const db = createClient(url, key) as unknown as Db

function prozent(teil: number, ganzes: number): string {
  return ganzes === 0 ? '—' : `${Math.round((teil / ganzes) * 100)} %`
}

async function main() {
  const datei = fortschrittDatei(gebietName)
  const fortsetzen = hatFlag('fortsetzen')

  let offeneKacheln: Kachel[] | undefined
  if (fortsetzen) {
    if (!existsSync(datei)) {
      console.error(`Kein Fortschritt fuer „${gebietName}" — ${datei} fehlt.`)
      console.error('Ohne die Datei waere „fortsetzen" ein vollstaendiger Lauf, der nur so heisst.')
      process.exit(1)
    }
    offeneKacheln = JSON.parse(readFileSync(datei, 'utf8')).offen as Kachel[]
    console.log(`\n  Fortsetzen    ${offeneKacheln.length} Kacheln aus ${datei}`)
  }

  const kacheln = offeneKacheln ?? startKacheln(gebiet, MAX_RADIUS_KM)
  const abrufeMin = kacheln.length * BEGRIFFE.length

  console.log(`\n  Gebiet        ${gebietName}`)
  console.log(`  Kacheln       ${kacheln.length}`)
  console.log(`  Begriffe      ${BEGRIFFE.join(', ')}`)
  console.log(`  Max. Tiefe    ${maxTiefe}`)
  console.log(`  Modus         ${schreiben ? 'SCHARF — legt Leads an' : 'Trockenlauf (schreibt nichts)'}`)
  if (schreiben && maxNeu !== undefined) console.log(`  Begrenzung    hoechstens ${maxNeu} neue Leads`)
  console.log(`\n  ⚠ Mindestens ${abrufeMin} Abrufe — auch im Trockenlauf, sie kosten.`)
  console.log(`    Mit Verfeinerung koennen es deutlich mehr werden.\n`)

  // Der Bestand einmal laden, nicht je Fund abfragen.
  //
  // ⚠ SEITENWEISE. Ein einfaches `.select()` liefert höchstens 1.000 Zeilen —
  // ohne Fehler, ohne Warnung. Genau das passierte am 21.08. dreimal: der Lauf
  // meldete „Bestand 1000 Leads", während 6.988 in der Tabelle standen. Er
  // kannte ein Siebtel und hielt jeden der übrigen für einen NEUEN Betrieb.
  // Dass daraus kein Datenschaden wurde, verdankt sich allein dem partiellen
  // Unique-Index auf `google_place_id` — die Datenbank war die Schranke, nicht
  // dieser Code.
  const gelesen = await alleSeiten<Record<string, unknown>>((von, bis) =>
    db.from('sv_leads')
      .select('id,firma,lat,lng,google_place_id')
      .not('lat', 'is', null)
      .order('id', { ascending: true })
      .range(von, bis),
  )

  if (!gelesen.ok) {
    console.error('Bestand nicht lesbar:', gelesen.error)
    process.exit(1)
  }
  const rohBestand = gelesen.zeilen

  const bestand: BestandsZeile[] = (rohBestand ?? []).map((z: Record<string, unknown>) => ({
    id: String(z.id),
    firma: (z.firma as string) ?? null,
    lat: Number(z.lat),
    lng: Number(z.lng),
    googlePlaceId: (z.google_place_id as string) ?? null,
  }))
  console.log(`  Bestand       ${bestand.length} Leads mit Koordinaten\n`)

  const laufId = crypto.randomUUID()
  const bericht = await entdecke({
    places: holeAdapter(),
    db,
    gebiet,
    begriffe: BEGRIFFE,
    maxTiefe,
    schreiben,
    laufId,
    bestand,
    maxNeu,
    offeneKacheln,
    fortschritt: (s) => {
      process.stdout.write(`\r  Kachel ${s.kachel}/${s.vonKacheln}+ · ${s.funde} eindeutige Funde   `)
    },
    // ⚠ Nach JEDER Kachel schreiben, nicht alle N. Ein Lauf wird nicht zu einem
    // gewaehlten Zeitpunkt abgebrochen, sondern zu einem beliebigen.
    sichere: (offen) => {
      writeFileSync(datei, JSON.stringify({ gebiet: gebietName, offen }, null, 0))
    },
  })

  console.log('\n')
  console.log(`  Lauf          ${bericht.laufId}`)
  console.log(`  Kacheln       ${bericht.kacheln} (davon ${bericht.verfeinert} verfeinert)`)
  console.log(`  Abrufe        ${bericht.abrufe}`)
  console.log(`  Funde brutto  ${bericht.bruttoFunde}`)
  console.log(`  eindeutig     ${bericht.eindeutig}`)
  console.log(`  ├─ neu              ${bericht.je.neu}  ${prozent(bericht.je.neu, bericht.eindeutig)}`)
  console.log(`  ├─ Dublette (Name)  ${bericht.je.dublette_name}`)
  console.log(`  ├─ Dublette (Ort)   ${bericht.je.dublette_place_id}`)
  console.log(`  └─ unbrauchbar      ${bericht.je.unbrauchbar}`)
  console.log(`  Dauer         ${Math.round(bericht.dauerMs / 1000)} s`)

  // ⭐ Die Werte ansehen, nicht nur die Zahlen. Ein Trockenlauf, der bloss
  // zaehlt, zeigt genau die Fehlerklasse nicht, die P2 gekostet hat:
  // „Wert vorhanden, Wert unbrauchbar".
  for (const [titel, schluessel] of [
    ['NEU — bitte ansehen', 'neu'],
    ['VERWORFEN', 'unbrauchbar'],
    ['als Dublette erkannt', 'dublette_name'],
  ] as const) {
    const liste = bericht.proben[schluessel]
    if (liste.length === 0) continue
    console.log(`
  ${titel} (${liste.length} von ${bericht.je[schluessel]}):`)
    for (const z of liste) console.log(`    ${z.slice(0, 96)}`)
  }

  if (bericht.gedeckeltAmEnde > 0) {
    console.log(`\n  ⚠ ${bericht.gedeckeltAmEnde} Kacheln lieferten auch auf der letzten Stufe noch`)
    console.log(`    das Maximum. Dort sitzen mehr Bueros, als dieser Lauf gesehen hat —`)
    console.log(`    mit --max-tiefe ${maxTiefe + 1} weiter verfeinern.`)
  }

  if (bericht.fehler.length > 0) {
    console.log(`\n  ${bericht.fehler.length} Fehler:`)
    for (const f of bericht.fehler.slice(0, 10)) console.log(`    ${f}`)
    if (bericht.fehler.length > 10) console.log(`    … und ${bericht.fehler.length - 10} weitere`)
  }

  if (!schreiben && bericht.je.neu > 0) {
    console.log(`\n  Trockenlauf — es wurde nichts geschrieben.`)
    console.log(`  Scharf:  npm run discovery -- --gebiet ${gebietName} --schreiben`)
  }
  // Der Lauf ist durch — die Fortschrittsdatei hat ihren Zweck erfuellt.
  // Sie liegen zu lassen hiesse, dass ein spaeteres `--fortsetzen` eine
  // abgeschlossene Warteschlange fortsetzt und sofort fertig meldet.
  if (existsSync(datei)) unlinkSync(datei)

  if (schreiben) {
    console.log(`\n  Zuruecknehmen:`)
    console.log(`    delete from sv_leads where entdeckt_lauf = '${laufId}';`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('\nLauf abgebrochen:', err)
  process.exit(1)
})
