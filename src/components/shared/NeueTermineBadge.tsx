'use client'

// AAR-724: Portal-spezifische Badges für „Neue Termine / Rückrufe".
// Dünne Wrapper um RealtimeCountBadge mit passender fetchCount-Query.

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import RealtimeCountBadge, { type RealtimeCountBadgeProps } from './RealtimeCountBadge'

type Variant = RealtimeCountBadgeProps['variant']

// Dispatch/Admin-Rückrufe: admin_termine typ='rueckruf' status='offen' + noch
// nicht gesehen. Die Rückrufe-Liste ist rollenneutral pro Team (alle Dispatcher
// sehen alle offenen Rückrufe), daher kein User-Filter — auf der Liste wird
// der Rückruf gemeinsam abgearbeitet, der Seen-Zustand gilt „pro Org". Für
// differenzierten Seen-State pro User bräuchten wir eine m:n-Tabelle.
function useRueckrufeCount() {
  return useCallback(async () => {
    const supabase = createClient()
    const { count } = await supabase
      .from('admin_termine')
      .select('id', { count: 'exact', head: true })
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
      .is('gesehen_am', null)
    return count ?? 0
  }, [])
}

// AAR-724: userId wird aktuell nicht mehr für den Count benötigt (siehe
// Kommentar oben). Prop bleibt für künftige per-User-Filterung, z. B. wenn
// wir eine admin_termine_seen-Tabelle einführen.
export function DispatchNeueRueckrufeBadge({
  userId: _userId,
  variant = 'counter',
  className,
}: {
  userId: string
  variant?: Variant
  className?: string
}) {
  const fetchCount = useRueckrufeCount()
  return (
    <RealtimeCountBadge
      fetchCount={fetchCount}
      realtimeTable="admin_termine"
      variant={variant}
      className={className}
    />
  )
}

export function AdminNeueRueckrufeBadge({
  variant = 'counter',
  className,
}: {
  variant?: Variant
  className?: string
}) {
  const fetchCount = useRueckrufeCount()
  return (
    <RealtimeCountBadge
      fetchCount={fetchCount}
      realtimeTable="admin_termine"
      variant={variant}
      className={className}
    />
  )
}
