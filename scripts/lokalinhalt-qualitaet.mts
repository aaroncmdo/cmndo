// Qualitaets-Bericht ueber die generierten Ortsinhalte (stadt_lokalinhalte).
//
// Run:  npx tsx scripts/lokalinhalt-qualitaet.mts [--strict] [--grenze 40]
//       (braucht .env.local im Repo-Root oder im Haupt-Checkout)
//
// WOFUER: Der Cron erzeugt ab 19.08.2026 taeglich zwei Staedte. Bei den ersten
// fuenf sah alles gut aus (max. 0,4 % Ueberlappung) — das sagt wenig ueber 170.
// Je mehr Staedte, desto wahrscheinlicher wiederholt sich das Modell, und
// niemand merkt es: jede Seite fuer sich liest sich gut, erst der PAARWEISE
// Vergleich zeigt den Baukasten. Genau daran sind die Cluster-Domains
// gescheitert (75-88 % Ueberlappung bei einer Spec-Grenze von 40 %).
//
// ⚠ Das Umlaut-Urteil kommt vom GATE, nicht von hier. `pruefeLokalinhalt` ist
// dieselbe Funktion, die die Pipeline vor dem Veroeffentlichen fragt — ein
// zweites Mass wuerde driften und dann etwas anderes sagen als die Wirklichkeit.
// Der Bericht zeigt damit auch, ob eine ALT veroeffentlichte Zeile heute noch
// durchginge (Regeln werden schaerfer, Bestand wird es nicht von selbst).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HAUPT = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2'

function ladeEnv() {
  for (const p of [join(ROOT, '.env.local'), join(HAUPT, '.env.local')]) {
    if (!existsSync(p)) continue
    for (const zeile of readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = zeile.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
    return p
  }
  return null
}

const envPfad = ladeEnv()
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FEHLER: keine .env.local mit SUPABASE_SERVICE_ROLE_KEY gefunden.')
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const { pruefeLokalinhalt } = await import('../src/lib/lokalinhalt/gate')
// ⚠ Der NAME, nicht der Slug — genau wie pipeline.ts es tut
// (`pruefeLokalinhalt(entwurf, stadt.name)`). Mit dem Slug meldete dieses
// Skript beim ersten Lauf "Ortsbezug fehlt" fuer koeln und muenchen: der Text
// schreibt "Köln"/"München", der Slug ist "koeln"/"muenchen". Ein Messwerkzeug,
// das anders aufruft als der Produktionspfad, misst sich selbst.
const { getStadtStammdaten } = await import('../src/lib/lokalinhalt/staedte')
const { paarBefunde, substanzVerteilung, textAusZeile, viergramme } = await import(
  './lib/lokalinhalt-qualitaet-scan.mjs'
)

const strict = process.argv.includes('--strict')
const gi = process.argv.indexOf('--grenze')
const GRENZE = gi > -1 ? Number(process.argv[gi + 1]) : 40

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const { data, error } = await sb
  .from('stadt_lokalinhalte')
  .select(
    'stadt_slug, status, substanz_score, stadtbezirke, hauptachsen, unfall_hotspots, lokale_faqs, hero_anker, topografie_anker',
  )
  .order('stadt_slug')

if (error) {
  console.error('DB:', error.message)
  process.exit(1)
}
const zeilen = (data ?? []) as Record<string, any>[]
if (zeilen.length === 0) {
  // Bewusst KEIN "alles gut": eine leere Tabelle heisst, dass der Cron nichts
  // erzeugt hat — das ist ein Befund, kein Ruhezustand.
  console.log('LOKALINHALT-QUALITAET\n\n  0 Zeilen — der Cron hat nichts erzeugt. Das ist ein Befund, keine Entwarnung.')
  process.exit(strict ? 1 : 0)
}

// --- Selbsttest ------------------------------------------------------------
// "0 Befunde" ist nur so viel wert wie der Beweis, dass dieses Skript ueberhaupt
// anschlagen KANN. Mit --selbsttest laufen zwei synthetische Zeilen mit:
// eine mit ASCII-Ersatz UND ohne Ortsbezug, dazu ihr Klon (100 % Ueberlappung).
// Werden die beiden nicht gemeldet, ist der ganze Bericht wertlos.
const selbsttest = process.argv.includes('--selbsttest')
const KAPUTT = {
  stadt_slug: '__selbsttest_a',
  status: 'veroeffentlicht',
  stadtbezirke: [{ name: 'Innenstadt', ortsteile: [] }],
  hauptachsen: { autobahnen: ['A1'], bundesstrassen: [], knoten: [] },
  unfall_hotspots: [],
  lokale_faqs: [
    {
      frage: 'Wer zahlt fuer den Schaden?',
      antwort:
        'Die gegnerische Haftpflicht muss fuer Schaeden aufkommen und koennte haeufig ueber die Kaiserstrasse hinaus zustaendig sein, waehrend groessere Betraege spaeter geprueft werden.',
    },
  ],
  hero_anker: 'Ein Text ohne jeden Ortsbezug, der buendelt und koennen schreibt.',
  topografie_anker: null,
}
// Getrennt halten, NICHT in `zeilen` mischen: die Proben sind absichtlich
// duenn und identisch. Untergemischt verfaelschen sie genau die Kennzahlen,
// wegen derer man das Skript aufruft — beim ersten scharfen Lauf meldete es
// mit --selbsttest `min 39 Woerter` statt 1282 und 2,90 % statt 0,20 %
// Ueberlappung. Ein Selbsttest, der den Messwert verschiebt, den er absichern
// soll, ist schlimmer als keiner.
const proben: Array<Record<string, any>> = selbsttest
  ? [KAPUTT as Record<string, any>, { ...KAPUTT, stadt_slug: '__selbsttest_b' } as Record<string, any>]
  : []
/** Echte Zeilen + Proben — nur fuer die BEFUNDE, nie fuer die Statistik. */
const zeilenMitProben = [...zeilen, ...proben]

console.log(`\nLOKALINHALT-QUALITAET   (env: ${envPfad})${selbsttest ? '   [SELBSTTEST aktiv]' : ''}\n`)

// --- 1) Wuerde jede Zeile heute noch durchs Gate gehen? ---------------------
const durchgefallen: { slug: string; status: string; gruende: string[] }[] = []
for (const z of zeilenMitProben) {
  const befund = pruefeLokalinhalt(
    {
      stadtbezirke: z.stadtbezirke ?? [],
      hauptachsen: z.hauptachsen ?? { autobahnen: [], bundesstrassen: [], knoten: [] },
      unfallHotspots: z.unfall_hotspots ?? [],
      lokaleFaqs: z.lokale_faqs ?? [],
      heroAnker: z.hero_anker ?? undefined,
      topografieAnker: z.topografie_anker ?? undefined,
    },
    getStadtStammdaten(z.stadt_slug)?.name ?? z.stadt_slug,
  )
  if (!befund.ok) durchgefallen.push({ slug: z.stadt_slug, status: z.status, gruende: befund.gruende })
}

// --- 2) Substanz ------------------------------------------------------------
const v = substanzVerteilung(zeilen)
console.log(`  Staedte                  ${v.staedte}`)
console.log(`  Woerter (min/median/max) ${v.woerter.min} / ${v.woerter.median} / ${v.woerter.max}`)
console.log(`  ohne Bezirke             ${v.ohne.bezirke}`)
console.log(`  ohne Knoten              ${v.ohne.knoten}`)
console.log(`  ohne FAQs                ${v.ohne.faqs}`)
console.log(`  ohne Unfallschwerpunkte  ${v.ohne.hotspots}${v.ohne.hotspots === v.staedte ? '   (alle — der Quellenzwang laesst praktisch keine durch)' : ''}`)

// --- 3) Near-Duplicate ------------------------------------------------------
// ⚠ Der NAME, nicht der Slug — derselbe Fehler wie oben beim Gate, hier aber
// mit umgekehrtem Vorzeichen: `viergramme` soll den Ortsnamen ENTFERNEN, damit
// zwei Baukasten-Texte, die sich nur in ihm unterscheiden, als das erkannt
// werden, was sie sind. Mit dem Slug ("koeln") greift die Ersetzung bei jeder
// Umlaut-Stadt nicht, denn im Text steht "Köln" — der Ortsname bleibt drin und
// laesst die Paare kuenstlich VERSCHIEDEN aussehen. Gemessen 23.08.: Slug 333
// Paare ueber der Grenze, Name 478. Ein Messfehler, der beruhigt, ist der
// gefaehrlichste — genau davor warnt auch der Kommentar in `viergramme`.
const grammeVon = (liste: Array<Record<string, any>>) =>
  liste.map((z) => ({
    slug: z.stadt_slug,
    gramme: viergramme(textAusZeile(z), getStadtStammdaten(z.stadt_slug)?.name ?? z.stadt_slug),
  }))
// Zwei Laeufe, bewusst: `p` findet die BEFUNDE (inkl. Proben), `pEcht` liefert
// die ZAHLEN, die im Bericht stehen. Bei 173 Staedten sind das 2x ~15.000
// Mengenvergleiche — Millisekunden, und dafuer stimmen beide Aussagen.
const p = paarBefunde(grammeVon(zeilenMitProben), GRENZE)
const pEcht = selbsttest ? paarBefunde(grammeVon(zeilen), GRENZE) : p
console.log(`\n  Textueberlappung (${pEcht.paare} Paare, Grenze ${GRENZE} %)`)
console.log(`    Durchschnitt           ${pEcht.schnitt.toFixed(2)} %`)
console.log(`    Maximum                ${pEcht.max.toFixed(1)} %${pEcht.schlimmstes ? `  (${pEcht.schlimmstes})` : ''}`)

console.log('\nBEFUNDE\n')
console.log(`  ueber der Grenze         ${p.ueberGrenze.length}`)
for (const u of p.ueberGrenze.slice(0, 10)) console.log(`    🔴 ${u.a} ↔ ${u.b}  ${u.wert.toFixed(1)} %`)
if (p.ueberGrenze.length > 10) console.log(`    … und ${p.ueberGrenze.length - 10} weitere`)

console.log(`  faellt heute durchs Gate ${durchgefallen.length}`)
for (const d of durchgefallen.slice(0, 10)) {
  console.log(`    ${d.status === 'veroeffentlicht' ? '🔴' : '⚠'} ${d.slug} (${d.status}) — ${d.gruende[0]?.slice(0, 90)}`)
}
if (durchgefallen.length > 10) console.log(`    … und ${durchgefallen.length - 10} weitere`)

let selbsttestOk = true
if (selbsttest) {
  const treffer = durchgefallen.filter((d) => d.slug.startsWith('__selbsttest'))
  // ⚠ Nicht nur ZAEHLEN, sondern den GRUND pruefen: die Probe verletzt zwei
  // Regeln gleichzeitig (ASCII-Ersatz + fehlender Ortsbezug). Wer nur zaehlt,
  // bekommt ein gruenes Ergebnis, obwohl der Umlaut-Teil blind sein koennte —
  // der Ortsbezug allein haette den Treffer schon erzeugt.
  const mitUmlautGrund = treffer.filter((d) =>
    d.gruende.some((g) => /Umlaut|transliteriert/i.test(g)),
  ).length
  const paarGefunden = p.ueberGrenze.filter((u) => u.a.startsWith('__selbsttest')).length
  selbsttestOk = treffer.length === 2 && mitUmlautGrund === 2 && paarGefunden >= 1
  console.log(
    `\n  SELBSTTEST  Gate ${treffer.length}/2 (davon mit Umlaut-Grund ${mitUmlautGrund}/2) · ` +
      `Duplikat-Paar ${paarGefunden >= 1 ? 'gefunden' : 'NICHT gefunden'}  ` +
      (selbsttestOk ? '✓ das Instrument schlaegt an' : '🔴 DAS INSTRUMENT IST BLIND — Bericht ignorieren'),
  )
}

const echt = {
  ueberGrenze: p.ueberGrenze.filter((u) => !u.a.startsWith('__selbsttest')),
  durchgefallen: durchgefallen.filter((d) => !d.slug.startsWith('__selbsttest')),
}
const schlimm =
  echt.ueberGrenze.length + echt.durchgefallen.filter((d) => d.status === 'veroeffentlicht').length
if (schlimm === 0) console.log(`\n  ✓ keine echten Befunde${selbsttest ? '' : '   (Belastbarkeit pruefen: --selbsttest)'}`)
// exitCode statt process.exit(): ein harter Exit reisst den offenen Supabase-Client
// mit und quittiert das unter Windows mit einer libuv-Assertion.
process.exitCode = (strict && schlimm > 0) || !selbsttestOk ? 1 : 0
