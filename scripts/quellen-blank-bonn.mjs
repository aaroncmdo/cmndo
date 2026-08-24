// Stellt die 57 Bonn-Hotspot-Quellen auf die ROBUSTE Form um:
// `quelle` traegt nur noch die blanke URL, die Zuschreibung wandert in den
// Beschreibungstext.
//
// WARUM NOETIG, obwohl der LP-Renderer gefixt ist: Die DB-Zeile wird von ZWEI
// Oberflaechen gelesen. Der Fix (`h.quelle.split(/\s+/)[0]`) sitzt in den
// Cluster-LPs — die claimondo.de-Stadtseite rendert weiterhin
// `href={h.quelle}` (page.tsx:635) und nimmt damit das GANZE Feld als href.
// Betroffen sind dort 9 der 10 Orte (alle ausser `bonn`, das ueber
// HYPERLOCAL_DATA laeuft und die DB nicht liest) = 50 der 57 Eintraege.
//
// Eine blanke URL ist in BEIDEN Renderern korrekt, unabhaengig vom Fix.
//
// ⚠ Die Namensnennung ist bei der Datenlizenz Deutschland Namensnennung 2.0
// lizenzrechtlich PFLICHT — sie darf nicht einfach entfallen, sondern muss in
// den sichtbaren Text.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HIER = dirname(fileURLToPath(import.meta.url))
const ist = JSON.parse(readFileSync(join(HIER, 'lokalinhalte/.ist-stand-bonn-alle.json'), 'utf8'))
const ZIEL = join(HIER, 'lokalinhalte/charge-18-bonn-quellen.json')

// Zwei Achsen, bewusst getrennt:
//   `quelle` (der LINK)  -> wo ein Leser die Stelle NACHSEHEN kann
//   Zuschreibung (TEXT)  -> woher die ZAHL stammt, plus Lizenz-Namensnennung
//
// Der Link zeigt auf die interaktive Karte, nicht auf den Rohdaten-Download:
// Wer auf opengeodata.nrw.de klickt, landet bei einer ZIP-Datei und muesste
// 60 MB laden und selbst rechnen, um „Koelnstrasse, 46 Unfaelle" zu pruefen.
// Auf der Karte kann er die Stelle direkt ansehen. Ein Beleg muss die Aussage
// nicht als Text enthalten, er muss sie ueberpruefbar machen — und das tut hier
// die Karte besser. Das bestehende stadt-unfallhotspots.json nutzt sie aus
// demselben Grund.
const KARTE = 'https://unfallatlas.statistikportal.de/'

const ZUSCHREIBUNG = {
  'opengeodata.nrw.de':
    ' Datengrundlage: Unfallatlas der Statistischen Ämter des Bundes und der Länder, ' +
    'Rohdaten Unfallorte 2021–2025 (Datenlizenz Deutschland Namensnennung 2.0), eigene Auswertung.',
  'unfallatlas.statistikportal.de':
    ' Datengrundlage: Unfallatlas der Statistischen Ämter des Bundes und der Länder, ' +
    'Rohdaten Unfallorte 2021–2025 (Datenlizenz Deutschland Namensnennung 2.0), eigene Auswertung.',
  'bonn.de':
    ' Quelle: Bundesstadt Bonn, „Umgestaltung der Verkehrsführung am Bertha-von-Suttner-Platz", abgerufen am 24.08.2026.',
}

/** Rohdaten-Download -> Kartenanwendung. Die bonn.de-Quelle bleibt, wie sie ist. */
const LINK_UMLEITUNG = { 'opengeodata.nrw.de': KARTE }

const ziel = {}
let umgestellt = 0, unbekannt = 0
for (const [slug, s] of Object.entries(ist)) {
  const hotspots = (s.unfallHotspots ?? []).map((h) => {
    const url = String(h.quelle).trim().split(/\s+/)[0]
    let host
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { host = null }
    const zus = ZUSCHREIBUNG[host]
    if (!zus) { console.error(`🔴 ${slug}: keine Zuschreibung fuer Host "${host}"`); unbekannt++; return h }
    const linkZiel = LINK_UMLEITUNG[host] ?? url
    // Nicht doppelt anhaengen, falls das Skript zweimal laeuft.
    const schonDrin = h.beschreibung.includes('Datengrundlage:') || h.beschreibung.includes('Quelle: Bundesstadt')
    if (linkZiel !== h.quelle) umgestellt++
    return {
      ...h,
      quelle: linkZiel,
      beschreibung: schonDrin ? h.beschreibung : h.beschreibung + zus,
    }
  })
  ziel[slug] = { ...s, unfallHotspots: hotspots }
}

if (unbekannt > 0) { console.error(`\n🔴 ${unbekannt} Eintrag/Eintraege ohne bekannte Zuschreibung — nichts geschrieben.`); process.exit(1) }

// Schrumpf-Waechter ueber alle Felder
let fehler = 0
for (const [slug, s] of Object.entries(ziel)) {
  const a = ist[slug], b = s
  const z = (o) => [
    (o.stadtbezirke ?? []).length,
    (o.hauptachsen?.autobahnen ?? []).length + (o.hauptachsen?.bundesstrassen ?? []).length + (o.hauptachsen?.knoten ?? []).length,
    (o.unfallHotspots ?? []).length,
    (o.lokaleFaqs ?? []).length,
    o.topografieAnker ? 1 : 0,
  ]
  const va = z(a), vb = z(b)
  for (let i = 0; i < va.length; i++) if (vb[i] < va[i]) { console.error(`🔴 ${slug}: Feld ${i} schrumpft ${va[i]} → ${vb[i]}`); fehler++ }
}
if (fehler > 0) process.exit(1)

writeFileSync(ZIEL, JSON.stringify(ziel, null, 2))
const alle = Object.values(ziel).flatMap((s) => s.unfallHotspots)
console.log(`Geschrieben: ${ZIEL}`)
console.log(`Hotspots: ${alle.length} · Quellen umgestellt: ${umgestellt}`)
console.log(`Quellen MIT Leerzeichen (muss 0 sein): ${alle.filter((h) => /\s/.test(h.quelle)).length}`)
console.log(`Beschreibungen mit Zuschreibung: ${alle.filter((h) => /Datengrundlage:|Quelle: Bundesstadt/.test(h.beschreibung)).length}`)
