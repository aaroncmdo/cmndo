// P2.3c — Termin-State-Transitions als assignee-generische Engine-Primitive.
// Konsolidiert die DB-State-Uebergaenge der AAR-864-Verlegungs-Maschine + die fehlende
// termin-level Cancel-Primitive. Auth / Notifications / Route-Vorschlaege / Fall-Storno+Billing
// bleiben im Consumer (termin-verlegung-actions.ts / storno-actions.ts) bis Phase-3-Repoint.
// verlege ist race-sicher ueber gutachter_termine_no_assignee_overlap (P2.2): neuer Slot wirft
// 23P01 bei Ueberlappung -> Rollback des alt-Status. Alle Ops idempotent (status-gegate Updates).

import type { SupabaseClient } from '@supabase/supabase-js'

const AKTIV = ['bestaetigt', 'reserviert', 'verlegt', 'verlegung_pending'] as const

/**
 * Felder, die beim Verlegen vom Quell- auf den Ziel-Termin übergehen.
 *
 * ⭐⭐ ANLASS (Regel-4-Smoke 29.08.): Die Auswahl trug nur die LEGACY-Bezug-Spalten
 * (`fall_id`, `claim_id`). `gutachter_termine` führt den Bezug aber auf **zwei** Achsen —
 * Legacy und kanonisch (`bezug_typ` + `bezug_id`) — und die Engine schreibt neue Termine
 * **bezug-nativ**: dort sind die Legacy-Spalten NULL.
 *
 * Folge: Beim Verlegen eines bezug-nativen Termins las `verlege()` `fall_id`/`claim_id` als
 * NULL und legte den neuen Slot **ganz ohne Fallbezug** an — `bezug_typ`/`bezug_id` wurden
 * nie kopiert. Der neue Termin ist damit ein **Waise**: `bezugOrExpr()` findet ihn nie, der
 * Kunde sieht den Vorschlag nicht und kann ihn nicht annehmen, während der alte Termin auf
 * `verlegt` blockiert stehen bleibt. **Der Vorgang hängt, ohne dass irgendwo ein Fehler steht.**
 *
 * Auf prod gemessen: 3 von 10 aktiven Terminen waren bezug-nativ und damit betroffen; 51 der
 * 79 Termine insgesamt. Die Zahl wächst, weil die Engine neue Termine so schreibt — **die
 * Migration auf bezug-nativ hat die Verlegung schleichend gebrochen.**
 *
 * ⚠ Verwandt mit AGENTS.md §Termin-Bezug-Gate, aber vom Ratchet NICHT gedeckt: der gatet
 * naive **Filter** (`.eq('fall_id', …)`), nicht das **Kopieren** beim Insert.
 *
 * Beide Achsen werden 1:1 übernommen — welche gefüllt ist, entscheidet der Quell-Termin.
 * Kein Trigger verbietet das (`trg_validate_gutachter_termine_claim_id` fordert nur
 * `claim_id`, sobald `fall_id` gesetzt ist — beim Kopieren bleibt das Paar konsistent).
 */
const BEZUG_UND_KONTEXT_FELDER =
  'id, assignee_id, assignee_typ, sv_lead_id, fall_id, claim_id, lead_id, bezug_typ, bezug_id, kb_id, kanal, typ, status'

export type AbsageStatus = 'abgesagt' | 'storniert' | 'abgelehnt'

/**
 * Cancelt EINEN Termin (status -> terminal + cancelled_at + Grund). NICHT Fall-Storno/Billing
 * (das ist stornoFall/transitionFallStatus). Idempotent: nur wenn der Termin noch aktiv ist.
 */
export async function sageAb(
  terminId: string,
  opts?: { grund?: string; status?: AbsageStatus; db?: SupabaseClient },
): Promise<{ ok: true; terminId: string } | { ok: false; error: string; code: 'nicht_aktiv' | 'db' }> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const status = opts?.status ?? 'abgesagt'
  const patch: Record<string, unknown> = { status, cancelled_at: new Date().toISOString() }
  if (opts?.grund) patch.ablehnungsgrund = opts.grund
  const { data, error } = await db
    .from('gutachter_termine')
    .update(patch)
    .eq('id', terminId)
    .in('status', AKTIV as unknown as string[])
    .select('id')
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!data || data.length === 0) return { ok: false, error: 'Termin nicht (mehr) aktiv', code: 'nicht_aktiv' }
  return { ok: true, terminId }
}

export interface VerlegeInput {
  neuVon: string
  neuBis: string
  /** default 'verlegung_pending' (SV-Flow); 'bestaetigt' = Kunde-Sofort (alt -> verschoben). */
  neuerStatus?: 'verlegung_pending' | 'bestaetigt'
  initiatorKunde?: boolean
  grund?: string
  db?: SupabaseClient
}
export type VerlegeResult =
  | { ok: true; neuerTerminId: string }
  | { ok: false; error: string; code: 'alt_nicht_aktiv' | 'belegt' | 'db' }

/**
 * Verschiebt einen Termin: alt -> 'verlegt' (bzw. 'verschoben' bei Kunde-Sofort) + neuer Slot
 * (race-sicher via Constraint; 23P01 -> Rollback alt). Spiegelt AAR-864 terminVerlegung*Vorschlagen
 * als reine DB-Transition (Auth/Notify = Caller).
 */
export async function verlege(terminId: string, input: VerlegeInput): Promise<VerlegeResult> {
  const db = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const neuerStatus = input.neuerStatus ?? 'verlegung_pending'
  const altNeuStatus = neuerStatus === 'bestaetigt' ? 'verschoben' : 'verlegt'

  const { data: alt, error: ladeErr } = await db
    .from('gutachter_termine')
    .select(BEZUG_UND_KONTEXT_FELDER)
    .eq('id', terminId)
    .maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message, code: 'db' }
  if (!alt || !(AKTIV as unknown as string[]).includes(alt.status as string))
    return { ok: false, error: 'Quell-Termin nicht aktiv', code: 'alt_nicht_aktiv' }

  // 1) alt umschalten (idempotenz-gegate auf den geladenen Status)
  const { data: altUpd, error: altErr } = await db
    .from('gutachter_termine')
    .update({
      status: altNeuStatus,
      // Geist-Fix: terminales 'verschoben' (Kunde-Sofort-Reschedule) MUSS cancelled_at setzen —
      // analog zum SV-Accept (entscheideVerlegung). Ohne das erscheint der alte Termin in
      // cancelled_at-gefilterten Listen (z.B. /kunde/termine) als Geist neben dem neuen Slot.
      // 'verlegt' (SV-Propose) bleibt aktiv/blockiert bis zur Entscheidung -> KEIN cancelled_at.
      ...(altNeuStatus === 'verschoben' ? { cancelled_at: new Date().toISOString() } : {}),
      verlegung_grund: input.grund ?? null,
      ...(input.initiatorKunde ? { verlegung_initiator_kunde: true } : {}),
    })
    .eq('id', alt.id)
    .eq('status', alt.status as string)
    .select('id')
  if (altErr) return { ok: false, error: altErr.message, code: 'db' }
  if (!altUpd || altUpd.length === 0) return { ok: false, error: 'Quell-Termin race', code: 'alt_nicht_aktiv' }

  // 2) neuen Slot anlegen (race-sicher via Constraint; CMM-49: assignee direkt aus alt
  //    geschrieben, sv_id nicht mehr — der Normalize-Trigger ist damit no-op)
  const { data: neu, error: insErr } = await db
    .from('gutachter_termine')
    .insert({
      assignee_id: alt.assignee_id,
      assignee_typ: alt.assignee_typ,
      sv_lead_id: alt.sv_lead_id,
      // Beide Bezug-Achsen 1:1 uebernehmen — welche gefuellt ist, entscheidet der
      // Quell-Termin. Vorher wurden nur fall_id/claim_id kopiert; bei einem
      // BEZUG-NATIVEN Quell-Termin (Legacy-Spalten NULL) entstand dadurch ein Termin
      // ganz OHNE Fallbezug. Details im Kommentar an BEZUG_UND_KONTEXT_FELDER.
      fall_id: alt.fall_id,
      claim_id: alt.claim_id,
      lead_id: alt.lead_id,
      bezug_typ: alt.bezug_typ,
      bezug_id: alt.bezug_id,
      kb_id: alt.kb_id,
      kanal: alt.kanal,
      typ: alt.typ ?? 'sv_begutachtung',
      start_zeit: input.neuVon,
      end_zeit: input.neuBis,
      status: neuerStatus,
      verlegung_quelle_id: alt.id,
      verlegung_grund: input.grund ?? null,
      ...(input.initiatorKunde ? { verlegung_initiator_kunde: true } : {}),
    })
    .select('id')
    .single()
  if (insErr || !neu) {
    // Rollback alt — cancelled_at mit zuruecksetzen: alt war vor verlege aktiv (cancelled_at=null),
    // beim 'verschoben'-Pfad haben wir es oben gesetzt -> hier wieder nullen, sonst Geist nach Fail.
    // Scheitert DIESER Write, bleibt der alte Termin auf altNeuStatus stehen, ohne dass ein neuer
    // existiert. Beim 'verschoben'-Pfad ist das terminal: 'verschoben' steht nicht in AKTIV, also
    // laeuft JEDER weitere Verlegungs-Versuch in 'alt_nicht_aktiv' — der Termin ist dann tot.
    const { error: rollbackFehler } = await db
      .from('gutachter_termine')
      .update({ status: alt.status as string, verlegung_grund: null, cancelled_at: null })
      .eq('id', alt.id)
    if (rollbackFehler) {
      console.error(
        `[state-transitions] Rollback nach fehlgeschlagenem Insert misslungen (Termin ${alt.id} haengt auf '${altNeuStatus}'):`,
        rollbackFehler.message,
      )
    }
    if (insErr?.code === '23P01') return { ok: false, error: 'Neuer Slot belegt', code: 'belegt' }
    return { ok: false, error: insErr?.message ?? 'Insert fehlgeschlagen', code: 'db' }
  }
  return { ok: true, neuerTerminId: neu.id as string }
}

/**
 * Entscheidet eine pending Verlegung. bestaetigen: neu -> bestaetigt, alt(verlegt) -> verschoben +
 * cancelled_at. ablehnen: neu -> storniert + cancelled_at, alt(verlegt) -> bestaetigt (Rollback).
 * Spiegelt AAR-864 terminVerlegungBestaetigen/Ablehnen (Auth = Caller).
 */
export async function entscheideVerlegung(
  neuerTerminId: string,
  entscheidung: 'bestaetigen' | 'ablehnen',
  opts?: { grund?: string; db?: SupabaseClient },
): Promise<{ ok: true } | { ok: false; error: string; code: 'nicht_pending' | 'db' }> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const { data: neu, error: ladeErr } = await db
    .from('gutachter_termine')
    .select('id, status, verlegung_quelle_id')
    .eq('id', neuerTerminId)
    .maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message, code: 'db' }
  if (!neu || neu.status !== 'verlegung_pending' || !neu.verlegung_quelle_id)
    return { ok: false, error: 'Slot nicht im Status verlegung_pending', code: 'nicht_pending' }

  const now = new Date().toISOString()
  if (entscheidung === 'bestaetigen') {
    const { data: u1, error: e1 } = await db
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', neu.id)
      .eq('status', 'verlegung_pending')
      .select('id')
    if (e1) return { ok: false, error: e1.message, code: 'db' }
    if (!u1 || u1.length === 0) return { ok: false, error: 'race', code: 'nicht_pending' }
    const { error: e2 } = await db
      .from('gutachter_termine')
      .update({ status: 'verschoben', cancelled_at: now })
      .eq('id', neu.verlegung_quelle_id)
      .eq('status', 'verlegt')
    if (e2) {
      // Ohne Rollback stehen BEIDE Termine aktiv: der neue auf 'bestaetigt', der alte auf 'verlegt'.
      const { error: rollbackFehler } = await db
        .from('gutachter_termine')
        .update({ status: 'verlegung_pending' })
        .eq('id', neu.id)
      if (rollbackFehler) {
        console.error(
          `[state-transitions] Rollback misslungen — Termin ${neu.id} bleibt 'bestaetigt' neben aktivem Quell-Termin ${neu.verlegung_quelle_id}:`,
          rollbackFehler.message,
        )
      }
      return { ok: false, error: e2.message, code: 'db' }
    }
    return { ok: true }
  } else {
    const { data: u1, error: e1 } = await db
      .from('gutachter_termine')
      .update({ status: 'storniert', cancelled_at: now, verlegung_grund: opts?.grund ?? null })
      .eq('id', neu.id)
      .eq('status', 'verlegung_pending')
      .select('id')
    if (e1) return { ok: false, error: e1.message, code: 'db' }
    if (!u1 || u1.length === 0) return { ok: false, error: 'race', code: 'nicht_pending' }
    const { error: e2 } = await db
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', neu.verlegung_quelle_id)
      .eq('status', 'verlegt')
    if (e2) {
      // Ohne Rollback ist der neue Termin storniert UND der alte bleibt auf 'verlegt' haengen —
      // der Kunde haette dann gar keinen aktiven Termin mehr.
      const { error: rollbackFehler } = await db
        .from('gutachter_termine')
        .update({ status: 'verlegung_pending', cancelled_at: null })
        .eq('id', neu.id)
      if (rollbackFehler) {
        console.error(
          `[state-transitions] Rollback misslungen — Termin ${neu.id} bleibt storniert, Quell-Termin ${neu.verlegung_quelle_id} auf 'verlegt':`,
          rollbackFehler.message,
        )
      }
      return { ok: false, error: e2.message, code: 'db' }
    }
    return { ok: true }
  }
}

export interface ReassigniereDeadPinInput {
  /** Ziel-Partner (sachverstaendige.id) — validate_assignee-Trigger prueft die Existenz. */
  partnerId: string
  /** Ziel-Status. default 'bestaetigt' (Dispatch bestaetigt den echten Partner). Achtung:
   *  'reserviert' unterliegt der bestehenden TTL-Bereinigung (expire_geblockte_termine_ohne_sa:
   *  reserviert_bis IS NULL + fall_id IS NULL + >1h -> storniert) — fuer eine DAUERHAFTE
   *  Zuweisung 'bestaetigt' nutzen (Default). */
  neuerStatus?: 'reserviert' | 'bestaetigt'
  db?: SupabaseClient
}
export type ReassigniereDeadPinResult =
  | { ok: true; terminId: string }
  | { ok: false; error: string; code: 'nicht_dispatch_pending' | 'belegt' | 'db' }

/**
 * AAR-956 Dead-Pin-Reassign-Safety-Net: weist einen Dead-Pin-Termin (assignee_typ='sv_lead',
 * status='dispatch_pending') einem echten Partner (sachverstaendiger) zu. Beim Flip in den
 * Exclusion-Status (reserviert/bestaetigt) greift gutachter_termine_no_assignee_overlap →
 * 23P01 bei Doppelbuchung des Partners (belegt) — dispatch_pending war exempt, jetzt schuetzt
 * die Constraint den Partner. sv_lead_id wird genullt (kein Dead-Pin mehr). status-gegate
 * (.eq dispatch_pending + sv_lead) → idempotent. Reine DB-Transition — Notify/Auth = Caller
 * (Dispatch-Revier).
 */
export async function reassigniereDeadPin(
  terminId: string,
  input: ReassigniereDeadPinInput,
): Promise<ReassigniereDeadPinResult> {
  const db = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const neuerStatus = input.neuerStatus ?? 'bestaetigt'
  const { data, error } = await db
    .from('gutachter_termine')
    .update({
      assignee_typ: 'sachverstaendiger',
      assignee_id: input.partnerId,
      sv_lead_id: null,
      status: neuerStatus,
    })
    .eq('id', terminId)
    .eq('status', 'dispatch_pending')
    .eq('assignee_typ', 'sv_lead')
    .select('id')
  if (error) {
    if (error.code === '23P01') return { ok: false, error: 'Partner zu dieser Zeit belegt', code: 'belegt' }
    return { ok: false, error: error.message, code: 'db' }
  }
  if (!data || data.length === 0)
    return { ok: false, error: 'Termin nicht (mehr) dispatch_pending', code: 'nicht_dispatch_pending' }
  return { ok: true, terminId }
}

export interface WeiseSvGesuchtZuInput {
  /** Ziel-Partner (sachverstaendige.id) — validate_assignee-Trigger prueft die Existenz. */
  partnerId: string
  /** Ziel-Status. default 'bestaetigt' (Dispatch bestaetigt den echten Partner; s. reassigniereDeadPin). */
  neuerStatus?: 'reserviert' | 'bestaetigt'
  db?: SupabaseClient
}
export type WeiseSvGesuchtZuResult =
  | { ok: true; terminId: string }
  | { ok: false; error: string; code: 'nicht_sv_gesucht' | 'belegt' | 'db' }

/**
 * Kunde-Termin-Funnel T4: weist einen Portal-Wunschtermin (status='sv_gesucht', KEIN Assignee)
 * einem echten Partner (sachverstaendiger) zu. Gegenstueck zu reassigniereDeadPin fuer die
 * ANDERE Pending-Achse: sv_gesucht traegt keinen sv_lead-Assignee (der Kunde waehlte nur eine
 * Wunschzeit ueber den Akte-Kalender), daher .eq('status','sv_gesucht') statt dispatch_pending+
 * sv_lead und KEIN sv_lead_id-Null. Beim Flip in den Exclusion-Status (reserviert/bestaetigt)
 * greift gutachter_termine_no_assignee_overlap → 23P01 bei Doppelbuchung (belegt). status-gegate
 * → idempotent. Reine DB-Transition — Notify/Auth/Cursor-Nachlauf = Caller (Dispatch-Revier).
 */
export async function weiseSvGesuchtZu(
  terminId: string,
  input: WeiseSvGesuchtZuInput,
): Promise<WeiseSvGesuchtZuResult> {
  const db = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const neuerStatus = input.neuerStatus ?? 'bestaetigt'
  const { data, error } = await db
    .from('gutachter_termine')
    .update({
      assignee_typ: 'sachverstaendiger',
      assignee_id: input.partnerId,
      status: neuerStatus,
    })
    .eq('id', terminId)
    .eq('status', 'sv_gesucht')
    .select('id')
  if (error) {
    if (error.code === '23P01') return { ok: false, error: 'Partner zu dieser Zeit belegt', code: 'belegt' }
    return { ok: false, error: error.message, code: 'db' }
  }
  if (!data || data.length === 0)
    return { ok: false, error: 'Termin nicht (mehr) sv_gesucht', code: 'nicht_sv_gesucht' }
  return { ok: true, terminId }
}
