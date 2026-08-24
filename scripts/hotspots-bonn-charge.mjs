// Baut aus dem amtlichen Unfallatlas die `unfallHotspots`-Bloecke fuer die
// 10 Orte der Bonn-Domain — mit Unfalltyp und Beteiligten, nicht nur Fallzahl.
//
// BELEGT UND DAHER VERWENDET:
//   UTYP1        1-7, per Datensatzbeschreibung des Unfallatlas bestaetigt
//   UKATEGORIE   1=Getoetete, 2=Schwerverletzte (so liest es auch
//                scripts/lib/unfall-cluster.mjs — dieselbe Auslegung)
//   IstRad/IstFuss/IstKrad/IstGkfz  Beteiligungsflags (0/1)
// NICHT VERWENDET, weil nur teilweise belegbar: UART, IstStrassenzustand,
//   ULICHTVERH. Lieber wenige Dimensionen, die alle stimmen.
//
// ⚠ Der Unfallatlas enthaelt NUR Unfaelle MIT PERSONENSCHADEN. Jede Beschreibung
// sagt das ausdruecklich — sonst liest sich die Zahl wie "alle Unfaelle".
//
// Run: node scripts/hotspots-bonn-charge.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { zipEintraege } from './lib/zip-lesen.mjs'
import { spaltenIndizes, bildeAgs } from './lib/unfall-cluster.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = join(HIER, '..')
const CACHE = join(HIER, '.unfallatlas-cache')
const GEOCACHE = join(HIER, 'unfallatlas-geocode-cache.json')
const ZIEL = join(HIER, '.hotspots-bonn-fertig.json')

const JAHRE = [2021, 2022, 2023, 2024, 2025]
const SLUGS = ['bonn','sankt-augustin','siegburg','troisdorf','koenigswinter','bad-honnef','hennef','bornheim','rheinbach','meckenheim']
const ZIEL_PRO_ORT = 6
const MIN_PRO_ORT = 4
const STUFEN = [10, 8, 6, 5]
const MIN_ABSTAND_LAT = 0.0025
const MIN_ABSTAND_LNG = 0.0037

const UTYP = {
  1: 'Fahrunfall', 2: 'Abbiegeunfall', 3: 'Einbiegen- oder Kreuzen-Unfall',
  4: 'Überschreiten-Unfall', 5: 'Unfall durch ruhenden Verkehr',
  6: 'Unfall im Längsverkehr', 7: 'sonstiger Unfall',
}
// Was der Typ fuer die Begutachtung bedeutet — Fachaussage, keine Ortsbehauptung.
const TYP_FOLGE = {
  1: 'Beim Fahrunfall verliert jemand ohne Zutun anderer die Kontrolle; die Anstoßstelle liegt dann oft an Bordstein, Leitplanke oder Böschung, und der Schaden sitzt in Achse und Unterboden statt im sichtbaren Blech.',
  2: 'Abbiegeunfälle treffen das Fahrzeug meist seitlich vorn — dort sitzen Kotflügel, Radaufhängung und Scheinwerfer samt Sensorik, deren Erneuerung die Kalkulation schnell dominiert.',
  3: 'Beim Einbiegen und Kreuzen trifft es typischerweise die Fahrzeugflanke. Für die Haftungsfrage ist dann entscheidend, auf welcher Höhe der Anstoß sitzt und in welche Richtung das Blech verformt ist.',
  4: 'Beim Überschreiten-Unfall ist ein Fußgänger beteiligt. Am Fahrzeug bleiben oft nur Eindellungen an Haube, Kotflügel oder Scheibe zurück — die Instandsetzung ist wegen Fußgängerschutz-Systemen und verklebter Frontscheibe trotzdem aufwendig.',
  5: 'Unfälle durch ruhenden Verkehr entstehen beim Ein- und Ausparken oder an haltenden Fahrzeugen. Der Schaden wirkt klein, betrifft aber fast immer lackierte Anbauteile mit verbauter Sensorik.',
  6: 'Im Längsverkehr dominieren Auffahren und seitliches Streifen. Beim Heckanstoß wandert die Kraft in Querträger und Kofferraumboden, beim Streifen zieht sich die Kontaktspur über mehrere Bauteile.',
  7: 'Der Hergang lässt sich hier nicht auf einen Standardtyp reduzieren — umso mehr zählt die Spurenlage am Fahrzeug.',
}

// --- AGS ---------------------------------------------------------------------
const amtsdaten = JSON.parse(readFileSync(join(REPO, 'claimondo-marketing/lib/kfz-gutachter/staedte-amtsdaten.json'), 'utf8'))
const agsZuSlug = new Map()
for (const s of SLUGS) agsZuSlug.set(amtsdaten[s].ags, s)

// --- Clustern MIT Zusatzmerkmalen -------------------------------------------
const proStadt = new Map()
let gesamt = 0
for (const jahr of JAHRE) {
  const eintraege = zipEintraege(readFileSync(join(CACHE, `Unfallorte${jahr}.zip`)))
  const text = eintraege.sort((a, b) => b.groesse - a.groesse)[0].entpacke().toString('utf8')
  const zeilen = text.split(/\r?\n/)
  const kopf = zeilen[0].replace(/^﻿/, '').split(';').map((c) => c.trim().toUpperCase())
  const I = spaltenIndizes(zeilen[0])
  const iTyp = kopf.indexOf('UTYP1')
  const iRad = kopf.indexOf('ISTRAD'), iFuss = kopf.indexOf('ISTFUSS')
  const iKrad = kopf.indexOf('ISTKRAD'), iGkfz = kopf.indexOf('ISTGKFZ')
  if ([iTyp, iRad, iFuss, iKrad, iGkfz].some((x) => x < 0)) throw new Error(`${jahr}: Zusatzspalte fehlt`)

  for (let z = 1; z < zeilen.length; z++) {
    const s = zeilen[z].split(';')
    if (s.length < I._anzahl - 1) continue
    const slug = agsZuSlug.get(bildeAgs(s[I.ULAND], s[I.UREGBEZ], s[I.UKREIS], s[I.UGEMEINDE]))
    if (!slug) continue
    const lng = parseFloat(String(s[I.XGCSWGS84]).replace(',', '.'))
    const lat = parseFloat(String(s[I.YGCSWGS84]).replace(',', '.'))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const zelle = `${Math.round(lat / 0.001)}_${Math.round(lng / 0.0015)}`
    if (!proStadt.has(slug)) proStadt.set(slug, new Map())
    const m = proStadt.get(slug)
    if (!m.has(zelle)) m.set(zelle, { n: 0, schwer: 0, tote: 0, latSum: 0, lngSum: 0, typ: {}, rad: 0, fuss: 0, krad: 0, gkfz: 0 })
    const c = m.get(zelle)
    c.n++; c.latSum += lat; c.lngSum += lng
    const kat = parseInt(s[I.UKATEGORIE], 10)
    if (kat === 1) c.tote++; else if (kat === 2) c.schwer++
    const t = parseInt(s[iTyp], 10)
    if (UTYP[t]) c.typ[t] = (c.typ[t] ?? 0) + 1
    if (s[iRad] === '1') c.rad++
    if (s[iFuss] === '1') c.fuss++
    if (s[iKrad] === '1') c.krad++
    if (s[iGkfz] === '1') c.gkfz++
    gesamt++
  }
}
console.log(`${gesamt.toLocaleString('de-DE')} Unfaelle mit Personenschaden 2021-2025 in den 10 Orten\n`)

// --- Auswahl je Ort ----------------------------------------------------------
function waehle(zellen, schwelle, max) {
  const kand = [...zellen.values()].filter((c) => c.n >= schwelle)
    .map((c) => ({ ...c, lat: c.latSum / c.n, lng: c.lngSum / c.n }))
    .sort((a, b) => b.n - a.n || b.tote - a.tote || b.schwer - a.schwer)
  const gew = []
  for (const c of kand) {
    if (gew.some((g) => Math.abs(g.lat - c.lat) < MIN_ABSTAND_LAT && Math.abs(g.lng - c.lng) < MIN_ABSTAND_LNG)) continue
    gew.push(c)
    if (gew.length >= max) break
  }
  return gew
}

const cache = JSON.parse(readFileSync(GEOCACHE, 'utf8'))
const schluessel = (c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`
const QUELLE = 'https://unfallatlas.statistikportal.de/'

function leseToken() {
  for (const p of [join(REPO, '.env.local'), join(REPO, '../../../.env.local')]) {
    if (!existsSync(p)) continue
    const z = readFileSync(p, 'utf8').split('\n').find((l) => l.startsWith('MAPBOX_ACCESS_TOKEN='))
    if (z) return z.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
  }
  return null
}
const TOKEN = leseToken()

/** Geocodiert fehlende Cluster nach. Ohne Strassenname ist eine Haeufung keine
 *  Angabe — deshalb Abbruch statt stillem Weglassen, wenn kein Token da ist. */
async function geocodiereFehlende(kandidaten) {
  const offen = kandidaten.filter((c) => !cache[schluessel(c)])
  if (offen.length === 0) return
  if (!TOKEN) throw new Error(`${offen.length} Cluster ohne Geocoding und kein MAPBOX_ACCESS_TOKEN`)
  for (const c of offen) {
    const u = `https://api.mapbox.com/geocoding/v5/mapbox.places/${c.lng},${c.lat}.json?types=address&language=de&limit=1&access_token=${TOKEN}`
    const r = await fetch(u)
    if (!r.ok) throw new Error(`Mapbox HTTP ${r.status}`)
    const f = (await r.json()).features?.[0]
    const ctx = f?.context ?? []
    const finde = (p) => ctx.find((x) => x.id?.startsWith(p))?.text ?? null
    cache[schluessel(c)] = { strasse: f?.text ?? null, stadtteil: finde('neighborhood') ?? finde('locality') ?? null }
    await new Promise((r2) => setTimeout(r2, 120))
  }
  writeFileSync(GEOCACHE, JSON.stringify(cache, null, 1))
}

/** Mapbox haengt Mülldorf & Co. den historischen Stadtnamen an ("Siegburg-Mülldorf").
 *  Mülldorf gehoert seit 1969 zu Sankt Augustin — das Praefix waere schlicht falsch. */
function bereinigeStadtteil(stadtteil, slug) {
  if (!stadtteil) return null
  let s = stadtteil
  for (const fremd of SLUGS.map((x) => x.replace(/-/g, ' '))) {
    if (fremd === slug.replace(/-/g, ' ')) continue
    const re = new RegExp(`^${fremd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[- ]`, 'i')
    s = s.replace(re, '')
  }
  return s.trim() || null
}

const ausgabe = {}
for (const slug of SLUGS) {
  const zellen = proStadt.get(slug) ?? new Map()

  // ⚠ Zusammenfassen NACH der Auswahl liess drei Orte unter das Minimum fallen
  // (drei Cluster derselben Strasse = ein Eintrag). Deshalb wird jetzt auf
  // VERSCHIEDENE Strassen hin ausgewaehlt: grosszuegig Kandidaten ziehen,
  // geocodieren, gruppieren — und erst dann die staerksten Strassen nehmen.
  let treffer = [], stufe = null, nachStrasse = new Map()
  for (const st of STUFEN) {
    stufe = st
    treffer = waehle(zellen, st, 14)
    await geocodiereFehlende(treffer)
    nachStrasse = gruppiereNachStrasse(treffer, slug)
    if (nachStrasse.size >= MIN_PRO_ORT) break
  }
  // Nur die staerksten Strassen behalten.
  nachStrasse = new Map([...nachStrasse.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, ZIEL_PRO_ORT))

  const liste = []
  for (const e of [...nachStrasse.values()].sort((a, b) => b.n - a.n)) {
    const stadtteil = [...e.stadtteile][0]
    const ort = stadtteil ? `${e.strasse} (${stadtteil})` : e.strasse
    const mehrere = e.teile.length > 1

    const topTyp = Object.entries(e.typ).sort((a, b) => b[1] - a[1])[0]
    const satzTyp = topTyp
      ? ` Häufigster erfasster Unfalltyp war der ${UTYP[topTyp[0]]} (${topTyp[1]} von ${e.n} Fällen). ${TYP_FOLGE[topTyp[0]]}`
      : ''

    // ⚠ Das sind Beteiligungs-Flags je Unfall, keine getrennten Unfaelle — die
    // Formulierung muss den Bezug "von N Faellen" tragen, sonst liest sich
    // "22x ein Fahrrad" wie 22 zusaetzliche Unfaelle.
    const bet = []
    if (e.rad) bet.push(`in ${e.rad} ein Fahrrad`)
    if (e.fuss) bet.push(`in ${e.fuss} ein Fußgänger`)
    if (e.krad) bet.push(`in ${e.krad} ein Motorrad`)
    if (e.gkfz) bet.push(`in ${e.gkfz} ein Güterkraftfahrzeug`)
    const satzBet = bet.length
      ? ` Von den ${e.n} Fällen war ${bet.join(', ')} beteiligt.`
      : ''

    const folgen = []
    if (e.tote) folgen.push(`${e.tote} mit tödlichem Ausgang`)
    if (e.schwer) folgen.push(`${e.schwer} mit Schwerverletzten`)
    const satzFolgen = folgen.length ? `, darunter ${folgen.join(' und ')}` : ''

    liste.push({
      ort,
      beschreibung:
        `Der amtliche Unfallatlas weist hier für die Jahre 2021 bis 2025 ${e.n} Unfälle mit Personenschaden aus${satzFolgen}` +
        `${mehrere ? ` — verteilt auf ${e.teile.length} Häufungsstellen entlang derselben Achse` : ''}.` +
        ` Reine Blechschäden sind darin nicht enthalten, die tatsächliche Zahl der Zusammenstöße liegt also höher.` +
        satzTyp + satzBet,
      quelle: `${QUELLE} (Unfallatlas der Statistischen Ämter des Bundes und der Länder, Erhebungsjahre 2021-2025, Datenlizenz Deutschland 2.0)`,
    })
  }
  ausgabe[slug] = liste
  const warn = liste.length < MIN_PRO_ORT ? `  ⚠ unter ${MIN_PRO_ORT}` : ''
  console.log(`  ${slug.padEnd(16)} ${liste.length} Hotspots (Schwelle ${stufe})${warn}`)
}

function gruppiereNachStrasse(treffer, slug) {
  const nachStrasse = new Map()
  for (const c of treffer) {
    const g = cache[schluessel(c)]
    if (!g?.strasse) continue
    const key = g.strasse
    if (!nachStrasse.has(key)) nachStrasse.set(key, { strasse: g.strasse, stadtteile: new Set(), teile: [], n: 0, schwer: 0, tote: 0, typ: {}, rad: 0, fuss: 0, krad: 0, gkfz: 0 })
    const e = nachStrasse.get(key)
    const st = bereinigeStadtteil(g.stadtteil, slug)
    if (st && st !== g.strasse) e.stadtteile.add(st)
    e.teile.push(c)
    e.n += c.n; e.schwer += c.schwer; e.tote += c.tote
    e.rad += c.rad; e.fuss += c.fuss; e.krad += c.krad; e.gkfz += c.gkfz
    for (const [t, v] of Object.entries(c.typ)) e.typ[t] = (e.typ[t] ?? 0) + v
  }
  return nachStrasse
}

writeFileSync(ZIEL, JSON.stringify(ausgabe, null, 2))
console.log(`\nGeschrieben: ${ZIEL}`)