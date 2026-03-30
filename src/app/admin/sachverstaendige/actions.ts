'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const PAKET_CONFIG: Record<string, { faelle: number; km: number; preis: number }> = {
  'starter-10': { faelle: 10, km: 20, preis: 1500 },
  'standard-25': { faelle: 25, km: 40, preis: 3750 },
  'premium-50': { faelle: 50, km: 100, preis: 7500 },
}

export type OnboardingData = {
  vorname: string
  nachname: string
  email: string
  telefon: string
  gutachter_typ: string
  qualifikationen: string[]
  standort_adresse: string
  standort_plz: string
  standort_lat: number | null
  standort_lng: number | null
  standort_place_id: string | null
  paket: string
}

export async function createSachverstaendiger(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const email = (formData.get('email') as string)?.trim()
  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null
  const paket = (formData.get('paket') as string) || 'starter-10'
  const gebietPlzRaw = (formData.get('gebiet_plz') as string)?.trim() || ''
  const maxFaelle = parseInt(formData.get('max_faelle_monat') as string) || 10

  if (!email) throw new Error('E-Mail ist erforderlich')

  const gebietPlz = gebietPlzRaw
    .split(/[,;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)

  const admin = createAdminClient()
  const tempPassword = crypto.randomUUID().slice(0, 12)

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr) throw new Error(`User erstellen fehlgeschlagen: ${authErr.message}`)

  const { error: profileErr } = await admin
    .from('profiles')
    .insert({
      id: authUser.user.id,
      email,
      rolle: 'sachverstaendiger',
      vorname,
      nachname,
      telefon,
    })

  if (profileErr) throw new Error(`Profil erstellen fehlgeschlagen: ${profileErr.message}`)

  const { error: svErr } = await admin
    .from('sachverstaendige')
    .insert({
      profile_id: authUser.user.id,
      paket,
      gebiet_plz: gebietPlz,
      max_faelle_monat: maxFaelle,
    })

  if (svErr) throw new Error(`SV-Eintrag fehlgeschlagen: ${svErr.message}`)

  revalidatePath('/admin/sachverstaendige')

  return { id: authUser.user.id, tempPassword }
}

export async function onboardGutachter(data: OnboardingData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  if (!data.email) throw new Error('E-Mail ist erforderlich')

  const admin = createAdminClient()
  const tempPassword = crypto.randomUUID().slice(0, 12)

  // 1. Auth user erstellen
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
  })

  if (authErr) throw new Error(`User erstellen fehlgeschlagen: ${authErr.message}`)

  // 2. Profile erstellen
  const { error: profileErr } = await admin.from('profiles').insert({
    id: authUser.user.id,
    email: data.email,
    rolle: 'sachverstaendiger',
    vorname: data.vorname || null,
    nachname: data.nachname || null,
    telefon: data.telefon || null,
  })

  if (profileErr) throw new Error(`Profil erstellen fehlgeschlagen: ${profileErr.message}`)

  // 3. Paket-Config ableiten
  const paketCfg = PAKET_CONFIG[data.paket] ?? PAKET_CONFIG['starter-10']

  // 4. SV-Eintrag mit allen neuen Feldern
  const { data: svEntry, error: svErr } = await admin.from('sachverstaendige').insert({
    profile_id: authUser.user.id,
    paket: data.paket,
    gutachter_typ: data.gutachter_typ,
    qualifikationen: data.qualifikationen,
    standort_adresse: data.standort_adresse || null,
    standort_plz: data.standort_plz || null,
    standort_lat: data.standort_lat,
    standort_lng: data.standort_lng,
    standort_place_id: data.standort_place_id,
    max_faelle_monat: paketCfg.faelle,
    paket_faelle_gesamt: paketCfg.faelle,
    paket_umkreis_km: paketCfg.km,
    radius_km: paketCfg.km,
    anzahlung_faellig: paketCfg.preis,
    anzahlung_status: 'offen',
    onboarding_abgeschlossen: true,
    partner_seit: new Date().toISOString(),
    ist_aktiv: true,
  }).select('id').single()

  if (svErr) throw new Error(`SV-Eintrag fehlgeschlagen: ${svErr.message}`)

  // 5. Finance-Eintrag fuer Anzahlung
  try {
    await admin.from('finance_eintraege').insert({
      typ: 'gutachter-anzahlung',
      betrag: paketCfg.preis,
      status: 'offen',
      beschreibung: `Gutachter-Anzahlung: ${data.vorname} ${data.nachname} (${data.paket})`,
      referenz_id: svEntry?.id ?? null,
      referenz_typ: 'sachverstaendige',
    })
  } catch {
    // finance_eintraege might not exist yet
  }

  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/finance')

  return { svId: svEntry?.id, tempPassword, email: data.email }
}
