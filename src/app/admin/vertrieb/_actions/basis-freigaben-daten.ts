'use server'

import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getBasisFreigaben(): Promise<
  | {
      ok: true
      svs: {
        id: string
        paket: string | null
        onboarding_quelle: string | null
        standort_plz: string | null
        standort_adresse: string | null
        created_at: string | null
        profiles: {
          vorname: string | null
          nachname: string | null
          email: string | null
          firma: string | null
        } | null
      }[]
    }
  | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('sachverstaendige')
    .select(
      'id, paket, onboarding_quelle, standort_plz, standort_adresse, created_at, profiles!sachverstaendige_profile_id_fkey(vorname, nachname, email, firma)',
    )
    .eq('paket', 'basic')
    .eq('verifizierung_status', 'ausstehend')
    // Nur noch-nicht-freigeschaltete (Tier-2-Enforcement: freigeschaltete SVs tragen
    // 'ausstehend' = Frist laeuft, gehoeren nicht in die Freigabe-Queue).
    .eq('portal_zugang_freigeschaltet', false)
    .is('geloescht_am', null)
    .order('created_at', { ascending: true })

  if (error) return { ok: false, error: error.message }

  type RawRow = {
    id: string
    paket: string | null
    onboarding_quelle: string | null
    standort_plz: string | null
    standort_adresse: string | null
    created_at: string | null
    profiles: unknown
  }

  const rows = (data ?? []) as unknown as RawRow[]

  const svs = rows.map((sv) => {
    const pRel = sv.profiles
    const p = (Array.isArray(pRel) ? pRel[0] : pRel) as {
      vorname: string | null
      nachname: string | null
      email: string | null
      firma: string | null
    } | null

    return {
      id: sv.id,
      paket: sv.paket,
      onboarding_quelle: sv.onboarding_quelle,
      standort_plz: sv.standort_plz,
      standort_adresse: sv.standort_adresse,
      created_at: sv.created_at,
      profiles: p,
    }
  })

  return { ok: true, svs }
}
