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
  variant?: 'default' | 'compact'
  className?: string
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const padding = variant === 'compact' ? 6 : 12
  const iconSize = variant === 'compact' ? 32 : 40

  const actionTone = ACTION_TO_TONE[action?.variant ?? 'primary']

  const actionEl = action ? (
    action.href ? (
      <a
        href={action.href}
        style={{ textDecoration: 'none', display: 'inline-block', marginTop: tokens.spacing[4] }}
      >
        <Button tone={actionTone} size="md" onPress={() => {}}>
          {action.label}
        </Button>
      </a>
    ) : (
      <div style={{ marginTop: tokens.spacing[4] }}>
        <Button tone={actionTone} size="md" onPress={action.onClick ?? (() => {})}>
          {action.label}
        </Button>
      </div>
    )
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
        {actionEl}
      </Stack>
    </Card>
  )

  if (className) {
    return <div className={className}>{inner}</div>
  }
  return inner
}
