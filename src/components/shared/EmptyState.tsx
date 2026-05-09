// Server-Component-Wrapper für EmptyState.
//
// Warum diese Aufteilung:
//   - Viele Aufrufer sind Server-Components und übergeben `icon` als LucideIcon-
//     Function. Function-Props sind NICHT serialisierbar über die Server/Client-
//     Grenze (Next.js App-Router-Fehler "Functions cannot be passed to Client
//     Components").
//   - Lösung: LucideIcon hier auf dem Server zu JSX rendern (ReactNode ist
//     serialisierbar) und als `iconNode` an EmptyStateClient durchreichen.
//
// Alle bestehenden Aufrufer können unverändert bleiben (`icon={FolderOpenIcon}`).

import type { LucideIcon } from 'lucide-react'
import { tokens } from '@/lib/design-tokens'
import EmptyStateClient from './EmptyStateClient'

export type EmptyStateAction = {
  label: string
  onClick?: () => void
  href?: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** Single Action (Backwards-Compat). Wenn `actions` gesetzt ist, wird `action` ignoriert. */
  action?: EmptyStateAction
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
  const iconNode = IconComp ? (
    <IconComp size={iconSize} color={tokens.colors.lightBlue} />
  ) : undefined

  const actionList = actions ?? (action ? [action] : [])

  return (
    <EmptyStateClient
      iconNode={iconNode}
      title={title}
      description={description}
      actions={actionList}
      variant={variant}
      className={className}
    />
  )
}
