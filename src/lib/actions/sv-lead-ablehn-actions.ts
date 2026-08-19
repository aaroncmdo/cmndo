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
  // CMM-44 SP-B PR2a: claim_id fuer sv_zugewiesen_am-Clear auf claims (SSoT).
  // CMM-49 (faelle-Drop-Runway): Anker auf faelle_claim_bridge statt .from('faelle')
  // (Admin-Client -> kein RLS-Belang; bridge.fall_id == faelle.id, 1:1). sv_id +
  // lead_preis_netto aus claims (SSoT, div=0); der faelle.lead_preis_netto-Legacy-
  // Fallback ist tot (0 claim-lose faelle).
  const { data: fall } = await db
    .from('faelle_claim_bridge')
    .select('fall_id, claim_id, claims:claims!fk_bridge_claim(claim_nummer, operative_status, lead_preis_netto, sv_id)')
    .eq('fall_id', fallId)
    .single()

  if (!fall) return { ok: false, error: 'Fall nicht gefunden' }
  const fallClaimObj = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const fallClaimNummer = (fallClaimObj as { claim_nummer?: string | null } | null)?.claim_nummer ?? null
  const fallSvId = (fallClaimObj as { sv_id?: string | null } | null)?.sv_id ?? null
  if (fallSvId !== sv.id) return { ok: false, error: 'Nicht zugewiesen' }
  // CMM-74 b2 reader-fallback-drop: Status-Gate NUR auf claims.operative_status (SSoT) — der
  // faelle.status-Fallback ist entfernt, da operative_status vollstaendig ist (alle Creator + Backfill, #2884).
  const fallStatus = (fallClaimObj as { operative_status?: string | null } | null)?.operative_status ?? null
  if (!['sv-zugewiesen', 'sv-termin'].includes(fallStatus as string)) {
    return { ok: false, error: 'Lead kann in diesem Status nicht mehr abgelehnt werden' }
  }

  const grundLabel = `lead_abgelehnt_${grund}${begruendung ? `: ${begruendung}` : ''}`

  // 1. revertCaseBilling falls Preis schon berechnet.
  // CMM-44 Phase 3 / CMM-49: lead_preis_netto aus claims (SSoT). Der faelle-Legacy-
  // Fallback entfiel mit dem Bridge-Anker (jede faelle hat einen claim, div=0).
  const leadPreisVal = (fallClaimObj as { lead_preis_netto?: number | null } | null)?.lead_preis_netto
  if (leadPreisVal != null && Number(leadPreisVal) > 0) {
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

  // 3. SV-Felder clearen damit Dispatch neu zuweisen kann.
  // CMM-49 faelle-DROP: sv_id + sv_zugewiesen_am claims-direkt (SSoT; claims.id == fall_id).
  // sv_termin war ein faelle-only-Legacy-Feld (faelle gedroppt) — der Termin-Lifecycle liegt
  // kanonisch in der Termin-Engine (gutachter_termine, AAR-552); kein faelle-Write mehr.
  const fallClaimId = (fall as { claim_id?: string | null }).claim_id ?? null
  if (fallClaimId) {
    // Ohne das Clearing bleibt der ablehnende Gutachter am Fall haengen — Dispatch
    // kann dann nicht neu zuweisen.
    const { error: clearFehler } = await db.from('claims').update({ sv_id: null, sv_zugewiesen_am: null }).eq('id', fallClaimId)
    if (clearFehler) {
      console.error(`[sv-lead-ablehn] SV-Felder nicht geleert (Claim ${fallClaimId}) — Neuzuweisung blockiert:`, clearFehler.message)
    }
  }

  // 4. Dispatch-Task fuer Re-Allocation
  try {
    await createLinkedTask({
      fall_id: fallId,
      titel: `SV hat Lead abgelehnt — neuen SV zuweisen (Fall ${fallClaimNummer ?? fallId.slice(0, 8)})`,
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
