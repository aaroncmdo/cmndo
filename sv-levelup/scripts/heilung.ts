/**
 * Bestandsheilung — zieht den Bestand auf den Stand des Codes nach.
 *
 *   npm run heilung                # Trockenlauf — zeigt nur, was zu tun waere
 *   npm run heilung -- --schreiben # SCHARF
 *
 * Zwei Abschnitte, dieselbe Klasse von Schaden: eine Regel wurde verbessert,
 * der Code ist geheilt, und der Bestand traegt die alten Fehler unveraendert
 * weiter, weil ihn niemand nachzieht.
 *
 *   1. DISCOVERY — auslaendische Betriebe entfernen, fehlende Orte nachtragen.
 *   2. CHECKS — Messungen ihrem Bestandslead zuordnen. Bis zur Zuordnung bei
 *      der Messung geschah das erst beim Terminwunsch; alles davor liegt neben
 *      seinem Betrieb, ohne ihn zu kennen.
 *
 * ⚠ Der Trockenlauf ist ABSICHT der Vorgabewert. Abschnitt 1 LOESCHT Zeilen —
 * er darf nicht versehentlich starten.
 *
 * ⚠ Anders als Discovery und Anreicherung kostet dieser Lauf NICHTS: er fragt
 * keine fremde Schnittstelle, er raeumt nur auf, was schon da ist.
 */
import { createClient } from '@supabase/supabase-js'
import type { Db } from '../lib/anreicherung/schreiben'
import { loescheAusland, planeHeilung, trageOrtNach, type HeilZeile } from '../lib/discovery/heilung'
import { ordneCheckZu, sucheTreffer } from '../lib/levelup/zuordnung'

type OffenerCheck = {
  id: string
  token: string
  firmenname: string | null
  website_url: string | null
  standort_ort: string | null
  standort_lat: number | null
  standort_lng: number | null
  score: number | null
}

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

/**
 * Abschnitt 2 — Messungen ihrem Bestandslead zuordnen.
 *
 * ⚠ Es wird NIE ein Lead angelegt, auch hier nicht. Die Startseite sagt zu:
 * „kein Eintrag in einer Interessentenliste." Ein bestehender Eintrag darf um
 * sein Messergebnis ergaenzt werden, ein neuer entsteht nicht.
 */
async function heileChecks(): Promise<void> {
  // ⚠ AUFSTEIGEND, und bewusst ALLE fertigen Checks — nicht nur unverknuepfte.
  //
  // Der Nachtrag am Lead heisst `levelup_letzter_score`. Bei mehreren Checks
  // desselben Betriebs gewinnt der ZULETZT VERARBEITETE. Bei absteigender
  // Sortierung ist das der AELTESTE — und genau das ist beim ersten scharfen
  // Lauf passiert: „Stanoksei" hat vier Messungen (69, 67, —, 47), am Lead
  // stand 47. Die Zahl war da, sie war plausibel, und sie war falsch.
  //
  // Aufsteigend zu lesen dreht das um: der neueste Check schreibt zuletzt. Und
  // weil bereits verknuepfte Checks mitlaufen, heilt derselbe Lauf auch die
  // Leads, an denen schon ein falscher Score steht. Der Lauf ist idempotent —
  // er setzt dieselben Werte, wenn sich nichts geaendert hat.
  const { data, error } = await db
    .from('levelup_checks')
    .select('id,token,firmenname,website_url,standort_ort,standort_lat,standort_lng,score')
    .eq('status', 'fertig')
    .order('erstellt_am', { ascending: true })

  if (error) {
    console.error('Checks nicht lesbar:', error.message)
    return
  }

  const offen = (data ?? []) as unknown as OffenerCheck[]
  console.log(`\n  ── Abschnitt 2 · Messungen ─────────────────────────────`)
  console.log(`  Geprueft      ${offen.length} fertige Checks (aeltester zuerst)\n`)

  if (offen.length === 0) return

  let zugeordnet = 0
  let ohneTreffer = 0
  const fehler: string[] = []

  for (const c of offen) {
    const name = `${c.firmenname ?? c.website_url ?? c.token} (${c.standort_ort ?? 'ohne Ort'})`

    if (!schreiben) {
      const vorschau = await sucheTreffer(db, {
        firmenname: c.firmenname, website_url: c.website_url,
        lat: c.standort_lat, lng: c.standort_lng,
      })
      if (!vorschau.ok) { fehler.push(`${name}: ${vorschau.error}`); continue }
      if (vorschau.treffer) { zugeordnet++; console.log(`    ${name} → ${vorschau.treffer.wie}`) }
      else { ohneTreffer++; console.log(`    ${name} → kein Lead im Bestand`) }
      continue
    }

    const r = await ordneCheckZu(db, {
      id: c.id, firmenname: c.firmenname, website_url: c.website_url,
      lat: c.standort_lat, lng: c.standort_lng, score: c.score,
    })
    if (!r.ok) { fehler.push(`${name}: ${r.error}`); continue }
    if (r.treffer) { zugeordnet++; console.log(`    ${name} → ${r.treffer.wie}`) }
    else { ohneTreffer++; console.log(`    ${name} → kein Lead im Bestand`) }
  }

  console.log(`\n  Zugeordnet    ${zugeordnet}${schreiben ? '' : ' (waere)'}`)
  console.log(`  Ohne Treffer  ${ohneTreffer}`)
  if (fehler.length > 0) {
    console.log(`\n  ${fehler.length} Fehler:`)
    for (const f of fehler.slice(0, 10)) console.log(`    ${f}`)
  }
}

async function main() {
  console.log(`\n  Modus         ${schreiben ? 'SCHARF — loescht und schreibt' : 'Trockenlauf (aendert nichts)'}`)
  console.log(`\n  ── Abschnitt 1 · Discovery-Bestand ─────────────────────`)

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
    await heileChecks()
    console.log('\n  Trockenlauf — es wurde nichts geaendert.')
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

  // ⚠ Abschnitt 2 laeuft NACH Abschnitt 1: die frisch nachgetragenen Orte und
  // der bereinigte Bestand sind die Grundlage, gegen die zugeordnet wird.
  await heileChecks()
  console.log('')
}

main().catch((err) => {
  console.error('\nHeilung abgebrochen:', err)
  process.exit(1)
})
