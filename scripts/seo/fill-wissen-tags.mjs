// Traegt `tags` fuer die veroeffentlichten Wissen-Artikel nach, denen sie fehlen.
//
// Hintergrund (23.08.2026): Die Sektion „Passend zum Thema" auf /wissen/[slug]
// (components/content/WissenVerwandteThemen.tsx) steuert ueber `tags`. Sieben
// veroeffentlichte Artikel trugen GAR KEINE Tags und fielen damit durch — und
// zwar ausgerechnet Kernthemen (Stundenverrechnungssaetze, 130-%-Regel,
// SV-Honorar-Kuerzung, Restwertboersen, Nutzungsausfall/Mietwagen).
//
// ⚠ Warum nicht ueber `cluster` automatisieren: das Feld ist Freitext mit ~20
// Varianten fuer 69 Artikel — Dubletten und Quellennamen statt Themen
// („Captain-HUK", „Versicherungsbote", „KUES"). `tags` ist dagegen eine
// geschlossene Menge aus 7 Werten. Die Zuordnung unten ist deshalb HANDGELEGT,
// abgeleitet aus Titel + vorhandenem cluster-Wert.
//
// Ohne Flag TROCKENLAUF (nur Bericht). Schreiben erst mit --apply.
//
//   node --env-file=.env.local scripts/seo/fill-wissen-tags.mjs
//   node --env-file=.env.local scripts/seo/fill-wissen-tags.mjs --apply

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

// Erlaubte Werte = die im Bestand tatsaechlich vorkommenden. Ein Tippfehler hier
// erzeugt sonst ein achtes „Tag", das keine Ziel-Map kennt — also stumm bleibt.
const ERLAUBT = new Set([
  'Schadenregulierung', 'Recht & Urteile', 'Gutachten',
  'Werkstatt', 'Versicherer', 'Markt & News', 'Tools',
])

const TAGS = {
  'stundenverrechnungssaetze-unfallregulierung-vergleichswerkstatt': ['Werkstatt', 'Schadenregulierung'],
  'fiktive-abrechnung-130-prozent-regel-totalschaden': ['Schadenregulierung', 'Gutachten'],
  'sachverstaendigenhonorar-kuerzung-versicherung': ['Gutachten', 'Schadenregulierung'],
  'restwertboersen-versicherer-restwertangebot-internet': ['Gutachten', 'Schadenregulierung'],
  'nutzungsausfall-mietwagen-vergleich-schadensersatz-2': ['Schadenregulierung', 'Recht & Urteile'],
  'obliegenheitsverletzung-kfz-haftpflicht-direktanspruch-geschaedigter': ['Recht & Urteile', 'Schadenregulierung'],
  'restwertrisiko-gebrauchtwagen-handel-ayvens': ['Markt & News', 'Gutachten'],
}

for (const [slug, tags] of Object.entries(TAGS)) {
  const unbekannt = tags.filter((t) => !ERLAUBT.has(t))
  if (unbekannt.length) {
    console.error(`ABBRUCH: unbekanntes Tag bei ${slug}: ${unbekannt.join(', ')}`)
    process.exit(1)
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ABBRUCH: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file gesetzt?)')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: artikel, error } = await db
  .from('wissen_artikel')
  .select('slug,title,tags,status')
  .in('slug', Object.keys(TAGS))
if (error) { console.error('ABBRUCH: Lesen fehlgeschlagen:', error.message); process.exit(1) }

// Der Abgleich gegen den IST-Zustand ist wichtig: laeuft das Script ein zweites
// Mal, darf es nichts ueberschreiben, was inzwischen redaktionell gesetzt wurde.
const zuSchreiben = []
for (const slug of Object.keys(TAGS)) {
  const a = artikel.find((x) => x.slug === slug)
  if (!a) { console.log(`  ! unbekannter Slug (uebersprungen): ${slug}`); continue }
  if (a.status !== 'veroeffentlicht') { console.log(`  ! nicht veroeffentlicht (uebersprungen): ${slug}`); continue }
  if (a.tags?.length) { console.log(`  = hat bereits Tags (unangetastet): ${slug} [${a.tags.join(', ')}]`); continue }
  zuSchreiben.push({ slug, tags: TAGS[slug], titel: a.title })
}

console.log(`\nGefunden: ${artikel.length} von ${Object.keys(TAGS).length}`)
console.log(`Zu schreiben: ${zuSchreiben.length}\n`)
for (const z of zuSchreiben) console.log(`  ${z.tags.join(' + ').padEnd(40)} ${z.titel.slice(0, 56)}`)

if (!APPLY) {
  console.log('\n--- TROCKENLAUF (kein Write). Mit --apply schreiben. ---')
  process.exit(0)
}

let ok = 0
for (const z of zuSchreiben) {
  // .select() anhaengen und die Row-Zahl pruefen: ein Update, das 0 Zeilen trifft,
  // meldet KEINEN Fehler (AGENTS.md §Stille-Write-Gate).
  const { data, error: e } = await db
    .from('wissen_artikel')
    .update({ tags: z.tags })
    .eq('slug', z.slug)
    .select('slug')
  if (e) { console.error(`  FEHLER ${z.slug}: ${e.message}`); continue }
  if (!data || data.length === 0) { console.error(`  FEHLER ${z.slug}: 0 Zeilen getroffen`); continue }
  ok++
}
console.log(`\n${ok} von ${zuSchreiben.length} Artikeln aktualisiert.`)
if (ok !== zuSchreiben.length) process.exit(1)
