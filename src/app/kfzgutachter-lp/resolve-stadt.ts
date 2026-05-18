import { STAEDTE, getStadtBySlug, type Stadt } from '@/app/kfz-gutachter/staedte'

// Ermittelt die beworbene Stadt aus den URL-Parametern der Ad-URL.
// Priorität:
//   1. ?stadt= / ?city=  — exakter Slug (von Aaron pro Kampagne gesetzt,
//      zuverlässigster Weg).
//   2. utm_term / utm_campaign — Substring-Scan gegen die Städte aus
//      staedte.ts (fängt z. B. „kfz gutachter köln" oder „kampagne-koeln").
// Kein Treffer → null → Hero zeigt die generische Headline.

type ParamValue = string | string[] | undefined

function first(v: ParamValue): string {
  const raw = Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
  return raw.toLowerCase().trim()
}

export function resolveStadt(searchParams: Record<string, ParamValue>): Stadt | null {
  // 1. Dedizierter Param — exakter Slug-Treffer.
  const explicit = first(searchParams.stadt) || first(searchParams.city)
  if (explicit) {
    const direct = getStadtBySlug(explicit)
    if (direct) return direct
  }

  // 2. Best-effort: Stadt-Name oder -Slug irgendwo in den UTM-Params.
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
