'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { buildWerkstattFinderLeadExtra } from '@/lib/werkstatt/embed-finder-core'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { getConsentedGaClientId } from '@/lib/analytics/ga4-conversions'
import { findWerkstaetten, type WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { geocodeAdresse } from '@/lib/mapbox/geocode'

export type WerkstattFinderLeadPayload = {
  vorname?: string | null
  nachname?: string | null
  email: string
  telefon?: string | null
  werkstattId?: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
}

/**
 * Oeffentlicher Embed-Finder: legt einen Lead an (Reparateur-Zuweisung nur wenn gewaehlt
 * UND Test-Guard passt, sonst Supply-Gate=ohne Werkstatt) und liefert einen FlowLink-Token,
 * mit dem der Kunde in den bestehenden /flow einsteigt (dieser verzweigt die Strecke).
 */
export async function erstelleWerkstattFinderLead(
  payload: WerkstattFinderLeadPayload,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!payload.email?.trim()) return { ok: false, error: 'E-Mail fehlt' }

  const admin = createAdminClient()

  // Werkstatt-Email fuer den Test-Guard (nur wenn eine Werkstatt gewaehlt wurde).
  let werkstattEmail: string | null = null
  if (payload.werkstattId) {
    const { data: ws } = await admin
      .from('werkstaetten')
      .select('email')
      .eq('id', payload.werkstattId)
      .maybeSingle()
    werkstattEmail = (ws?.email as string | null) ?? null
  }

  const gaClientId = await getConsentedGaClientId()

  const extra = buildWerkstattFinderLeadExtra({
    werkstattId: payload.werkstattId ?? null,
    werkstattEmail,
    kundeEmail: payload.email,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    ort: payload.ort ?? null,
  })
  if (gaClientId) (extra as Record<string, unknown>).ga_client_id = gaClientId

  const result = await createLead(
    admin,
    {
      vorname: payload.vorname ?? null,
      nachname: payload.nachname ?? null,
      email: payload.email,
      telefon: payload.telefon ?? null,
      source_channel: 'werkstatt_finder',
      status: 'neu',
    },
    extra,
  )
  if (!result.ok) return { ok: false, error: result.error }

  // Non-kritisch: FlowLink erzeugen. Schlaegt er fehl, ist der Lead trotzdem da (Dispatcher greift).
  try {
    const link = await ensureCanonicalFlowLinkForLead(result.leadId)
    if (link.ok) return { ok: true, token: link.token }
    return { ok: false, error: link.error }
  } catch (err) {
    console.error('[werkstatt-finder] FlowLink fehlgeschlagen', err)
    return { ok: false, error: 'Flow-Link konnte nicht erstellt werden' }
  }
}

/**
 * Public-Finder-Suche: liest nach Distanz rangierte ECHTE Partner-Werkstaetten
 * (nurEchte=true grenzt Test-/interne Werkstaetten email-basiert aus). findWerkstaetten
 * ist server-only (service-role Admin-Client) — der Client ruft daher diese Action.
 */
export async function sucheEchteWerkstaetten(input: {
  lat?: number
  lng?: number
  plz?: string
}): Promise<WerkstattFinderRow[]> {
  return findWerkstaetten({ ...input, nurEchte: true, limit: 10 })
}

/**
 * Standalone-Finder-Suche nach freiem Ort/PLZ-String: geocodiert die Eingabe
 * (Mapbox, DE-scoped) und liefert die nach Distanz rangierten ECHTEN Partner-
 * Werkstaetten + das neue Karten-Zentrum. Ermoeglicht den Embed-Finder ohne
 * lat/lng-URL-Params (Direkt-Besucher tippen PLZ/Ort). center=null => Ort nicht
 * gefunden, der Client zeigt einen Hinweis.
 */
export async function sucheWerkstaettenNachOrt(
  query: string,
): Promise<{ rows: WerkstattFinderRow[]; center: { lat: number; lng: number } | null }> {
  const geo = await geocodeAdresse(query)
  if (!geo) return { rows: [], center: null }
  const rows = await findWerkstaetten({ lat: geo.lat, lng: geo.lng, nurEchte: true, limit: 10 })
  return { rows, center: { lat: geo.lat, lng: geo.lng } }
}
