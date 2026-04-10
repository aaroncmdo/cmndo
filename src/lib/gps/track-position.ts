'use server'

import { createClient } from '@/lib/supabase/server'

// KFZ-158 Phase 2: Server Action um GPS-Position in sv_live_position zu speichern.
// Wird vom Frontend alle 30 Sekunden aufgerufen (Throttling im Client).

export async function trackPosition(input: {
  lat: number
  lng: number
  accuracy_m: number
  heading: number | null
  speed_mps: number | null
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' }

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, live_tracking_enabled')
    .eq('profile_id', user.id)
    .single()

  if (!sv) return { error: 'no_sv' }
  if (!sv.live_tracking_enabled) return { error: 'tracking_disabled' }

  const { error } = await supabase.from('sv_live_position').insert({
    gutachter_id: sv.id,
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracy_m,
    heading: input.heading,
    speed_kmh: input.speed_mps != null ? Math.round(input.speed_mps * 3.6 * 10) / 10 : null,
  })

  if (error) return { error: error.message }
  return { success: true }
}
