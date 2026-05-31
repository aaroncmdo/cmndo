import { STAEDTE, getStadtBySlug, type Stadt } from '@/app/kfz-gutachter/staedte'
import { resolveCidStadt } from './cid-staedte'

// Ermittelt die beworbene Stadt aus den URL-Parametern der Ad-URL.
// Priorität:
//   1. ?stadt= / ?city=  — exakter Slug (von Aaron pro Kampagne gesetzt,
//      zuverlässigster Weg).
//   2. ?cid=  — Marketing-Agentur-CID (Google Ads). Mapping → Stadt-Name.
//      Wenn Name auch in STAEDTE existiert, nehmen wir das volle Object
//      (lokale SEO-Anker). Sonst Name-only.
//   3. utm_term / utm_campaign — Substring-Scan gegen die Städte aus
//      staedte.ts (fängt z. B. „kfz gutachter köln" oder „kampagne-koeln").
// Kein Treffer → null → Hero zeigt die generische Headline.

type ParamValue = string | string[] | undefined

/** Minimal-Stadt-Object: Hero + Popover greifen nur auf `.name` zu. */
export type ResolvedStadt = Pick<Stadt, 'name'> & Partial<Stadt>

function first(v: ParamValue): string {
  const raw = Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
  return raw.toLowerCase().trim()
}

function firstRaw(v: ParamValue): string {
  const raw = Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
  return raw.trim()
}

/**
 * Versucht, einen Stadt-Namen wie "Köln" oder "Bergisch Gladbach" auf
 * einen Slug aus STAEDTE zu mappen. Wenn ja, wird das volle Stadt-Object
 * zurückgegeben (bessere lokale SEO-Anker). Sonst null → Name-only.
 */
function tryFullStadtFromName(name: string): Stadt | null {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return getStadtBySlug(slug)
}

export function resolveStadt(
  searchParams: Record<string, ParamValue>,
): ResolvedStadt | null {
  // 1. Dedizierter Param — exakter Slug-Treffer.
  const explicit = first(searchParams.stadt) || first(searchParams.city)
  if (explicit) {
    const direct = getStadtBySlug(explicit)
    if (direct) return direct
  }

  // 2. CID-Param der Marketing-Agentur (Google-Ads).
  const cidStadtName = resolveCidStadt(firstRaw(searchParams.cid))
  if (cidStadtName) {
    const full = tryFullStadtFromName(cidStadtName)
    if (full) return full
    return { name: cidStadtName }
  }

  // 3. Best-effort: Stadt-Name oder -Slug irgendwo in den UTM-Params.
  const haystack = [explicit, first(searchParams.utm_term), first(searchParams.utm_campaign)]
    .filter(Boolean)
    .join(' ')

  if (haystack) {
    for (const s of STAEDTE) {
      if (haystack.includes(s.slug) || haystack.includes(s.name.toLowerCase())) {
        return s
      }
    }
  }

  return null
}
