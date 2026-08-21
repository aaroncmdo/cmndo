/**
 * Websites für entdeckte Betriebe — aus dem Google-Unternehmensprofil.
 *
 *   npm run websites                          # Trockenlauf über 20 Kandidaten
 *   npm run websites -- --limit 50            # mehr ansehen
 *   npm run websites -- --schreiben --limit 20   # SCHARF, klein
 *   npm run websites -- --schreiben           # SCHARF über ALLE
 *   npm run websites -- --schreiben --ab <id> # fortsetzen
 *
 * ⚠ Der Trockenlauf ist ABSICHT die Vorgabe — und er kostet TROTZDEM: er
 * unterdrückt das Schreiben, nicht die Abrufe.
 *
 * ⭐ Ein Massenlauf darf nicht der erste Schreibzugriff auf echte Daten sein.
 * P2 hat das teuer gelehrt: 140 grüne Tests und zwei vollständige Trockenläufe
 * zeigten nichts — erst der scharfe Lauf über fünf echte Leads förderte vier
 * Fehler zutage, alle in der Form „Wert vorhanden, Wert unbrauchbar". Deshalb
 * ist `--limit` hier der empfohlene erste scharfe Schritt, und der Bericht zeigt
 * WERTE, nicht nur Zahlen.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { holeAdapter } from '../lib/places'
import { holeWebsitesAusPlaces } from '../lib/anreicherung/website-aus-places'
import type { Db } from '../lib/anreicherung/schreiben'

/**
 * Wo der Fortschritt liegt.
 *
 * ⚠ Ohne ihn beginnt ein Neustart wieder vorn. Der Filter „ohne Website"
 * schliesst zwar die ERFOLGREICHEN aus — aber nicht die, bei denen Google keine
 * Website kennt. Das sind rund 15 %; bei jedem Neustart wuerden sie erneut
 * abgefragt und erneut bezahlt.
 */
const FORTSCHRITT = '.websites-fortschritt.json'

const args = process.argv.slice(2)
const hatFlag = (n: string) => args.includes(`--${n}`)
const wert = (n: string) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}

const schreiben = hatFlag('schreiben')
const limit = wert('limit') ? Number(wert('limit')) : (schreiben ? undefined : 20)
/**
 * Ab welcher Kennung weitergemacht wird.
 *
 * `--ab <id>` gewinnt; sonst die Fortschrittsdatei, sofern `--fortsetzen`
 * gesetzt ist. Ohne beides beginnt der Lauf vorn — ein „fortsetzen", das
 * stillschweigend alles neu abfragt, kostet zweimal und meldet dabei Erfolg.
 */
const abId = wert('ab') ?? (hatFlag('fortsetzen') && existsSync(FORTSCHRITT)
  ? (JSON.parse(readFileSync(FORTSCHRITT, 'utf8')).letzteId as string | undefined)
  : undefined)

if (hatFlag('fortsetzen') && !abId) {
  console.error(`Kein Fortschritt gefunden (${FORTSCHRITT} fehlt oder ist leer).`)
  console.error('Ohne ihn waere „fortsetzen" ein vollstaendiger Lauf, der nur so heisst.')
  process.exit(1)
}
/** Nur die entdeckten — der gepflegte Bestand läuft über `npm run anreicherung`. */
const quelle = wert('quelle') ?? 'places_discovery'

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
  // Wie viele warten überhaupt? Die Zahl VOR dem Lauf, damit hinterher
  // erkennbar ist, welcher Anteil erledigt wurde.
  let offenQuery = db
    .from('sv_leads')
    .select('id', { count: 'exact', head: true })
    .not('google_place_id', 'is', null)
    .is('website_url', null)
  if (quelle) offenQuery = offenQuery.eq('quelle', quelle)
  const { count: offen } = await offenQuery

  console.log(`\n  Quelle        ${quelle}`)
  console.log(`  Kandidaten    ${offen ?? '?'} ohne Website, mit Place-Kennung`)
  console.log(`  Diesmal       ${limit ?? 'ALLE'}`)
  if (abId) console.log(`  Fortsetzen    ab Kennung > ${abId}`)
  console.log(`  Modus         ${schreiben ? 'SCHARF — schreibt website_url' : 'Trockenlauf (schreibt nichts)'}`)
  console.log(`\n  ⚠ Je Kandidat EIN Details-Abruf — auch im Trockenlauf, sie kosten.\n`)

  const laufId = crypto.randomUUID()
  const r = await holeWebsitesAusPlaces({
    db,
    places: holeAdapter(),
    laufId,
    dryRun: !schreiben,
    quelle,
    limit,
    abId,
    fortschritt: (nr, gesamt, zeile) => {
      process.stdout.write(`\r  ${nr}/${gesamt} · ${zeile.slice(0, 88).padEnd(88)}`)
    },
    // ⚠ Nach JEDEM Lead sichern, nicht alle N: ein Lauf wird nicht zu einem
    // gewaehlten Zeitpunkt abgebrochen, sondern zu einem beliebigen.
    sichere: (letzteId) => {
      if (schreiben) writeFileSync(FORTSCHRITT, JSON.stringify({ letzteId, laufId }))
    },
  })

  if (!r.ok) {
    console.error('\n\nLauf abgebrochen:', r.error)
    process.exit(1)
  }

  const b = r.bericht
  console.log('\n')
  console.log(`  Lauf          ${b.laufId}`)
  console.log(`  Betrachtet    ${b.betrachtet}`)
  console.log(`  ├─ Website gefunden   ${b.gefunden}  ${prozent(b.gefunden, b.betrachtet)}`)
  console.log(`  ├─ keine im Profil    ${b.ohneWebsite}  ${prozent(b.ohneWebsite, b.betrachtet)}`)
  console.log(`  └─ Fehler             ${b.fehler.length}`)
  if (schreiben) console.log(`  Geschrieben   ${b.geschrieben}`)

  // ⭐ Die WERTE ansehen, nicht nur die Zahlen.
  if (b.proben.length > 0) {
    console.log(`\n  GEFUNDEN — bitte ansehen (${b.proben.length} von ${b.gefunden}):`)
    for (const z of b.proben) console.log(`    ${z.slice(0, 100)}`)
  }

  if (b.fehler.length > 0) {
    console.log(`\n  ${b.fehler.length} Fehler:`)
    for (const f of b.fehler.slice(0, 10)) console.log(`    ${f.leadId}: ${f.error}`)
    if (b.fehler.length > 10) console.log(`    … und ${b.fehler.length - 10} weitere`)
  }

  // Der Lauf ist durch — die Fortschrittsdatei hat ihren Zweck erfüllt. Sie
  // liegen zu lassen hiesse, dass ein späteres `--fortsetzen` an einer Stelle
  // ansetzt, hinter der nichts mehr kommt, und sofort „fertig" meldet.
  if (schreiben && !limit && existsSync(FORTSCHRITT)) unlinkSync(FORTSCHRITT)

  if (!schreiben) {
    console.log(`\n  Trockenlauf — es wurde nichts geschrieben.`)
    console.log(`  Scharf (klein):  npm run websites -- --schreiben --limit 20`)
  } else {
    console.log(`\n  Zuruecknehmen:  npm run anreicherung -- --zurueck ${laufId}`)
    if (b.letzteId) console.log(`  Fortsetzen:     npm run websites -- --schreiben --ab ${b.letzteId}`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('\nLauf abgebrochen:', err)
  process.exit(1)
})
