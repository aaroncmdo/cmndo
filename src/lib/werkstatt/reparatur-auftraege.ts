// Outbound-Werkstatt-Seite: zur Reparatur ZUGEWIESENE Auftraege fuer die eingeloggte Werkstatt.
// Self-scoped via SECURITY-DEFINER-RPC (nur kuratierte Spalten, kein Kunden-Kontakt).
// Eigenes File (NICHT das mit der Finder-Session geteilte queries.ts).

import { createClient } from '@/lib/supabase/server'

export type WerkstattReparaturAuftrag = {
  claim_id: string
  kunde_name: string | null
  fahrzeug: string | null
  kennzeichen: string | null
  ort: string | null
  quelle: string | null
  zugewiesen_am: string | null
}

export async function getWerkstattReparaturAuftraege(): Promise<WerkstattReparaturAuftrag[]> {
  const supabase = await createClient()
  // Funktion (noch) nicht in den generierten Types -> as never; in der DB live (Mig 20260629104957).
  const { data, error } = await supabase.rpc('get_werkstatt_reparatur_auftraege' as never)
  if (error) {
    console.error('[werkstatt] get_werkstatt_reparatur_auftraege:', error.message)
    return []
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    claim_id: r.claim_id as string,
    kunde_name: (r.kunde_name as string | null) ?? null,
    fahrzeug: (r.fahrzeug as string | null) ?? null,
    kennzeichen: (r.kennzeichen as string | null) ?? null,
    ort: (r.ort as string | null) ?? null,
    quelle: (r.quelle as string | null) ?? null,
    zugewiesen_am: (r.zugewiesen_am as string | null) ?? null,
  }))
}
