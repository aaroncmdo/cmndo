'use client'

// AAR-724 / K1-Konsolidierung: Generischer Counter-Badge mit Realtime-Refresh.
// Rendert nichts wenn der Counter 0 ist. Data-Layer über useRealtimeCount.

import RealtimeCountView from './RealtimeCountView'
import { useRealtimeCount } from '@/lib/realtime/use-realtime-count'

type BadgeStyle = 'dot' | 'counter'

export type RealtimeCountBadgeProps = {
  fetchCount: () => Promise<number>
  realtimeTable: string
  initialCount?: number
  variant?: BadgeStyle
  className?: string
}

export default function RealtimeCountBadge({
  fetchCount,
  realtimeTable,
  initialCount = 0,
  variant = 'counter',
  className = '',
}: RealtimeCountBadgeProps) {
  const { count } = useRealtimeCount({ fetchCount, table: realtimeTable, initialCount })
  return <RealtimeCountView count={count} variant={variant} className={className} />
}
