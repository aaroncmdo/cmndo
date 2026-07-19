import { createClient } from '@/lib/supabase/server'

// Struktur-Sicht der Makler-Empfehlung (Downline/Upline/Override-Stats). Quelle: SECURITY-DEFINER-
// RPC get_makler_empfehlung_uebersicht (auth.uid()-gated, leak-frei). Kein RLS-Rekursions-Risiko.

export type EmpfehlungDownline = {
  makler_id: string
  firma: string
  ansprechpartner_vorname: string
  status: string
  gutachten_count: number
  override_netto_summe: number
  override_pending_netto: number
}

export type EmpfehlungUpline = {
  makler_id: string
  firma: string
  ansprechpartner_vorname: string
}

export type EmpfehlungUebersicht = {
  upline: EmpfehlungUpline | null
  downline: EmpfehlungDownline[]
  totals: {
    downline_count: number
    override_netto_gesamt: number
    override_pending: number
    override_freigegeben: number
  }
}

export async function getMaklerEmpfehlungUebersicht(
  maklerId: string,
): Promise<EmpfehlungUebersicht | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_makler_empfehlung_uebersicht', {
    p_makler_id: maklerId,
  })
  if (error) {
    console.error('[getMaklerEmpfehlungUebersicht]', error.message)
    return null
  }
  return (data as unknown as EmpfehlungUebersicht | null) ?? null
}
