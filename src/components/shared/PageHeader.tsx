// AAR-727 / AAR-769 Phase 3 Batch 1: Einheitlicher Seiten-Header fuer
// alle Portale. Ersetzt inline `<div><h1>...</h1><p>...</p><Actions/></div>`-
// Pattern das in 8+ Seiten leicht abweichend kopiert war.
//
// Baut auf Primitives (Row, Stack, Text, Icon) — erster Migrations-Schritt
// der Phase 3.

import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'
import { Row, Stack, Text, Icon } from '@/components/primitives'

type Props = {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  /**
   * `md` (default) fuer Sub-Seiten (18px Titel).
   * `lg` fuer oberste Hub-Seiten (24px Titel).
   */
  size?: 'md' | 'lg'
}

export default function PageHeader({
  title,
  description,
  icon: LucideIconRef,
  actions,
  size = 'md',
}: Props) {
  const titleVariant = size === 'lg' ? 'headingLg' : 'headingMd'

  return (
    <Row align="start" justify="between" gap={3}>
      <Stack gap={1}>
        <Row gap={2} align="center">
          {LucideIconRef ? <Icon icon={LucideIconRef} size={20} color="ondo" /> : null}
          <Text variant={titleVariant} color="navy" truncate>
            {title}
          </Text>
        </Row>
        {description ? (
          <Text variant="bodySm" color="ondo">
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? (
        <Row gap={3} align="center">
          {actions}
        </Row>
      ) : null}
    </Row>
  )
}
