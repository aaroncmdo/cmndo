// Fahrzeug-Schaden-Loader: Claims + Draft-Leads fuer ein Fahrzeug, firma-scoped.
// Security: kein RLS (Admin/Service-Role-Client), daher explizites Ownership-Gate
// via flotten_fahrzeuge (firma_id=firmaId AND vehicle_id=vehicleId).
// Pure loader — kein throw, kein Result-Object, kein revalidatePath (read-only).

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type ClaimMini = {
  claimId: string
  claimNummer: string | null
  status: string | null
  schadentag: string | null
  schadensHoeheNetto: number | null
  createdAt: string | null
}

export type DraftMini = {
  leadId: string
  status: string | null
  createdAt: string | null
}

export type FahrzeugSchaeden = {
  claims: ClaimMini[]
  drafts: DraftMini[]
}

/** Lead-Statuses die als "Draft" gelten (noch nicht umgewandelt/disqualifiziert).
 *  Exportiert: der Draft-Lifecycle (schaden-fortsetzung.ts) nutzt dieselbe Menge als
 *  Race-Schutz beim Storno — ein Lead ist genau dann stornierbar, wenn er noch Draft ist. */
export const DRAFT_STATUSES = ['neu', 'rueckruf', 'quali-offen', 'flow-gesendet'] as const

/**
 * Laedt Claims + Draft-Leads fuer ein Fahrzeug — streng firma-scoped.
 * Gibt { claims:[], drafts:[] } zurueck wenn das Fahrzeug nicht zur Firma gehoert
 * (kein Leak fremder Daten). Query-Fehler werden als leere Arrays behandelt (kein throw).
 */
export async function getFahrzeugSchaeden(
  db: AnyDb,
  firmaId: string,
  vehicleId: string,
): Promise<FahrzeugSchaeden> {
  // 1) Ownership gate: Fahrzeug muss zur Firma gehoeren
  const { data: ownerRow } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()

  if (!ownerRow) {
    return { claims: [], drafts: [] }
  }

  return ladeSchaedenFuerFahrzeug(db, vehicleId)
}

/**
 * Ungegateter Kern: Claims + Draft-Leads eines Fahrzeugs. Der Caller MUSS das
 * Ownership-Gate selbst gefahren haben (firma-scoped: getFahrzeugSchaeden;
 * owner-scoped: src/lib/kunde/fahrzeug-schaeden.ts).
 */
export async function ladeSchaedenFuerFahrzeug(db: AnyDb, vehicleId: string): Promise<FahrzeugSchaeden> {
  // 2) Claims — absteigend nach Erstelldatum
  const { data: claimsRaw, error: claimsError } = await db
    .from('claims')
    // T3-slice-2b: claims.status -> operative_status
    .select('id,claim_nummer,operative_status,schadentag,schadens_hoehe_netto,created_at')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })

  if (claimsError) {
    console.error('[fahrzeug-schaeden] claims query error:', claimsError.message)
  }

  const claims: ClaimMini[] = ((claimsError ? [] : (claimsRaw ?? [])) as Array<Record<string, unknown>>).map(
    (row) => ({
      claimId: row.id as string,
      claimNummer: (row.claim_nummer as string | null) ?? null,
      status: (row.operative_status as string | null) ?? null,
      schadentag: (row.schadentag as string | null) ?? null,
      schadensHoeheNetto: (row.schadens_hoehe_netto as number | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    }),
  )

  // 3) Draft-Leads (nur offene Statuses) — absteigend nach Erstelldatum
  const { data: leadsRaw, error: leadsError } = await db
    .from('leads')
    .select('id,status,created_at')
    .eq('vehicle_id', vehicleId)
    .in('status', DRAFT_STATUSES)
    .order('created_at', { ascending: false })

  if (leadsError) {
    console.error('[fahrzeug-schaeden] leads query error:', leadsError.message)
  }

  const drafts: DraftMini[] = ((leadsError ? [] : (leadsRaw ?? [])) as Array<Record<string, unknown>>).map(
    (row) => ({
      leadId: row.id as string,
      status: (row.status as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    }),
  )

  return { claims, drafts }
}
