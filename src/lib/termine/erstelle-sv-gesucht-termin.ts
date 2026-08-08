// Kunde-Termin-Funnel T4: der Writer für Portal-Wunschtermine ohne SV. Legt eine bezug-native
// gutachter_termine-Zeile (bezug_typ='fall', kein Assignee, status='sv_gesucht') an → sie landet
// in der Dispatch-Terminwunsch-Queue (quelle='portal') und in der Kunde-Akte als "wird bestätigt".
//
// 🔴 Vor T4 gab es KEINEN Writer für sv_gesucht — nur Leser. Der DB-CHECK
// (gutachter_termine_status_check) trägt 'sv_gesucht' bereits (verifiziert 08.08.).
//
// bezug_typ='fall' (bezug_id=claimId) statt 'claim': konsistent zur T1-Konversion + zu den
// 'fall'-Achsen-Reads der Kunde-Akte; bezugOrExpr behandelt fall/claim ohnehin als Äquivalenz.
// KEIN Assignee (sv_gesucht = "echter SV wird noch gefunden") → die Dispatch-Zuweisung
// (weiseSvGesuchtZu) setzt ihn später. Reine DB-Schreibung; Auth/Ownership liegt beim Caller.

import type { createAdminClient } from '@/lib/supabase/admin'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'

type AdminClient = ReturnType<typeof createAdminClient>

// Nicht-terminale Status: existiert eine solche sv_begutachtung-Zeile, ist der Wunsch schon
// gestellt → Idempotenz (kein zweiter offener Termin am selben Claim).
const TERMINAL = ['storniert', 'abgesagt', 'abgelehnt', 'verlegt', 'abgeschlossen'] as const

export type ErstelleSvGesuchtInput = {
  claimId: string
  startIso: string
  besichtigungsort?: {
    adresse?: string | null
    lat?: number | null
    lng?: number | null
    placeId?: string | null
  } | null
}

export async function erstelleSvGesuchtTermin(
  admin: AdminClient,
  { claimId, startIso, besichtigungsort }: ErstelleSvGesuchtInput,
): Promise<{ ok: boolean; created: boolean; terminId?: string; error?: string }> {
  // 1. Existiert bereits ein offener sv_begutachtung-Termin am Claim? -> noop (Idempotenz).
  //    bezug-aware: findet fall- UND claim-verankerte Termine (bezugOrExpr = fall≡claim).
  const { data: bestehend, error: readErr } = await admin
    .from('gutachter_termine')
    .select('id, status')
    .or(bezugOrExpr('fall', claimId))
    .eq('typ', 'sv_begutachtung')
    .not('status', 'in', `(${TERMINAL.join(',')})`)
    .limit(1)
  if (readErr) return { ok: false, created: false, error: readErr.message }
  if (bestehend && bestehend.length > 0) {
    return { ok: true, created: false, terminId: (bestehend[0] as { id: string }).id }
  }

  // 2. Kein offener Termin -> sv_gesucht-Zeile anlegen. .select()+Row-Check (#4625).
  const insert: Record<string, unknown> = {
    bezug_typ: 'fall',
    bezug_id: claimId,
    typ: 'sv_begutachtung',
    status: 'sv_gesucht',
    start_zeit: startIso,
  }
  if (besichtigungsort) {
    if (besichtigungsort.adresse != null) insert.besichtigungsort_adresse = besichtigungsort.adresse
    if (besichtigungsort.lat != null) insert.besichtigungsort_lat = besichtigungsort.lat
    if (besichtigungsort.lng != null) insert.besichtigungsort_lng = besichtigungsort.lng
    if (besichtigungsort.placeId != null) insert.besichtigungsort_place_id = besichtigungsort.placeId
  }

  const { data: inserted, error: insErr } = await admin
    .from('gutachter_termine')
    .insert(insert)
    .select('id')
  if (insErr) return { ok: false, created: false, error: insErr.message }
  if (!inserted || inserted.length === 0) {
    return { ok: false, created: false, error: 'sv_gesucht-Termin-Insert lieferte keine Zeile.' }
  }
  return { ok: true, created: true, terminId: (inserted[0] as { id: string }).id }
}
