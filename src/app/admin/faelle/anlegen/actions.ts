'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { qualiAusSchadensart } from '@/lib/werkstatt/abrechnungsweg'
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
  if (profile?.rolle !== 'admin') {
    return { success: false, error: 'Nur Admins können Fälle anlegen' }
  }

  if (!data.vorname?.trim() || !data.nachname?.trim() || !data.telefon?.trim() || !data.schadens_plz?.trim()) {
    return { success: false, error: 'Pflichtfelder: Vorname, Nachname, Telefon, Schadens-PLZ' }
  }

  const db = createAdminClient()

  // Abrechnungsweg-Audit (03.08.): Quali-Achse aus schadens_art ableiten, sonst erzeugt der
  // Sofort-Convert (Schritt 2) einen wegs-losen Claim (abrechnungsweg=null) trotz klarer
  // Versicherungs-Klassifikation. Auf den LEAD schreiben -> convert-Spalte + DB-Views konsistent.
  const quali = qualiAusSchadensart(data.schadens_art)

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
      ...(quali ? { schuldfrage: quali.schuldfrage, eigene_versicherung: quali.eigeneVersicherung } : {}),
      qualifizierungs_phase: 'konvertiert',
      fahrzeug_standort_plz: data.schadens_plz.trim(),
      // B5-Fix (Entry-Point-Audit): PLZ auch nach unfallort_plz -> erreicht claims.schadenort_plz
      // (convert liest lead.unfallort_plz; F6/Aaron 14.07. "Form-Wiring folgt").
      unfallort_plz: data.schadens_plz.trim(),
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

  // 2. (CMM-49 Phase 6) Kanonische Lead->Claim-Konversion. anlegeFall erzeugt oben einen Lead
  //    (source_channel='admin-direkt') und konvertiert ihn jetzt ueber denselben kanonischen Pfad
  //    wie Flow/Dispatch: convertLeadToClaim. Das legt das volle Ecosystem an (claims +
  //    geschaedigter-Party + personen + faelle_claim_bridge), statt des frueheren "thin"
  //    createClaimForFall-Claims (der KEINE geschaedigter-Party anlegte -> kunde_*/halter_*/
  //    ist_fahrzeughalter-Edits in der Fallakte liefen ins Leere). createClaimForFall ist damit
  //    obsolet + geloescht. KB: convertLeadToClaim nimmt lead.zugewiesen_an (=user.id, rollen-gegated
  //    auf admin/KB via validate_kundenbetreuer_rolle) bzw. faellt auf Round-Robin zurueck — daher
  //    KEIN expliziter kundenbetreuerId (ein mitarbeiter-user.id wuerde den Trigger verletzen).
  try {
    const { convertLeadToClaim } = await import('@/lib/leads/convert-lead-to-claim')
    const conv = await convertLeadToClaim({ leadId: lead.id, triggerByUserId: user.id })
    if (!conv.ok) {
      // Rollback: Lead loeschen (kein Claim -> kein Fall); convertLeadToClaim hat den Claim bei
      // einem Folgefehler bereits selbst zurueckgerollt (cleanupAndFail).
      await db.from('leads').delete().eq('id', lead.id)
      return { success: false, error: `Fall-Anlage fehlgeschlagen: ${conv.error}` }
    }
    // CMM-49: zwei admin-Form-Felder, die der kanonische lead->claim NICHT aus dem Lead mappt:
    //   - schadenort_ort: convertLeadToClaim hardcodet schadenort_ort=null (Ort aus PLZ ableitbar)
    //   - schadens_ursache: wird vom Converter nicht uebernommen (im Flow erst in der Fallakte)
    // -> hier explizit nachziehen, wenn das Formular sie liefert (sonst No-op). Schadenort-PLZ/
    //    -Adresse, Schadenart + Spezifikation flossen bereits via den Lead (fahrzeug_standort_*,
    //    schadens_art, spezifikation).
    const adminExtras: Record<string, unknown> = {}
    if (data.schadens_ort?.trim()) adminExtras.schadenort_ort = data.schadens_ort.trim()
    if (data.schadensursache?.trim()) adminExtras.schadens_ursache = data.schadensursache.trim()
    if (Object.keys(adminExtras).length > 0) {
      await db.from('claims').update(adminExtras).eq('id', conv.claimId)
    }
    // CMM-68: manuelle Anlage hat keine FIN -> FIN-loser vehicles-Stub + claims.vehicle_id
    // (Kennzeichen aus dem Formular). convertLeadToClaim legt mangels Lead-FIN kein Fahrzeug an.
    if (data.kennzeichen?.trim()) {
      const { ensureVehicleForClaim } = await import('@/lib/vehicles/ensure-vehicle')
      const veh = await ensureVehicleForClaim({ claimId: conv.claimId, snapshot: { kennzeichen: data.kennzeichen.trim() }, db })
      if (!veh.ok) console.warn('[CMM-68] vehicles-Stub bei manueller Anlage:', veh.error)
    }
    // Pflichtdok-Slots nachziehen: convertLeadToClaim legt selbst KEINE Slots an (bewusst —
    // jeder Caller ergaenzt sie, s. finalizeKundeSetup/flow[token]:550). anlegeFall hatte diesen
    // Schritt vergessen -> admin-angelegte Faelle blieben ohne Pflichtdokument-Slots, der Kunde
    // konnte keine Pflicht-Doku hochladen (Health-Fund claims-missing-pflichtdokumente). Non-fatal:
    // der Fall ist bereits angelegt; ein Slot-Fehler darf die Anlage nicht ruecknehmen.
    try {
      const { data: leadDocs } = await db
        .from('leads')
        .select(
          'polizei_vor_ort, polizeibericht_pflicht, polizeibericht_status, personenschaden_flag, hat_vorschaeden, zb1_status, service_typ, wa_gesendet, mietwagen_flag, nutzungsausfall',
        )
        .eq('id', lead.id)
        .maybeSingle()
      const { createPflichtdokumenteFromKatalog } = await import('@/lib/dokumente/create-pflicht')
      await createPflichtdokumenteFromKatalog(
        db as unknown as Parameters<typeof createPflichtdokumenteFromKatalog>[0],
        conv.fallId,
        leadDocs as Record<string, unknown> | null,
      )
    } catch (err) {
      console.warn('[anlegeFall] Pflichtdok-Slot-Init non-fatal:', err)
    }
    revalidatePath('/admin/faelle', 'page')
    revalidatePath('/dispatch/dashboard', 'page')
    return { success: true, fall_id: conv.fallId, claim_nummer: conv.claimNummer }
  } catch (err) {
    console.error('[CMM-49] convertLeadToClaim (admin-anlegen):', err)
    await db.from('leads').delete().eq('id', lead.id)
    return { success: false, error: 'Fall-Anlage fehlgeschlagen (Konversion)' }
  }
}
