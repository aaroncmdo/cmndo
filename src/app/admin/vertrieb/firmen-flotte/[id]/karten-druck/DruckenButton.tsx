'use client'

import { Button } from '@/components/primitives'

export function DruckenButton() {
  return (
    <Button variant="navy" size="sm" onClick={() => window.print()}>
      Drucken
    </Button>
  )
}
