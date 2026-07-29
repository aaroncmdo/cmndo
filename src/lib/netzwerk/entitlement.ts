import type { SupabaseClient } from '@supabase/supabase-js'

export type AboZeile = { status: string; gueltig_bis: string | null }

/** Reine Ableitung (derive-at-read, K1): comped ODER (aktiv UND nicht abgelaufen). */
export function istAktivesAbo(abo: AboZeile, now: Date = new Date()): boolean {
  if (abo.status === 'comped') return true
  if (abo.status !== 'aktiv') return false
  return abo.gueltig_bis == null ? false : new Date(abo.gueltig_bis) >= now
}

/** Batch (K10): EIN Read; liefert die Teilmenge der svIds mit aktivem/comped Abo. */
export async function ladeZahlendeSvSet(
  admin: SupabaseClient,
  svIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (svIds.length === 0) return new Set()
  const { data, error } = await admin
    .from('sv_netzwerk_abonnements')
    .select('sv_id, status, gueltig_bis')
    .in('sv_id', svIds)
  if (error) {
    console.error('[ladeZahlendeSvSet]', error.message)
    return new Set()
  }
  const out = new Set<string>()
  for (const r of (data ?? []) as Array<{ sv_id: string } & AboZeile>)
    if (istAktivesAbo(r, now)) out.add(r.sv_id)
  return out
}

/** Duenner Wrapper ueber den Batch-Loader (Einzelabfrage). */
export async function istZahlenderNetzwerkPartner(
  admin: SupabaseClient,
  svId: string,
): Promise<boolean> {
  return (await ladeZahlendeSvSet(admin, [svId])).has(svId)
}
