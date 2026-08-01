// Kunde-Fahrzeug-Loader (P6 / K8): alle Fahrzeuge, deren current_owner_id der Kunde ist.
// Owner-scoped (vehicles.current_owner_id = profiles.id) — bewusst NICHT firma-scoped
// (das ist die Flotten-Achse via flotten_fahrzeuge, siehe src/lib/flotte/*).
// Pure loader — kein throw, Query-Fehler -> leere Liste (Pattern wie flotte/fahrzeug-schaeden.ts).

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type KundeFahrzeug = {
  vehicleId: string
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  farbe: string | null
  kilometerstand: number | null
  fin: string | null
}

export async function getKundeFahrzeuge(db: AnyDb, userId: string): Promise<KundeFahrzeug[]> {
  const { data, error } = await db
    .from('vehicles')
    .select('id,kennzeichen_aktuell,hersteller,modell_haupttyp,farbe_klartext,aktueller_kilometerstand,fin')
    .eq('current_owner_id', userId)
    .order('kennzeichen_aktuell', { ascending: true })

  if (error) {
    console.error('[kunde-fahrzeuge] query error:', error.message)
    return []
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    vehicleId: row.id as string,
    kennzeichen: (row.kennzeichen_aktuell as string | null) ?? null,
    hersteller: (row.hersteller as string | null) ?? null,
    modell: (row.modell_haupttyp as string | null) ?? null,
    farbe: (row.farbe_klartext as string | null) ?? null,
    kilometerstand: (row.aktueller_kilometerstand as number | null) ?? null,
    fin: (row.fin as string | null) ?? null,
  }))
}
