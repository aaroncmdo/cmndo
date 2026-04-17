'use server'

// AAR-384: Server-Actions für Kunden-Geotracking im Token-Flow.
// Authentifiziert ausschließlich über kunden_tracking_token (der Kunde
// hat KEINE auth-Session). Jede Action lädt den Termin über den Token,
// verifiziert dass er noch im Zeitfenster ist, und schreibt dann via
// Admin-Client (service_role) auf gutachter_termine + kunde_live_position.

import { createAdminClient } from '@/lib/supabase/admin'
import { calculateEtaMinutes } from '@/lib/eta/calculate-eta'

type ActionResult<T = undefined> = T extends undefined
  ? { success: true } | { success: false; error: string }
  : ({ success: true } & T) | { success: false; error: string }

interface TerminAuth {
  id: string
  fall_id: string
  sv_id: string
  start_zeit: string
  kunden_tracking_token: string
  kunde_tracking_aktiviert: boolean | null
}

async function verifyToken(
  token: string,
  terminId: string,
): Promise<{ ok: true; termin: TerminAuth } | { ok: false; error: string }> {
  if (!token || !terminId) return { ok: false, error: 'Token oder Termin fehlt' }
  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select(
      'id, fall_id, sv_id, start_zeit, kunden_tracking_token, kunde_tracking_aktiviert',
    )
    .eq('id', terminId)
    .eq('kunden_tracking_token', token)
    .single()
  if (!termin) return { ok: false, error: 'Ungültiger Tracking-Link' }

  // Gleiches Zeitfenster wie die Seite (2h vor bis 4h nach Termin)
  const now = Date.now()
  const terminZeit = new Date(termin.start_zeit).getTime()
  const hoursUntil = (terminZeit - now) / (1000 * 60 * 60)
  const hoursAfter = (now - terminZeit) / (1000 * 60 * 60)
  if (hoursUntil > 2 || hoursAfter > 4) {
    return { ok: false, error: 'Link nicht mehr gültig' }
  }
  return { ok: true, termin: termin as TerminAuth }
}

/**
 * Kunde startet seine Anfahrt: setzt kunde_tracking_aktiviert + losgefahren_am.
 */
export async function startKundeTracking(
  token: string,
  terminId: string,
): Promise<ActionResult> {
  const auth = await verifyToken(token, terminId)
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('gutachter_termine')
    .update({
      kunde_tracking_aktiviert: true,
      kunde_losgefahren_am: new Date().toISOString(),
    })
    .eq('id', terminId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Kunde meldet seine aktuelle Position. Upsert auf kunde_live_position
 * (eindeutig per termin_id), optional ETA-Neuberechnung gegen die
 * Termin-Adresse via Google Directions API.
 */
export async function updateKundePosition(
  token: string,
  terminId: string,
  position: {
    lat: number
    lng: number
    accuracy_m?: number | null
    speed_kmh?: number | null
  },
  options?: { recalculateEta?: boolean },
): Promise<ActionResult<{ etaMinutes: number | null }>> {
  const auth = await verifyToken(token, terminId)
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()

  // Fall-Adresse für ETA-Berechnung laden
  let etaMinutes: number | null = null
  if (options?.recalculateEta) {
    const { data: fall } = await db
      .from('faelle')
      .select(
        'schadens_adresse, schadens_plz, schadens_ort, besichtigungsort_adresse',
      )
      .eq('id', auth.termin.fall_id)
      .single()
    const adresse =
      fall?.besichtigungsort_adresse ??
      [fall?.schadens_adresse, fall?.schadens_plz, fall?.schadens_ort]
        .filter(Boolean)
        .join(', ')
    if (adresse) {
      etaMinutes = await calculateEtaMinutes(
        { lat: position.lat, lng: position.lng },
        adresse,
      )
    }
  }

  const { error: upsertErr } = await db
    .from('kunde_live_position')
    .upsert(
      {
        termin_id: terminId,
        kunde_id: null,
        lat: position.lat,
        lng: position.lng,
        accuracy_m: position.accuracy_m ?? null,
        speed_kmh: position.speed_kmh ?? null,
      },
      { onConflict: 'termin_id' },
    )
  if (upsertErr) return { success: false, error: upsertErr.message }

  if (etaMinutes != null) {
    await db
      .from('gutachter_termine')
      .update({
        kunde_eta_minuten: etaMinutes,
        kunde_eta_letzte_berechnung: new Date().toISOString(),
      })
      .eq('id', terminId)
  }
  return { success: true, etaMinutes }
}

/**
 * Kunde stoppt das Tracking (manuell oder nach Ankunft). Flag zurücksetzen
 * und die Live-Position-Zeile entfernen, damit der SV-Kartenmarker
 * verschwindet.
 */
export async function stopKundeTracking(
  token: string,
  terminId: string,
  opts?: { angekommen?: boolean },
): Promise<ActionResult> {
  const auth = await verifyToken(token, terminId)
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const patch: Record<string, unknown> = { kunde_tracking_aktiviert: false }
  if (opts?.angekommen) patch.kunde_angekommen_am = new Date().toISOString()

  await db.from('gutachter_termine').update(patch).eq('id', terminId)
  await db.from('kunde_live_position').delete().eq('termin_id', terminId)
  return { success: true }
}
