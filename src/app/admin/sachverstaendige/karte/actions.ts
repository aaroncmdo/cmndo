'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { revalidatePath } from 'next/cache'

export async function updateGutachterProfil(
  svId: string,
  field: string,
  value: unknown,
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Fields that live on the profiles table (via profile_id)
  const profileFields = ['telefon', 'email', 'vorname', 'nachname']

  if (profileFields.includes(field)) {
    // Get profile_id from sachverstaendige
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', svId)
      .single()

    if (!sv?.profile_id) throw new Error('Gutachter-Profil nicht gefunden')

    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', sv.profile_id)

    if (error) throw new Error(error.message)
  } else {
    // Fields on sachverstaendige table
    const { error } = await supabase
      .from('sachverstaendige')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', svId)

    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/sachverstaendige/karte')
}

// AAR SV-Audit-Konsolidierung: Deaktivier-/Aktivier-Flow setzt jetzt
// gesperrt_seit + gesperrt_grund + gesperrt_von_user_id statt ist_aktiv.
// `ist_aktiv` ist reserviert für den automatischen Onboarding-Flow
// (Stripe-Webhook). Admin-manueller Toggle läuft über die Sperr-Felder.
export async function reactivateGutachter(svId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('sachverstaendige')
    .update({
      gesperrt_seit: null,
      gesperrt_grund: null,
      gesperrt_von_user_id: null,
      // Legacy-Felder defensiv mitziehen — falls sie noch irgendwo gelesen werden.
      deaktiviert_grund: null,
      deaktiviert_am: null,
    })
    .eq('id', svId)
  if (error) throw new Error(error.message)

  // KFZ-151: Auto-Resolve Account-Sperr-Tasks (Reminder/Mahn-Tasks die jetzt obsolet sind)
  try {
    await resolveTasksForEntity('gutachter', svId, 'Account manuell entsperrt')
    await resolveTasksForEntity('sv_onboarding', svId, 'Account manuell entsperrt')
  } catch (err) { console.error('[KFZ-151] resolveTasks reactivate:', err) }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/sachverstaendige/karte')
}

export async function deactivateGutachter(svId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('sachverstaendige')
    .update({
      gesperrt_seit: new Date().toISOString(),
      gesperrt_grund: grund || 'Manuell gesperrt',
      gesperrt_von_user_id: user.id,
      // Legacy-Felder parallel setzen für Backward-Compat in alten Listings.
      deaktiviert_grund: grund || 'Manuell gesperrt',
      deaktiviert_am: new Date().toISOString(),
    })
    .eq('id', svId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/sachverstaendige/karte')
}

export async function reassignCases(fromSvId: string, toSvId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data, error } = await supabase
    .from('faelle')
    .update({ sv_id: toSvId })
    .eq('sv_id', fromSvId)
    .not('status', 'in', '("abgeschlossen","storniert")')
    .select('id')

  if (error) throw new Error(error.message)
  revalidatePath('/admin/sachverstaendige')
  return { count: data?.length ?? 0 }
}

export async function softDeleteGutachter(svId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // Check for open cases
  const { count } = await supabase
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .eq('sv_id', svId)
    .not('status', 'in', '("abgeschlossen","storniert")')

  if ((count ?? 0) > 0) {
    throw new Error(`Noch ${count} offene Fälle. Bitte zuerst umverteilen.`)
  }

  // AAR SV-Audit-Konsolidierung: Soft-Delete setzt geloescht_am + Sperr-Felder.
  // ist_aktiv bleibt unverändert — das Flag ist reserviert für den Onboarding-Flow.
  const { error } = await supabase
    .from('sachverstaendige')
    .update({
      geloescht_am: new Date().toISOString(),
      gesperrt_seit: new Date().toISOString(),
      gesperrt_grund: 'Gelöscht durch Admin',
      gesperrt_von_user_id: user.id,
      // Legacy-Felder defensiv.
      deaktiviert_grund: 'Gelöscht durch Admin',
      deaktiviert_am: new Date().toISOString(),
    })
    .eq('id', svId)
  if (error) throw new Error(error.message)

  // Delete the auth user completely so they can never log in again
  try {
    const { data: svData } = await supabase.from('sachverstaendige').select('user_id, profile_id').eq('id', svId).single()
    const authUserId = svData?.user_id ?? svData?.profile_id
    if (authUserId) {
      const admin = createAdminClient()
      await admin.auth.admin.deleteUser(authUserId)
    }
  } catch { /* service role key may not be set, or user already deleted */ }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/sachverstaendige/karte')
  revalidatePath('/admin/finance')
}

export async function getOpenCasesCount(svId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .eq('sv_id', svId)
    .not('status', 'in', '("abgeschlossen","storniert")')
  return count ?? 0
}

// ─── KFZ-122: Gutachter endgültig löschen (NUR deaktivierte) ─────────────

export async function deleteGutachter(svId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!svId || typeof svId !== 'string' || svId.length < 10) {
      return { success: false, error: 'Ungültige SV-ID' }
    }

    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    // Nur Admins dürfen löschen
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    if (profile?.rolle !== 'admin') return { success: false, error: 'Nur Admins können Gutachter löschen' }

    // AAR SV-Audit-Konsolidierung: Precondition ist gesperrt_seit (Admin hat
     // manuell gesperrt), nicht mehr ist_aktiv=false (das ist der Onboarding-Status).
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('id, gesperrt_seit, geloescht_am')
      .eq('id', svId)
      .single()
    if (!sv) return { success: false, error: 'Gutachter nicht gefunden' }
    if (!sv.gesperrt_seit && !sv.geloescht_am) {
      return { success: false, error: 'Nur gesperrte Gutachter können endgültig gelöscht werden. Bitte zuerst sperren.' }
    }

    const { error } = await supabase.rpc('delete_gutachter_komplett', { p_sv_id: svId })
    if (error) {
      console.error('[deleteGutachter] RPC error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/admin/sachverstaendige')
    revalidatePath('/admin/sachverstaendige/karte')
    return { success: true }
  } catch (err) {
    console.error('[deleteGutachter] Fehler:', err)
    return { success: false, error: String(err) }
  }
}

// AAR-130: Isochrone für SV oder Organisation neu berechnen via HERE API.
// Wird vom Detail-Panel im KarteHubClient als "Neu berechnen"-Button getriggert.
// Nutzt die zentrale calculateIsochrone (AAR-132 — HERE) und schreibt das
// resultierende GeoJSON-Polygon zurück in die jeweilige Tabelle.
export async function recalculateIsochrone(
  entityType: 'sv' | 'organisation',
  entityId: string,
): Promise<{ success: boolean; pointCount?: number; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { success: false, error: 'Nur Admins' }

  const adminDb = createAdminClient()
  // AAR-549 S1: paket_umkreis_km ist kanonische Radius-Quelle (radius_km +
  // paket_radius_km wurden gedropt, Backfill via GREATEST). Organisationen
  // haben weiterhin zwei Spalten (einsatzgebiet_km | einsatzgebiet_radius_km).
  const selectCols = entityType === 'sv'
    ? 'standort_lat, standort_lng, paket_umkreis_km'
    : 'standort_lat, standort_lng, einsatzgebiet_km, einsatzgebiet_radius_km'
  const table = entityType === 'sv' ? 'sachverstaendige' : 'organisationen'

  const { data: row, error: loadErr } = await adminDb
    .from(table)
    .select(selectCols)
    .eq('id', entityId)
    .maybeSingle()

  if (loadErr || !row) {
    return { success: false, error: loadErr?.message ?? 'Entität nicht gefunden' }
  }

  const r = row as unknown as Record<string, number | null>
  const lat = r.standort_lat
  const lng = r.standort_lng
  const radiusCandidates = entityType === 'sv'
    ? [r.paket_umkreis_km]
    : [r.einsatzgebiet_km, r.einsatzgebiet_radius_km]
  const radiusKm = radiusCandidates.find((v) => v != null && Number(v) > 0) ?? null

  if (lat == null || lng == null) {
    return { success: false, error: 'Keine Koordinaten gesetzt — Adresse erst pflegen.' }
  }
  if (!radiusKm || radiusKm <= 0) {
    return { success: false, error: 'Kein Einsatzradius gesetzt.' }
  }

  try {
    const { calculateIsochrone } = await import('@/lib/isochrone/calculate-isochrone')
    const points = await calculateIsochrone(Number(lat), Number(lng), Number(radiusKm))
    if (points.length < 3) {
      return { success: false, error: 'HERE API lieferte weniger als 3 Punkte.' }
    }
    // GeoJSON [lng, lat] mit geschlossenem Ring
    const ring = points.map((p) => [p.lng, p.lat])
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
    const polygon = { type: 'Polygon' as const, coordinates: [ring] }

    const { error: upErr } = await adminDb
      .from(table)
      .update({ isochrone_polygon: polygon })
      .eq('id', entityId)

    if (upErr) return { success: false, error: upErr.message }

    revalidatePath('/admin/sachverstaendige/karte')
    if (entityType === 'sv') revalidatePath('/admin/sachverstaendige')
    if (entityType === 'organisation') {
      revalidatePath('/admin/organisationen')
      revalidatePath('/admin/communities')
    }
    return { success: true, pointCount: points.length }
  } catch (err) {
    console.error('[recalculateIsochrone] HERE-Fehler:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}
