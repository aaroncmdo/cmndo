'use server'

// AAR-573 (V7): Manueller Phase-Override — nur für Admin-Rolle.
// Setzt `claims.phase` (snake_case Subphase aus dem CHECK-Constraint der
// Notion-State-Machine) auf einen beliebigen Wert, ohne den normalen
// Subphase-Resolver laufen zu lassen.
// CMM-44 SP-A2 (Cluster 3): claims.phase ist SSoT (vorher faelle.aktuelle_phase).
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
// AAR-664 (Folge): Konstante in eigene Datei extrahiert (siehe Memory
// `'use server'-Konstanten-Falle`). Hier nur noch importieren für die
// serverseitige Validierung — Client importiert direkt aus .constants.
import { ALLOWED_PHASE_VALUES } from './manual-phase-override.constants'

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

  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT)
  // -> via claim_id aus claims nested embed laden statt aus faelle.
  // CMM-44 SP-A2 (Cluster 3): aktuelle_phase -> claims.phase (SSoT) — claim_id
  // + phase aus dem Embed lesen, Subphase wird unten auf claims geschrieben.
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, claim_id, claims:claim_id(kundenbetreuer_id, phase, claim_nummer)')
    .eq('id', input.fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const kundenbetreuerId = (fallClaim?.kundenbetreuer_id as string | null) ?? null
  const claimId = (fall as { claim_id?: string | null }).claim_id ?? null
  if (!claimId) {
    return { success: false, error: 'Kein Claim mit dem Fall verknüpft' }
  }

  const alteSubphase = (fallClaim?.phase as string | null) ?? null
  if (alteSubphase === input.neueSubphase) {
    return { success: false, error: 'Subphase ist bereits der gewählte Wert', alteSubphase }
  }

  // CMM-44 SP-A2 (Cluster 3): direkter Update auf claims.phase (SSoT). Der
  // CHECK-Constraint der 52 zulaessigen Subphasen-Werte wandert mit dem
  // faelle.aktuelle_phase-Drop (PR2) auf claims.phase.
  const { error: updateErr } = await supabase
    .from('claims')
    .update({ phase: input.neueSubphase })
    .eq('id', claimId)
  if (updateErr) {
    return { success: false, error: updateErr.message, alteSubphase }
  }

  // AAR-585 (Variante A): Phase-Transition in phase_transitions schreiben.
  // Gibt der Timeline-History (AAR-571) echte Rows für manuell gesetzte Phasen.
  // Non-critical — Fehler hier darf den Override nicht blockieren.
  await supabase.from('phase_transitions').insert({
    fall_id: input.fallId,
    from_phase: alteSubphase,
    to_phase: input.neueSubphase,
    trigger_type: 'manual_admin',
    transitioned_by: user.id,
    actor_rolle: 'admin',
    grund: begruendung,
    payload: { override_grund: begruendung, alte_subphase: alteSubphase },
  }).then(({ error }) => {
    if (error) console.error('phase_transitions insert failed (non-critical):', error.message)
  })

  // Audit-Eintrag direkt in webhook_events — LexDrive-Processor nicht nötig,
  // da keine Auto-Side-Effects laufen sollen.
  await supabase.from('webhook_events').insert({
    event_id: `manual-${input.fallId}-phase-${Date.now()}`,
    event_type: 'manual_phase_override',
    fall_id: input.fallId,
    fall_nr: (fallClaim?.claim_nummer as string | null) ?? input.fallId.slice(0, 8),
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

    if (kundenbetreuerId && kundenbetreuerId !== user.id) {
      empfaenger.push({ id: kundenbetreuerId, rolle: 'kundenbetreuer' })
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

  revalidatePath(`/faelle/${input.fallId}`)
  revalidatePath(`/faelle/${input.fallId}/prozess`)
  revalidatePath(`/faelle/${input.fallId}/timeline`)

  return { success: true, alteSubphase }
}
