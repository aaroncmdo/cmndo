import { createAdminClient } from '@/lib/supabase/admin'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { freischaltungsPatch } from '@/lib/sv/freischaltung'
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
 *  2. Den Freischaltungs-Patch schreiben (portal_zugang_freigeschaltet, ist_aktiv,
 *     verifiziert, verifiziert_am — src/lib/sv/freischaltung.ts, derselbe Patch wie
 *     Stripe/Gutschein/Sub-SV) + onboarding_status + ggf. Isochrone.
 *  3. Offenen sv_basic_claim_review-Task schliessen (non-fatal).
 *
 * Aaron 19.09.2026: „ich moechte nicht mehr verifizieren und ich moechte auch nicht mehr
 * nachhalten muessen, ob die Dokumente fehlen oder nicht … Damit soll er wirklich
 * verifiziert und buchbar sein." — Deshalb setzt die Freigabe `verifiziert` wieder
 * bedingungslos und startet KEINE 14-Tage-Frist mehr (Option B vom 08.08. und der
 * Siegel-Fix vom 31.08. sind zurueckgenommen; beide standen hier bis zum 19.09.).
 * Dokumente laedt der SV im Wizard oder jederzeit unter „Nachweise" hoch — sie sind
 * Zubehoer fuer den Kundenflow, kein Tor.
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
    .select('standort_lat, standort_lng, standort_plz, paket_umkreis_km, isochrone_polygon, verifiziert_am')
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

  // Die Freigabe-Flags atomar setzen (+ ggf. nachberechnete Isochrone).
  // onboarding_status='abgeschlossen': ohne den Flip blieben freigegebene Basic-SVs
  // ewig auf dem Anlage-Default 'pending' (Aaron-Fund 05.08.). Der Paid-Statusautomat
  // laeuft NICHT ueber diesen Core und bleibt unberuehrt.
  //
  // `verifiziert` speist das gruene "Verifiziert"-Badge in der Kundensicht
  // (components/kunde/claim-view/TeamZone.tsx) und das Whitelabel-Gate (branding/gate.ts).
  // Seit dem 19.09. bedeutet es „freigeschalteter Claimondo-Partner" und wird mit der
  // Freischaltung gesetzt — bei einem erneuten Lauf bleibt das erste Datum stehen.
  const nowIso = new Date().toISOString()
  const { error: svErr } = await db
    .from('sachverstaendige')
    .update({
      ...freischaltungsPatch(nowIso, {
        verifiziertAmBestehend: (sv as { verifiziert_am?: string | null }).verifiziert_am ?? null,
      }),
      onboarding_status: 'abgeschlossen',
      ...geoPatch,
    } as never)
    .eq('id', svId)
  if (svErr) return { ok: false, error: `Freigabe fehlgeschlagen: ${svErr.message}` }

  // Offenen sv_basic_claim_review-Task schliessen (best-effort, non-fatal).
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
