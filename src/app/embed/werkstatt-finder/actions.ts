'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { buildWerkstattFinderLeadExtra } from '@/lib/werkstatt/embed-finder-core'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { getConsentedGaClientId } from '@/lib/analytics/ga4-conversions'
import { findWerkstaetten, type WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { pruefeEmbedFotos, type EmbedFoto } from '@/lib/werkstatt/bedarf/embed-foto-guard'
import { klassifiziereSchadenbildBase64 } from '@/lib/werkstatt/bedarf/schadenbild-gewerke'
import { qualifiziereWerkstaetten, type Qualifiziert } from '@/lib/werkstatt/bedarf/qualifiziere'
import { getStorageUrl } from '@/lib/storage/url'
import type { Reparaturbedarf, Fit } from '@/lib/werkstatt/bedarf/types'

export type WerkstattFinderLeadPayload = {
  vorname?: string | null
  nachname?: string | null
  email: string
  telefon?: string | null
  werkstattId?: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
  fotos?: EmbedFoto[]
  bedarf?: Reparaturbedarf
}

// Re-export fuer den Client (damit er keine extra imports braucht)
export type { EmbedFoto, Reparaturbedarf, Fit }

/**
 * T3: Transiente Schadenfoto-Klassifizierung fuer den Embed-Funnel.
 * Guarded (Abuse-Guard), fail-safe (kein Throw bei KI-Fehler).
 * Gibt Reparaturbedarf zurueck — kein Storage, kein Persistenz (transient).
 */
export async function klassifiziereSchadenfotoEmbed(images: EmbedFoto[]): Promise<Reparaturbedarf> {
  const guard = pruefeEmbedFotos(images)
  if (!guard.ok) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  const { kategorien, confidence } = await klassifiziereSchadenbildBase64(guard.images)
  if (kategorien.length === 0) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  return { kategorien, quelle: 'schadenbild', confidence }
}

/**
 * T4: Werkstatt-Suche optional mit Bedarfs-Qualifizierung.
 * Ohne bedarf: heutiges Verhalten (kein Regress).
 * Mit bedarf: qualifiziereWerkstaetten → Fit-Chips + hart-Filter.
 */
export async function sucheEchteWerkstaetten(input: {
  lat?: number
  lng?: number
  plz?: string
  bedarf?: Reparaturbedarf
}): Promise<{ werkstaetten: (WerkstattFinderRow & { fit?: Fit })[]; keineSpezialisierte: boolean }> {
  const rows = await findWerkstaetten({ lat: input.lat, lng: input.lng, plz: input.plz, nurEchte: true, limit: 10 })
  if (!input.bedarf) {
    return { werkstaetten: rows, keineSpezialisierte: false }
  }
  const q = qualifiziereWerkstaetten(rows, input.bedarf)
  return { werkstaetten: q.werkstaetten, keineSpezialisierte: q.keineSpezialisierte }
}

/**
 * T4: Standalone-Finder-Suche nach freiem Ort/PLZ-String, optional mit Bedarfs-Qualifizierung.
 * Geocodiert die Eingabe (Mapbox, DE-scoped) und liefert qualifizierte Werkstaetten + Karten-Zentrum.
 * center=null => Ort nicht gefunden.
 */
export async function sucheWerkstaettenNachOrt(
  query: string,
  bedarf?: Reparaturbedarf,
): Promise<{
  werkstaetten: (WerkstattFinderRow & { fit?: Fit })[]
  center: { lat: number; lng: number } | null
  keineSpezialisierte: boolean
}> {
  const geo = await geocodeAdresse(query)
  if (!geo) return { werkstaetten: [], center: null, keineSpezialisierte: false }
  const rows = await findWerkstaetten({ lat: geo.lat, lng: geo.lng, nurEchte: true, limit: 10 })
  if (!bedarf) {
    return { werkstaetten: rows, center: { lat: geo.lat, lng: geo.lng }, keineSpezialisierte: false }
  }
  const q = qualifiziereWerkstaetten(rows, bedarf)
  return {
    werkstaetten: q.werkstaetten,
    center: { lat: geo.lat, lng: geo.lng },
    keineSpezialisierte: q.keineSpezialisierte,
  }
}

/** Hilfsfunktion: Dateiendung aus media_type ableiten. */
function extFromMediaType(mediaType: string): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Oeffentlicher Embed-Finder: legt einen Lead an (Reparateur-Zuweisung nur wenn gewaehlt
 * UND Test-Guard passt, sonst Supply-Gate=ohne Werkstatt) und liefert einen FlowLink-Token,
 * mit dem der Kunde in den bestehenden /flow einsteigt (dieser verzweigt die Strecke).
 *
 * T5: Optional fotos + bedarf → nicht-kritisch bei Conversion persistiert:
 * - Fotos → fall-dokumente Storage unter leads/{leadId}/schadensfoto_{ts}_{rand}.{ext}
 * - URLs → leads.schadensfoto_urls
 * - Bedarf → leads.bedarf_kategorien / bedarf_quelle / bedarf_confidence / bedarf_ermittelt_am
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

  const leadId = result.leadId

  // T5: Foto + Bedarf nicht-kritisch persistieren (vor FlowLink-Return).
  // Ein Fehler hier bricht den Lead-Anlage-Return NICHT.
  try {
    const neueUrls: string[] = []

    // Fotos hochladen (je Foto nicht-fatal).
    if (payload.fotos && payload.fotos.length > 0) {
      for (const foto of payload.fotos) {
        try {
          const buffer = Buffer.from(foto.data, 'base64')
          const ext = extFromMediaType(foto.media_type)
          const rand = Math.random().toString(36).slice(2, 8)
          const path = `leads/${leadId}/schadensfoto_${Date.now()}_${rand}.${ext}`
          const { error: uploadErr } = await admin.storage
            .from('fall-dokumente')
            .upload(path, buffer, { contentType: foto.media_type })
          if (uploadErr) {
            console.error('[werkstatt-finder] Foto-Upload fehlgeschlagen (non-fatal):', uploadErr.message)
            continue
          }
          const url = await getStorageUrl(admin, 'fall-dokumente', path)
          if (url) neueUrls.push(url)
        } catch (err) {
          console.error('[werkstatt-finder] Foto-Upload-Schleife fehlgeschlagen (non-fatal):', err)
        }
      }
    }

    // Leads-Update: schadensfoto_urls + bedarf (kombiniert).
    const updatePayload: Record<string, unknown> = {}
    if (neueUrls.length > 0) {
      updatePayload.schadensfoto_urls = neueUrls
    }
    if (payload.bedarf) {
      updatePayload.bedarf_kategorien = payload.bedarf.kategorien
      updatePayload.bedarf_quelle = payload.bedarf.quelle
      updatePayload.bedarf_confidence = payload.bedarf.confidence
      updatePayload.bedarf_ermittelt_am = new Date().toISOString()
    }
    if (Object.keys(updatePayload).length > 0) {
      await admin.from('leads').update(updatePayload as never).eq('id', leadId)
    }
  } catch (err) {
    console.error('[werkstatt-finder] Foto/Bedarf-Persistenz fehlgeschlagen (non-fatal):', err)
  }

  // Non-kritisch: FlowLink erzeugen. Schlaegt er fehl, ist der Lead trotzdem da (Dispatcher greift).
  try {
    const link = await ensureCanonicalFlowLinkForLead(leadId)
    if (link.ok) return { ok: true, token: link.token }
    return { ok: false, error: link.error }
  } catch (err) {
    console.error('[werkstatt-finder] FlowLink fehlgeschlagen', err)
    return { ok: false, error: 'Flow-Link konnte nicht erstellt werden' }
  }
}
