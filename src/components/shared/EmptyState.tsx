// AAR-414 / AAR-769 Phase 3: Zentrale Empty-State-Primitive. Server-Wrapper,
// der das LucideIcon (Function — Server-only) zu einem serialisierbaren
// ReactNode rendert und alles andere an EmptyStateClient delegiert. Buttons
// mit onPress dürfen nicht direkt aus einer Server-Component kommen (sonst
// "Event handlers cannot be passed to Client Component props" zur Laufzeit).

import type { LucideIcon } from 'lucide-react'
import { Icon } from '@/components/primitives'
import EmptyStateClient, { type EmptyStateAction } from './EmptyStateClient'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
  /** Mehrere Actions — wird über action (singular) gemappt wenn beide gesetzt sind. */
  actions?: EmptyStateAction[]
  variant?: 'default' | 'compact'
  className?: string
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  actions,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const iconSize = variant === 'compact' ? 32 : 40
  const iconNode = icon ? <Icon icon={icon} size={iconSize} color="lightBlue" /> : undefined

  const mergedActions: EmptyStateAction[] = actions ?? (action ? [action] : [])

  return (
    <EmptyStateClient
      iconNode={iconNode}
      title={title}
      description={description}
      actions={mergedActions}
      variant={variant}
      className={className}
    />
  )
}
