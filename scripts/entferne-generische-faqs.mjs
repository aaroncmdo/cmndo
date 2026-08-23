// Entfernt generische FAQs aus den Ortsinhalten — Repo-Chargen und/oder DB.
//
// WOFUER: Das Feld `lokaleFaqs` ist fuer STADT-Daten gedacht (so der Kommentar
// an seiner Rendering-Stelle). Es wurde mit allgemeinen Rechtsfragen gefuellt,
// die mit dem Ort nichts zu tun haben — dieselbe Antwort bis zu 79-mal, nur die
// FRAGE trug den Ortsnamen. Gemessen 23.08.: die FAQs stellten 74 % des
// Textkoerpers und ueberlappten paarweise im Schnitt 36,7 % (max 86 %), waehrend
// die echt lokalen Felder — Bezirke, Achsen, Topografie — bei 0,0-0,1 % lagen.
// Zwei davon (Wertminderung, "wer zahlt") standen sogar DOPPELT auf der Seite:
// der zentrale Basis-Block beantwortet sie bereits.
//
// Die vier inhaltlichen Luecken (Mietwagen, Kostenvoranschlag, Gutachterwahl,
// Werkstattwahl) sind vorher in den Basis-Block gewandert — sie erscheinen
// danach auf ALLEN 173 Seiten statt auf 58-79, in sechs Sprachen. Es geht also
// kein Inhalt verloren, er steht nur an der richtigen Stelle.
//
// ⚠ ERKENNUNG UEBER HAEUFIGKEIT, nicht ueber eine Stichwortliste: Dieselbe
// Aussage existiert in mehreren Formulierungen ("bleibt bestehen" / "bleibt
// Ihnen erhalten" / "bleibt Ihnen"). Eine Stichwortliste haette die Varianten
// verfehlt und dabei so ausgesehen, als sei aufgeraeumt.
//
// Run:  node scripts/entferne-generische-faqs.mjs [--chargen] [--db] [--scharf]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SCHWELLE = 3 // eine Antwort in mehr als 3 Staedten ist keine Ortsangabe

/**
 * Zweite Achse: SCHABLONEN, die die Haeufigkeit nicht fangen kann.
 *
 * Die Gerichts-FAQ stand auf ~100 Staedten in immer derselben Bauweise —
 * "Bis 5.000 Euro das Amtsgericht <X>, darueber das Landgericht <Y>" — aber
 * weil die beiden Gerichtsnamen variieren, ist jede Antwort ein Unikat und
 * bleibt unter jeder Haeufigkeitsschwelle. Sie ist trotzdem doppelt: der
 * zentrale Basis-Block beantwortet exakt diese Frage, ausfuehrlicher, mit
 * denselben Gerichten als Variablen, auf derselben Seite.
 *
 * ⭐ Merksatz fuer die naechste Runde: Eine Haeufigkeitsmessung findet
 * wortgleiche Wiederholung. Eine Schablone mit eingesetztem Datenwert sieht
 * fuer sie wie 100 verschiedene Texte aus. Diese Klasse findet nur das Auge —
 * deshalb steht sie hier als ausgeschriebenes Muster und nicht als Schwelle.
 */
const SCHABLONEN = [
  {
    name: 'gericht (Basis-Block deckt es ab: faq_gericht)',
    trifft: (f) =>
      /welches gericht|gericht ist .*zust[äa]ndig/i.test(String(f?.frage ?? '')) &&
      /amtsgericht|landgericht/i.test(String(f?.antwort ?? '')),
  },
]

const args = process.argv.slice(2)
const scharf = args.includes('--scharf')
const machChargen = args.includes('--chargen')
const machDb = args.includes('--db')
const machSchablonen = args.includes('--schablonen')
if (!machChargen && !machDb) {
  console.error('Bitte --chargen und/oder --db angeben (ohne --scharf = Trockenlauf).')
  process.exit(1)
}

/** Normalisierte Antwort als Schluessel — Whitespace egal, Rest wortgenau. */
const schluessel = (f) => String(f?.antwort ?? '').replace(/\s+/g, ' ').trim()

/**
 * Zaehlt Antworten ueber alle Staedte und liefert die generischen zurueck.
 * `staedte` = [{ slug, faqs }]
 */
function generischeAntworten(staedte) {
  const zaehl = new Map()
  for (const s of staedte) {
    // Pro STADT nur einmal zaehlen: stuende dieselbe Antwort zweimal in
    // derselben Stadt, waere das ein anderer Fehler und keine Verbreitung.
    for (const k of new Set(s.faqs.map(schluessel))) {
      if (!k) continue
      zaehl.set(k, (zaehl.get(k) ?? 0) + 1)
    }
  }
  const treffer = new Map()
  for (const [k, n] of zaehl) if (n > SCHWELLE) treffer.set(k, n)
  return treffer
}

// --- Quellen einlesen -------------------------------------------------------
const CHARGEN = []
if (machChargen) {
  for (let i = 1; i <= 20; i++) {
    const nr = String(i).padStart(2, '0')
    for (const suffix of ['grossstaedte', 'mittelstaedte', 'kleinstaedte']) {
      const p = join('scripts/lokalinhalte', `charge-${nr}-${suffix}.json`)
      if (existsSync(p)) CHARGEN.push(p)
    }
  }
}

let sb = null
if (machDb) {
  for (const p of ['.env.local', 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local']) {
    if (!existsSync(p)) continue
    for (const z of readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = z.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
    break
  }
  const { createClient } = await import('@supabase/supabase-js')
  sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Die Haeufigkeit wird ueber die VEREINIGUNG beider Quellen bestimmt — eine
// Charge allein saehe eine Antwort vielleicht nur 3-mal und liesse sie stehen,
// obwohl sie ueber alle Staedte hinweg 79-mal vorkommt.
const alle = []
const chargenDaten = new Map()
for (const p of CHARGEN) {
  // Die Chargen sind ein OBJEKT mit dem Slug als Schluessel, kein Array. Beim
  // ersten Lauf hatte ich das geraten — das Skript meldete daraufhin brav
  // "0 FAQs entfernt", und das liest sich wie "nichts zu tun". Verraten hat es
  // sich nur an einem Zaehler, der auf seinem Startwert 99 stehen blieb. Daher
  // unten der harte Abbruch: eine leere Charge ist ein Lesefehler, kein Befund.
  const roh = JSON.parse(readFileSync(p, 'utf-8'))
  const liste = Object.entries(roh).map(([slug, daten]) => ({ slug, daten }))
  if (liste.length === 0) throw new Error(`${p}: 0 Staedte gelesen — Struktur unerwartet`)
  chargenDaten.set(p, { roh, liste })
  for (const s of liste) alle.push({ slug: s.slug, faqs: s.daten.lokaleFaqs ?? [] })
}
let dbZeilen = []
if (sb) {
  const { data, error } = await sb
    .from('stadt_lokalinhalte')
    .select('id, stadt_slug, lokale_faqs')
    .eq('status', 'veroeffentlicht')
  if (error) {
    console.error('DB:', error.message)
    process.exit(1)
  }
  dbZeilen = data ?? []
  for (const z of dbZeilen) alle.push({ slug: z.stadt_slug, faqs: z.lokale_faqs ?? [] })
}

const generisch = generischeAntworten(alle)
console.log(`\nGENERISCHE FAQs (Antwort in mehr als ${SCHWELLE} Staedten)\n`)
for (const [k, n] of [...generisch.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}x  ${k.slice(0, 96)}`)
}
console.log(`\n  ${generisch.size} Antworten betroffen\n`)

if (machSchablonen) {
  const treffer = alle.flatMap((s) => s.faqs).filter((f) => SCHABLONEN.some((sch) => sch.trifft(f)))
  console.log('SCHABLONEN (Datenwert variiert, Aussage nicht)\n')
  for (const sch of SCHABLONEN) {
    const n = alle.flatMap((s) => s.faqs).filter((f) => sch.trifft(f)).length
    console.log(`  ${String(n).padStart(4)}x  ${sch.name}`)
  }
  const bsp = treffer[0]
  if (bsp) console.log(`\n  Beispiel: "${bsp.frage}"\n            "${bsp.antwort}"`)
  console.log('')
}

const behalte = (faqs) =>
  (faqs ?? []).filter(
    (f) =>
      !generisch.has(schluessel(f)) && !(machSchablonen && SCHABLONEN.some((s) => s.trifft(f))),
  )

// --- Chargen ----------------------------------------------------------------
let cWeg = 0
let cMin = { slug: '', n: 99 }
for (const [p, { roh, liste }] of chargenDaten) {
  let weg = 0
  for (const { slug, daten } of liste) {
    const vorher = (daten.lokaleFaqs ?? []).length
    daten.lokaleFaqs = behalte(daten.lokaleFaqs)
    weg += vorher - daten.lokaleFaqs.length
    if (daten.lokaleFaqs.length < cMin.n) cMin = { slug, n: daten.lokaleFaqs.length }
  }
  cWeg += weg
  if (scharf && weg > 0) writeFileSync(p, JSON.stringify(roh, null, 2) + '\n', 'utf-8')
  console.log(`  ${p.split(/[\\/]/).pop().padEnd(30)} -${weg}`)
}
if (CHARGEN.length) console.log(`  Chargen: ${cWeg} FAQs entfernt · duennste Stadt danach ${cMin.slug} (${cMin.n})\n`)

// --- DB ---------------------------------------------------------------------
if (sb) {
  let dWeg = 0
  let geaendert = 0
  let dMin = { slug: '', n: 99 }
  for (const z of dbZeilen) {
    const vorher = (z.lokale_faqs ?? []).length
    const neu = behalte(z.lokale_faqs)
    if (neu.length < dMin.n) dMin = { slug: z.stadt_slug, n: neu.length }
    if (neu.length === vorher) continue
    dWeg += vorher - neu.length
    geaendert++
    if (!scharf) continue
    // ⚠ Rueckgabewert PRUEFEN: supabase-js wirft nicht. Und `.select()`, damit
    // eine von RLS gefilterte 0-Zeilen-Aenderung nicht als Erfolg durchgeht.
    const { data, error } = await sb
      .from('stadt_lokalinhalte')
      .update({ lokale_faqs: neu })
      .eq('id', z.id)
      .select('id')
    if (error) {
      console.error(`  🔴 ${z.stadt_slug}: ${error.message}`)
      process.exitCode = 1
    } else if (!data?.length) {
      console.error(`  🔴 ${z.stadt_slug}: 0 Zeilen geaendert — Update lief ins Leere`)
      process.exitCode = 1
    }
  }
  console.log(`  DB: ${dWeg} FAQs aus ${geaendert} Staedten · duennste danach ${dMin.slug} (${dMin.n})`)
}

console.log(scharf ? '\n✓ geschrieben' : '\nTrockenlauf — nichts geschrieben. Mit --scharf ausfuehren.')
