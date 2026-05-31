'use server'

// AAR-940 Phase 2: Token-validierte Self-Service-Strecke /anfrage/[token].
// Anon-Route — kein Login. Token = gutachter_finder_anfragen.self_service_token.
// Promotion Anfrage->Lead beim Klick (service_role, anon schreibt nie in leads).
// Muster: /kunde-termin/[token] (createAdminClient, Token+Expiry-Gate).

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'

// leads_schadentyp_check erlaubt nur diese Werte (sonst CHECK-Violation).
const SCHADENTYP_ALLOWED = new Set([
  'spurwechsel',
  'auffahrunfall',
  'vorfahrtsverletzung',
  'parkplatz',
  'sonstiges',
])

/**
 * Laedt + validiert die Anfrage per self_service_token (+ Expiry). service_role.
 * self_service_token-Spalten sind (noch) nicht in database.types -> Cast.
 */
async function ladeAnfrageByToken(token: string): Promise<{
  admin: ReturnType<typeof createAdminClient> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anfrage: any | null
  error?: string
}> {
  if (!token) return { admin: null, anfrage: null, error: 'Kein Token.' }
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('gutachter_finder_anfragen')
    .select('*')
    .eq('self_service_token', token)
    .maybeSingle()
  if (!data) return { admin, anfrage: null, error: 'Dieser Link ist ungültig.' }
  const exp = data.self_service_token_expires_at as string | null
  if (!exp || new Date(exp).getTime() < Date.now()) {
    return { admin, anfrage: null, error: 'Dieser Link ist abgelaufen.' }
  }
  return { admin, anfrage: data }
}

/** Liest die kundensichtbaren Anfrage-Basics fuer die Landing (Token-Gate). */
export async function getAnfrageByToken(token: string): Promise<{
  data: { vorname: string | null; bereitsKonvertiert: boolean } | null
  error?: string
}> {
  const { anfrage, error } = await ladeAnfrageByToken(token)
  if (!anfrage) return { data: null, error }
  return {
    data: {
      vorname: (anfrage.vorname as string | null) ?? null,
      bereitsKonvertiert: !!anfrage.konvertiert_zu_lead_id,
    },
  }
}

/**
 * Promotion beim FlowLink-Klick: Anfrage -> Lead via service_role. Idempotent
 * (schon promotet -> bestehender Lead). Anfrage bleibt read-only Capture, nur
 * der Marker (konvertiert_zu_lead_id/status) wird gesetzt. KEIN Fall/Account —
 * der entsteht erst in Phase 4 via signSAandCreateFall nach SA.
 */
export async function promoteAnfrageZuLead(
  token: string,
): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  const { admin, anfrage, error } = await ladeAnfrageByToken(token)
  if (!admin || !anfrage) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Idempotenz: schon promotet -> bestehenden Lead zurueck.
  if (anfrage.konvertiert_zu_lead_id) {
    return { ok: true, leadId: anfrage.konvertiert_zu_lead_id as string }
  }

  const vorname = (anfrage.vorname as string | null) ?? ''
  const nachname = (anfrage.nachname as string | null) ?? ''
  const rawSchadentyp = (anfrage.schadentyp as string | null) ?? 'sonstiges'
  const schadentyp = SCHADENTYP_ALLOWED.has(rawSchadentyp) ? rawSchadentyp : 'sonstiges'

  const created = await createLead(
    admin,
    {
      source_channel: 'self_service',
      status: 'quali-offen',
      vorname,
      nachname,
      telefon: (anfrage.telefon as string | null) ?? null,
      email: (anfrage.email as string | null) ?? null,
    },
    {
      schadentyp,
      schadens_hergang:
        (anfrage.schadens_kurzbeschreibung as string | null) ??
        (anfrage.schadenort as string | null) ??
        null,
      fahrzeug_standort_lat: (anfrage.schadenort_lat as number | null) ?? null,
      fahrzeug_standort_lng: (anfrage.schadenort_lng as number | null) ?? null,
      fahrzeug_standort_adresse:
        (anfrage.besichtigungsort_adresse as string | null) ??
        (anfrage.schadenort as string | null) ??
        null,
      fin: (anfrage.fin_vin as string | null) ?? null,
      kennzeichen: (anfrage.kennzeichen as string | null) ?? null,
      hsn: (anfrage.hsn as string | null) ?? null,
      tsn: (anfrage.tsn as string | null) ?? null,
      fahrzeug_hersteller: (anfrage.fahrzeug_hersteller as string | null) ?? null,
      fahrzeug_modell: (anfrage.fahrzeug_modell as string | null) ?? null,
      fahrzeug_baujahr: (anfrage.fahrzeug_baujahr as number | null) ?? null,
      wunschtermin: (anfrage.wunschtermin as string | null) ?? null,
      qualifizierungs_phase: 'erstkontakt',
      ga_client_id: (anfrage.ga_client_id as string | null) ?? null,
    },
  )
  if (!created.ok) return { ok: false, error: created.error }

  // Anfrage-Marker (Anfrage = read-only Capture; nur Verweis + Status).
  const { error: markErr } = await admin
    .from('gutachter_finder_anfragen')
    .update({
      konvertiert_zu_lead_id: created.leadId,
      konvertiert_am: new Date().toISOString(),
      status: 'konvertiert',
    })
    .eq('id', anfrage.id as string)
  if (markErr) {
    // Lead existiert bereits — Marker ist Best-effort, nicht hart fehlschlagen.
    console.error('[promoteAnfrageZuLead] Anfrage-Marker fehlgeschlagen:', markErr)
  }

  return { ok: true, leadId: created.leadId }
}
