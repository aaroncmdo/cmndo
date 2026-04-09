'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PAKET_CONFIG: Record<string, { faelle: number; km: number; preis: number }> = {
  standard: { faelle: 10, km: 15, preis: 1500 },
  'starter-10': { faelle: 10, km: 15, preis: 1500 },
  pro: { faelle: 25, km: 40, preis: 3750 },
  'standard-25': { faelle: 25, km: 40, preis: 3750 },
  premium: { faelle: 50, km: 70, preis: 7500 },
  'premium-50': { faelle: 50, km: 70, preis: 7500 },
}

export async function completeOnboarding(data: {
  userId: string
  existingSvId: string | null
  vorname: string
  nachname: string
  telefon: string
  gutachter_typ: string
  qualifikationen: string[]
  standort_adresse: string
  standort_plz: string
  standort_lat: number | null
  standort_lng: number | null
  standort_place_id: string
  paket: string
  kalender_typ: string
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const paketConfig = PAKET_CONFIG[data.paket] ?? PAKET_CONFIG['standard']

  // Update profile
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      vorname: data.vorname,
      nachname: data.nachname,
      telefon: data.telefon,
      rolle: 'sachverstaendiger',
    })
    .eq('id', data.userId)

  if (profileErr) throw new Error(`Profil-Update fehlgeschlagen: ${profileErr.message}`)

  // Create or update sachverstaendige
  // BUG-A.3 fix: gebiet_plz ist text[] nicht text → wrap im Array.
  // BUG-FOLLOW-1 workaround: portal_zugang_freigeschaltet explizit auf false
  // setzen (DB-Default ist faelschlich true, separater Folge-Bug).
  if (data.existingSvId) {
    const { error } = await supabase
      .from('sachverstaendige')
      .update({
        paket: data.paket,
        gebiet_plz: data.standort_plz ? [data.standort_plz] : [],
        max_faelle_monat: paketConfig.faelle,
        paket_faelle_gesamt: paketConfig.faelle,
        paket_umkreis_km: paketConfig.km,
        anzahlung_faellig: paketConfig.preis,
        onboarding_anzahlung_betrag: paketConfig.preis,
        gutachter_typ: data.gutachter_typ,
        standort_adresse: data.standort_adresse,
        standort_plz: data.standort_plz,
        standort_lat: data.standort_lat,
        standort_lng: data.standort_lng,
        standort_place_id: data.standort_place_id || null,
        kalender_typ: data.kalender_typ,
        qualifikationen: data.qualifikationen,
        onboarding_abgeschlossen: true,
        ist_aktiv: true,
      })
      .eq('id', data.existingSvId)

    if (error) throw new Error(`SV-Update fehlgeschlagen: ${error.message}`)
  } else {
    const { error } = await supabase
      .from('sachverstaendige')
      .insert({
        profile_id: data.userId,
        paket: data.paket,
        gebiet_plz: data.standort_plz ? [data.standort_plz] : [],
        max_faelle_monat: paketConfig.faelle,
        paket_faelle_gesamt: paketConfig.faelle,
        paket_faelle_genutzt: 0,
        paket_umkreis_km: paketConfig.km,
        anzahlung_faellig: paketConfig.preis,
        onboarding_anzahlung_betrag: paketConfig.preis,
        gutachter_typ: data.gutachter_typ,
        offene_faelle: 0,
        standort_adresse: data.standort_adresse,
        standort_plz: data.standort_plz,
        standort_lat: data.standort_lat,
        standort_lng: data.standort_lng,
        standort_place_id: data.standort_place_id || null,
        kalender_typ: data.kalender_typ,
        qualifikationen: data.qualifikationen,
        onboarding_abgeschlossen: true,
        ist_aktiv: true, // Deaktiviert-Banner triggert ueber 'ist_aktiv=false', nicht hier
        onboarding_status: 'pending',
        portal_zugang_freigeschaltet: false, // BUG-FOLLOW-1 workaround: DB-Default ist faelschlich true
      })

    if (error) throw new Error(`SV-Erstellung fehlgeschlagen: ${error.message}`)
  }

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/profil')
}
