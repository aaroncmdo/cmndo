// AAR-414 / AAR-769 Phase 3: Zentrale Error-State-Primitive. Vollständig
// auf Primitives migriert. Visuelles Layout wie EmptyState, mit AlertTriangle-
// Icon in Danger-Tone, optionaler Fehlermeldung im Mono-Font und Retry-CTA.

'use client'

import { AlertTriangleIcon, RefreshCcwIcon } from 'lucide-react'
import { Button, Card, Icon, Stack, Text } from '@/components/primitives'
import { tokens } from '@/lib/design-tokens'

export interface ErrorStateProps {
  title?: string
  description?: string
  error?: Error | { message?: string } | null
  retry?: () => void
  retryLabel?: string
  className?: string
}

export default function ErrorState({
  title = 'Etwas ist schiefgelaufen',
  description = 'Die Seite konnte nicht geladen werden.',
  error,
  retry,
  retryLabel = 'Erneut versuchen',
  className = '',
}: ErrorStateProps) {
  const handleRetry = retry ?? (() => {
    if (typeof window !== 'undefined') window.location.reload()
  })

  const inner = (
    <Card p={12}>
      <Stack gap={2} align="center">
        <Icon icon={AlertTriangleIcon} size={40} color="danger" />
        <Text variant="headingSm" color="navy" align="center">
          {title}
        </Text>
        <Text variant="bodySm" color="ondo" align="center">
          {description}
        </Text>
        {error?.message && (
          <p
            style={{
              color: tokens.colors.danger,
              fontSize: 11,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              maxWidth: 480,
              textAlign: 'center',
              marginTop: tokens.spacing[2],
            }}
          >
            {error.message}
          </p>
        )}
        <div style={{ marginTop: tokens.spacing[4] }}>
          <Button
            tone="navy"
            size="md"
            iconLeft={<Icon icon={RefreshCcwIcon} size={16} color="white" />}
            onPress={handleRetry}
          >
            {retryLabel}
          </Button>
        </div>
      </Stack>
    </Card>
  )

  if (className) {
    return <div className={className}>{inner}</div>
  }
  return inner
}
