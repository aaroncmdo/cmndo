import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { sindTier2DocsGeprueft, berechneTier2Patch } from '@/lib/sv/tier2-docs'
import { haversineKm } from '@/lib/gps/geofence'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Ab dieser Abweichung zwischen gespeicherten Koordinaten und PLZ-Mittelpunkt gilt der
 * Standort als fehlgeocodet. 25 km stammen aus der Messung vom 20.08.: die Verteilung ist
 * bimodal — korrekte SVs liegen bei 1–4 km, die Ausreisser bei 443 und 563 km. Der
 * Graubereich 5–25 km war auf prod nachweislich LEER, die Schwelle braucht also kein Ermessen.
 */
export const STANDORT_PLAUSIBILITAET_MAX_KM = 25

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
    .select('standort_lat, standort_lng, standort_plz, paket_umkreis_km, isochrone_polygon, verifizierung_status, verifizierung_frist_bis')
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

  // Koordinaten VORHANDEN heisst nicht Koordinaten RICHTIG. Auf prod sass ein aktiver,
  // verifizierter SV laut PLZ in Heiligenthal und laut Koordinaten 563 km entfernt in
  // Niederbayern — die Isochrone wurde aus den falschen Koordinaten gebaut und lag komplett
  // dort, er war in seiner echten Region unsichtbar. Ursache: ein Geocoding ohne Ortsbezug
  // (die Strasse allein wurde aufgeloest). Trennscharfes Merkmal in der Messung: SVs MIT
  // standort_place_id lagen alle bei ~1 km, alle 3 Fehlverortungen hatten keine.
  if (sv.standort_plz) {
    const { data: plzGeo } = await db
      .from('plz_geo')
      .select('lat, lng, ort')
      .eq('plz', sv.standort_plz)
      .maybeSingle()
    // Fail-open: kennt plz_geo die PLZ nicht, wird NICHT geblockt — eine Luecke in der
    // Referenztabelle darf keine Freigabe verhindern.
    if (plzGeo?.lat != null && plzGeo.lng != null) {
      const abweichungKm = haversineKm(
        Number(sv.standort_lat), Number(sv.standort_lng),
        Number(plzGeo.lat), Number(plzGeo.lng),
      )
      if (abweichungKm > STANDORT_PLAUSIBILITAET_MAX_KM) {
        return {
          ok: false,
          error:
            `Freigabe nicht möglich: Die hinterlegten Koordinaten liegen ${Math.round(abweichungKm)} km von der PLZ ${sv.standort_plz}`
            + `${plzGeo.ort ? ` (${plzGeo.ort})` : ''} entfernt — der Standort ist offenbar falsch geocodiert. `
            + 'Bitte die Adresse erneut über die Google-Places-Vorschläge auswählen (nicht frei eintippen), '
            + 'damit Koordinaten und Einsatzgebiet stimmen.',
        }
      }
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

  // Tier-2-Enforcement (Spec 2026-08-08): Freischaltung setzt verifizierung_status
  // NICHT mehr blind auf 'geprueft'. Nur wenn Berufshaftpflicht + Gewerbeanmeldung
  // wirklich geprueft sind → 'geprueft'; sonst 'ausstehend' + 14-Tage-Frist, damit
  // der Reminder-Cron + der FG3-Dispatch-Gate (frist_ueberschritten) greifen. Der
  // fruehere Blind-'geprueft'-Setter war der Bypass, der 9 SVs ohne Docs dispatchbar
  // machte (prod 08.08.). 'geprueft' setzt kuenftig NUR tier2Freigeben nach Doc-Pruefung.
  const tier2Patch = berechneTier2Patch(
    await sindTier2DocsGeprueft(db, svId),
    (sv as { verifizierung_status?: string | null }).verifizierung_status ?? null,
    (sv as { verifizierung_frist_bis?: string | null }).verifizierung_frist_bis ?? null,
    Date.now(),
  )

  // Die Freigabe-Flags atomar setzen (+ ggf. nachberechnete Isochrone + Tier-2-Patch).
  // onboarding_status='abgeschlossen': ohne den Flip blieben freigegebene Basic-SVs
  // ewig auf dem Anlage-Default 'pending' (Aaron-Fund 05.08.). Der Paid-Statusautomat
  // laeuft NICHT ueber diesen Core und bleibt unberuehrt.
  const { error: svErr } = await db
    .from('sachverstaendige')
    .update({
      verifiziert: true,
      verifiziert_am: new Date().toISOString(),
      ist_aktiv: true,
      portal_zugang_freigeschaltet: true,
      onboarding_status: 'abgeschlossen',
      ...tier2Patch,
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
