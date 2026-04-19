'use server'

// AAR-573 (V7): Manueller Phase-Override — nur für Admin-Rolle.
// Setzt `faelle.aktuelle_phase` (snake_case Subphase aus dem CHECK-Constraint
// der Notion-State-Machine) auf einen beliebigen Wert, ohne den normalen
// Subphase-Resolver laufen zu lassen.
//
// Unterscheidet sich vom bestehenden manual-status-override (AAR-560/C11):
// Dort wird `faelle.status` (21 grobe Werte) gesetzt. Hier wird die feine
// Subphase (52 Werte) gesetzt — gedacht für Fine-Tuning der Kunden-/SV-
// Sichtbarkeit (Visibility-Matrix filtert danach), ohne das Status-Feld
// zu berühren.
//
// Audit: webhook_events (Typ `manual_phase_override`) + Mitteilung an andere
// Admins + KB des Falls. Keine Auto-Side-Effects (keine WA, keine SLA-Crons,
// keine Tasks).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'
import { SUBPHASE_VISIBILITY } from '@/lib/fall/subphase-visibility'

export const ALLOWED_PHASE_VALUES = Object.keys(SUBPHASE_VISIBILITY) as readonly string[]

interface OverrideInput {
  fallId: string
  neueSubphase: string
  begruendung: string
}

export async function manualPhaseOverride(input: OverrideInput): Promise<{
  success: boolean
  error?: string
  alteSubphase?: string | null
}> {
  if (!input.fallId) return { success: false, error: 'fall_id fehlt' }
  if (!ALLOWED_PHASE_VALUES.includes(input.neueSubphase)) {
    return { success: false, error: `Ungültige Subphase „${input.neueSubphase}"` }
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
    return { success: false, error: 'Nur Admin-Rolle darf Subphasen manuell überschreiben' }
  }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, aktuelle_phase, kundenbetreuer_id')
    .eq('id', input.fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const alteSubphase = (fall.aktuelle_phase as string | null) ?? null
  if (alteSubphase === input.neueSubphase) {
    return { success: false, error: 'Subphase ist bereits der gewählte Wert', alteSubphase }
  }

  // Direkter Update auf faelle.aktuelle_phase — CHECK-Constraint der Migration
  // aar557_nachzug prüft die 52 zulässigen Werte serverseitig.
  const { error: updateErr } = await supabase
    .from('faelle')
    .update({ aktuelle_phase: input.neueSubphase })
    .eq('id', input.fallId)
  if (updateErr) {
    return { success: false, error: updateErr.message, alteSubphase }
  }

  // Audit-Eintrag direkt in webhook_events — LexDrive-Processor nicht nötig,
  // da keine Auto-Side-Effects laufen sollen.
  await supabase.from('webhook_events').insert({
    event_id: `manual-${input.fallId}-phase-${Date.now()}`,
    event_type: 'manual_phase_override',
    fall_id: input.fallId,
    fall_nr: fall.fall_nummer ?? input.fallId.slice(0, 8),
    source: 'manual_admin',
    user_id: user.id,
    payload: {
      alte_subphase: alteSubphase,
      neue_subphase: input.neueSubphase,
      override_grund: begruendung,
    },
    status: 'processed',
  })

  const mitteilungTitel = `Subphase-Override: ${alteSubphase ?? '∅'} → ${input.neueSubphase}`
  const mitteilungBody = `${begruendung}\n\n— Durchgeführt von Admin ${user.email ?? user.id.slice(0, 8)}`

  try {
    const empfaenger: Array<{ id: string; rolle: 'admin' | 'kundenbetreuer' }> = []

    const { data: andereAdmins } = await supabase
      .from('profiles')
      .select('id')
      .eq('rolle', 'admin')
      .neq('id', user.id)
    for (const a of andereAdmins ?? []) {
      empfaenger.push({ id: a.id, rolle: 'admin' })
    }

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
    // Mitteilungen non-critical — Audit liegt in webhook_events
  }

  revalidatePath(`/admin/faelle/${input.fallId}`)
  revalidatePath(`/admin/faelle/${input.fallId}/prozess`)
  revalidatePath(`/admin/faelle/${input.fallId}/timeline`)

  return { success: true, alteSubphase }
}
