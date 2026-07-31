import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Freigabe-Kern fuer einen Basic-SV — geteilt zwischen der manuellen Admin-Freigabe
 * (`gibBasicSvFrei`, admin/sachverstaendige/[id]/verifizierung-actions.ts) und der
 * Auto-Freigabe bei Onboarding-Abschluss (`schliesseSvBasicOnboardingAb`,
 * sv-onboarding/finalize.ts — Aaron 29.07.: "alle SVs sollen sich selbst freigeben").
 *
 * Tut drei Dinge:
 *  1. Go-Live-Geo-Guard: ohne standort_lat/lng blocken (der SV waere sonst zwar
 *     "frei", aber map-unsichtbar + nicht dispatchbar). Fehlende Isochrone aus den
 *     Koordinaten nachberechnen; schlaegt das fehl -> blocken.
 *  2. Die 5 Freigabe-Flags atomar setzen (verifizierung_status, verifiziert,
 *     verifiziert_am, ist_aktiv, portal_zugang_freigeschaltet) + ggf. Isochrone.
 *  3. Offenen sv_basic_claim_review-Task schliessen (non-fatal).
 *
 * KEIN Auth-Guard hier — der Caller macht die Auth (Admin bzw. eingeloggter SV).
 * Der Caller uebergibt seinen Admin-Client (Service-Role) und revalidiert selbst.
 */
export async function freigebeBasicSvCore(
  db: AdminClient,
  svId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: sv, error: readErr } = await db
    .from('sachverstaendige')
    .select('standort_lat, standort_lng, paket_umkreis_km, isochrone_polygon')
    .eq('id', svId)
    .maybeSingle()
  if (readErr) return { ok: false, error: `SV konnte nicht geladen werden: ${readErr.message}` }
  if (!sv) return { ok: false, error: 'Sachverständiger nicht gefunden.' }

  if (sv.standort_lat == null || sv.standort_lng == null) {
    return {
      ok: false,
      error:
        'Freigabe nicht möglich: Dem Gutachter fehlen Standort-Koordinaten. Bitte zuerst die Adresse (via Google Places) nachtragen — sonst ist er auf der Karte unsichtbar und nicht buchbar.',
    }
  }

  // Fehlende Isochrone nachberechnen, damit der SV nach der Freigabe wirklich
  // sichtbar + dispatchbar ist. Schlägt die Berechnung fehl -> blocken (nicht
  // stillschweigend "frei ohne Einsatzgebiet").
  const geoPatch: Record<string, unknown> = {}
  if (sv.isochrone_polygon == null) {
    const radiusKm = sv.paket_umkreis_km ?? 25
    try {
      const polygon = await calculateIsochrone(Number(sv.standort_lat), Number(sv.standort_lng), radiusKm)
      if (!polygon.length) throw new Error('leeres Polygon')
      geoPatch.isochrone_polygon = polygon
    } catch (err) {
      console.error('[freigebeBasicSvCore] Isochrone-Nachberechnung fehlgeschlagen:', err)
      return {
        ok: false,
        error:
          'Freigabe nicht möglich: Das Einsatzgebiet (Isochrone) konnte nicht berechnet werden. Bitte später erneut versuchen.',
      }
    }
  }

  // Die 5 Freigabe-Flags atomar setzen (+ ggf. nachberechnete Isochrone).
  const { error: svErr } = await db
    .from('sachverstaendige')
    .update({
      verifizierung_status: 'geprueft',
      verifiziert: true,
      verifiziert_am: new Date().toISOString(),
      ist_aktiv: true,
      portal_zugang_freigeschaltet: true,
      ...geoPatch,
    } as never)
    .eq('id', svId)
  if (svErr) return { ok: false, error: `Freigabe fehlgeschlagen: ${svErr.message}` }

  // Offenen sv_basic_claim_review-Task schliessen (best-effort, non-fatal).
  const nowIso = new Date().toISOString()
  const { error: taskErr } = await db
    .from('tasks')
    .update({
      status: 'erledigt',
      erledigt_am: nowIso,
      auto_resolved_am: nowIso,
      auto_resolved_grund: 'Basic-SV freigegeben',
    } as never)
    .eq('typ', 'sv_basic_claim_review')
    .eq('entity_id', svId)
    .eq('status', 'offen')
  if (taskErr) {
    console.error('[freigebeBasicSvCore] Task-Schliessen fehlgeschlagen:', taskErr.message)
  }

  return { ok: true }
}
