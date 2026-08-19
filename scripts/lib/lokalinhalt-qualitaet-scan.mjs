// Qualitaets-Mass fuer generierte Ortsinhalte (stadt_lokalinhalte).
//
// Reine Logik, ohne DB/Netz — der CLI-Teil liegt in scripts/lokalinhalt-qualitaet.mts.
//
// WOFUER: Der Cron erzeugt taeglich Staedte. Am 19.08. waren fuenf da und die
// Stichprobe sah gut aus (max. 0,4 % Ueberlappung). Das sagt wenig ueber 170 —
// je mehr Staedte, desto wahrscheinlicher wiederholt sich das Modell. Ohne
// Messung faellt das niemandem auf: jede Seite fuer sich liest sich gut, erst
// der PAARWEISE Vergleich zeigt den Baukasten.
//
// ⚠ Bewusst KEIN eigenes Umlaut-Mass hier. Das gehoert dem Gate
// (src/lib/lokalinhalt/gate.ts) — zwei Fassungen derselben Regel driften
// auseinander, und dann sagt das Messwerkzeug etwas anderes als die Pipeline.

/** Nutzersichtbare WERTE einer DB-Zeile als ein Text. */
export function textAusZeile(zeile) {
  if (!zeile || typeof zeile !== 'object') return ''
  const liste = (x) => (Array.isArray(x) ? x : [])
  const teile = [
    ...liste(zeile.stadtbezirke).flatMap((b) => [b?.name, ...liste(b?.ortsteile)]),
    ...liste(zeile.hauptachsen?.autobahnen),
    ...liste(zeile.hauptachsen?.bundesstrassen),
    ...liste(zeile.hauptachsen?.knoten),
    ...liste(zeile.unfall_hotspots).flatMap((h) => [h?.ort, h?.beschreibung]),
    ...liste(zeile.lokale_faqs).flatMap((f) => [f?.frage, f?.antwort]),
    zeile.hero_anker,
    zeile.topografie_anker,
  ]
  return teile.filter((t) => typeof t === 'string' && t.trim()).join(' ')
}

/**
 * 4-Gramme eines Textes, OHNE den Ortsnamen.
 *
 * Der Ortsname muss raus: zwei Baukasten-Texte, die sich nur in ihm
 * unterscheiden, sind genau der Scaled-Content-Fall, den wir finden wollen —
 * mit Ortsnamen im Vergleich saehen sie faelschlich verschieden aus.
 */
export function viergramme(text, ortsname) {
  // Der Ortsname kann aus mehreren Teilen bestehen ("bergisch-gladbach",
  // "Frankfurt am Main") — jeder Teil einzeln raus.
  //
  // ⚠ MIT WORTGRENZEN. Eine erste Fassung ersetzte den blossen Teilstring:
  // bei "Essen" verschwand das "essen" aus "Interessen", bei kurzen Namen
  // ("Hof", "Ulm", "Aue") zerfiel der Text vollends — und die Ueberlappung
  // sank auf 0, also genau in die harmlos aussehende Richtung.
  let bereinigt = String(text)
  for (const teil of String(ortsname ?? '').split(/[\s-]+/).filter((t) => t.length >= 2)) {
    const wort = teil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    bereinigt = bereinigt.replace(new RegExp(`(?<![\\p{L}\\p{N}])${wort}(?![\\p{L}\\p{N}])`, 'giu'), ' ')
  }
  const woerter = bereinigt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const gramme = new Set()
  for (let i = 0; i + 4 <= woerter.length; i++) gramme.add(woerter.slice(i, i + 4).join(' '))
  return gramme
}

/** Jaccard-Ueberlappung zweier Gramm-Mengen in Prozent. */
export function ueberlappung(a, b) {
  if (!a?.size || !b?.size) return 0
  let schnitt = 0
  for (const g of a) if (b.has(g)) schnitt++
  const vereinigung = a.size + b.size - schnitt
  return vereinigung ? (100 * schnitt) / vereinigung : 0
}

/**
 * Alle Paare vergleichen. `staedte` = [{ slug, gramme }].
 * `grenze` in Prozent (Spec: <40 % gegen Near-Duplicate).
 */
export function paarBefunde(staedte, grenze) {
  let max = 0
  let schlimmstes = ''
  const ueberGrenze = []
  let summe = 0
  let paare = 0
  for (let i = 0; i < staedte.length; i++) {
    for (let j = i + 1; j < staedte.length; j++) {
      const wert = ueberlappung(staedte[i].gramme, staedte[j].gramme)
      summe += wert
      paare++
      if (wert > max) {
        max = wert
        schlimmstes = `${staedte[i].slug} ↔ ${staedte[j].slug}`
      }
      if (wert >= grenze) ueberGrenze.push({ a: staedte[i].slug, b: staedte[j].slug, wert })
    }
  }
  ueberGrenze.sort((x, y) => y.wert - x.wert)
  return { max, schlimmstes, ueberGrenze, schnitt: paare ? summe / paare : 0, paare }
}

/** Wie oft ist eine Substanz-Kategorie leer? */
export function substanzVerteilung(zeilen) {
  const laenge = (x) => (Array.isArray(x) ? x.length : 0)
  const ohne = { bezirke: 0, hotspots: 0, faqs: 0, knoten: 0 }
  const woerter = []
  for (const z of zeilen) {
    if (laenge(z?.stadtbezirke) === 0) ohne.bezirke++
    if (laenge(z?.unfall_hotspots) === 0) ohne.hotspots++
    if (laenge(z?.lokale_faqs) === 0) ohne.faqs++
    if (laenge(z?.hauptachsen?.knoten) === 0) ohne.knoten++
    woerter.push(textAusZeile(z).split(/\s+/).filter(Boolean).length)
  }
  woerter.sort((a, b) => a - b)
  return {
    staedte: zeilen.length,
    ohne,
    woerter: {
      min: woerter[0] ?? 0,
      median: woerter[Math.floor(woerter.length / 2)] ?? 0,
      max: woerter.at(-1) ?? 0,
    },
  }
}
