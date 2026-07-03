import { createAdminClient } from '@/lib/supabase/admin'

// Makler-Gesellschaft: Auswahl-Optionen (gaengige Versicherer + Maklerpools) fuer Anlage +
// Verwaltung. Via Admin-Client geladen, weil die Self-Registrierung OEFFENTLICH ist (anon kann
// versicherungen/maklerpools nicht per RLS lesen) — reine Lookup-Listen, kein PII.
export type GesellschaftOption = { id: string; name: string }

export async function getGesellschaftOptions(): Promise<{
  versicherungen: GesellschaftOption[]
  maklerpools: GesellschaftOption[]
}> {
  const admin = createAdminClient()
  const [vRes, pRes] = await Promise.all([
    admin.from('versicherungen').select('id, name').eq('ist_aktiv', true).order('name'),
    admin.from('maklerpools').select('id, name').eq('aktiv', true).order('name'),
  ])
  return {
    versicherungen: (vRes.data ?? []) as GesellschaftOption[],
    maklerpools: (pRes.data ?? []) as GesellschaftOption[],
  }
}
