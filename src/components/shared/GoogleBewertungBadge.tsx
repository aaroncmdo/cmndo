// CMM-31: Gecachte Google-Bewertung eines SV-Profils.
// Liest aus google_bewertungen_cache — kein Live-API-Aufruf.
import { StarIcon } from 'lucide-react'

type Props = {
  durchschnitt: number | null
  anzahl: number | null
  zuletztAktualisiert?: string | null
  size?: 'sm' | 'md'
}

export default function GoogleBewertungBadge({
  durchschnitt,
  anzahl,
  zuletztAktualisiert,
  size = 'md',
}: Props) {
  if (durchschnitt === null || anzahl === null) return null

  const sternText = durchschnitt.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  const aktualisiert = zuletztAktualisiert
    ? new Date(zuletztAktualisiert).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
    : null

  if (size === 'sm') {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"
        title={aktualisiert ? `Zuletzt aktualisiert: ${aktualisiert}` : undefined}
      >
        <StarIcon className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
        {sternText}
        <span className="text-amber-600/70">({anzahl})</span>
      </span>
    )
  }

  return (
    <div
      className="inline-flex items-center gap-2 rounded-ios-xl bg-amber-50 border border-amber-200 px-3 py-2"
      title={aktualisiert ? `Zuletzt aktualisiert: ${aktualisiert}` : undefined}
    >
      <StarIcon className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-amber-800">{sternText}</span>
        <span className="text-xs text-amber-600">({anzahl.toLocaleString('de-DE')} Bewertungen)</span>
      </div>
      {aktualisiert && (
        <span className="text-[10px] text-amber-500/70 ml-1">· {aktualisiert}</span>
      )}
    </div>
  )
}
