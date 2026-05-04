'use server'

// AAR-CMM Stufe 2: Spontane Disposition aus dem Dispatch-Kalender.
// Erstellt minimalen Lead, reserviert Termin beim gewählten SV, sendet
// optional FlowLink an den Kunden. Service-Typ default 'nur_gutachter' —
// Aaron-Vorgabe: Spontandisposition läuft nicht über Komplettservice.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { reserveSvTerminForLead } from '@/app/dispatch/leads/[id]/_actions/sv-termin'
import { sendFlowLinkMultiChannel } from '@/app/dispatch/leads/[id]/_actions/flowlink'

export type SpontanInput = {
  vorname: string
  nachname: string
  telefon: string
  email: string | null
  besichtigungsortAdresse: string
  besichtigungsortLat: number | null
  besichtigungsortLng: number | null
  svId: string
  startIso: string
  durationMin: number
  flowlinkKanal: 'whatsapp' | 'sms' | 'email' | 'kein'
}

export async function createSpontanTermin(
  input: SpontanInput,
): Promise<{ ok: boolean; leadId?: string; terminId?: string; flowlinkSent?: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  if (!input.vorname.trim() || !input.nachname.trim()) {
    return { ok: false, error: 'Vor- und Nachname sind Pflicht' }
  }
  if (!input.telefon.trim()) return { ok: false, error: 'Telefonnummer ist Pflicht' }
  if (!input.svId) return { ok: false, error: 'Sachverständiger fehlt' }
  if (!input.startIso) return { ok: false, error: 'Startzeit fehlt' }

  // 1. Minimal-Lead anlegen
  const { data: leadRow, error: leadErr } = await supabase
    .from('leads')
    .insert({
      vorname: input.vorname.trim(),
      nachname: input.nachname.trim(),
      telefon: input.telefon.trim(),
      email: input.email?.trim() || null,
      besichtigungsort_adresse: input.besichtigungsortAdresse.trim() || null,
      besichtigungsort_lat: input.besichtigungsortLat,
      besichtigungsort_lng: input.besichtigungsortLng,
      service_typ: 'nur_gutachter',
      status: 'qualifizierung',
      source_channel: 'dispatch_spontan',
      zugewiesen_an: user.id,
    })
    .select('id')
    .single()

  if (leadErr || !leadRow) {
    return { ok: false, error: leadErr?.message ?? 'Lead-Anlage fehlgeschlagen' }
  }
  const leadId = leadRow.id as string

  // 2. Termin reservieren (nutzt bestehende Action mit Konfliktcheck +
  //    Baseline-Fahrtzeit + In-App-Mitteilung an SV)
  const reserve = await reserveSvTerminForLead(leadId, input.svId, input.startIso, input.durationMin)
  if (!reserve.success) {
    // Lead nicht löschen — Dispatcher kann mit anderem SV nochmal versuchen.
    return { ok: false, leadId, error: reserve.error ?? 'Termin-Reservierung fehlgeschlagen' }
  }

  // 3. FlowLink optional senden (Onboarding-Link an Kunden)
  let flowlinkSent = false
  if (input.flowlinkKanal !== 'kein') {
    const flow = await sendFlowLinkMultiChannel(leadId, input.flowlinkKanal)
    flowlinkSent = !!flow.success
  }

  revalidatePath('/dispatch/kalender')
  revalidatePath('/dispatch/leads')
  return { ok: true, leadId, terminId: reserve.terminId, flowlinkSent }
}
