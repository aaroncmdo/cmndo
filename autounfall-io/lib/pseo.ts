import {
  PSEO_CITIES,
  PSEO_TYPES,
  PSEO_CITY_SLUGS,
  PSEO_TYPE_SLUGS,
  type PseoCity,
  type PseoType,
} from '@/content/pseo-data.generated'

// Loader fuer die PSEO-Stadtseiten (WP-5). Re-exportiert die generierten Maps/
// Typen, damit Consumer nur '@/lib/pseo' brauchen. typ_count + Ranking-Flag
// werden zur Render-Zeit berechnet (im Quell-HTML 100/100 verifiziert, siehe
// scripts/port-pseo.py).
export * from '@/content/pseo-data.generated'

/**
 * Stand der pSEO-Vorlage (ISO, YYYY-MM-DD) — speist `datePublished`/`dateModified`
 * im Article-Schema der ~100 Stadt-x-Typ-Seiten.
 *
 * WARUM: `pseoGraph()` erzeugt einen `Article`-Node, und die Route deklariert
 * `openGraph: { type: 'article' }` — ohne Datum ist das ein Artikel ohne
 * Erscheinungsdatum. `articleGraph()` und `restGraph()` in derselben Datei setzen
 * beide Felder laengst; nur dieser Pfad hatte sie nie. Aktualitaet ist ein
 * dokumentierter Zitations-Faktor fuer KI-Antwortmaschinen (GEO-Baseline
 * 18.08.2026, Befund B2 — auf claimondo.de bereits behoben).
 *
 * Die Seiten sind template-generiert, haben also kein individuelles Datum: Dieser
 * Wert beschreibt den Stand von Vorlage UND Stadtdaten gemeinsam. Startwert ist
 * das git-Datum von `lib/pseo.ts`, `lib/jsonld.ts` und der Route (alle 2026-07-18)
 * — nachweisbar, nicht geschaetzt.
 *
 * ⚠ PFLEGE: Wer die Vorlage oder `content/pseo-data.generated` inhaltlich aendert,
 * bumpt diesen Wert. Bewusst KEIN `new Date()`: ein Datum, das ohne inhaltliche
 * Aenderung mitwandert, ist kein Aktualitaetssignal, sondern Rauschen — und
 * entwertet das Signal fuer die ganze Domain.
 */
export const PSEO_LAST_UPDATED = '2026-07-18'

// Hoechster Anteil ueber alle Typen → Intro-Wording „haeufigste" vs „eine der haeufigsten".
const MAX_PCT = Math.max(...Object.values(PSEO_TYPES).map((t) => t.pct))

const toInt = (s: string) => Number(s.replace(/[^\d]/g, ''))

export type PseoPage = {
  city: PseoCity
  type: PseoType
  /** Math.round(unfaelle * pct/100) — wie im Prototyp. */
  typCount: number
  /** true nur fuer den haeufigsten Typ (auffahrunfall, 24 %). */
  isTopType: boolean
  /** SV-Zahl ohne „ca. "-Prefix (FAQ-Wording). */
  svsNumber: string
}

export function getPseoPage(stadt: string, typ: string): PseoPage | undefined {
  const city = PSEO_CITIES[stadt]
  const type = PSEO_TYPES[typ]
  if (!city || !type) return undefined
  return {
    city,
    type,
    typCount: Math.round((toInt(city.unfaelle) * type.pct) / 100),
    isTopType: type.pct === MAX_PCT,
    svsNumber: city.svs.replace(/^ca\.\s*/, ''),
  }
}

export function getPseoParams(): { stadt: string; typ: string }[] {
  const params: { stadt: string; typ: string }[] = []
  for (const stadt of PSEO_CITY_SLUGS) {
    for (const typ of PSEO_TYPE_SLUGS) params.push({ stadt, typ })
  }
  return params
}

/** de-DE Tausenderpunkt fuer berechnete Integer (typ_count). */
export function deNum(n: number): string {
  return n.toLocaleString('de-DE')
}

// Templatisierte Meta + FAQ — 1:1 aus PSEO-<stadt>-<typ>.html. Geteilt zwischen
// Render (app/kfz-unfall/...) und JSON-LD (pseoGraph), damit visible Content +
// FAQPage-Schema garantiert uebereinstimmen (Google-Richtlinie).
export function pseoMeta(p: PseoPage): { title: string; description: string } {
  return {
    // Der fruehere Zusatz "· Sachverstaendigen finden + Schaden abrechnen" kostete
    // allein 44 Zeichen. Folge (18.08. gemessen): ALLE 100 PSEO-Titel lagen ueber
    // 60 Zeichen, Median 70 — und weil metaTitle() den Marken-Suffix ab 60 Zeichen
    // weglaesst, erschien "autounfall.io" auf KEINER der 100 Seiten im Titel.
    // Ohne den Zusatz: Median 40, alle unter 60, Marke auf allen 100 sichtbar.
    // Der Zusatz war Fuellmaterial, das Google in der Anzeige ohnehin abschnitt;
    // uebrig bleibt das exakte Suchwort. (Aaron-Entscheidung, Variante C aus 4.)
    // Die H1 ist NICHT betroffen — sie baut sich unabhaengig aus type/city.
    title: `${p.type.label} in ${p.city.name}`,
    description: `${p.type.label} in ${p.city.name}: ${p.type.pct}% aller Unfälle, Ø ${p.type.schaden} Schaden. BGH ${p.type.bgh}. Unabhängige Sachverständige in Ihrer Region.`,
  }
}

// WP-5 entschlackt (2026-05-26): von 5 auf 3 FAQ reduziert, um den je Unfalltyp
// ueber alle Staedte identischen Anteil zu senken (Cross-City-Duplicate-Gate).
// Behalten = die stadt-spezifischen Fragen (Schaden/Haeufigkeit/SV-Dichte je Stadt);
// entfernt = Gericht (steht in der Stats-Tabelle) + BGH-Urteil (steht im Rechtsrahmen).
// Single Source fuer sichtbare FAQ UND FAQPage-Schema (pseoGraph) -> bleiben konsistent.
export function pseoFaq(p: PseoPage): { q: string; a: string }[] {
  const { city, type } = p
  return [
    {
      q: `Wer zahlt einen Sachverständigen bei einem ${type.label} in ${city.name}?`,
      a: `Bei Fremdverschulden zahlt der Haftpflichtversicherer des Unfallverursachers nach § 249 BGB. Bei einem Schaden von durchschnittlich ${type.schaden} fällt das BVSK-Honorar mit ca. 12–14 % an (BVSK-Honorartabelle 2024).`,
    },
    {
      q: `Wie häufig sind ${type.label}-Unfälle in ${city.name}?`,
      a: `In ${city.name} ereignen sich jährlich rund ${deNum(p.typCount)} ${type.label}-Fälle (${type.pct}% von ${city.unfaelle} Gesamt-Unfällen, Polizeistatistik 2024).`,
    },
    {
      q: `Wie viele BVSK-Sachverständige gibt es in ${city.name}?`,
      a: `Rund ${p.svsNumber} BVSK-zertifizierte Kfz-Sachverständige sind im Großraum ${city.name} aktiv (BVSK-Verbandsverzeichnis 2024).`,
    },
  ]
}
