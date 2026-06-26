'use server'

// Reparaturfreigabe (manuell durch admin/Kundenbetreuer in der Fallakte) — setzt/loescht
// den claims.reparatur_freigegeben_am-Marker, den die Werkstatt in „Meine Vermittlungen" sieht.
// Gate = admin/KB: deckt sich mit dem Fallakte-Button (admin/KB) UND der claims-RLS
// (claims_staff_all_consolidated: is_admin() OR is_kundenbetreuer()-own). Dispatch hat
// keinen Fallakte-/claims-Write-Pfad -> bewusst NICHT im Gate (sonst silent no-op).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const STAFF = ['admin', 'kundenbetreuer']

async function requireStaff(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  return p && STAFF.includes((p as { rolle?: string }).rolle ?? '') ? { id: user.id } : null
}

export async function reparaturFreigeben(claimId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff()
  if (!staff) return { ok: false, error: 'Keine Berechtigung.' }
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('claims')
    .update({ reparatur_freigegeben_am: new Date().toISOString(), reparatur_freigegeben_von: staff.id })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/faelle/${claimId}`)
  return { ok: true }
}

export async function reparaturFreigabeZuruecknehmen(claimId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff()
  if (!staff) return { ok: false, error: 'Keine Berechtigung.' }
  if (!claimId) return { ok: false, error: 'Keine Fall-ID.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('claims')
    .update({ reparatur_freigegeben_am: null, reparatur_freigegeben_von: null })
    .eq('id', claimId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/faelle/${claimId}`)
  return { ok: true }
}
