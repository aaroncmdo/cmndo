'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { revertCaseBilling } from '@/lib/abrechnung/revert-case-billing'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { revalidatePath } from 'next/cache'

/**
 * Folge-Ticket aus AAR-926: SV-Lead-Ablehnung-Pfad. Audit
 * docs/12.05.2026/abrechnung-audit.md Abschnitt 2: "SV bezahlt fuer Leads die
 * er nicht annehmen will" — bisher kein Code-Pfad, jetzt diese Server-Action.
 *
 * SV im Portal-Fallakte kann zugewiesenen Lead ablehnen:
 * - Voraussetzungen: SV ist der aktuell zugewiesene sv_id, Status in
 *   {sv-zugewiesen, sv-termin} (vor Besichtigung).
 * - Grund Pflicht (Enum oder min. 20 Zeichen Freitext)
 * - State-Machine: Status zurueck auf sv-gesucht
 * - revertCaseBilling falls lead_preis_netto schon gesetzt war
 * - sv_id, sv_zugewiesen_am, sv_termin gecleart (damit Dispatch neu zuweisen kann)
 * - Dispatch-Task automatisch fuer Re-Allocation
 */

export type AblehnungsGrund =
  | 'terminkonflikt'
  | 'kein_haftpflichtschaden'
  | 'entfernung'
  | 'kapazitaet'
  | 'sonstiges'

export async function lehneLeadAb(
  fallId: string,
  grund: AblehnungsGrund,
  begruendung?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein SV-Profil' }

  // Bei "sonstiges" min. 20 Zeichen Begründung
  if (grund === 'sonstiges' && (!begruendung || begruendung.trim().length < 20)) {
    return { ok: false, error: 'Begründung muss mindestens 20 Zeichen lang sein' }
  }

  const db = createAdminClient()

  // Fall laden + Eigentumspruefung
  const { data: fall } = await db
    .from('faelle')
    .select('id, sv_id, status, lead_preis_netto, fall_nummer')
    .eq('id', fallId)
    .single()

  if (!fall) return { ok: false, error: 'Fall nicht gefunden' }
  if (fall.sv_id !== sv.id) return { ok: false, error: 'Nicht zugewiesen' }
  if (!['sv-zugewiesen', 'sv-termin'].includes(fall.status as string)) {
    return { ok: false, error: 'Lead kann in diesem Status nicht mehr abgelehnt werden' }
  }

  const grundLabel = `lead_abgelehnt_${grund}${begruendung ? `: ${begruendung}` : ''}`

  // 1. revertCaseBilling falls Preis schon berechnet
  if (fall.lead_preis_netto != null && Number(fall.lead_preis_netto) > 0) {
    try {
      await revertCaseBilling(fallId, grundLabel, user.id)
    } catch (err) {
      console.error('[lead-ablehn] revertCaseBilling fehlgeschlagen:', err)
      // weiter — Status-Wechsel ist wichtiger als Cleanup
    }
  }

  // 2. State-Machine-Trigger: status zurueck auf sv-gesucht
  try {
    await transitionFallStatus(fallId, 'sv-gesucht', { grund: grundLabel, user_id: user.id })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Status-Wechsel fehlgeschlagen' }
  }

  // 3. SV-Felder clearen damit Dispatch neu zuweisen kann
  await db.from('faelle').update({
    sv_id: null,
    sv_zugewiesen_am: null,
    sv_termin: null,
  }).eq('id', fallId)

  // 4. Dispatch-Task fuer Re-Allocation
  try {
    await createLinkedTask({
      fall_id: fallId,
      titel: `SV hat Lead abgelehnt — neuen SV zuweisen (Fall ${fall.fall_nummer ?? fallId.slice(0, 8)})`,
      typ: 'dispatch',
      prioritaet: 'dringend',
      faellig_am: new Date(),
      entity_type: 'case',
      entity_id: fallId,
      trigger_event: 'lead_abgelehnt',
    })
  } catch (err) {
    console.error('[lead-ablehn] Dispatch-Task-Erstellung fehlgeschlagen (non-critical):', err)
  }

  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/admin/faelle')
  revalidatePath(`/dispatch/leads/${fallId}`)

  return { ok: true }
}
