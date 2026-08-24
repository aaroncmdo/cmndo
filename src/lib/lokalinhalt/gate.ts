// Qualitaets-Gate fuer generierte hyperlokale Ortsinhalte.
//
// Reine Logik, bewusst ohne DB/Netz — damit sie vollstaendig unit-testbar ist
// und der Admin-Action nichts als Glue bleibt (Muster: scripts/lib/*-scan.mjs).
//
// Aaron-Entscheid 12.08.2026, zwei Teile:
//  1. Unfallschwerpunkte DUERFEN generiert werden — aber NUR mit belegbarer
//     Quell-URL ("Quellenzwang"). Ein Hotspot ohne Quelle wird VERWORFEN, nicht
//     etwa der ganze Entwurf abgelehnt: der Rest kann brauchbar sein.
//  2. Das Substanz-Gate verlangt >= 3 harte, extern verifizierbare Ortsfakten.
//     Die urspruengliche Eigendaten-Pflicht ist gestrichen — gemessen haetten
//     sie nur ~6 von 92 Staedten erfuellt (Spec §4.1).
//
// Warum das Verwerfen und nicht blosses Warnen: Ein erfundener
// "Unfallschwerpunkt" ist eine Tatsachenbehauptung ueber einen realen Ort. Bei
// 92 Staedten waere das 92x Haftungsrisiko, und ein Reviewer kann eine
// plausibel klingende Kreuzung nicht gegen die Realitaet pruefen, ohne die
// Quelle zu haben. Ohne Quelle -> nicht veroeffentlichbar, Punkt.

export type Stadtbezirk = { name: string; ortsteile: string[] }
export type Hauptachsen = { autobahnen: string[]; bundesstrassen: string[]; knoten: string[] }
export type UnfallHotspot = {
  ort: string
  beschreibung: string
  quelle: string
  einzelfall?: boolean
}
export type LokaleFaq = { frage: string; antwort: string }

export type LokalinhaltEntwurf = {
  stadtbezirke: Stadtbezirk[]
  hauptachsen: Hauptachsen
  unfallHotspots: UnfallHotspot[]
  lokaleFaqs: LokaleFaq[]
  heroAnker?: string
  topografieAnker?: string
}

export type GateBefund = {
  /** Bereinigter Entwurf — Hotspots ohne belastbare Quelle sind entfernt. */
  bereinigt: LokalinhaltEntwurf
  /** Anzahl gefuellter Substanz-Kategorien (0-4). */
  substanzScore: number
  /** true, wenn der Entwurf in den Review darf. */
  ok: boolean
  /** Was verworfen wurde — gehoert in den Admin, damit der Verlust sichtbar ist. */
  verworfen: string[]
  /** Warum der Entwurf (nicht) durchgeht. */
  gruende: string[]
}

/** Mindestzahl gefuellter Kategorien, damit ein Entwurf in den Review geht. */
export const MIN_SUBSTANZ_SCORE = 2

/**
 * Wortstaemme, die im Deutschen ZWINGEND einen Umlaut oder ein ß tragen.
 *
 * Bewusst eine Liste und kein Scan auf blosses `ae`/`oe`/`ue`/`ss`: nach kurzem
 * Vokal ist `ss` korrekt (Fluss, Schloss, dass), und `oe`/`ae` stecken in echten
 * Ortsnamen dieser Lane — Soest, Coesfeld, Oer-Erkenschwick, Baesweiler. Ein
 * naiver Scan haette die alle geflaggt.
 */
const ASCII_ERSATZ_STAEMME = [
  'strasse', 'buendel', 'fuer', 'ueber', 'koenn', 'muess', 'groess', 'naechst',
  'waehrend', 'haeufig', 'moeglich', 'zurueck', 'aendern', 'hoehe', 'laeng',
  'staerk', 'ueblich', 'aeusser', 'oeffentl', 'schliess', 'gemaess', 'fuehr',
  'pruef', 'schaeden', 'beschaedig', 'zustaendig', 'unfaelle', 'spaeter',
  'taeglich', 'jaehrl', 'oertlich', 'verzoeger', 'zaehl', 'waehl',
]

const ASCII_ERSATZ_REGEX = new RegExp(`\\p{L}*(?:${ASCII_ERSATZ_STAEMME.join('|')})\\p{L}*`, 'giu')

/**
 * Ab dieser Textlaenge ist deutscher Fliesstext OHNE einen einzigen Umlaut
 * praktisch unmoeglich (ä/ö/ü/ß machen ~1,5 % der Buchstaben aus — auf 800
 * Zeichen waeren ~12 zu erwarten, die Wahrscheinlichkeit fuer null liegt bei
 * ~1e-5). Darunter ist Umlautfreiheit legitim: "Bonn-Nord, A565, B9".
 */
const MIN_ZEICHEN_FUER_UMLAUT_PFLICHT = 800

/**
 * Findet ASCII-Ersatzschreibweisen ("buendelt", "Kaiserstrasse") in einem Text.
 *
 * Frontend-Texte muessen echte Umlaute tragen (AGENTS.md §Sprache) — bei
 * generierten Ortsinhalten ist das nicht selbstverstaendlich: das Modell liefert
 * nicht-deterministisch mal so, mal so (gemessen 19.08., siehe gate.test.ts).
 */
export function findeAsciiUmlautErsatz(text: string): string[] {
  return [...new Set(text.match(ASCII_ERSATZ_REGEX) ?? [])]
}

/**
 * Schablonen: dieselbe Aussage mit eingesetztem DATENWERT.
 *
 * Diese Klasse entkommt jeder Haeufigkeitspruefung. Die Gerichts-FAQ stand auf
 * 96 Staedten in identischer Bauweise — weil zwei Gerichtsnamen variieren, ist
 * jede Antwort ein Unikat und bleibt unter jeder Schwelle. Sie ist trotzdem
 * doppelt: der zentrale Basis-Block der Stadtseite beantwortet beide Fragen
 * bereits, ausfuehrlicher und mit denselben Werten als Variablen.
 *
 * ⚠ Bewusst als ausgeschriebene Muster und NICHT als Negativbeispiele im
 * Generator-Prompt: ein Prompt lehrt durch Beispiel, und ein Negativbeispiel
 * liefert dem Modell genau die Formulierung, die es vermeiden soll.
 */
const BASIS_BLOCK_SCHABLONEN: { name: string; trifft: (frage: string, antwort: string) => boolean }[] = [
  {
    name: 'Gerichtsstand (Basis-Block: faq_gericht)',
    trifft: (frage, antwort) =>
      /welches gericht|gericht ist .{0,40}zust[äa]e?ndig/i.test(frage) &&
      /amtsgericht|landgericht/i.test(antwort),
  },
  {
    name: 'Frist bis vor Ort (Basis-Block: faq_finden)',
    trifft: (frage, antwort) =>
      /wie schnell|wie lange dauert/i.test(frage) && /\d+\s*bis\s*\d+\s*Stunden/i.test(antwort),
  },
]

/**
 * Namensteile, die allein KEIN Ortsbezug sind.
 *
 * "Frankfurt am Main" in Teile zu zerlegen ist noetig (der Fliesstext schreibt
 * "Frankfurt"), macht aber "am", "an" und "der" zu Kandidaten — und die stehen
 * in fast jedem deutschen Satz. Ohne diese Liste bestuende jede beliebige
 * Antwort den Ortsbezug-Test, sobald die Stadt einen Praepositions-Namen traegt.
 * "Bad" und "Sankt" stehen aus demselben Grund hier: sie tragen den Ort nicht.
 */
const NAMENS_FUELLWOERTER = new Set([
  'am', 'an', 'der', 'die', 'das', 'im', 'in', 'bei', 'vor', 'auf', 'zur', 'zum',
  'und', 'ob', 'aus', 'bad', 'sankt', 'st', 'saale', 'westf', 'rheinland',
])

/**
 * Der volle Stadtname plus seine tragenden Bestandteile.
 *
 * Die Stammdaten fuehren "Mülheim an der Ruhr", der Fliesstext schreibt
 * "Mülheim". Eine Pruefung nur auf den vollen Namen blockte einwandfreie
 * Ortsfragen — am echten Bestand gemessen (frankfurt, 23.08.).
 */
function namensVarianten(stadtName: string): string[] {
  const voll = stadtName.trim()
  const teile = voll
    .split(/[\s\-–(),.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !NAMENS_FUELLWOERTER.has(t.toLowerCase()))
  return [...new Set([voll, ...teile])].filter(Boolean)
}

/** Regex-sichere Fassung eines Ortsnamens. */
function alsWortmuster(wert: string, ganzesWort: boolean): RegExp | null {
  const roh = wert.trim()
  if (roh.length < 2) return null
  const escaped = roh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Kein Lookahead beim Ortsnamen: "Dormagens" soll als Bezug zaehlen.
  const ende = ganzesWort ? '(?![\\p{L}\\p{N}])' : ''
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${ende}`, 'iu')
}

/**
 * Traegt eine FAQ echten Ortsbezug — oder ist sie eine austauschbare Rechtsfrage?
 *
 * Das entscheidende Kriterium liegt in der ANTWORT, nicht in der Frage. Genau
 * dort lag der Fehler, der 103 Stadtseiten betraf: der Ortsname wanderte in die
 * Frage ("Darf ich meine Werkstatt in Herne frei waehlen?"), waehrend die
 * Antwort fuer jede Stadt Deutschlands wortgleich blieb. Die Frage sieht dann
 * lokal aus, der Inhalt ist es nie.
 *
 * Als Bezug zaehlt: der Stadtname, ein Bezirk/Ortsteil oder eine Achse aus
 * DIESEM Entwurf. Damit misst sich die FAQ an den Ortsdaten, die daneben
 * stehen — es braucht keine gepflegte Stichwortliste, die veraltet.
 */
export function istOrtsspezifischeFaq(
  faq: { frage?: unknown; antwort?: unknown },
  ort: { stadtName: string; bezirke: string[]; achsen: string[] },
): boolean {
  const frage = typeof faq?.frage === 'string' ? faq.frage : ''
  const antwort = typeof faq?.antwort === 'string' ? faq.antwort : ''
  if (!antwort.trim()) return false

  // Schablonen zuerst: sie tragen den Ortsnamen oft mit und wuerden das
  // Bezug-Kriterium sonst bestehen.
  if (BASIS_BLOCK_SCHABLONEN.some((s) => s.trifft(frage, antwort))) return false

  const kandidaten = [...namensVarianten(ort.stadtName), ...ort.bezirke]
  for (const k of kandidaten) {
    const re = alsWortmuster(k, false)
    if (re?.test(antwort)) return true
  }
  // Achsen als ganzes Wort — "A57" darf nicht in "A570" treffen.
  for (const a of ort.achsen) {
    const re = alsWortmuster(a, true)
    if (re?.test(antwort)) return true
  }
  return false
}

/**
 * Belastbare Quelle = absolute http(s)-URL mit echtem Host.
 *
 * Bewusst streng: relative Pfade, `example.com`, blosse Behoerdennamen ohne Link
 * und localhost sind KEINE Belege. Ein Reviewer muss die Aussage nachschlagen
 * koennen, ohne zu raten.
 */
export function istBelastbareQuelle(quelle: unknown): boolean {
  if (typeof quelle !== 'string') return false
  const roh = quelle.trim()
  if (!roh) return false

  // Die Quelle darf einen Zusatz tragen ("<url> (Polizei Bonn, 30.01.2025)") —
  // wir pruefen das erste Token, das wie eine URL aussieht.
  const kandidat = roh.split(/\s+/)[0]

  let url: URL
  try {
    url = new URL(kandidat)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const host = url.hostname.toLowerCase()
  if (!host.includes('.')) return false
  if (host === 'localhost' || host.endsWith('.local')) return false
  // Platzhalter-Domains, die LLMs gern erfinden, wenn sie keine echte kennen.
  if (/^(www\.)?(example|beispiel|test|placeholder)\.(com|org|net|de)$/.test(host)) return false

  return true
}

/** Normalisiert ein moeglicherweise unvollstaendiges Modell-Ergebnis. */
function alsListe<T>(wert: unknown): T[] {
  return Array.isArray(wert) ? (wert as T[]) : []
}

function textHat(wert: unknown): boolean {
  return typeof wert === 'string' && wert.trim().length > 0
}

/**
 * Prueft und bereinigt einen generierten Ortsinhalt.
 *
 * `stadtName` dient dem Ortsbezug-Check: ein Text, der die Stadt nicht einmal
 * nennt, ist kein hyperlokaler Text — genau das Muster (Template mit
 * ausgetauschtem Namen), das Google als Scaled Content Abuse abwertet.
 */
export function pruefeLokalinhalt(
  entwurf: Partial<LokalinhaltEntwurf> | null | undefined,
  stadtName: string,
): GateBefund {
  const verworfen: string[] = []
  const gruende: string[] = []

  const roh: LokalinhaltEntwurf = {
    stadtbezirke: alsListe<Stadtbezirk>(entwurf?.stadtbezirke).filter((b) => textHat(b?.name)),
    hauptachsen: {
      autobahnen: alsListe<string>(entwurf?.hauptachsen?.autobahnen).filter(textHat),
      bundesstrassen: alsListe<string>(entwurf?.hauptachsen?.bundesstrassen).filter(textHat),
      knoten: alsListe<string>(entwurf?.hauptachsen?.knoten).filter(textHat),
    },
    unfallHotspots: alsListe<UnfallHotspot>(entwurf?.unfallHotspots),
    lokaleFaqs: alsListe<LokaleFaq>(entwurf?.lokaleFaqs).filter(
      (f) => textHat(f?.frage) && textHat(f?.antwort),
    ),
    heroAnker: textHat(entwurf?.heroAnker) ? entwurf!.heroAnker : undefined,
    topografieAnker: textHat(entwurf?.topografieAnker) ? entwurf!.topografieAnker : undefined,
  }

  // --- Quellenzwang: Hotspots ohne belastbaren Beleg fliegen raus ------------
  const hotspots: UnfallHotspot[] = []
  for (const h of roh.unfallHotspots) {
    if (!textHat(h?.ort) || !textHat(h?.beschreibung)) {
      verworfen.push(`Unfallschwerpunkt ohne Ort/Beschreibung verworfen`)
      continue
    }
    if (!istBelastbareQuelle(h?.quelle)) {
      verworfen.push(`Unfallschwerpunkt "${h.ort}" verworfen — keine belastbare Quell-URL`)
      continue
    }
    hotspots.push({
      ort: h.ort.trim(),
      beschreibung: h.beschreibung.trim(),
      quelle: h.quelle.trim(),
      einzelfall: h.einzelfall === true,
    })
  }

  // --- Generische FAQ verwerfen ---------------------------------------------
  // Wie beim Quellenzwang oben: die einzelne Angabe faellt weg, der Entwurf
  // bleibt gueltig. Eine austauschbare Rechtsfrage macht die uebrigen Ortsdaten
  // nicht wertlos — sie gehoert nur nicht in ein Feld fuer STADT-Daten.
  //
  // ⚠ Diese Pruefung fehlte bis 23.08., und der Prompt allein hat sie nicht
  // ersetzt: Er sagt seit jeher „Die lokalen FAQ muessen ORTSSPEZIFISCH sein",
  // gibt daneben aber eine MENGE vor („Ziel: 10-14 Stueck"). Eine konkrete Zahl
  // schlaegt eine weiche Einschraenkung — gibt ein Ort nicht genug her, fuellt
  // das Modell mit Allgemeinem auf. Ergebnis waren 103 Stadtseiten, auf denen
  // dieselbe Antwort bis zu 158-mal stand. Ein Prompt ist eine Bitte, ein Gate
  // ist eine Regel; deshalb steht die Pruefung hier.
  const ortFuerFaq = {
    stadtName,
    bezirke: roh.stadtbezirke.flatMap((b) => [b.name, ...alsListe<string>(b.ortsteile)]),
    achsen: [
      ...roh.hauptachsen.autobahnen,
      ...roh.hauptachsen.bundesstrassen,
      ...roh.hauptachsen.knoten,
    ],
  }
  const ortsFaqs: LokaleFaq[] = []
  for (const f of roh.lokaleFaqs) {
    if (istOrtsspezifischeFaq(f, ortFuerFaq)) {
      ortsFaqs.push(f)
      continue
    }
    verworfen.push(
      `FAQ "${String(f?.frage ?? '').slice(0, 60)}" verworfen — ohne Ortsbezug in der ANTWORT ` +
        `(oder Schablone, die der zentrale Basis-Block bereits beantwortet)`,
    )
  }

  const bereinigt: LokalinhaltEntwurf = {
    ...roh,
    unfallHotspots: hotspots,
    lokaleFaqs: ortsFaqs,
  }

  // --- Substanz-Score: gefuellte Kategorien ---------------------------------
  const hatBezirke = bereinigt.stadtbezirke.length > 0
  const hatAchsen =
    bereinigt.hauptachsen.autobahnen.length > 0 || bereinigt.hauptachsen.bundesstrassen.length > 0
  const hatHotspots = bereinigt.unfallHotspots.length > 0
  const hatFaqs = bereinigt.lokaleFaqs.length > 0

  const substanzScore = [hatBezirke, hatAchsen, hatHotspots, hatFaqs].filter(Boolean).length

  if (substanzScore < MIN_SUBSTANZ_SCORE) {
    gruende.push(
      `Substanz-Score ${substanzScore} < ${MIN_SUBSTANZ_SCORE} — zu wenige gefuellte Kategorien`,
    )
  }

  // --- Ortsbezug -------------------------------------------------------------
  // ⚠ Gegen die NAMENSVARIANTEN, nicht nur den vollen Namen. Die Stammdaten
  // fuehren "Stolberg (Rheinland)" und "Frankfurt am Main", jeder Fliesstext
  // schreibt "Stolberg" bzw. "Frankfurt" — ein Vergleich auf den vollen Namen
  // lehnt einwandfreie Entwuerfe ab. Am 23.08. an einer echten Charge
  // aufgeschlagen, NACHDEM ich dieselbe Klasse eine Funktion weiter oben schon
  // gefixt hatte: derselbe Fehler an zwei Stellen, eine davon uebersehen.
  const varianten = namensVarianten(stadtName).map((v) => v.toLowerCase())
  const textkorpus = [
    ...bereinigt.stadtbezirke.map((b) => b.name),
    ...bereinigt.lokaleFaqs.flatMap((f) => [f.frage, f.antwort]),
    ...bereinigt.unfallHotspots.map((h) => `${h.ort} ${h.beschreibung}`),
    bereinigt.heroAnker ?? '',
    bereinigt.topografieAnker ?? '',
  ]
    .join(' ')
    .toLowerCase()

  if (varianten.length > 0 && !varianten.some((v) => textkorpus.includes(v))) {
    gruende.push(`Ortsbezug fehlt — "${stadtName}" kommt im Inhalt nicht vor`)
  }

  // --- Umlaut-Pflicht --------------------------------------------------------
  // Eigener Korpus, weil hier ALLE nutzersichtbaren Werte zaehlen (auch Achsen
  // und Ortsteile) — der Ortsbezug-Korpus oben ist absichtlich enger.
  // WERTE, nicht Schluessel: `bundesstrassen` ist ein Schema-Feldname und steht
  // in jedem Entwurf; ein Scan ueber JSON.stringify() haette am 19.08. alle
  // fuenf erzeugten Staedte geflaggt, auch die drei einwandfreien.
  const sichtbar = [
    ...bereinigt.stadtbezirke.flatMap((b) => [b.name, ...(b.ortsteile ?? [])]),
    ...bereinigt.hauptachsen.autobahnen,
    ...bereinigt.hauptachsen.bundesstrassen,
    ...bereinigt.hauptachsen.knoten,
    ...bereinigt.unfallHotspots.flatMap((h) => [h.ort, h.beschreibung]),
    ...bereinigt.lokaleFaqs.flatMap((f) => [f.frage, f.antwort]),
    bereinigt.heroAnker ?? '',
    bereinigt.topografieAnker ?? '',
  ].join(' ')

  const ersatz = findeAsciiUmlautErsatz(sichtbar)
  if (ersatz.length > 0) {
    gruende.push(
      `ASCII-Ersatz statt Umlauten: ${ersatz.slice(0, 6).join(', ')}` +
        (ersatz.length > 6 ? ` (+${ersatz.length - 6} weitere)` : ''),
    )
  } else if (
    sichtbar.length >= MIN_ZEICHEN_FUER_UMLAUT_PFLICHT &&
    !/[äöüßÄÖÜ]/.test(sichtbar)
  ) {
    // Der frankfurt-Fall: die Musterliste greift nicht, weil das Modell auch die
    // Woerter umschrieb — aber 11.836 Zeichen deutscher Text ohne EINEN Umlaut
    // sind der Beweis fuer sich.
    gruende.push(
      `Kein einziger Umlaut auf ${sichtbar.length} Zeichen — Text ist durchgaengig transliteriert`,
    )
  }

  return {
    bereinigt,
    substanzScore,
    ok: gruende.length === 0,
    verworfen,
    gruende,
  }
}
