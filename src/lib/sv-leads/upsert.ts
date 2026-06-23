// Kanonische SV-Lead-Quelle: TS-Wrapper um die DB-RPC `sv_lead_upsert` — der EINZIGE
// Schreibweg in sv_leads (Dedup dat_id ODER normalized_name+plz; Coalesce-Enrichment).
// Pflicht (NOT NULL ohne Default in sv_leads): name, adresse, lat, lng.

import { createAdminClient } from '@/lib/supabase/admin'

export type SvLeadPayload = {
  /** Pflicht (NOT NULL). */
  name: string
  /** Pflicht (NOT NULL). */
  adresse: string
  /** Pflicht (NOT NULL). */
  lat: number
  /** Pflicht (NOT NULL). */
  lng: number
  firma?: string | null
  vorname?: string | null
  nachname?: string | null
  plz?: string | null
  ort?: string | null
  telefon?: string | null
  email?: string | null
  /** DAT-Identitaet (Dedup-Key, wenn vorhanden). */
  dat_id?: string | null
  dat_expert_nr?: string | null
  qualifikationen?: string[] | null
  paket_umkreis_km?: number | null
  /** Herkunft (z.B. 'admin', 'admin_bulk', 'dat_sync'). Default 'admin'. */
  quelle?: string | null
  ist_aktiv?: boolean | null
}

/**
 * Idempotenter Upsert eines sv_lead ueber die kanonische DB-RPC.
 * Dedup: `dat_id` wenn gesetzt, sonst (normalized_name, plz). Enrichment-Felder
 * (firma/vorname/nachname/telefon/email/dat_expert_nr/qualifikationen) werden bei einem
 * Update nur ueberschrieben, wenn der neue Wert nicht leer ist (kein Daten-Verlust bei
 * partiellem Sync). Kern-Felder (name/adresse/geo) werden ueberschrieben.
 */
export async function upsertSvLead(
  payload: SvLeadPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!payload.name?.trim() || !payload.adresse?.trim()) {
    return { ok: false, error: 'Name und Adresse sind Pflicht.' }
  }
  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
    return { ok: false, error: 'Standort (lat/lng) ist Pflicht — Adresse konnte nicht geokodiert werden.' }
  }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('sv_lead_upsert', {
    p: payload as unknown as Record<string, unknown>,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data as string }
}
