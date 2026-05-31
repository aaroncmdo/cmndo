import { getLiveStats } from './live-stats'

// Server-Component: rendert null bei DB-Fehler oder zu kleinem Count
// (siehe live-stats.ts). Sichere Default-Implementierung.
export async function LiveCountPill() {
  const stats = await getLiveStats()
  if (!stats) return null

  return (
    <p
      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30 sm:mt-3 sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-sm"
      aria-label={`Live-Statistik: ${stats.leads30} Anfragen in den letzten ${stats.windowDays} Tagen`}
    >
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Letzte {stats.windowDays} Tage: {stats.leads30.toLocaleString('de-DE')} Anfragen erhalten
    </p>
  )
}
