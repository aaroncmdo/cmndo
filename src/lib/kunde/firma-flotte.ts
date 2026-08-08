// Sub-Projekt 2 (Kunde-Portal 1+): Firmen-Konto + Flotte — Queries + Form-Types.
// personen.firma_id = Konto<->Firma-SSoT; flotten_fahrzeuge = N:M Firma<->Fahrzeug.
// Reads laufen ueber den Admin-Client (personen/firmen sind deny-all fuer Kunden;
// PII-Schutz -> Server-Actions statt Client-RLS). Types hier (NICHT im 'use server'-
// File), damit der Client-Bundle sie importieren darf.

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export type KundeFirma = {
  id: string
  name: string
  rechtsform: string | null
  ustId: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
}

export type FlottenFahrzeug = {
  flottenId: string
  vehicleId: string
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  fin: string | null
  hsn: string | null
  tsn: string | null
  farbe: string | null
  kilometerstand: number | null
  notiz: string | null
}

export type FirmaForm = {
  name: string
  rechtsform?: string
  ustId?: string
  strasse?: string
  plz?: string
  ort?: string
}

export type FahrzeugForm = {
  kennzeichen: string
  hersteller?: string
  modell?: string
  notiz?: string
  fin?: string
  hsn?: string
  tsn?: string
}

/**
 * Lean: hat der Kunde ein Firmen-Konto (personen.firma_id gesetzt)? EIN Query — fuer das
 * Nav-Gating (Flotte ist ein B2B-Feature, laeuft sonst als "Firmen-Konto anlegen"-Formular
 * fuer jeden Privatkunden auf). db = Admin/Service-Role (personen ist deny-all fuer Kunden).
 */
export async function kundeHatFirma(db: AnyDb, userId: string): Promise<boolean> {
  const { data } = await db.from('personen').select('firma_id').eq('user_id', userId).maybeSingle()
  return ((data?.firma_id as string | null) ?? null) != null
}

/** Firma des eingeloggten Kunden (via personen.firma_id). db = Admin/Service-Role. */
export async function getKundeFirma(db: AnyDb, userId: string): Promise<KundeFirma | null> {
  const { data: person } = await db.from('personen').select('firma_id').eq('user_id', userId).maybeSingle()
  const firmaId = (person?.firma_id as string | null) ?? null
  if (!firmaId) return null
  const { data: f } = await db
    .from('firmen')
    .select('id, name, rechtsform, ust_id, adresse_strasse, adresse_plz, adresse_ort')
    .eq('id', firmaId)
    .maybeSingle()
  if (!f) return null
  return {
    id: f.id as string,
    name: (f.name as string | null) ?? '',
    rechtsform: (f.rechtsform as string | null) ?? null,
    ustId: (f.ust_id as string | null) ?? null,
    strasse: (f.adresse_strasse as string | null) ?? null,
    plz: (f.adresse_plz as string | null) ?? null,
    ort: (f.adresse_ort as string | null) ?? null,
  }
}

/** Fahrzeuge der Firmen-Flotte (N:M flotten_fahrzeuge -> vehicles), neueste zuerst. */
export async function getKundeFlotte(db: AnyDb, firmaId: string): Promise<FlottenFahrzeug[]> {
  const { data } = await db
    .from('flotten_fahrzeuge')
    .select(
      'id, notiz, vehicle:vehicle_id(id, kennzeichen_aktuell, hersteller, modell_haupttyp, fin, hsn, tsn, farbe_klartext, aktueller_kilometerstand)',
    )
    .eq('firma_id', firmaId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((row: Record<string, unknown>) => {
    const vRaw = row.vehicle as unknown
    const v = (Array.isArray(vRaw) ? vRaw[0] ?? null : vRaw) as Record<string, unknown> | null
    return {
      flottenId: row.id as string,
      vehicleId: (v?.id as string) ?? '',
      kennzeichen: (v?.kennzeichen_aktuell as string | null) ?? null,
      hersteller: (v?.hersteller as string | null) ?? null,
      modell: (v?.modell_haupttyp as string | null) ?? null,
      fin: (v?.fin as string | null) ?? null,
      hsn: (v?.hsn as string | null) ?? null,
      tsn: (v?.tsn as string | null) ?? null,
      farbe: (v?.farbe_klartext as string | null) ?? null,
      kilometerstand: (v?.aktueller_kilometerstand as number | null) ?? null,
      notiz: (row.notiz as string | null) ?? null,
    }
  })
}
