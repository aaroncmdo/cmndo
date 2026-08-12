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

  const bereinigt: LokalinhaltEntwurf = { ...roh, unfallHotspots: hotspots }

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
  const stadt = stadtName.trim().toLowerCase()
  const textkorpus = [
    ...bereinigt.stadtbezirke.map((b) => b.name),
    ...bereinigt.lokaleFaqs.flatMap((f) => [f.frage, f.antwort]),
    ...bereinigt.unfallHotspots.map((h) => `${h.ort} ${h.beschreibung}`),
    bereinigt.heroAnker ?? '',
    bereinigt.topografieAnker ?? '',
  ]
    .join(' ')
    .toLowerCase()

  if (stadt && !textkorpus.includes(stadt)) {
    gruende.push(`Ortsbezug fehlt — "${stadtName}" kommt im Inhalt nicht vor`)
  }

  return {
    bereinigt,
    substanzScore,
    ok: gruende.length === 0,
    verworfen,
    gruende,
  }
}
