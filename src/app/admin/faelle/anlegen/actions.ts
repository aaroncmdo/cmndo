'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
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
  const created = await createLead(
    db,
    {
      source_channel: 'admin-direkt',
      status: 'neu',
      vorname: data.vorname.trim(),
      nachname: data.nachname.trim(),
      telefon: data.telefon.trim(),
      email: data.email?.trim() || null,
    },
    {
      schadens_fall_typ: null,
      spezifikation: data.spezifikation || null,
      schadens_art: data.schadens_art || null,
      qualifizierungs_phase: 'konvertiert',
      fahrzeug_standort_plz: data.schadens_plz.trim(),
      fahrzeug_standort_adresse: data.schadens_adresse?.trim() || null,
      kennzeichen: data.kennzeichen?.trim() || null,
      notiz: data.notiz?.trim() || null,
      zugewiesen_an: user.id,
    },
  )

  if (!created.ok) {
    return { success: false, error: `Lead-Anlage fehlgeschlagen: ${created.error}` }
  }
  const lead = { id: created.leadId }

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
  // CMM-44 SP-A2 (Cluster 1): schadens_adresse/_plz/_ort sind Semantik-Duplikat-
  // Spalten — claims (schadenort_adresse/_plz/_ort) ist SSoT. createClaimForFall
  // unten schreibt sie dort; der faelle-Insert befuellt sie nicht mehr.
  const { data: fall, error: fallErr } = await db.from('faelle').insert({
    fall_nummer: fallNummer,
    lead_id: lead.id,
    status: 'ersterfassung',
    kennzeichen: data.kennzeichen?.trim() || null,
    schadens_ursache: data.schadensursache?.trim() || null,
    // KFZ-154: Schadenart fuer den Dispatcher-Match.
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

  // AAR-811: claims-Write (non-blocking)
  // CMM-44 SP-A/SP-A2: spezifikation + schadenort_* sind faelle<->claims-Duplikat-
  // Spalten → werden hier auf claims geschrieben (SSoT), nicht mehr in den
  // faelle-Insert oben. Das SP-A-Sync-Trigger-Paar ist gedroppt — claims ist
  // der einzige Schreibpfad.
  try {
    const { createClaimForFall } = await import('@/lib/claims/create-for-fall')
    await createClaimForFall(db, fall.id, {
      schadens_plz: data.schadens_plz,
      schadens_adresse: data.schadens_adresse ?? null,
      schadens_ort: data.schadens_ort ?? null,
      schadens_ursache: data.schadensursache ?? null,
      schadens_art: data.schadens_art ?? null,
      spezifikation: data.spezifikation ?? null,
    }, 'manuell_admin')
  } catch (err) { console.error('[AAR-811] createClaimForFall (admin-anlegen):', err) }

  revalidatePath('/admin/faelle', 'page')
  revalidatePath('/dispatch/dashboard', 'page')
  return { success: true, fall_id: fall.id, fall_nummer: fallNummer }
}
