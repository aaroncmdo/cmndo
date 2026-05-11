// AAR-414: Zentrale Loading-Skeleton-Primitive. Ersetzt hardcodete
// animate-pulse-Divs mit einheitlicher Grau-Pulsieren-Animation in
// 4 Varianten: card | list | table | inline.

type Variant = 'card' | 'list' | 'table' | 'inline' | 'block'

export interface LoadingSkeletonProps {
  variant?: Variant
  count?: number
  rows?: number
  cols?: number
  /** Nur für variant="block" — tailwind height-class, default h-48 */
  height?: string
  className?: string
}

export default function LoadingSkeleton({
  variant = 'card',
  count = 3,
  rows = 5,
  cols = 5,
  height = 'h-48',
  className = '',
}: LoadingSkeletonProps) {
  if (variant === 'inline') {
    return (
      <span
        className={`inline-block h-4 w-24 bg-claimondo-bg rounded animate-pulse align-middle ${className}`}
      />
    )
  }

  if (variant === 'block') {
    return (
      <div
        className={`bg-white border border-claimondo-border rounded-2xl ${height} animate-pulse ${className}`}
      />
    )
  }

  if (variant === 'list') {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-white border border-claimondo-border rounded-xl p-4"
          >
            <div className="w-10 h-10 rounded-full bg-claimondo-bg animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-claimondo-bg rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-claimondo-bg/60 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div
        className={`bg-white rounded-2xl border border-claimondo-border overflow-hidden ${className}`}
      >
        <div className="border-b border-claimondo-border px-4 py-3 flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-4 bg-claimondo-bg rounded animate-pulse flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="border-b border-claimondo-border/50 px-4 py-4 flex gap-4 last:border-b-0"
          >
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-4 bg-claimondo-bg/60 rounded animate-pulse flex-1"
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  // card (default)
  return (
    <div className={`grid gap-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-claimondo-border rounded-2xl p-5 space-y-3"
        >
          <div className="h-5 w-1/3 bg-claimondo-bg rounded animate-pulse" />
          <div className="h-3 w-full bg-claimondo-bg/60 rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-claimondo-bg/60 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}
