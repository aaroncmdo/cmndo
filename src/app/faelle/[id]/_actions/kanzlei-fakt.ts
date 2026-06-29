'use server'

// KB/Admin-Eingabe eines Kanzlei-Fakts -> Fakt schreiben + Phase ableiten (applyKanzleiFakt).
// Aaron 29.06.: KB UND Admin tragen die fuer die naechste Phase fehlenden Daten im Claim ein.
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyKanzleiFakt } from '@/lib/kanzlei/apply-fakt'
import type { KanzleiFaktKey, KanzleiFaktWert } from '@/lib/kanzlei/fakt-mapping'
import { revalidatePath } from 'next/cache'

export async function saveKanzleiFakt(
  fallId: string,
  faktKey: KanzleiFaktKey,
  wert: KanzleiFaktWert,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (!['admin', 'kundenbetreuer'].includes(profile?.rolle ?? '')) {
    return { ok: false, error: 'Nur Admin und KB dürfen Kanzlei-Fakten eintragen' }
  }

  // Schreiben via service-role (Kanzlei-Fakten umgehen RLS bewusst — Staff-gegated oben).
  const admin = createAdminClient()
  const res = await applyKanzleiFakt(
    admin,
    fallId,
    faktKey,
    { ...wert, datum: wert.datum ?? new Date().toISOString() },
    user.id,
  )
  if (!res.ok) return res

  revalidatePath(`/faelle/${fallId}`)
  return { ok: true }
}
