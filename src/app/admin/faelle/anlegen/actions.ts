'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// KFZ-154 Cleanup-Follow-up: Manuelle Fall-Anlage UI fuer Admins.
// Bisher entstanden Faelle nur via convertLeadToFall (aus Leads) oder
// seed-testdata. Diese Action erlaubt einem Admin direkt einen Fall
// anzulegen ohne erst einen Lead-Eintrag durchzuklicken — typisch fuer
// schnelle 'Telefonisch reingekommen, sofort als Fall' Workflows.
//
// Pflichtfelder: vorname, nachname, telefon, schadens_plz.
// Optional: kennzeichen, schadens_adresse, spezifikation, schadens_art, notiz.
// Spezifikation + Schadenart sind optional aber empfohlen damit der
// Dispatcher-Hard-Filter (KFZ-154) aktiv wird.

export type AnlegeFallInput = {
  vorname: string
  nachname: string
  telefon: string
  email?: string
  kennzeichen?: string
  schadens_adresse?: string
  schadens_plz: string
  schadens_ort?: string
  schadensursache?: string
  spezifikation?: string
  schadens_art?: string
  notiz?: string
}

export async function anlegeFall(data: AnlegeFallInput): Promise<
  { success: true; fall_id: string; fall_nummer: string } | { success: false; error: string }
> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin' && profile?.rolle !== 'mitarbeiter') {
    return { success: false, error: 'Nur Admins und Mitarbeiter koennen Faelle anlegen' }
  }

  if (!data.vorname?.trim() || !data.nachname?.trim() || !data.telefon?.trim() || !data.schadens_plz?.trim()) {
    return { success: false, error: 'Pflichtfelder: Vorname, Nachname, Telefon, Schadens-PLZ' }
  }

  const db = createAdminClient()

  // 1. Lead-Eintrag anlegen (Konversions-Source) damit alle existing Hooks
  //    (Tasks, Notifications) gleich greifen.
  const { data: lead, error: leadErr } = await db.from('leads').insert({
    vorname: data.vorname.trim(),
    nachname: data.nachname.trim(),
    telefon: data.telefon.trim(),
    email: data.email?.trim() || null,
    source_channel: 'admin-direkt',
    schadens_fall_typ: null,
    spezifikation: data.spezifikation || null,
    schadens_art: data.schadens_art || null,
    status: 'neu',
    qualifizierungs_phase: 'konvertiert',
    fahrzeug_standort_plz: data.schadens_plz.trim(),
    fahrzeug_standort_adresse: data.schadens_adresse?.trim() || null,
    kennzeichen: data.kennzeichen?.trim() || null,
    notiz: data.notiz?.trim() || null,
    zugewiesen_an: user.id,
  }).select('id').single()

  if (leadErr || !lead) {
    return { success: false, error: `Lead-Anlage fehlgeschlagen: ${leadErr?.message ?? 'unbekannt'}` }
  }

  // 2. Fall-Nummer generieren (CLM-YYYYMMDD-NNN, analog convertLeadToFall)
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await db
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .like('fall_nummer', `CLM-${dateStr}-%`)
  const nr = String((count ?? 0) + 1).padStart(3, '0')
  const fallNummer = `CLM-${dateStr}-${nr}`

  // 3. Fall-Eintrag direkt anlegen (kein Round-Robin Kundenbetreuer hier —
  //    Admin uebernimmt die Verantwortung selbst)
  const { data: fall, error: fallErr } = await db.from('faelle').insert({
    fall_nummer: fallNummer,
    lead_id: lead.id,
    status: 'ersterfassung',
    kennzeichen: data.kennzeichen?.trim() || null,
    schadens_adresse: data.schadens_adresse?.trim() || null,
    schadens_plz: data.schadens_plz.trim(),
    schadens_ort: data.schadens_ort?.trim() || null,
    schadens_ursache: data.schadensursache?.trim() || null,
    // KFZ-154: Spezifikation + Schadenart fuer den Dispatcher-Match
    spezifikation: data.spezifikation || null,
    schadens_art: data.schadens_art || null,
    dispatch_id: user.id,
    konvertiert_am: new Date().toISOString(),
    konvertiert_von_lead: lead.id,
  }).select('id').single()

  if (fallErr || !fall) {
    // Rollback: Lead loeschen
    await db.from('leads').delete().eq('id', lead.id)
    return { success: false, error: `Fall-Anlage fehlgeschlagen: ${fallErr?.message ?? 'unbekannt'}` }
  }

  // AAR-811: Dual-Write claims (non-blocking)
  try {
    const { createClaimForFall } = await import('@/lib/claims/create-for-fall')
    await createClaimForFall(db, fall.id, {
      schadens_plz: data.schadens_plz,
      schadens_adresse: data.schadens_adresse ?? null,
      schadens_ort: data.schadens_ort ?? null,
      schadens_ursache: data.schadensursache ?? null,
      schadens_art: data.schadens_art ?? null,
    }, 'manuell_admin')
  } catch (err) { console.error('[AAR-811] createClaimForFall (admin-anlegen):', err) }

  revalidatePath('/admin/faelle', 'page')
  revalidatePath('/dispatch/dashboard', 'page')
  return { success: true, fall_id: fall.id, fall_nummer: fallNummer }
}
