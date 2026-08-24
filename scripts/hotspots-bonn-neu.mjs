// Schreibt die Bonn-Hotspots NEU — auf dem exportierten Ist-Stand, nach der
// korrigierten Vorgabe (24.08.):
//
//  1. KEINE Opferzahlen. Schwerverletzte und Getoetete sind keine
//     Aufzaehlungspunkte in einem Text, der Gutachterleistungen verkauft.
//     (Vorher standen sie in 40 von 56 Eintraegen.)
//  2. QUELLE korrigiert. Bisher zeigte sie auf unfallatlas.statistikportal.de —
//     abgerufen: eine reine KARTENANWENDUNG ohne lesbare Einzelaussagen. Ein
//     Leser, der klickt, findet die Zahl dort nicht. Jetzt zeigt sie auf die
//     opengeodata.nrw.de-Rohdaten, aus denen tatsaechlich gerechnet wurde
//     (Unfallorte<jahr>_EPSG25832_CSV.zip, Datenlizenz Deutschland 2.0) —
//     nachrechenbar statt nur plausibel.
//  3. EHRLICHE EINORDNUNG. Das hier sind statistische Haeufungen aus Rohdaten,
//     KEINE behoerdlich ausgewiesenen Unfallhaeufungsstellen. Unfallkommissionen
//     weisen fuer kleinere Staedte oft gar keine aus. Der Text sagt das, statt
//     eine behoerdliche Feststellung zu behaupten, die es nicht gibt.
//
// Run: node scripts/hotspots-bonn-neu.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { zipEintraege } from './lib/zip-lesen.mjs'
import { spaltenIndizes, bildeAgs } from './lib/unfall-cluster.mjs'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = join(HIER, '..')
const CACHE = join(HIER, '.unfallatlas-cache')
const GEOCACHE = join(HIER, 'unfallatlas-geocode-cache.json')
const ZIEL = join(HIER, '.hotspots-bonn-v2.json')

const JAHRE = [2021, 2022, 2023, 2024, 2025]
const SLUGS = ['bonn','sankt-augustin','siegburg','troisdorf','koenigswinter','bad-honnef','hennef','bornheim','rheinbach','meckenheim']
const ZIEL_PRO_ORT = 6
const MIN_PRO_ORT = 4
const STUFEN = [10, 8, 6, 5]
const MIN_ABSTAND_LAT = 0.0025
const MIN_ABSTAND_LNG = 0.0037

const QUELLE =
  'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/ ' +
  '(Unfallatlas der Statistischen Ämter des Bundes und der Länder, Rohdaten Unfallorte 2021-2025, ' +
  'Datenlizenz Deutschland Namensnennung 2.0 — eigene Auswertung)'

const UTYP = {
  1: 'Fahrunfall', 2: 'Abbiegeunfall', 3: 'Einbiegen- oder Kreuzen-Unfall',
  4: 'Überschreiten-Unfall', 5: 'Unfall durch ruhenden Verkehr',
  6: 'Unfall im Längsverkehr', 7: 'sonstiger Unfall',
}
const TYP_FOLGE = {
  1: 'Beim Fahrunfall verliert jemand ohne Zutun anderer die Kontrolle. Die Anstoßstelle liegt dann meist an Bordstein, Leitplanke oder Böschung, und der Schaden sitzt in Achse und Unterboden statt im sichtbaren Blech — ohne Vermessung bleibt er unbeziffert.',
  2: 'Abbiegeunfälle treffen das Fahrzeug seitlich vorn. Dort sitzen Kotflügel, Radaufhängung und Scheinwerfer samt Sensorik, deren Erneuerung die Kalkulation schnell dominiert.',
  3: 'Beim Einbiegen und Kreuzen trifft es typischerweise die Fahrzeugflanke. Für die Haftungsfrage ist entscheidend, auf welcher Höhe der Anstoß sitzt und in welche Richtung das Blech verformt ist — nach der Reparatur ist das nicht mehr feststellbar.',
  4: 'Der Überschreiten-Unfall betrifft querende Fußgänger. Am Fahrzeug bleiben oft nur Eindellungen an Haube, Kotflügel oder Scheibe, die Instandsetzung ist wegen Fußgängerschutz-Systemen und verklebter Frontscheibe trotzdem aufwendig.',
  5: 'Unfälle durch ruhenden Verkehr entstehen beim Ein- und Ausparken oder an haltenden Fahrzeugen. Der Schaden wirkt klein, betrifft aber fast immer lackierte Anbauteile mit verbauter Abstandssensorik.',
  6: 'Im Längsverkehr dominieren Auffahren und seitliches Streifen. Beim Heckanstoß wandert die Kraft in Querträger und Kofferraumboden, beim Streifen zieht sich die Kontaktspur über mehrere Bauteile, die gemeinsam kalkuliert gehören.',
  7: 'Der Hergang lässt sich hier nicht auf einen Standardtyp reduzieren — umso mehr zählt die Spurenlage am Fahrzeug.',
}

const amtsdaten = JSON.parse(readFileSync(join(REPO, 'claimondo-marketing/lib/kfz-gutachter/staedte-amtsdaten.json'), 'utf8'))
const agsZuSlug = new Map()
for (const s of SLUGS) agsZuSlug.set(amtsdaten[s].ags, s)

const proStadt = new Map()
for (const jahr of JAHRE) {
  const eintraege = zipEintraege(readFileSync(join(CACHE, `Unfallorte${jahr}.zip`)))
  const text = eintraege.sort((a, b) => b.groesse - a.groesse)[0].entpacke().toString('utf8')
  const zeilen = text.split(/\r?\n/)
  const kopf = zeilen[0].replace(/^﻿/, '').split(';').map((c) => c.trim().toUpperCase())
  const I = spaltenIndizes(zeilen[0])
  const iTyp = kopf.indexOf('UTYP1')
  const iRad = kopf.indexOf('ISTRAD'), iFuss = kopf.indexOf('ISTFUSS')
  const iKrad = kopf.indexOf('ISTKRAD'), iGkfz = kopf.indexOf('ISTGKFZ')
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
    if (!m.has(zelle)) m.set(zelle, { n: 0, latSum: 0, lngSum: 0, typ: {}, rad: 0, fuss: 0, krad: 0, gkfz: 0 })
    const c = m.get(zelle)
    c.n++; c.latSum += lat; c.lngSum += lng
    const t = parseInt(s[iTyp], 10)
    if (UTYP[t]) c.typ[t] = (c.typ[t] ?? 0) + 1
    if (s[iRad] === '1') c.rad++
    if (s[iFuss] === '1') c.fuss++
    if (s[iKrad] === '1') c.krad++
    if (s[iGkfz] === '1') c.gkfz++
  }
}

function waehle(zellen, schwelle, max) {
  const kand = [...zellen.values()].filter((c) => c.n >= schwelle)
    .map((c) => ({ ...c, lat: c.latSum / c.n, lng: c.lngSum / c.n }))
    .sort((a, b) => b.n - a.n)
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

function bereinigeStadtteil(stadtteil, slug) {
  if (!stadtteil) return null
  let s = stadtteil
  for (const fremd of SLUGS.map((x) => x.replace(/-/g, ' '))) {
    if (fremd === slug.replace(/-/g, ' ')) continue
    s = s.replace(new RegExp(`^${fremd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[- ]`, 'i'), '')
  }
  return s.trim() || null
}

const ausgabe = {}
for (const slug of SLUGS) {
  const zellen = proStadt.get(slug) ?? new Map()
  let gruppen = new Map()
  for (const st of STUFEN) {
    const treffer = waehle(zellen, st, 14)
    gruppen = new Map()
    for (const c of treffer) {
      const g = cache[schluessel(c)]
      if (!g?.strasse) continue
      if (!gruppen.has(g.strasse)) gruppen.set(g.strasse, { strasse: g.strasse, stadtteile: new Set(), teile: 0, n: 0, typ: {}, rad: 0, fuss: 0, krad: 0, gkfz: 0 })
      const e = gruppen.get(g.strasse)
      const stt = bereinigeStadtteil(g.stadtteil, slug)
      if (stt && stt !== g.strasse) e.stadtteile.add(stt)
      e.teile++; e.n += c.n
      e.rad += c.rad; e.fuss += c.fuss; e.krad += c.krad; e.gkfz += c.gkfz
      for (const [t, v] of Object.entries(c.typ)) e.typ[t] = (e.typ[t] ?? 0) + v
    }
    if (gruppen.size >= MIN_PRO_ORT) break
  }
  const top = [...gruppen.values()].sort((a, b) => b.n - a.n).slice(0, ZIEL_PRO_ORT)

  ausgabe[slug] = top.map((e) => {
    const stadtteil = [...e.stadtteile][0]
    const ort = stadtteil ? `${e.strasse} (${stadtteil})` : e.strasse
    const topTyp = Object.entries(e.typ).sort((a, b) => b[1] - a[1])[0]

    const bet = []
    if (e.rad) bet.push(`in ${e.rad} ein Fahrrad`)
    if (e.fuss) bet.push(`in ${e.fuss} ein Fußgänger`)
    if (e.krad) bet.push(`in ${e.krad} ein Motorrad`)
    if (e.gkfz) bet.push(`in ${e.gkfz} ein Güterkraftfahrzeug`)

    return {
      ort,
      beschreibung:
        `Eine eigene Auswertung der Unfallatlas-Rohdaten für 2021 bis 2025 zeigt hier eine Häufung von ${e.n} erfassten Unfällen` +
        `${e.teile > 1 ? `, verteilt auf ${e.teile} Stellen entlang derselben Achse` : ''}. ` +
        `Das ist eine statistische Häufung aus den Rohdaten, keine behördlich ausgewiesene Unfallhäufungsstelle — und erfasst sind nur Unfälle, bei denen die Polizei aufgenommen hat, reine Blechschäden fehlen darin.` +
        (topTyp ? ` Häufigster Typ war der ${UTYP[topTyp[0]]} (${topTyp[1]} von ${e.n}). ${TYP_FOLGE[topTyp[0]]}` : '') +
        (bet.length ? ` Von den ${e.n} Fällen war ${bet.join(', ')} beteiligt.` : ''),
      quelle: QUELLE,
    }
  })
  console.log(`  ${slug.padEnd(16)} ${ausgabe[slug].length} Hotspots`)
}

writeFileSync(ZIEL, JSON.stringify(ausgabe, null, 2))
const alle = Object.values(ausgabe).flat()
const mitOpfern = alle.filter((h) => /Schwerverletzt|tödlich|Getötet/i.test(h.beschreibung)).length
console.log(`\nGeschrieben: ${ZIEL}`)
console.log(`Hotspots gesamt: ${alle.length} · mit Opferzahlen: ${mitOpfern} (muss 0 sein)`)
if (mitOpfern > 0) process.exit(1)
