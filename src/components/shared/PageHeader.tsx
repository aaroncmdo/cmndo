import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

// AAR-727 Shared: Einheitlicher Seiten-Header für alle Portale.
// Ersetzt inline `<div><h1>...</h1><p>...</p><Actions/></div>`-Pattern,
// das in 8+ Seiten leicht abweichend kopiert war (font-bold vs.
// font-semibold, mt-0.5 vs. mt-1, text-xl vs. text-2xl).

type Props = {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  /**
   * `md` (default) für Sub-Seiten und Portal-Seiten (text-lg mobil, text-xl ab sm).
   * `lg` für oberste Hub-Seiten (text-xl mobil, text-2xl ab sm).
   */
  size?: 'md' | 'lg'
}

export default function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  size = 'md',
}: Props) {
  const titleSize =
    size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'

  return (
    <div className="flex items-start justify-between gap-2 sm:gap-4">
      <div className="min-w-0">
        <h1
          className={`${titleSize} font-semibold text-claimondo-navy flex items-center gap-2`}
        >
          {Icon ? <Icon className="w-5 h-5 text-claimondo-ondo shrink-0" /> : null}
          <span className="truncate">{title}</span>
        </h1>
        {description ? (
          <p className="text-sm text-claimondo-ondo mt-0.5">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-3 shrink-0">{actions}</div>
      ) : null}
    </div>
  )
}
