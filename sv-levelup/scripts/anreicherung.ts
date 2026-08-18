/**
 * CLI der Lead-Anreicherung (F-15 + F-16).
 *
 *   npm run anreicherung                      # Trockenlauf ueber die Arbeitsmenge
 *   npm run anreicherung -- --limit 5         # nur die ersten 5
 *   npm run anreicherung -- --schreiben       # SCHARF: schreibt in sv_leads
 *   npm run anreicherung -- --zurueck <lauf>  # dreht einen Lauf zurueck
 *
 * ⚠ Der Trockenlauf ist ABSICHT der Default. Das Script schreibt in die
 * Produktionsdatenbank; ein versehentlicher Aufruf darf dort nichts anfassen.
 */
import { createClient } from '@supabase/supabase-js'
import { erzeugeHoler } from '../lib/anreicherung/netz'
import { laufeAn } from '../lib/anreicherung/lauf-alle'
import { dreheLaufZurueck } from '../lib/anreicherung/rueckwaerts'
import type { Db } from '../lib/anreicherung/schreiben'

const args = process.argv.slice(2)
const hatFlag = (n: string) => args.includes(`--${n}`)
const wert = (n: string) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 ? args[i + 1] : undefined
}

const schreiben = hatFlag('schreiben')
const limit = wert('limit') ? Number(wert('limit')) : undefined
const zurueck = wert('zurueck')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.')
  console.error('Aufruf:  node --env-file=../.env.local --import tsx scripts/anreicherung.ts')
  process.exit(1)
}

const db = createClient(url, key) as unknown as Db

function prozent(teil: number, ganzes: number): string {
  if (ganzes === 0) return '—'
  return `${Math.round((teil / ganzes) * 100)} %`
}

async function main() {
  if (zurueck) {
    console.log(`Drehe Lauf ${zurueck} zurück …`)
    const r = await dreheLaufZurueck(db, zurueck)
    if (!r.ok) {
      console.error(`FEHLGESCHLAGEN: ${r.error}`)
      process.exit(1)
    }
    console.log(`${r.zurueckgesetzt} Felder auf ${r.leads} Leads zurückgesetzt.`)
    console.log('Die Audit-Zeilen bleiben stehen (append-only).')
    return
  }

  const laufId = crypto.randomUUID()
  console.log(schreiben ? '=== SCHARFER LAUF (schreibt) ===' : '=== TROCKENLAUF (schreibt nichts) ===')
  console.log(`Lauf-ID: ${laufId}`)
  if (limit) console.log(`Begrenzt auf ${limit} Leads.`)
  console.log('')

  const begonnen = Date.now()
  const hole = erzeugeHoler({ cachen: true })

  const r = await laufeAn(db, {
    laufId, hole, limit, dryRun: !schreiben,
    fortschritt: (nr, gesamt, zeile) =>
      console.log(`[${String(nr).padStart(3)}/${gesamt}] ${zeile}`),
  })

  if (!r.ok) {
    console.error(`\nLAUF FEHLGESCHLAGEN: ${r.error}`)
    process.exit(1)
  }

  const b = r.bericht
  const dauer = Math.round((Date.now() - begonnen) / 1000)

  console.log('\n' + '='.repeat(64))
  console.log(`ERGEBNIS  (${dauer}s, ${b.betrachtet} Leads betrachtet)`)
  console.log('='.repeat(64))

  console.log('\nTrefferquote je Feld:')
  for (const feld of ['website_url', 'email', 'telefon', 'vorname', 'nachname']) {
    const n = b.jeFeld[feld] ?? 0
    console.log(`  ${feld.padEnd(12)} ${String(n).padStart(3)} von ${b.betrachtet}   ${prozent(n, b.betrachtet)}`)
  }

  console.log('\nZuordnungs-Sicherheit der gefundenen Websites:')
  console.log(`  90+  (Firma + PLZ)   ${b.sicherheit.hoch}`)
  console.log(`  70-89 (Firma o. Ort) ${b.sicherheit.mittel}`)
  console.log(`  <70  (unsicher)      ${b.sicherheit.niedrig}`)
  console.log(`  belastbar (>=70):    ${b.websiteBelastbar} von ${b.betrachtet}  ${prozent(b.websiteBelastbar, b.betrachtet)}`)

  const gruende = Object.entries(b.gruende).sort((a, c) => c[1] - a[1])
  if (gruende.length > 0) {
    console.log('\nKein Treffer — Gründe:')
    for (const [grund, n] of gruende) console.log(`  ${String(n).padStart(3)}x  ${grund}`)
  }

  if (b.fehler.length > 0) {
    console.log(`\nFehler (${b.fehler.length}):`)
    for (const f of b.fehler.slice(0, 10)) console.log(`  ${f.leadId}: ${f.error}`)
    if (b.fehler.length > 10) console.log(`  … und ${b.fehler.length - 10} weitere`)
  }

  if (schreiben) {
    console.log(`\nZurückdrehen:  npm run anreicherung -- --zurueck ${laufId}`)
  } else {
    console.log('\nNichts geschrieben. Scharf:  npm run anreicherung -- --schreiben')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
