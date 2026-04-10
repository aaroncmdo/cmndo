'use server'

import { createClient } from '@/lib/supabase/server'

// KFZ-158 Phase 3: Server Action zum Markieren der Ankunft am Termin.

export async function markArrival(input: {
  termin_id: string
  lat: number
  lng: number
  via: 'gps' | 'manual_swipe'
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'unauthorized' }

  const { error } = await supabase
    .from('gutachter_termine')
    .update({
      ankunft_zeit: new Date().toISOString(),
      gps_lat_ankunft: input.lat,
      gps_lng_ankunft: input.lng,
      ankunft_via: input.via,
    })
    .eq('id', input.termin_id)

  if (error) return { error: error.message }
  return { success: true }
}
