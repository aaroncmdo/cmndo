// AAR-414 / AAR-769 Phase 3: Zentrale Empty-State-Primitive. Server-Wrapper,
// der das LucideIcon (Function — Server-only) zu einem serialisierbaren
// ReactNode rendert und alles andere an EmptyStateClient delegiert. Buttons
// mit onPress dürfen nicht direkt aus einer Server-Component kommen (sonst
// "Event handlers cannot be passed to Client Component props" zur Laufzeit).

import type { LucideIcon } from 'lucide-react'
import { tokens } from '@/lib/design-tokens'
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
  icon: IconComp,
  title,
  description,
  action,
  actions,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const iconSize = variant === 'compact' ? 32 : 40
  // 2026-05-14: LucideIcon direkt im Server-Wrapper aufrufen statt durch den
  // Client-Side `<Icon>`-Primitive zu reichen — sonst geht die Function-Reference
  // als prop an die Client-Boundary und Next.js wirft "Functions cannot be
  // passed directly to Client Components" auf /kunde/faelle (CMM-14).
  const iconNode = IconComp ? (
    <IconComp size={iconSize} color={tokens.colors.lightBlue} />
  ) : undefined

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
