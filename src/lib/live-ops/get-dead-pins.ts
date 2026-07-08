import { createAdminClient } from '@/lib/supabase/admin'
import type { DeadPin, LiveOpsScope } from './types'

type SvLeadRow = {
  id: string
  name: string
  firma: string | null
  warteliste_status: string
  lat: number
  lng: number
  ort: string | null
  plz: string | null
  quelle: string
}

/**
 * Dead-Pins: sv_leads mit Koordinaten, aktiv (ist_aktiv=true), noch nicht konvertiert.
 * KB sieht keine Dead-Pins (Rueckgabe leeres Array).
 */
export async function getDeadPins(scope: LiveOpsScope): Promise<DeadPin[]> {
  if (scope.role === 'kundenbetreuer') return []

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('sv_leads')
    .select('id, name, firma, warteliste_status, lat, lng, ort, plz, quelle')
    .eq('ist_aktiv', true)
    .is('konvertiert_zu_sv_id', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('erstellt_am', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[getDeadPins] sv_leads query failed', error)
    return []
  }

  return ((data ?? []) as unknown as SvLeadRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    firma: row.firma ?? '',
    status: row.warteliste_status,
    lat: row.lat,
    lng: row.lng,
    region: row.ort ?? row.plz ?? '',
    quelle: row.quelle,
  }))
}
