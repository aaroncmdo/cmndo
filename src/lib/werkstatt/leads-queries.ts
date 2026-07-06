import 'server-only'

// Werkstatt-Portal: eigene OFFENE (nicht konvertierte) Inbound-Leads via
// v_werkstatt_lead (DEFINER-View, RLS-Gate werkstatt_id=auth.uid()-Werkstatt).
// Getrennt von queries.ts (Auftraege = Claims), damit die heisse queries.ts
// nicht angefasst wird.

import { createClient } from '@/lib/supabase/server'

export type WerkstattLead = {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kennzeichen: string | null
  fin: string | null
  erstzulassung: string | null
  schadentyp: string | null
  schadens_hergang: string | null
  unfalldatum: string | null
  unfallort: string | null
  kostenvoranschlag_netto: number | null
  kostenvoranschlag_brutto: number | null
  status: string | null
  created_at: string | null
}

const SELECT =
  'id, vorname, nachname, telefon, email, fahrzeug_hersteller, fahrzeug_modell, kennzeichen, fin, erstzulassung, schadentyp, schadens_hergang, unfalldatum, unfallort, kostenvoranschlag_netto, kostenvoranschlag_brutto, status, created_at'

/** Offene (nicht konvertierte) Inbound-Leads der Werkstatt (RLS-Gate in der View). */
export async function getWerkstattLeads(): Promise<WerkstattLead[]> {
  const supabase = await createClient()
  // v_werkstatt_lead ist frisch -> noch nicht in den generierten Types (Type-Lag,
  // AGENTS §Regel-2 Schritt 6). Cast wie bei anderen frischen View-Readern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('v_werkstatt_lead')
    .select(SELECT)
    .order('created_at', { ascending: false, nullsFirst: false })
  if (error) {
    console.error('[werkstatt] getWerkstattLeads:', error.message)
    return []
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    vorname: (r.vorname as string | null) ?? null,
    nachname: (r.nachname as string | null) ?? null,
    telefon: (r.telefon as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    fahrzeug_hersteller: (r.fahrzeug_hersteller as string | null) ?? null,
    fahrzeug_modell: (r.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (r.kennzeichen as string | null) ?? null,
    fin: (r.fin as string | null) ?? null,
    erstzulassung: (r.erstzulassung as string | null) ?? null,
    schadentyp: (r.schadentyp as string | null) ?? null,
    schadens_hergang: (r.schadens_hergang as string | null) ?? null,
    unfalldatum: (r.unfalldatum as string | null) ?? null,
    unfallort: (r.unfallort as string | null) ?? null,
    kostenvoranschlag_netto: r.kostenvoranschlag_netto != null ? Number(r.kostenvoranschlag_netto) : null,
    kostenvoranschlag_brutto: r.kostenvoranschlag_brutto != null ? Number(r.kostenvoranschlag_brutto) : null,
    status: (r.status as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
  }))
}
