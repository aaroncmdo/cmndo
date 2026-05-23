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
    title: `${p.type.label} in ${p.city.name} · Sachverständigen finden + Schaden abrechnen`,
    description: `${p.type.label} in ${p.city.name}: ${p.type.pct}% aller Unfälle, Ø ${p.type.schaden} Schaden. BGH ${p.type.bgh}. Unabhängige Sachverständige in Ihrer Region.`,
  }
}

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
      q: `Welches Gericht ist zuständig?`,
      a: `${city.gericht}. Streitwerte bis 5.000 € fallen ans Amtsgericht, darüber ans Landgericht (§ 23 Nr. 1 GVG).`,
    },
    {
      q: `Wie viele BVSK-Sachverständige gibt es in ${city.name}?`,
      a: `Rund ${p.svsNumber} BVSK-zertifizierte Kfz-Sachverständige sind im Großraum ${city.name} aktiv (BVSK-Verbandsverzeichnis 2024).`,
    },
    {
      q: `Welches BGH-Urteil ist bei ${type.label}-Streitigkeiten zentral?`,
      a: `BGH, Az. ${type.bgh} — definiert die Beweis- und Schadensregulierungs-Grundsätze bei ${type.label}-Konstellationen.`,
    },
  ]
}
