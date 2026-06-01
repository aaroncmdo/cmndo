'use server'

// AAR-840 / CMM-44 MP-8: Manuelle Endzustand-Server-Actions.
//
// KB/Admin triggern diese in der Fallakte. Sie setzen claims.status; die Phase
// wird daraus via v_claim_phase / getClaimLifecycle ABGELEITET (kein Trigger mehr —
// trg_claims_set_phase in MP-6c gedroppt). Hier setzen wir nur status +
// Endzustand-Audit-Felder.
//
// Terminal (Abschluss):  reguliert_vollstaendig / abgelehnt_final / storniert /
//                        an_externe_kanzlei_uebergeben / klage_rechtsstreit / verjaehrt
// Nicht-terminal (Regulierung): in_kommunikation_vs / abgelehnt (einfach, nachforderbar)

import { revalidatePath } from 'next/cache'
import { requireRole, type AuthedUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'

type ActionResult = { ok: true } | { ok: false; error: string }

// ── Shared Helpers ─────────────────────────────────────────────────────────

// Terminale Status — aus diesen heraus ist KEIN weiterer Übergang erlaubt (Guard in
// setEndzustandFields). `abgelehnt` (einfach) + `in_kommunikation_vs` sind bewusst NICHT
// terminal → nachforderbar/eskalierbar.
const ENDZUSTAENDE = [
  'reguliert_vollstaendig', 'storniert', 'klage_rechtsstreit',
  'verjaehrt', 'abgelehnt_final', 'an_externe_kanzlei_uebergeben',
  // AAR-939: nur_gutachter/embed-B Terminal (Termin durchgeführt, kein Regulierungs-Tail).
  // Wird per Auto-Close gesetzt durch die SV-Action markNurGutachterTerminDurchgefuehrt
  // (3c) am durchgefuehrt_am-Event, nicht manuell über diese KB/Admin-Actions.
  'termin_durchgefuehrt',
] as const

async function loadClaimContext(claimId: string): Promise<
  | { ok: true; fallId: string; status: string | null; work_state: string | null; kbId: string | null }
  | { ok: false; error: string }
> {
  const admin = createAdminClient()
  const { data: claim, error: claimErr } = await admin
    .from('claims')
    .select('id, status, work_state, kundenbetreuer_id')
    .eq('id', claimId)
    .maybeSingle()

  if (claimErr || !claim) return { ok: false, error: 'Claim nicht gefunden' }

  const { data: fall } = await admin
    .from('faelle')
    .select('id')
    .eq('claim_id', claimId)
    .maybeSingle()

  if (!fall) return { ok: false, error: 'Kein Fall für diesen Claim' }

  return {
    ok: true,
    fallId: fall.id as string,
    status: (claim.status as string | null) ?? null,
    work_state: (claim.work_state as string | null) ?? null,
    kbId: (claim.kundenbetreuer_id as string | null) ?? null,
  }
}

function authorizedForClaim(user: AuthedUser, kbId: string | null): boolean {
  if (user.rolle === 'admin') return true
  if (user.rolle === 'kundenbetreuer' && kbId === user.id) return true
  return false
}

async function writeAudit(
  fallId: string,
  fromPhase: string | null,
  toPhase: string,
  user: AuthedUser,
  grund: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('phase_transitions')
    .insert({
      fall_id:        fallId,
      from_phase:     fromPhase,
      to_phase:       toPhase,
      transition_at:  new Date().toISOString(),
      transitioned_by: user.id,
      actor_rolle:    user.rolle,
      trigger_type:   'manual',
      grund,
    })
  if (error) console.error('[AAR-840] phase_transitions insert failed:', error.message)
}

async function setEndzustandFields(
  claimId: string,
  fields: Record<string, unknown>,
  user: AuthedUser,
  grund: string,
  guardStatus: readonly string[],
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  // Atomar: nur updaten wenn aktueller Status nicht bereits final
  const { data, error } = await admin
    .from('claims')
    .update({
      ...fields,
      endzustand_gesetzt_durch_user_id: user.id,
      endzustand_gesetzt_am:            new Date().toISOString(),
      endzustand_grund:                 grund,
    })
    .eq('id', claimId)
    .not('status', 'in', `(${guardStatus.map((s) => `"${s}"`).join(',')})`)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Claim ist bereits in einem Endzustand' }
  return { ok: true }
}

// ── 1) markClaimAsInKommunikationVs ────────────────────────────────────────

export async function markClaimAsInKommunikationVs(input: {
  claim_id: string
  grund: string
  notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (!input.grund?.trim()) return { ok: false, error: 'grund ist Pflicht' }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx

  if (!authorizedForClaim(auth.user, ctx.kbId)) {
    return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  }

  // Validierung: KB muss den Fall tragen (work_state=in_bearbeitung), bevor er in
  // die VS-Kommunikation geht. D2/T1.1b: Dispatch/Processing lebt auf work_state.
  if (ctx.work_state !== 'in_bearbeitung') {
    return { ok: false, error: `Übergang ${ctx.work_state ?? 'null'} → in_kommunikation_vs nicht erlaubt (work_state muss in_bearbeitung sein)` }
  }

  const set = await setEndzustandFields(
    input.claim_id,
    { status: 'in_kommunikation_vs' },
    auth.user,
    input.grund,
    ENDZUSTAENDE,
  )
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }

  await writeAudit(ctx.fallId, null, 'regulierung:versicherungskontakt', auth.user, input.grund)

  if (input.notify_customer) {
    try {
      await emitEvent(
        'claim.in_kommunikation_vs',
        { claimId: input.claim_id, fallId: ctx.fallId, grund: input.grund },
        { fallId: ctx.fallId, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[AAR-840] emit claim.in_kommunikation_vs failed:', err)
    }
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}

// ── 2) markClaimAsReguliert ────────────────────────────────────────────────

export async function markClaimAsReguliert(input: {
  claim_id: string
  regulierungs_betrag: number
  grund?: string
  notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (!(input.regulierungs_betrag > 0)) {
    return { ok: false, error: 'regulierungs_betrag muss positiv sein' }
  }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx
  if (!authorizedForClaim(auth.user, ctx.kbId)) {
    return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  }

  const grund = input.grund ?? `Regulierung ${input.regulierungs_betrag.toFixed(2)} EUR akzeptiert`

  const set = await setEndzustandFields(
    input.claim_id,
    { status: 'reguliert_vollstaendig', regulierungs_betrag: input.regulierungs_betrag },
    auth.user,
    grund,
    ENDZUSTAENDE,
  )
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }

  await writeAudit(ctx.fallId, null, 'abschluss:erfolgreich_reguliert', auth.user, grund)

  const notify = input.notify_customer ?? true
  if (notify) {
    try {
      await emitEvent(
        'claim.reguliert',
        {
          claimId: input.claim_id,
          fallId:  ctx.fallId,
          betragEur: input.regulierungs_betrag,
          grund,
        },
        { fallId: ctx.fallId, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[AAR-840] emit claim.reguliert failed:', err)
    }
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}

// ── 3) markClaimAsAbgelehnt ────────────────────────────────────────────────

export async function markClaimAsAbgelehnt(input: {
  claim_id: string
  vs_ablehnungs_grund: string
  grund_freitext?: string
  /** true = finale Ablehnung (terminal → Abschluss); false/undefined = einfache
   *  Ablehnung (nicht-terminal → Regulierung/Nachforderung, nachforderbar). */
  final?: boolean
  notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (!input.vs_ablehnungs_grund?.trim()) {
    return { ok: false, error: 'vs_ablehnungs_grund ist Pflicht' }
  }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx
  if (!authorizedForClaim(auth.user, ctx.kbId)) {
    return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  }

  const grund = input.grund_freitext ?? `Ablehnung wegen ${input.vs_ablehnungs_grund}`

  const set = await setEndzustandFields(
    input.claim_id,
    { status: input.final ? 'abgelehnt_final' : 'abgelehnt', vs_ablehnungs_grund: input.vs_ablehnungs_grund },
    auth.user,
    grund,
    ENDZUSTAENDE,
  )
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }

  await writeAudit(
    ctx.fallId, null,
    input.final ? 'abschluss:abgelehnt_final' : 'regulierung:nachforderung',
    auth.user, grund,
  )

  const notify = input.notify_customer ?? true
  if (notify) {
    try {
      await emitEvent(
        'claim.abgelehnt',
        {
          claimId: input.claim_id,
          fallId:  ctx.fallId,
          vsAblehnungsGrund: input.vs_ablehnungs_grund,
          grundFreitext: input.grund_freitext,
        },
        { fallId: ctx.fallId, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[AAR-840] emit claim.abgelehnt failed:', err)
    }
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}

// ── 4) markClaimAsStorniert ────────────────────────────────────────────────

export async function markClaimAsStorniert(input: {
  claim_id: string
  grund: string
  notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (!input.grund?.trim()) return { ok: false, error: 'grund ist Pflicht' }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx
  if (!authorizedForClaim(auth.user, ctx.kbId)) {
    return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  }

  const set = await setEndzustandFields(
    input.claim_id,
    { status: 'storniert' },
    auth.user,
    input.grund,
    ENDZUSTAENDE,
  )
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }

  await writeAudit(ctx.fallId, null, 'abschluss:storniert', auth.user, input.grund)

  const notify = input.notify_customer ?? false
  if (notify) {
    try {
      await emitEvent(
        'claim.storniert',
        { claimId: input.claim_id, fallId: ctx.fallId, grund: input.grund },
        { fallId: ctx.fallId, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[AAR-840] emit claim.storniert failed:', err)
    }
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}

// ── 5) markClaimAsAnExterneKanzlei ─────────────────────────────────────────
// Wird primär aus AAR-841 (sendKanzleiPaket) aufgerufen, daher minimal-API.

export async function markClaimAsAnExterneKanzlei(input: {
  claim_id: string
  kanzlei_name: string
  uebergabe_datum: string
  grund?: string
  notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (!input.kanzlei_name?.trim()) return { ok: false, error: 'kanzlei_name ist Pflicht' }
  if (!input.uebergabe_datum) return { ok: false, error: 'uebergabe_datum ist Pflicht' }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx
  if (!authorizedForClaim(auth.user, ctx.kbId)) {
    return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  }

  const grund =
    input.grund ?? `Übergabe an ${input.kanzlei_name} am ${input.uebergabe_datum}`

  const set = await setEndzustandFields(
    input.claim_id,
    { status: 'an_externe_kanzlei_uebergeben' },
    auth.user,
    grund,
    ENDZUSTAENDE,
  )
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }

  await writeAudit(ctx.fallId, null, 'abschluss:an_externe_kanzlei', auth.user, grund)

  const notify = input.notify_customer ?? true
  if (notify) {
    try {
      await emitEvent(
        'claim.an_externe_kanzlei_uebergeben',
        {
          claimId:        input.claim_id,
          fallId:         ctx.fallId,
          kanzleiName:    input.kanzlei_name,
          uebergabeDatum: input.uebergabe_datum,
          grund,
        },
        { fallId: ctx.fallId, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[AAR-840] emit claim.an_externe_kanzlei_uebergeben failed:', err)
    }
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}

// ── 6) markClaimAsKlage ────────────────────────────────────────────────────
// CMM-44 MP-8: Klage / Rechtsstreit als terminaler Abschluss-Zustand.

export async function markClaimAsKlage(input: {
  claim_id: string
  grund: string
  notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (!input.grund?.trim()) return { ok: false, error: 'grund ist Pflicht' }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx
  if (!authorizedForClaim(auth.user, ctx.kbId)) {
    return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  }

  const set = await setEndzustandFields(
    input.claim_id,
    { status: 'klage_rechtsstreit' },
    auth.user,
    input.grund,
    ENDZUSTAENDE,
  )
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }

  await writeAudit(ctx.fallId, null, 'abschluss:klage_rechtsstreit', auth.user, input.grund)

  const notify = input.notify_customer ?? true
  if (notify) {
    try {
      await emitEvent(
        'claim.klage_rechtsstreit',
        { claimId: input.claim_id, fallId: ctx.fallId, grund: input.grund },
        { fallId: ctx.fallId, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[MP-8] emit claim.klage_rechtsstreit failed:', err)
    }
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}

// ── 7) markClaimAsVerjaehrt ────────────────────────────────────────────────
// CMM-44 MP-8: Verjährung als terminaler Abschluss-Zustand (intern; Kunde
// default-still — notify_customer defaultet auf false).

export async function markClaimAsVerjaehrt(input: {
  claim_id: string
  grund: string
  notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }

  if (!input.grund?.trim()) return { ok: false, error: 'grund ist Pflicht' }

  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx
  if (!authorizedForClaim(auth.user, ctx.kbId)) {
    return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  }

  const set = await setEndzustandFields(
    input.claim_id,
    { status: 'verjaehrt' },
    auth.user,
    input.grund,
    ENDZUSTAENDE,
  )
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }

  await writeAudit(ctx.fallId, null, 'abschluss:verjaehrt', auth.user, input.grund)

  const notify = input.notify_customer ?? false
  if (notify) {
    try {
      await emitEvent(
        'claim.verjaehrt',
        { claimId: input.claim_id, fallId: ctx.fallId, grund: input.grund },
        { fallId: ctx.fallId, triggeredBy: auth.user.id },
      )
    } catch (err) {
      console.error('[MP-8] emit claim.verjaehrt failed:', err)
    }
  }

  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}
