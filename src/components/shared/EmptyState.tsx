'use client'

// AAR-414 / AAR-769 Phase 3: Zentrale Empty-State-Primitive. Vollständig
// auf Primitives migriert (Card, Stack, Icon, Text, Button) — kein Tailwind
// mehr im Render. Action mit `href` wird per <a>-Wrapper außerhalb des
// Buttons unterstützt, weil <Button>-Primitive keinen Link-Modus hat.
//
// Muss 'use client' sein weil <Button> (auch 'use client') einen onPress-
// Handler-Function erwartet — Server-Components duerfen keine Functions
// als Props an Client-Components durchreichen (Next.js App-Router-Regel).

import type { LucideIcon } from 'lucide-react'
import { Button, Card, Icon, Stack, Text } from '@/components/primitives'
import type { ButtonTone } from '@/components/primitives/Button/Button.types'
import { tokens } from '@/lib/design-tokens'

type ActionVariant = 'primary' | 'secondary' | 'ghost'

const ACTION_TO_TONE: Record<ActionVariant, ButtonTone> = {
  primary: 'navy',
  secondary: 'ghost',
  ghost: 'ghost',
}

export type EmptyStateAction = {
  label: string
  onClick?: () => void
  href?: string
  variant?: ActionVariant
}

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  /** Single Action (Backwards-Compat). Wenn `actions` gesetzt ist, wird `action` ignoriert. */
  action?: EmptyStateAction
  /** 2026-05-07 Design-Review: Mehrere CTAs (z.B. „Kalender prüfen" · „Profil ergänzen" · „Gebiet anpassen"). */
  actions?: EmptyStateAction[]
  variant?: 'default' | 'compact'
  className?: string
}

function renderAction(a: EmptyStateAction) {
  const tone = ACTION_TO_TONE[a.variant ?? 'primary']
  const btn = (
    <Button tone={tone} size="md" onPress={a.onClick ?? (() => {})}>
      {a.label}
    </Button>
  )
  if (a.href) {
    return (
      <a key={a.label} href={a.href} style={{ textDecoration: 'none', display: 'inline-block' }}>
        {btn}
      </a>
    )
  }
  return <div key={a.label}>{btn}</div>
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
  const padding = variant === 'compact' ? 6 : 12
  const iconSize = variant === 'compact' ? 32 : 40

  const actionList = actions ?? (action ? [action] : [])

  const actionsEl = actionList.length > 0 ? (
    <div
      style={{
        marginTop: tokens.spacing[4],
        display: 'flex',
        gap: tokens.spacing[2],
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      {actionList.map(renderAction)}
    </div>
  ) : null

  const inner = (
    <Card p={padding}>
      <Stack gap={2} align="center">
        {icon && (
          <Icon icon={icon} size={iconSize} color="lightBlue" />
        )}
        <Text variant="headingSm" color="navy" align="center">
          {title}
        </Text>
        {description && (
          <Text variant="bodySm" color="ondo" align="center">
            {description}
          </Text>
        )}
        {actionsEl}
      </Stack>
    </Card>
  )

  if (className) {
    return <div className={className}>{inner}</div>
  }
  return inner
}
