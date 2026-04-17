'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'
import { PAKET_KONFIG } from '../anlegen/constants'

const PAKET_KM: Record<string, number> = {
  standard: 15, 'starter-10': 15,
  pro: 40, 'standard-25': 40,
  premium: 70, 'premium-50': 70,
}

export async function updateSvProfile(svId: string, profileId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null
  const paket = formData.get('paket') as string
  const maxFaelle = parseInt(formData.get('max_faelle_monat') as string) || 10
  const istAktiv = formData.get('ist_aktiv') === 'true'
  const notizen = (formData.get('notizen') as string)?.trim() || null

  // Standort from Google Places
  const standortAdresse = (formData.get('standort_adresse') as string)?.trim() || null
  const standortPlz = (formData.get('standort_plz') as string)?.trim() || null
  const standortLatStr = formData.get('standort_lat') as string
  const standortLngStr = formData.get('standort_lng') as string
  const standortLat = standortLatStr ? parseFloat(standortLatStr) : null
  const standortLng = standortLngStr ? parseFloat(standortLngStr) : null
  const standortPlaceId = (formData.get('standort_place_id') as string)?.trim() || null

  const radiusKm = PAKET_KM[paket] ?? 15

  // Update profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ vorname, nachname, telefon })
    .eq('id', profileId)

  if (profileErr) throw new Error(`Profil-Update fehlgeschlagen: ${profileErr.message}`)

  // Update sachverstaendige
  const svUpdate: Record<string, unknown> = {
    paket,
    max_faelle_monat: maxFaelle,
    ist_aktiv: istAktiv,
    notizen,
    standort_adresse: standortAdresse,
    standort_plz: standortPlz,
    standort_lat: standortLat,
    standort_lng: standortLng,
    standort_place_id: standortPlaceId,
    paket_umkreis_km: radiusKm,
    radius_km: radiusKm,
  }

  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update(svUpdate)
    .eq('id', svId)

  if (svErr) throw new Error(`SV-Update fehlgeschlagen: ${svErr.message}`)

  // Isochrone neu berechnen wenn Koordinaten vorhanden
  if (standortLat != null && standortLng != null && !isNaN(standortLat) && !isNaN(standortLng)) {
    try {
      const polygon = await calculateIsochrone(standortLat, standortLng, radiusKm)
      if (polygon.length > 0) {
        await supabase.from('sachverstaendige').update({ isochrone_polygon: polygon }).eq('id', svId)
      }
    } catch (err) {
      // AAR-132: Isochrone-Berechnung nicht kritisch — SV-Update greift trotzdem.
      // findBestSV fällt ohne Polygon auf den Radius-Check zurück.
      console.error('[AAR-132] Isochrone-Berechnung nach SV-Profil-Update fehlgeschlagen:', err)
    }
  }

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
}

// BUG-90: calculateIsochrone wurde nach src/lib/isochrone/calculate-isochrone.ts
// extrahiert damit auch anlegeSv() und der Profil-Tab dieselbe Logik nutzen.

// AAR-425: Admin-Toggle "SV manuell verifizieren".
// Gate für Whitelabel-Features auf der Kunden-Seite. Bewusst getrennt vom
// AAR-359-Verifizierungsflow (sa_vorlage_status / verifizierung_status), der
// die Dokument-Pflichten abbildet. `verifiziert` hier = "Aaron kennt den SV
// persönlich" → Whitelabel darf sichtbar sein.
export async function setzeSvVerifiziert(svId: string, verifiziert: boolean) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' as const }

  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') return { success: false, error: 'Nur Admins dürfen den Verifizierungs-Status ändern.' }

  const patch: Record<string, unknown> = verifiziert
    ? { verifiziert: true, verifiziert_am: new Date().toISOString(), verifiziert_von: user.id }
    : { verifiziert: false, verifiziert_am: null, verifiziert_von: null }

  const { error } = await supabase
    .from('sachverstaendige')
    .update(patch)
    .eq('id', svId)

  if (error) return { success: false, error: `Update fehlgeschlagen: ${error.message}` }

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  return { success: true as const }
}

// ─── AAR-364 SUB-4: Willkommens-Mail erneut senden ─────────────────────────

/**
 * Generiert ein neues Initial-Passwort, setzt es per Admin-API auf dem
 * auth.user, flaggt `force_password_change = true` und versendet die
 * WillkommenSv-Mail erneut mit den aktuellen Konditionen. Nur fuer Admins.
 */
function randomPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-='
  const bytes = randomBytes(length)
  let pw = ''
  for (let i = 0; i < length; i++) {
    pw += alphabet[bytes[i] % alphabet.length]
  }
  return pw
}

export async function resendWelcomeMail(
  svId: string,
): Promise<{ success: boolean; error?: string; initial_password?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: me } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') {
    return { success: false, error: 'Nur Admins dürfen Willkommens-Mails erneut senden.' }
  }
  const adminName = [me.vorname, me.nachname].filter(Boolean).join(' ') || 'Admin'

  const adminDb = createAdminClient()
  const { data: sv, error: svErr } = await adminDb
    .from('sachverstaendige')
    .select('id, profile_id, paket, paket_faelle_gesamt, max_faelle_monat, paket_umkreis_km, radius_km, onboarding_anzahlung_betrag, anzahlung_faellig, organisation_id, profiles(email, vorname, nachname, anrede, titel)')
    .eq('id', svId)
    .maybeSingle()

  if (svErr || !sv) {
    return { success: false, error: `SV nicht gefunden: ${svErr?.message ?? 'unbekannt'}` }
  }

  const profileRaw = sv.profiles as unknown
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    email: string | null
    vorname: string | null
    nachname: string | null
    anrede: string | null
    titel: string | null
  } | null

  if (!profile?.email) {
    return { success: false, error: 'SV hat keine Email-Adresse im Profil.' }
  }
  if (!sv.profile_id) {
    return { success: false, error: 'SV hat keine profile_id (Auth-User kann nicht aktualisiert werden).' }
  }

  const initialPassword = randomPassword(16)

  // Passwort zuruecksetzen + force_password_change = true
  const { error: authErr } = await adminDb.auth.admin.updateUserById(sv.profile_id, {
    password: initialPassword,
    user_metadata: { force_password_change: true, welcome_resent_by: user.id, welcome_resent_at: new Date().toISOString() },
  })
  if (authErr) {
    return { success: false, error: `Passwort-Reset fehlgeschlagen: ${authErr.message}` }
  }

  await adminDb
    .from('profiles')
    .update({ force_password_change: true })
    .eq('id', sv.profile_id)

  // Organisation (fuer Sub-SV-Pfad → "du gehoerst zu Buero X")
  let organisationName: string | null = null
  let rolleInOrganisation: string | null = null
  if (sv.organisation_id) {
    const { data: org } = await adminDb
      .from('organisationen')
      .select('name')
      .eq('id', sv.organisation_id)
      .maybeSingle()
    organisationName = org?.name ?? null
    rolleInOrganisation = 'Mitarbeiter'
  }

  // Paket-Name + Konditionen aus DB-Feldern (Paket-Override kann hier nicht mehr
  // unterschieden werden — wir nehmen die effektiven Werte aus `sachverstaendige`).
  const paketKey = (sv.paket as string | null) ?? 'standard'
  const paketName = paketKey.charAt(0).toUpperCase() + paketKey.slice(1)
  const kontingent = sv.paket_faelle_gesamt ?? sv.max_faelle_monat ?? (
    PAKET_KONFIG[paketKey as keyof typeof PAKET_KONFIG]?.kontingent ?? 10
  )
  const radiusKm = sv.paket_umkreis_km ?? sv.radius_km ?? (
    PAKET_KONFIG[paketKey as keyof typeof PAKET_KONFIG]?.radius_km ?? 15
  )
  const anzahlung = sv.onboarding_anzahlung_betrag ?? sv.anzahlung_faellig ?? (
    PAKET_KONFIG[paketKey as keyof typeof PAKET_KONFIG]?.preis_anzahlung_eur ?? 1500
  )

  try {
    const { sendWillkommenSv } = await import('@/lib/email/google/flows')
    await sendWillkommenSv({
      to: profile.email,
      anrede: profile.anrede ?? undefined,
      titel: profile.titel ?? undefined,
      vorname: profile.vorname ?? '',
      nachname: profile.nachname ?? '',
      paket_name: paketName,
      kontingent: Number(kontingent),
      radius_km: Number(radiusKm),
      anzahlung_betrag_eur: Number(anzahlung),
      initial_password: initialPassword,
      organisation_name: organisationName,
      rolle_in_organisation: rolleInOrganisation,
      von_admin_name: adminName,
    })
  } catch (err) {
    console.error('[AAR-364 SUB-4] Welcome-Mail-Resend fehlgeschlagen:', err)
    const msg = err instanceof Error ? err.message : 'Email-Versand fehlgeschlagen'
    return { success: false, error: msg }
  }

  revalidatePath(`/admin/sachverstaendige/${svId}`)
  return { success: true, initial_password: initialPassword }
}
