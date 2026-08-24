// Fuellt wissen_artikel.meta_title fuer die veroeffentlichten Artikel.
//
// Hintergrund (SEO-Audit 19.08.2026): `title` ist zugleich die sichtbare H1 des
// Artikels und darf lang/beschreibend bleiben. Das Marketing-Layout haengt an
// den <title> automatisch " | Claimondo" (12 Zeichen) an — Google zeigt rund 60.
// 58 der 65 Titel lagen ueber der daraus folgenden Marke von 48 Zeichen
// (laengster: 79 + 12 = 91). meta_title traegt den kurzen SERP-Titel, die H1
// bleibt unveraendert.
//
// Ohne Flag laeuft das Script als TROCKENLAUF (nur Bericht, kein Write).
// Schreiben erst mit --apply.
//
//   node --env-file=.env.local scripts/seo/fill-wissen-meta-titles.mjs
//   node --env-file=.env.local scripts/seo/fill-wissen-meta-titles.mjs --apply

import { createClient } from '@supabase/supabase-js'

const MAX_LEN = 48 // + " | Claimondo" (12) = 60
const APPLY = process.argv.includes('--apply')

// slug -> kurzer SERP-Titel. Bewusst per slug statt id: im Diff nachvollziehbar.
// Regel bei der Kuerzung: das Keyword bleibt vorn, der abgeschnittene Teil ist
// die rhetorische Frage / der Nachsatz — der steht ohnehin in der H1.
const META_TITLES = {
  'reparaturnachweis-fiktive-abrechnung-versicherer-pflicht': 'Reparaturnachweis nach fiktiver Abrechnung',
  'freie-wahl-kfz-sachverstaendiger-unverschuldeter-unfall': 'Freie Sachverständigenwahl nach dem Unfall',
  'restwertabzug-haftpflichtregulierung-hoeheres-angebot-bgh': 'Restwertabzug: höhere Angebote des Versicherers',
  'totalschaden-grenzfall-130-prozent-zweitmeinungsgutachten': '130-%-Grenze: Wann ein Zweitgutachten lohnt',
  'freie-werkstattwahl-dispositionsfreiheit-unfallgeschaedigter': 'Freie Werkstattwahl nach dem Unfall',
  'obliegenheitsverletzung-kfz-haftpflicht-direktanspruch-geschaedigter': 'Obliegenheitsverletzung Kfz-Haftpflicht',
  'modellwechsel-elektroauto-gebrauchtwagenmarkt-huk': 'Modellwechsel E-Auto: Folgen fürs Gutachten',
  'kammergericht-berlin-unfallschaden-verharmlosung-rueckabwicklung-20-u-186-18': 'KG Berlin: Verharmlosung des Unfallschadens',
  'ford-transit-custom-rueckruf-gurte-dieselleitung-tuersteuerung': 'Ford Transit Custom: Rückruf zu Gurt & Diesel',
  'e-scooter-unfaelle-fast-verdoppelt': 'E-Scooter-Unfälle: Zahlen fast verdoppelt',
  'mietwagen-nach-verkehrsunfall-klassenniedrigeres-fahrzeug-mietwagenkosten': 'Mietwagen nach Unfall: kleinere Klasse',
  '2020-nicolas-witte-sachverstaendigen-abschaffen-captain-huk': 'Nicolas Witte über den Sachverständigen',
  'oldtimer-saisonfahrzeug-totalschaden-wiederbeschaffungswert': 'Totalschaden beim Oldtimer: Wert ermitteln',
  'zentralrechner-architektur-folgen-werkstatt-gutachten': 'Zentralrechner im Fahrzeug: Folgen im Kfz',
  'automechanika-karosserie-lack-workshops-anmeldung': 'Automechanika 2024: Karosserie-Workshops',
  'schadengutachten-leasingfahrzeug-mietwagen-schadenregulierung': 'Schadengutachten bei Leasing & Mietwagen',
  'wiederbeschaffungsdauer-nutzungsausfall-unfallschadenregulierung': 'Wiederbeschaffungsdauer & Nutzungsausfall',
  'feuersozietaet-sachverstaendigenverfahren-reparaturfall-kaskoschaden': 'Feuersozietät: Sachverständigenverfahren',
  'gebrauchtwagenmarkt-juli-schwach-folgen-fahrzeugbewertung': 'Gebrauchtwagenmarkt Juli: Folgen fürs Gutachten',
  'mitverschulden-haftungsquote-schadensersatzberechnung': 'Mitverschulden § 254 BGB: Haftungsquoten',
  'schadensminderungspflicht-unfallgeschaedigter-254-bgb': 'Schadensminderungspflicht § 254 BGB',
  'totalschadengutachten-bewertungsfehler-sachverstaendigenpraxis': 'Totalschadengutachten: Bewertungsfehler',
  'restwert-kaskoregulierung-totalschaden-fahrzeugverwertung': 'Restwertgebot in der Kaskoregulierung',
  'sachverstaendigenhonorar-bvsk-tabelle-kuerzung-versicherer-gericht': 'Sachverständigenhonorar: BVSK-Tabelle',
  'restwertrisiko-gebrauchtwagen-handel-ayvens': 'Restwertrisiko durch Fuhrparkrückläufer',
  'zeitwertschutz-kaskoversicherung-totalschaden-gap-deckung': 'Zeitwertschutz Kasko: GAP bei Totalschaden',
  'digitale-schadenaufnahme-mobiler-karosseriescanner': 'Digitale Schadenaufnahme per Scanner',
  'olg-frankfurt-fiktive-abrechnung-lg-darmstadt-22-u-16-19': 'OLG Frankfurt zur fiktiven Abrechnung',
  'lg-berlin-persoenlichkeitsrecht-kfz-sachverstaendiger-huk-coburg-88-s-5-19': 'LG Berlin: Persönlichkeitsrecht des Gutachters',
  'vin-auswertung-fahrzeughistorie-sachverstaendigengutachten-restwert': 'VIN-Auswertung im Gutachten',
  'sommerhitze-reifenschaeden-schadenregulierung': 'Reifenschäden durch Sommerhitze',
  'kfz-klimaanlage-geschichte-kaeltemittel-schadenregulierung': 'Klimaanlage im Kfz: Technik & Schaden',
  'restwertboersen-versicherer-restwertangebot-internet': 'Restwertbörsen: Angebot des Versicherers',
  'fiktive-abrechnung-kaskoschaden-akb-besonderheiten': 'Fiktive Abrechnung bei Kaskoschäden',
  'direktanspruch-haftpflichtversicherer-115-vvg': 'Direktanspruch nach § 115 VVG',
  'vorschaden-offenlegungspflicht-sachverstaendiger-restwert-gutachten': 'Vorschäden im Gutachten: Offenlegung',
  'kfz-gutachten-plausibilitaetspruefung-versicherer-kuerzung': 'Kfz-Gutachten: Plausibilitätsprüfung',
  'sachverstaendigenhonorar-kuerzung-versicherung': 'Sachverständigenhonorar kürzen: was gilt',
  'restwertangebot-vorbehalt-annahme-geschaedigter-quittung': 'Restwertangebot: Unterschrift als Falle',
  'kfz-werkstatt-standgeld-fahrzeug-nicht-abgeholt': 'Standgeld in der Werkstatt: OLG Köln',
  'restwertermittlung-regionaler-markt-vs-restwertboerse': 'Restwertermittlung: Markt vs. Börse',
  'dat-neue-gesellschafter-verwaltungsrat-geschaeftsfuehrung': 'DAT: Neuer Gesellschafter und Führung',
  'e-autos-unfallrisiko-vergleich-verbrenner-unfallforschung': 'E-Autos vs. Verbrenner: Unfallforschung',
  'lg-frankfurt-oder-14-s-2-19-huk-coburg-beweisverfahren': 'LG Frankfurt (Oder): HUK zahlt nach 9,5 Jahren',
  'elektronische-feststellbremse-pruefstand-schadenrisiko': 'Elektronische Feststellbremse am Prüfstand',
  'wiederbeschaffungswert-ermittlung-methoden-sachverstaendiger': 'Wiederbeschaffungswert ermitteln',
  'hochvolt-investition-stundenverrechnungssatz-e-auto': 'Stundenverrechnungssatz für E-Autos',
  'nutzungsausfall-mietwagen-vergleich-schadensersatz-2': 'Nutzungsausfall oder Mietwagen?',
  'kompatibilitaetspruefung-schadengutachten-unfallhergang-schadenbild': 'Kompatibilitätsprüfung im Gutachten',
  'grobe-fahrlassigkeit-kaskoversicherung-quotelung-kvg-81': 'Grobe Fahrlässigkeit: § 81 VVG in der Kasko',
  'abtretung-schadensersatzanspruch-werkstatt-haftpflichtversicherer': 'Abtretung Schadensersatz an die Werkstatt',
  'reparaturkosten-2025-anstieg-764-euro': 'Reparaturkosten 2025: 764 Euro im Schnitt',
  'recht-auf-reparatur-bgb-aenderung-autohandel': 'Recht auf Reparatur: BGB-Änderung',
  'integritaetsinteresse-reparatur-totalschaden-unfallregulierung': 'Integritätsinteresse bei Totalschaden',
  'kaskoschaden-deckungsablehnung-obliegenheit': 'Kaskoschaden: Deckungsablehnung',
  'vw-klebeexperte-standard-scheibenerneuerung': 'VW-Klebeexperte: Standard Scheibentausch',
  'vorschaden-beweislast-unfallschadenregulierung': 'Vorschaden & Beweislast im Unfallschaden',
  'stundenverrechnungssaetze-unfallregulierung-vergleichswerkstatt': 'Stundenverrechnungssätze bei Unfällen',
  // Nachtrag 23.08.2026: die drei Artikel, die der Trockenlauf als „zu lang, ohne
  // Vorschlag" meldete. Gekuerzt nach derselben Regel wie oben — Keyword vorn,
  // der Nachsatz faellt (er steht ohnehin in der H1).
  'digitalisierung-werkstatt-kundenservice-dekra-ipsos-studie': 'Werkstatt-Digitalisierung: die große Lücke',
  'herstellermacht-freie-werkstaetten-recht-auf-reparatur': 'Recht auf Reparatur: Folgen für Werkstätten',
  'neodigital-uebernahme-hector-digital-assekuradeur-kartellamt': 'Assekuradeur übernommen: Folgen für Schäden',
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file=.env.local?)')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// --- 1. Laengen pruefen, BEVOR irgendetwas die DB anfasst ------------------
const zuLang = Object.entries(META_TITLES).filter(([, t]) => t.length > MAX_LEN)
if (zuLang.length > 0) {
  console.error(`ABBRUCH: ${zuLang.length} Vorschlaege ueber ${MAX_LEN} Zeichen:`)
  for (const [slug, t] of zuLang) console.error(`  ${t.length}  ${slug}\n      ${t}`)
  process.exit(1)
}

// --- 2. Gegen die DB abgleichen -------------------------------------------
const { data: artikel, error: readErr } = await db
  .from('wissen_artikel')
  .select('id, slug, title, meta_title, status')
  .eq('status', 'veroeffentlicht')

if (readErr) {
  console.error('Lesen fehlgeschlagen:', readErr.message)
  process.exit(1)
}

const bekannt = new Map(artikel.map((a) => [a.slug, a]))
const unbekannt = Object.keys(META_TITLES).filter((s) => !bekannt.has(s))
if (unbekannt.length > 0) {
  console.error(`ABBRUCH: ${unbekannt.length} Slugs existieren nicht (oder sind nicht veroeffentlicht):`)
  for (const s of unbekannt) console.error(`  ${s}`)
  process.exit(1)
}

const ohneVorschlag = artikel.filter((a) => !META_TITLES[a.slug] && a.title.length > MAX_LEN)
const zuSchreiben = artikel.filter((a) => META_TITLES[a.slug] && a.meta_title !== META_TITLES[a.slug])

console.log(`Artikel veroeffentlicht: ${artikel.length}`)
console.log(`Vorschlaege:             ${Object.keys(META_TITLES).length}`)
console.log(`Zu schreiben:            ${zuSchreiben.length}`)
console.log(`Zu lang, ohne Vorschlag: ${ohneVorschlag.length}`)
for (const a of ohneVorschlag) console.log(`  ! ${a.title.length}  ${a.slug}`)

if (!APPLY) {
  console.log('\n--- TROCKENLAUF (kein Write). Mit --apply schreiben. ---')
  for (const a of zuSchreiben) {
    console.log(`${String(a.title.length).padStart(2)} -> ${String(META_TITLES[a.slug].length).padStart(2)}  ${META_TITLES[a.slug]}`)
  }
  process.exit(0)
}

// --- 3. Schreiben ----------------------------------------------------------
let ok = 0
for (const a of zuSchreiben) {
  // .select() + Row-Check: ein Update, dessen Ergebnis niemand liest, kann
  // Erfolg und Fehlschlag nicht unterscheiden (AGENTS.md, Stille-Write-Gate).
  const { data, error } = await db
    .from('wissen_artikel')
    .update({ meta_title: META_TITLES[a.slug], updated_at: new Date().toISOString() })
    .eq('id', a.id)
    .select('id, meta_title')

  if (error) {
    console.error(`FEHLER ${a.slug}: ${error.message}`)
    process.exit(1)
  }
  if (!data || data.length !== 1) {
    console.error(`FEHLER ${a.slug}: ${data?.length ?? 0} Zeilen getroffen (erwartet 1)`)
    process.exit(1)
  }
  ok++
}

console.log(`\n${ok} Artikel aktualisiert.`)
