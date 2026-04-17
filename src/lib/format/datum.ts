// AAR-411: Zentrale Datum-/Zeit-Formatierung für Claimondo.
//
// Ersetzt die vielen Einzel-`toLocaleDateString('de-DE', …)`-Aufrufe im
// Codebase. Alle Funktionen sind null-safe und geben bei ungültigem Input
// einen leeren String zurück (statt "Invalid Date").

const TZ = 'Europe/Berlin'

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/**
 * Formatiert ein ISO-Datum nach deutschem Standard.
 *
 * @param iso    ISO-String oder null
 * @param style  'kurz' (17.04.26) · 'lang' (17. April 2026) · 'relative' (vor 3 Tagen / heute / morgen)
 */
export function formatDatum(
  iso: string | null | undefined,
  style: 'kurz' | 'lang' | 'relative' = 'kurz',
): string {
  const d = toDate(iso)
  if (!d) return ''

  if (style === 'kurz') {
    return d.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TZ,
    })
  }
  if (style === 'lang') {
    return d.toLocaleDateString('de-DE', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    })
  }
  // relative
  const now = new Date()
  const startOfDay = (x: Date) => {
    const c = new Date(x)
    c.setHours(0, 0, 0, 0)
    return c
  }
  const diffDays = Math.round(
    (startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000,
  )
  if (diffDays === 0) return 'heute'
  if (diffDays === 1) return 'morgen'
  if (diffDays === -1) return 'gestern'
  if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} Tagen`
  if (diffDays < -1 && diffDays >= -30) return `vor ${Math.abs(diffDays)} Tagen`
  // Fallback: Kurzformat
  return d.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit', timeZone: TZ,
  })
}

/** Formatiert nur die Uhrzeit: "14:30". */
export function formatUhrzeit(iso: string | null | undefined): string {
  const d = toDate(iso)
  if (!d) return ''
  return d.toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  })
}

/** Formatiert Datum + Uhrzeit: "17.04.2026, 14:30". */
export function formatDatumUhrzeit(iso: string | null | undefined): string {
  const d = toDate(iso)
  if (!d) return ''
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  })
}

/** Formatiert Datum mit Wochentag: "Mo., 17.04.2026". Praktisch für Terminlisten. */
export function formatDatumMitWochentag(iso: string | null | undefined): string {
  const d = toDate(iso)
  if (!d) return ''
  return d.toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ,
  })
}
