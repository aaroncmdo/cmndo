'use client'

// K1-Konsolidierung: Reiner Render-Teil des Counter-Badge. Kein State,
// kein Realtime — wird von RealtimeCountBadge gefüttert, kann aber auch
// eigenständig genutzt werden wenn der Consumer seine eigene Count-Quelle
// hat (z. B. GutachterShell.loadBadges, wo mehrere Badges gemeinsam
// geladen werden).

type BadgeStyle = 'dot' | 'counter'

export default function RealtimeCountView({
  count,
  variant = 'counter',
  className = '',
}: {
  count: number
  variant?: BadgeStyle
  className?: string
}) {
  if (count <= 0) return null

  if (variant === 'dot') {
    return (
      <span
        aria-label={`${count} neu`}
        className={`inline-block w-2 h-2 rounded-full bg-red-500 ${className}`}
      />
    )
  }

  return (
    <span
      aria-label={`${count} neu`}
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
