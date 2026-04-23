// AAR-414: Zentrale Empty-State-Primitive. Ersetzt hardcodete
// "bg-white rounded-2xl p-12 text-center"-Divs mit einheitlicher Sprache,
// Icon + Titel + Beschreibung + optionaler Action.

import type { LucideIcon } from 'lucide-react'

type ActionVariant = 'primary' | 'secondary' | 'ghost'

const ACTION_CLASSES: Record<ActionVariant, string> = {
  primary:
    'bg-claimondo-navy hover:bg-claimondo-ondo text-white',
  secondary:
    'bg-white hover:bg-[#f8f9fb] text-claimondo-navy border border-claimondo-border',
  ghost:
    'bg-transparent hover:bg-[#f8f9fb] text-claimondo-ondo',
}

const SIZE_CLASSES = {
  default: 'p-12',
  compact: 'p-6',
} as const

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
    variant?: ActionVariant
  }
  variant?: keyof typeof SIZE_CLASSES
  className?: string
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const padding = SIZE_CLASSES[variant]
  const actionVariant = action?.variant ?? 'primary'
  const actionClass = ACTION_CLASSES[actionVariant]

  const actionButton = action && (
    action.href ? (
      <a
        href={action.href}
        className={`inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors mt-4 ${actionClass}`}
      >
        {action.label}
      </a>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        className={`inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors mt-4 ${actionClass}`}
      >
        {action.label}
      </button>
    )
  )

  return (
    <div
      className={`bg-white rounded-2xl ${padding} text-center border border-claimondo-border ${className}`}
    >
      {Icon && (
        <Icon
          className={`${variant === 'compact' ? 'w-8 h-8' : 'w-10 h-10'} text-claimondo-light-blue mx-auto mb-3`}
          strokeWidth={1.5}
        />
      )}
      <p className="text-claimondo-navy font-medium">{title}</p>
      {description && (
        <p className="text-claimondo-ondo/70 text-sm mt-1 max-w-md mx-auto">{description}</p>
      )}
      {actionButton}
    </div>
  )
}
