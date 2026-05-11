'use client'

// Inner-Client-Anteil von EmptyState. Nimmt iconNode als ReactNode statt LucideIcon-
// Function entgegen — ReactNode ist serialisierbar über die Server/Client-Grenze,
// eine Function (LucideIcon) ist es nicht (Next.js App-Router-Regel).

import type { ReactNode } from 'react'
import { Button, Card, Stack, Text } from '@/components/primitives'
import type { ButtonTone } from '@/components/primitives/Button/Button.types'
import { tokens } from '@/lib/design-tokens'
type ActionVariant = 'primary' | 'secondary' | 'ghost'

export type EmptyStateAction = {
  label: string
  onClick?: () => void
  href?: string
  variant?: ActionVariant
}

const ACTION_TO_TONE: Record<ActionVariant, ButtonTone> = {
  primary: 'navy',
  secondary: 'ghost',
  ghost: 'ghost',
}

function renderAction(a: EmptyStateAction) {
  const tone = ACTION_TO_TONE[(a.variant ?? 'primary') as ActionVariant]
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

interface EmptyStateClientProps {
  iconNode?: ReactNode
  title: string
  description?: string
  actions: EmptyStateAction[]
  variant: 'default' | 'compact'
  className: string
}

export default function EmptyStateClient({
  iconNode,
  title,
  description,
  actions,
  variant,
  className,
}: EmptyStateClientProps) {
  const padding = variant === 'compact' ? 6 : 12

  const actionsEl = actions.length > 0 ? (
    <div
      style={{
        marginTop: tokens.spacing[4],
        display: 'flex',
        gap: tokens.spacing[2],
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      {actions.map(renderAction)}
    </div>
  ) : null

  const inner = (
    <Card p={padding}>
      <Stack gap={2} align="center">
        {iconNode}
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
