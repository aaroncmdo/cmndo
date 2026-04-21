'use server'

// AAR-560 (C11): Manueller Status-Override — nur für Admin-Rolle.
// Unterscheidet sich bewusst vom normalen state-machine-Pfad:
// - Keine Transition-Validation (darf alle faelle.status-Werte treffen)
// - Keine Auto-Side-Effects (WA, SLA-Crons, Tasks) — der Admin entscheidet
//   danach selbst ob er zusätzliche Events triggert
// - webhook_events-Audit + Mitteilungen an andere Admins + KB des Falls
//
// Use-Cases (aus Linear AAR-560): Legacy-Migration, Race-Condition-Recovery,
// außergerichtliche Einigung, Test/Staging.

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { processLexDriveEvent } from '@/lib/lexdrive/process-event'
import { createMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'

export const ALLOWED_STATUS_VALUES = [
  'onboarding',
  'ersterfassung',
  'sv-gesucht',
  'sv-zugewiesen',
  'sv-termin',
  'besichtigung',
  'begutachtung-laeuft',
  'gutachten-eingegangen',
  'filmcheck',
  'qc-pruefung',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'regulierung-laeuft',
  'vs-kuerzt',
  'vs-abgelehnt',
  'nachbesichtigung-laeuft',
  'klage',
  'zahlung-eingegangen',
  'abgeschlossen',
  'storniert',
] as const

export type FallStatusValue = (typeof ALLOWED_STATUS_VALUES)[number]

interface OverrideInput {
  fallId: string
  neuerStatus: FallStatusValue
  begruendung: string
}

export async function manualStatusOverride(input: OverrideInput): Promise<{
  success: boolean
  error?: string
  alterStatus?: string
}> {
  if (!input.fallId) return { success: false, error: 'fall_id fehlt' }
  if (!ALLOWED_STATUS_VALUES.includes(input.neuerStatus)) {
    return { success: false, error: `Ungültiger Status-Wert „${input.neuerStatus}"` }
  }
  const begruendung = input.begruendung.trim()
  if (begruendung.length < 10) {
    return { success: false, error: 'Begründung muss mindestens 10 Zeichen haben' }
  }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') {
    return { success: false, error: 'Nur Admin-Rolle darf Status manuell überschreiben' }
  }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, kundenbetreuer_id')
    .eq('id', input.fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const alterStatus = fall.status ?? 'unbekannt'
  if (alterStatus === input.neuerStatus) {
    return { success: false, error: 'Status ist bereits der gewählte Wert' }
  }

  const result = await processLexDriveEvent({
    fallId: input.fallId,
    fallNr: fall.fall_nummer ?? input.fallId.slice(0, 8),
    eventType: 'manual_status_override',
    payload: {
      neuer_status: input.neuerStatus,
      override_grund: begruendung,
      alter_status: alterStatus,
    },
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: user.id,
  })

  if (!result.success) {
    return { success: false, error: result.error, alterStatus }
  }

  // Mitteilungen an andere Admins + KB des Falls (NICHT Kunde, NICHT SV)
  const mitteilungTitel = `Status-Override: ${alterStatus} → ${input.neuerStatus}`
  const mitteilungBody = `${begruendung}\n\n— Durchgeführt von Admin ${user.email ?? user.id.slice(0, 8)}`

  try {
    const empfaenger: Array<{ id: string; rolle: 'admin' | 'kundenbetreuer' }> = []

    // Andere Admins finden (außer aktueller User)
    const { data: andereAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('rolle', 'admin')
      .neq('id', user.id)
    for (const a of andereAdmins ?? []) {
      empfaenger.push({ id: a.id, rolle: 'admin' })
    }

    // KB des Falls (wenn nicht der handelnde Admin selbst)
    if (fall.kundenbetreuer_id && fall.kundenbetreuer_id !== user.id) {
      empfaenger.push({ id: fall.kundenbetreuer_id, rolle: 'kundenbetreuer' })
    }

    if (empfaenger.length > 0) {
      await createMitteilungMulti(empfaenger, {
        kategorie: 'update',
        titel: mitteilungTitel,
        inhalt: mitteilungBody,
        kontext_typ: 'fall',
        kontext_id: input.fallId,
        prioritaet: 'hoch',
        absender_id: user.id,
        absender_name: user.email ?? undefined,
      })
    }
  } catch {
    // Mitteilungen sind non-critical — Audit liegt bereits in webhook_events
  }

  revalidatePath(`/faelle/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}/prozess`)
  revalidatePath(`/faelle/${input.fallId}/timeline`)

  return { success: true, alterStatus }
}
