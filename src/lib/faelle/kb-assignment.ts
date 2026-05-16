// AAR-427: Zentrale Kundenbetreuer-Auto-Zuweisung mit Admin-Fallback
//
// Kaskadierender Fallback bei der Lead→Fall-Konversion (und künftigen
// Re-Assignments):
//
//   1. Primär   → aktiver KB mit freier Kapazität (Round-Robin via Auslastung)
//   2. Sekundär → erster aktiver Admin übernimmt temporär die KB-Rolle,
//                  Fall bekommt kundenbetreuer_fallback_flag = true
//   3. Tertiär  → weder KB noch Admin verfügbar: Timeline-Eintrag + Error-Log,
//                  Fall bleibt unbezogen (kundenbetreuer_id = NULL)
//
// CMM/SoT-Konvention: claim ist die Single Source of Truth. Jeder Write der
// kundenbetreuer_id muss auf BEIDEN Tabellen passieren (claims + faelle),
// solange faelle.kundenbetreuer_id noch existiert. Helper updateKbOnFallAndClaim()
// kapselt das. Vor diesem Sweep wurde nur faelle geschrieben → Drift in 6/13 Fällen.
//
// Wird aufgerufen aus admin/dispatch/actions.ts (signSAandCreateFall-Flow)
// und kann später für Re-Assignments wiederverwendet werden.
//
// Sicherheit: nutzt den übergebenen Supabase-Client so wie er ist —
// der Caller entscheidet RLS (Server-Action läuft als eingeloggter Dispatcher
// oder Admin, hat damit schon Schreib-Rechte auf faelle).

import type { SupabaseClient } from '@supabase/supabase-js'

// Client-Type: wir nehmen den Server-Action-Client (nicht den Admin-Client),
// aber die Signatur ist bewusst generisch damit sowohl server.ts als auch
// admin.ts Clients reinpassen. Queries sind read-only bzw. update-only
// auf Spalten die für Dispatch/Admin via RLS erlaubt sind.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

export type KbAssignmentFallback = 'none' | 'admin' | 'error'

export type KbAssignmentResult = {
  success: boolean
  kundenbetreuer_id: string | null
  fallback_used: KbAssignmentFallback
  reason?: string
}

type ProfileLite = { id: string; email: string | null; kapazitaet_max: number | null }

/**
 * SoT-Helper: schreibt kundenbetreuer_id auf `claims` (SSoT) und die
 * Begleit-Felder auf `faelle`.
 *
 * CMM-44 SP-A: kundenbetreuer_id ist eine claims-Duplikat-Spalte — der Write
 * geht nur noch auf claims, die faelle-Spalte wird in PR2 gedroppt (bis dahin
 * spiegelt der Sync-Trigger sie zurueck). `fallback_flag` und `zugewiesen_am`
 * sind faelle-only Spalten und bleiben auf dem faelle-Update.
 */
async function updateKbOnFallAndClaim(
  supabase: AnySupabase,
  fallId: string,
  kbId: string,
  fallbackFlag: boolean,
): Promise<void> {
  const now = new Date().toISOString()
  const { data: fall } = await supabase
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()

  await supabase
    .from('faelle')
    .update({
      kundenbetreuer_fallback_flag: fallbackFlag,
      kundenbetreuer_zugewiesen_am: now,
    })
    .eq('id', fallId)

  const claimId = (fall?.claim_id as string | null) ?? null
  if (claimId) {
    await supabase.from('claims').update({ kundenbetreuer_id: kbId }).eq('id', claimId)
  }
}

/**
 * Findet den KB mit den wenigsten offenen Fällen unter der Kapazitätsgrenze.
 * Round-Robin via Auslastung: wer am wenigsten Fälle hat, bekommt den nächsten.
 *
 * Rückgabe: `null` wenn kein aktiver KB existiert. Ein KB ohne freie
 * Kapazität wird zurückgegeben (Least-Busy-Fallback) — die zweite
 * Eskalations-Stufe Admin-Fallback greift nur wenn gar kein KB da ist.
 */
export async function findAvailableKB(supabase: AnySupabase): Promise<ProfileLite | null> {
  const { data: betreuer } = await supabase
    .from('profiles')
    .select('id, email, kapazitaet_max')
    .eq('rolle', 'kundenbetreuer')
    .eq('aktiv', true)

  const list = (betreuer ?? []) as ProfileLite[]
  if (list.length === 0) return null

  const ids = list.map(p => p.id)
  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT).
  // Auslastung wird ueber claims gezaehlt, der Workflow-Status (abgeschlossen/
  // storniert) liegt weiterhin auf faelle und wird via nested join geprueft.
  const { data: claimsRows } = await supabase
    .from('claims')
    .select('kundenbetreuer_id, faelle:faelle!faelle_claim_id_fkey(status)')
    .in('kundenbetreuer_id', ids)

  const counts: Record<string, number> = {}
  for (const id of ids) counts[id] = 0
  for (const c of (claimsRows ?? []) as Array<{
    kundenbetreuer_id: string | null
    faelle?: { status: string | null } | { status: string | null }[] | null
  }>) {
    if (!c.kundenbetreuer_id) continue
    const fallJoin = Array.isArray(c.faelle) ? c.faelle[0] : c.faelle
    const status = fallJoin?.status ?? null
    if (status === 'abgeschlossen' || status === 'storniert') continue
    counts[c.kundenbetreuer_id] = (counts[c.kundenbetreuer_id] ?? 0) + 1
  }

  const eligible = list.filter(p => counts[p.id] < (p.kapazitaet_max ?? 100))
  if (eligible.length === 0) {
    // Alle über Kapazität — trotzdem den Least-Busy nehmen (besser als kein KB)
    return list.reduce((min, p) => (counts[p.id] < counts[min.id] ? p : min), list[0])
  }
  return eligible.reduce((min, p) => (counts[p.id] < counts[min.id] ? p : min), eligible[0])
}

/**
 * Findet den "ersten" aktiven Admin (ältester Account zuerst). Wird nur
 * genutzt wenn `findAvailableKB` nichts liefert.
 */
export async function findFirstActiveAdmin(supabase: AnySupabase): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, kapazitaet_max')
    .eq('rolle', 'admin')
    .eq('aktiv', true)
    .order('created_at', { ascending: true })
    .limit(1)
  const list = (data ?? []) as ProfileLite[]
  return list[0] ?? null
}

type AssignOptions = {
  /** Falls true, schreibt die Zuweisung direkt in die `faelle`-Zeile.
   *  Default false — der Caller (signSAandCreateFall) schreibt das Insert
   *  ohnehin und nimmt nur die IDs + Flags aus dem Ergebnis. */
  writeToFall?: boolean
  /** Zusätzliche Timeline-Notiz (optional, der Caller loggt die Konversion
   *  ohnehin separat). */
  logToTimeline?: boolean
}

/** Match-Hinweise für Sticky-KB-Lookup vor Round-Robin. */
export type StickyKbHints = {
  /** User-ID des Kunden falls bereits verknüpft (z.B. nach manuellem Match). */
  kunde_id?: string | null
  /** Lead-ID — über lead.email/telefon finden wir Anrufer + Halter. */
  lead_id?: string | null
  /** Direkte Kontakt-Werte (für Konversion ohne Lead-Row). */
  kontakte?: Array<{ email?: string | null; telefon?: string | null }>
}

/**
 * Sticky-KB: gibt den KB zurück, der diesen Kunden / Ansprechpartner
 * bereits in einem anderen aktiven Fall betreut. Match-Quellen:
 *   1. Direkte kunde_id-Verknüpfung (faelle.kundenbetreuer_id)
 *   2. claim_parties mit gleicher email/telefon (KB des verlinkten Falls)
 *   3. Anderer Lead mit gleicher email/telefon → daraus konvertierter Fall
 *
 * KB muss aktiv sein (`profiles.aktiv=true`), sonst NULL → Caller fällt
 * auf Round-Robin zurück. Kapazität wird absichtlich ignoriert — Sticky
 * schlägt Round-Robin auch bei voller Kapazität (Kontinuität > Workload).
 */
export async function findStickyKb(
  supabase: AnySupabase,
  hints: StickyKbHints,
): Promise<{ kb_id: string; quelle: 'kunde_id' | 'claim_parties' | 'leads' } | null> {
  // 1. Direkte kunde_id-Verknüpfung
  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT).
  // faelle.kunde_id (faelle-only) bleibt das Match-Kriterium; kundenbetreuer_id
  // + Profil-Join kommen ueber den verknuepften claims-Datensatz.
  if (hints.kunde_id) {
    const { data: kbFall } = await supabase
      .from('faelle')
      .select(
        'claims:claim_id(kundenbetreuer_id, profiles!claims_kundenbetreuer_id_fkey(id, aktiv, rolle))',
      )
      .eq('kunde_id', hints.kunde_id)
      .not('claim_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const claimJoin = (kbFall as {
      claims?:
        | {
            kundenbetreuer_id: string | null
            profiles?: { aktiv?: boolean; rolle?: string } | { aktiv?: boolean; rolle?: string }[] | null
          }
        | {
            kundenbetreuer_id: string | null
            profiles?: { aktiv?: boolean; rolle?: string } | { aktiv?: boolean; rolle?: string }[] | null
          }[]
        | null
    } | null)?.claims
    const claimRow = Array.isArray(claimJoin) ? claimJoin[0] : claimJoin
    const kbId = (claimRow?.kundenbetreuer_id as string | null) ?? null
    const profileJoin = claimRow?.profiles
    const profileRow = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin
    // Sticky-KB nur akzeptieren wenn Rolle KB oder Admin (nicht Dispatch)
    if (
      kbId &&
      profileRow?.aktiv &&
      ['kundenbetreuer', 'admin'].includes((profileRow.rolle as string) ?? '')
    ) {
      return { kb_id: kbId, quelle: 'kunde_id' }
    }
  }

  // 2./3. Über Kontakt-Werte (E-Mail / Telefon) auf claim_parties + leads
  const kontakte = hints.kontakte ?? []
  if (hints.lead_id && kontakte.length === 0) {
    const { data: lead } = await supabase
      .from('leads')
      .select('email, telefon, halter_email, halter_telefon')
      .eq('id', hints.lead_id)
      .maybeSingle()
    if (lead) {
      kontakte.push({ email: lead.email as string | null, telefon: lead.telefon as string | null })
      if (lead.halter_email || lead.halter_telefon) {
        kontakte.push({
          email: lead.halter_email as string | null,
          telefon: lead.halter_telefon as string | null,
        })
      }
    }
  }

  for (const k of kontakte) {
    const filters: string[] = []
    if (k.email) filters.push(`email.ilike.${k.email}`)
    if (k.telefon) filters.push(`telefon.eq.${k.telefon}`)
    if (filters.length === 0) continue

    // claim_parties → claim → faelle.kundenbetreuer_id
    const { data: parties } = await supabase
      .from('claim_parties')
      .select('claim_id, email, telefon')
      .or(filters.join(','))
      .limit(5)
    const claimIds = ((parties ?? []) as Array<{ claim_id: string }>).map((p) => p.claim_id)
    if (claimIds.length > 0) {
      // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims =
      // SSoT). Da wir die claim_ids ohnehin haben, lesen wir direkt auf claims
      // statt ueber faelle.
      const { data: kbClaims } = await supabase
        .from('claims')
        .select('kundenbetreuer_id, id, profiles!claims_kundenbetreuer_id_fkey(id, aktiv, rolle)')
        .in('id', claimIds)
        .not('kundenbetreuer_id', 'is', null)
        .order('created_at', { ascending: false })
      for (const row of (kbClaims ?? []) as Array<{
        kundenbetreuer_id: string
        profiles?: { aktiv?: boolean; rolle?: string } | { aktiv?: boolean; rolle?: string }[]
      }>) {
        const profileRow = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        if (
          profileRow?.aktiv &&
          ['kundenbetreuer', 'admin'].includes((profileRow.rolle as string) ?? '')
        ) {
          return { kb_id: row.kundenbetreuer_id, quelle: 'claim_parties' }
        }
      }
    }
  }

  return null
}

/**
 * Hauptfunktion: weist einen Kundenbetreuer zu oder fällt auf den ersten
 * Admin zurück. Sticky-KB hat Vorrang vor Round-Robin (gleicher Kunde /
 * Ansprechpartner → gleicher KB, auch bei voller Kapazität).
 */
export async function assignKundenbetreuer(
  supabase: AnySupabase,
  fallId: string,
  options: AssignOptions & { stickyHints?: StickyKbHints } = {},
): Promise<KbAssignmentResult> {
  // 0. Sticky-KB prüfen (bevor Round-Robin)
  if (options.stickyHints) {
    const sticky = await findStickyKb(supabase, options.stickyHints)
    if (sticky) {
      if (options.writeToFall) {
        await updateKbOnFallAndClaim(supabase, fallId, sticky.kb_id, false)
      }
      if (options.logToTimeline) {
        await supabase.from('timeline').insert({
          fall_id: fallId,
          typ: 'system',
          titel: 'KB durchgängig (Sticky)',
          beschreibung: `Kunde/Ansprechpartner hatte bereits einen Fall — derselbe KB übernimmt (Quelle: ${sticky.quelle}).`,
        })
      }
      return { success: true, kundenbetreuer_id: sticky.kb_id, fallback_used: 'none' }
    }
  }

  // 1. Primär: aktiver KB
  const kb = await findAvailableKB(supabase)
  if (kb) {
    if (options.writeToFall) {
      await updateKbOnFallAndClaim(supabase, fallId, kb.id, false)
    }
    return { success: true, kundenbetreuer_id: kb.id, fallback_used: 'none' }
  }

  // 2. Sekundär: Admin-Fallback
  const admin = await findFirstActiveAdmin(supabase)
  if (admin) {
    if (options.writeToFall) {
      await updateKbOnFallAndClaim(supabase, fallId, admin.id, true)
    }
    if (options.logToTimeline) {
      await supabase.from('timeline').insert({
        fall_id: fallId,
        typ: 'system',
        titel: 'KB-Fallback auf Admin',
        beschreibung: `Kein Kundenbetreuer verfügbar — Admin ${admin.email ?? admin.id} übernimmt vorübergehend die KB-Rolle für diesen Fall.`,
      })
    }
    console.warn('[AAR-427] KB-Fallback auf Admin:', { fallId, adminId: admin.id, email: admin.email })
    return {
      success: true,
      kundenbetreuer_id: admin.id,
      fallback_used: 'admin',
      reason: 'Kein aktiver Kundenbetreuer gefunden — Admin übernimmt vorübergehend.',
    }
  }

  // 3. Tertiär: weder KB noch Admin
  console.error('[AAR-427] Kein Admin-Fallback verfügbar — Fall bleibt unbezogen:', { fallId })
  if (options.logToTimeline) {
    await supabase.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: 'KB-Zuweisung fehlgeschlagen',
      beschreibung: 'Kein aktiver Kundenbetreuer und kein aktiver Admin verfügbar — Fall bleibt unbezogen. Bitte manuell zuweisen.',
    })
  }
  return {
    success: false,
    kundenbetreuer_id: null,
    fallback_used: 'error',
    reason: 'Kein aktiver KB und kein aktiver Admin verfügbar.',
  }
}

// ─── AAR-632: Re-Assignment bei KB-Deaktivierung ─────────────────────────────

export type ReassignResult = {
  scanned_count: number
  reassigned_count: number
  failed_count: number
  tasks_reassigned: number
  details: Array<{ fall_id: string; from_kb: string; to_kb: string | null; fallback: KbAssignmentFallback }>
}

/**
 * Findet alle offenen Fälle deren `kundenbetreuer_id` auf einen inaktiven
 * User zeigt und weist sie neu zu. Genutzt:
 *   - als Cron (`/api/cron/kb-reassign-inactive`) als tägliches Safety-Net
 *   - manuell aus Admin-Team-Page wenn Admin einen KB deaktiviert (AAR-634)
 *
 * AAR-635: neben Fällen werden auch die offenen Tasks der betroffenen Fälle
 * vom alten KB auf den neuen KB umgehängt, damit nichts beim inaktiven User
 * hängen bleibt. Orphaned-Tasks ohne Fall (`fall_id=null` oder Lead-Tasks)
 * werden via separater Logik im createAutoTask-Fallback addressiert.
 */
export async function reassignAllFaelleForInactiveKbs(
  supabase: AnySupabase,
): Promise<ReassignResult> {
  // 1. Alle inaktiven User-IDs finden, deren Fälle noch nicht umverteilt sind
  const { data: inactiveUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('aktiv', false)
  const inactiveIds = (inactiveUsers ?? []).map((u: { id: string }) => u.id)
  if (inactiveIds.length === 0) {
    return { scanned_count: 0, reassigned_count: 0, failed_count: 0, tasks_reassigned: 0, details: [] }
  }

  // 2. Alle offenen Fälle laden mit inaktivem KB
  // CMM-44 SP-A: kundenbetreuer_id ist claims-Duplikat-Spalte (claims = SSoT).
  // Der KB-Filter laeuft auf claims, faelle wird via nested join fuer id +
  // Workflow-Status (faelle-only) mitgelesen. !inner: seit CMM-Phase-1.5 hat
  // jeder Claim genau einen faelle-Twin (Sync-Trigger) — der Inner-Join macht
  // diese Invariante explizit statt sich auf einen Null-Filter zu verlassen.
  const { data: claimsWithInactiveKb } = await supabase
    .from('claims')
    .select('kundenbetreuer_id, faelle:faelle!faelle_claim_id_fkey!inner(id, status)')
    .in('kundenbetreuer_id', inactiveIds)
  const list = ((claimsWithInactiveKb ?? []) as Array<{
    kundenbetreuer_id: string
    faelle: { id: string; status: string | null } | { id: string; status: string | null }[]
  }>)
    .map((c) => {
      const fallJoin = Array.isArray(c.faelle) ? c.faelle[0] : c.faelle
      return { id: fallJoin.id, status: fallJoin.status, kundenbetreuer_id: c.kundenbetreuer_id }
    })
    .filter((f) => f.status !== 'abgeschlossen' && f.status !== 'storniert')

  const result: ReassignResult = {
    scanned_count: list.length,
    reassigned_count: 0,
    failed_count: 0,
    tasks_reassigned: 0,
    details: [],
  }

  // 3. Pro Fall neu zuweisen (Round-Robin via assignKundenbetreuer) +
  // AAR-635: offene Tasks vom alten KB auf den neuen umhängen.
  for (const fall of list) {
    const ass = await assignKundenbetreuer(supabase, fall.id, {
      writeToFall: true,
      logToTimeline: true,
    })
    if (ass.success && ass.kundenbetreuer_id) {
      result.reassigned_count += 1
      result.details.push({
        fall_id: fall.id,
        from_kb: fall.kundenbetreuer_id,
        to_kb: ass.kundenbetreuer_id,
        fallback: ass.fallback_used,
      })

      // AAR-635: Tasks dieses Falls vom alten KB auf den neuen KB umhängen
      const { data: taskRows, error: taskErr } = await supabase
        .from('tasks')
        .update({
          zugewiesen_an: ass.kundenbetreuer_id,
          empfaenger_user_id: ass.kundenbetreuer_id,
        })
        .eq('fall_id', fall.id)
        .eq('zugewiesen_an', fall.kundenbetreuer_id)
        .eq('status', 'offen')
        .select('id')
      if (taskErr) {
        console.error(`[AAR-635] Task-Reassign für Fall ${fall.id} fehlgeschlagen:`, taskErr.message)
      } else if (taskRows) {
        result.tasks_reassigned += taskRows.length
      }
    } else {
      result.failed_count += 1
      result.details.push({
        fall_id: fall.id,
        from_kb: fall.kundenbetreuer_id,
        to_kb: null,
        fallback: ass.fallback_used,
      })
    }
  }

  if (result.reassigned_count > 0 || result.tasks_reassigned > 0) {
    console.warn(
      `[AAR-632/635] KB-Reassignment: ${result.reassigned_count}/${result.scanned_count} Fälle + ${result.tasks_reassigned} Tasks neu zugewiesen`,
    )
  }
  return result
}
