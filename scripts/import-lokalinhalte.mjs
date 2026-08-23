// Importiert handgeschriebene Ortsinhalte nach stadt_lokalinhalte.
//
// WARUM HANDGESCHRIEBEN: Das Anthropic-Guthaben des Projekts ist leer, der
// naechtliche Cron erzeugt seit dem 20.08. nichts mehr (7 von 173 Staedten).
// Aaron: „kannst du die inhalte bitte generieren jetzt erstmal mit plan volumen".
//
// ⭐ GEPRUEFT WIRD MIT DEM ECHTEN GATE, nicht mit einer Nachbildung:
// `pruefeLokalinhalt` aus src/lib/lokalinhalt/gate.ts wird direkt importiert
// (Node --experimental-strip-types). Eine zweite Implementierung der Regeln
// waere genau die Sorte Duplikat, die spaeter auseinanderlaeuft — und dann
// haette der Import andere Massstaebe als die Pipeline.
//
// LAUF:  node --experimental-strip-types lokalinhalte-import.mjs [--scharf]
//        Ohne --scharf: nur pruefen, nichts schreiben.
//        --ersetzen: bestehende veroeffentlichte Fassung archivieren statt am
//        Unique-Index zu scheitern (fuer Nachbesserungen an Bestandsstaedten).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
// ⚠ ESM-Importe sind relativ zur SKRIPTDATEI (scripts/), die readFileSync-Pfade
// weiter unten dagegen relativ zum Arbeitsverzeichnis (Repo-Root). Beide sehen
// gleich aus und meinen Verschiedenes.
import { pruefeLokalinhalt } from '../src/lib/lokalinhalt/gate.ts'

const SCHARF = process.argv.includes('--scharf')
const ERSETZEN = process.argv.includes('--ersetzen')
const REPO = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2'
const WT = '.'

// Stadtnamen fuer den Ortsbezug-Check des Gates.
const staedteSrc = readFileSync(`${WT}/claimondo-marketing/lib/kfz-gutachter/staedte.ts`, 'utf8')
const namen = new Map()
for (const m of staedteSrc.matchAll(/slug:\s*'([^']+)'[\s\S]{0,400}?name:\s*'([^']+)'/g)) {
  if (!namen.has(m[1])) namen.set(m[1], m[2])
}

const inhalte = JSON.parse(readFileSync(process.argv.find(a=>a.endsWith('.json')) ?? './scripts/lokalinhalte/charge-01-grossstaedte.json', 'utf8'))

function env(schluessel) {
  const zeile = readFileSync(`${REPO}/.env.local`, 'utf8')
    .split('\n')
    .find((z) => z.startsWith(`${schluessel}=`))
  if (!zeile) throw new Error(`${schluessel} fehlt in .env.local`)
  return zeile.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
}

const db = SCHARF
  ? createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    })
  : null

console.log(SCHARF ? '— SCHARF (schreibt in die DB) —\n' : '— TROCKENLAUF (schreibt nichts) —\n')
console.log('Stadt            Score  Gate    Bezirke  FAQs  Befund')
console.log('─'.repeat(96))

let gruen = 0
let rot = 0
const fehlerhaft = []

for (const [slug, entwurf] of Object.entries(inhalte)) {
  const name = namen.get(slug)
  if (!name) {
    console.log(`${slug.padEnd(16)} — unbekannter Slug, uebersprungen`)
    rot++
    continue
  }

  const befund = pruefeLokalinhalt(entwurf, name)
  const zeichen = befund.ok ? '✓' : '🔴'
  console.log(
    `${slug.padEnd(16)}   ${befund.substanzScore}    ${zeichen.padEnd(6)} ` +
      `${String(befund.bereinigt.stadtbezirke.length).padStart(6)}  ` +
      `${String(befund.bereinigt.lokaleFaqs.length).padStart(4)}  ` +
      (befund.ok ? '' : befund.gruende.join(' · ').slice(0, 60)),
  )

  if (!befund.ok) {
    rot++
    fehlerhaft.push({ slug, gruende: befund.gruende })
    continue
  }
  gruen++

  if (SCHARF) {
    const jetzt = new Date().toISOString()

    // ⚠ Ein partieller Unique-Index laesst nur EINE veroeffentlichte Zeile je
    // Stadt zu. Ohne --ersetzen scheitert daher jeder zweite Lauf fuer dieselbe
    // Stadt an `stadt_lokalinhalte_ein_veroeffentlichter` — und weil das Skript
    // den Schreibfehler in dieselbe Zaehlung wie eine Gate-Ablehnung wirft, las
    // sich das als „12 abgelehnt", obwohl der Trockenlauf direkt davor
    // „12 bestanden" meldete. Zwei verschiedene Ursachen, eine Zahl.
    //
    // `--ersetzen` archiviert die alte Fassung VOR dem Insert (dasselbe Vorgehen
    // wie `veroeffentliche` in den Admin-Actions) — noetig fuer jede
    // Nachbesserung an einer bereits veroeffentlichten Stadt.
    if (ERSETZEN) {
      const { data: alt, error: archivFehler } = await db
        .from('stadt_lokalinhalte')
        .update({ status: 'archiviert' })
        .eq('stadt_slug', slug)
        .eq('status', 'veroeffentlicht')
        .select('id')
      if (archivFehler) {
        console.log(`  🔴 Archivieren fehlgeschlagen: ${archivFehler.message}`)
        gruen--
        rot++
        continue
      }
      if (alt?.length) console.log(`  ↻ ${alt.length} alte Fassung archiviert`)
    }

    const { error } = await db.from('stadt_lokalinhalte').insert({
      stadt_slug: slug,
      stadtbezirke: befund.bereinigt.stadtbezirke,
      hauptachsen: befund.bereinigt.hauptachsen,
      unfall_hotspots: befund.bereinigt.unfallHotspots,
      lokale_faqs: befund.bereinigt.lokaleFaqs,
      hero_anker: befund.bereinigt.heroAnker ?? null,
      topografie_anker: befund.bereinigt.topografieAnker ?? null,
      substanz_score: befund.substanzScore,
      ai_generated: true,
      ai_model: 'claude-opus-5',
      status: 'veroeffentlicht',
      veroeffentlicht_am: jetzt,
    })
    // ⚠ supabase-js WIRFT NICHT — ohne diese Pruefung meldet der Lauf Erfolg,
    // waehrend nichts ankommt (AGENTS.md §Stille-Write-Gate).
    if (error) {
      console.log(`  🔴 INSERT fehlgeschlagen: ${error.message}`)
      gruen--
      rot++
    }
  }
}

console.log('─'.repeat(96))
console.log(`${gruen} bestanden · ${rot} abgelehnt`)
if (fehlerhaft.length) {
  console.log('\nAbgelehnt:')
  for (const f of fehlerhaft) console.log(`  ${f.slug}: ${f.gruende.join(' · ')}`)
}
if (!SCHARF && gruen > 0) console.log('\nMit --scharf schreiben.')
