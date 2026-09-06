'use client'

// 2026-05-07 EmptyState-Iter-2: Schmaler Client-Wrapper, weil
// kalender/page.tsx eine Server-Component ist und Function-Components
// (LucideIcon) nicht über die RSC-Boundary an die `'use client'`-EmptyState
// gereicht werden können. Wrapper kapselt den Icon-Import client-side.

import { CalendarPlusIcon } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'

export default function KalenderListeEmpty() {
  return (
    <EmptyState
      icon={CalendarPlusIcon}
      title="Noch keine Termine"
      description="Termine entstehen automatisch, wenn ein Kunde über den FlowLink einen Vorschlag bestätigt oder Sie selbst einen Vorschlag machen. In Heute sehen Sie Ihre Tagesplanung mit Tagesroute."
      actions={[
        { label: 'Aufträge ansehen', href: '/gutachter/auftraege', variant: 'primary' },
        { label: 'Heute öffnen', href: '/gutachter/heute', variant: 'secondary' },
      ]}
    />
  )
}
