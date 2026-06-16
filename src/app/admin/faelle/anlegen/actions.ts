'use server'

import { randomUUID } from 'node:crypto'
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
  { success: true; fall_id: string; claim_nummer: string | null } | { success: false; error: string }
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

  // 2. (CMM-49 D2) claim-first: KEINE faelle-Row mehr. createClaimForFall legt den Claim
  //    mit id == fallId (Identity) an; die faelle_claim_bridge kommt vom trg_sync_claims_to_bridge
  //    (der faelle.update-Backref in createClaimForFall no-oppt mangels Row). Der frühere
  //    Skelett-faelle-INSERT ({lead_id,status,konvertiert_am}) ist data-lossless: lead_id ->
  //    claims.lead_id, status -> claims.operative_status='ersterfassung', konvertiert_am ~
  //    claims.created_at. Schadenort/-art/-ursache/spezifikation schreibt createClaimForFall
  //    claims-seitig (SSoT). Kein Round-Robin-KB hier — Admin übernimmt selbst.
  const fallId = randomUUID()
  let claimNummer: string | null = null
  try {
    const { createClaimForFall } = await import('@/lib/claims/create-for-fall')
    const claimId = await createClaimForFall(db, fallId, {
      schadens_plz: data.schadens_plz,
      schadens_adresse: data.schadens_adresse ?? null,
      schadens_ort: data.schadens_ort ?? null,
      schadens_ursache: data.schadensursache ?? null,
      schadens_art: data.schadens_art ?? null,
      spezifikation: data.spezifikation ?? null,
      lead_id: lead.id,
    }, 'manuell_admin')
    if (!claimId) {
      // Rollback: Lead loeschen (kein Claim -> kein Fall).
      await db.from('leads').delete().eq('id', lead.id)
      return { success: false, error: 'Fall-Anlage fehlgeschlagen: Claim konnte nicht angelegt werden' }
    }
    const { data: claim } = await db.from('claims').select('claim_nummer').eq('id', claimId).single()
    claimNummer = claim?.claim_nummer ?? null
    // CMM-68: manuelle Anlage hat keine FIN -> FIN-loser vehicles-Stub + claims.vehicle_id,
    // damit der vehicles-Write-Path auch hier vollstaendig ist (Kennzeichen aus dem Formular).
    if (data.kennzeichen?.trim()) {
      const { ensureVehicleForClaim } = await import('@/lib/vehicles/ensure-vehicle')
      const veh = await ensureVehicleForClaim({ claimId, snapshot: { kennzeichen: data.kennzeichen.trim() }, db })
      if (!veh.ok) console.warn('[CMM-68] vehicles-Stub bei manueller Anlage:', veh.error)
    }
  } catch (err) {
    console.error('[AAR-811] createClaimForFall (admin-anlegen):', err)
    await db.from('leads').delete().eq('id', lead.id)
    return { success: false, error: 'Fall-Anlage fehlgeschlagen (Claim-Insert)' }
  }

  revalidatePath('/admin/faelle', 'page')
  revalidatePath('/dispatch/dashboard', 'page')
  return { success: true, fall_id: fallId, claim_nummer: claimNummer }
}
