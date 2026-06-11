// CMM Entity-Model Phase 3 (Writer-Rewiring): personen-Write-Path-Helper.
//
// Bisher wurde claim_parties.person_id NUR per Backfill (Phase 2a,
// cmm_entity_personen_backfill_from_claim_parties) gesetzt — neue Konversionen,
// Airdrops und Flows legten Parteien OHNE person_id an. Dieser Helper ist der
// schreibzeitige Spiegel des 2a-Backfills: er macht aus einer Partei (Person+
// Rolle-Combo) den Person<->Claim-Rolle-Link, indem er die globale personen-
// Entitaet find-or-created und person_id verlinkt.
//
// Dedup (Aaron 03.06., Insight #4): Account = 1 personen pro user_id
// (zuverlaessig). OHNE Account KEIN Namens-Auto-Merge (DSGVO / Falsch-Merge) ->
// jede account-lose Partei bekommt ihre eigene Person; Wiedererkennung spaeter
// via Account-Link (Airdrop) / Admin-Merge-Tool.
//
// Non-critical: wirft NIE; liefert ein Result-Object. Ein Personen-Link darf eine
// Konversion / einen Airdrop nicht brechen — claim_parties bleibt valide, person_id
// kann ein zweites Mal (idempotent) nachgezogen werden.
//
// Typisierung wie ensure-vehicle.ts: db als untypisierter SupabaseClient, damit
// `.from('personen')` auch dann kompiliert, wenn die generierten DB-Types der
// frischen Tabelle noch hinterherhinken (AGENTS.md Regel 2 Schritt 6).

import type { SupabaseClient } from '@supabase/supabase-js'

/** Personen-Felder, die aus einer Partei in die globale personen-Entitaet ziehen.
 *  Spiegelt das 2a-Backfill-Mapping. */
export type PersonSnapshot = {
  anrede?: string | null
  titel?: string | null
  vorname?: string | null
  nachname?: string | null
  firma?: string | null
  ist_gewerbe?: boolean | null
  geburtsdatum?: string | null
  email?: string | null
  telefon?: string | null
  mobil?: string | null
  adresse_strasse?: string | null
  adresse_plz?: string | null
  adresse_ort?: string | null
  adresse_land?: string | null
  fuehrerscheinnummer?: string | null
  /** claim_parties.fuehrerscheinklassen ist text[]; personen.fuehrerscheinklassen ist text. */
  fuehrerscheinklassen?: string | string[] | null
  ust_id?: string | null
}

export type EnsurePersonResult =
  | { ok: true; personId: string; created: boolean }
  | { ok: true; personId: null; created: false; skipped: true }
  | { ok: false; error: string }

/** text[] (claim_parties) -> text (personen). Leeres Array / Nullish -> null.
 *  Ohne diese Normalisierung schluege ein supabase-js-Insert eines Arrays in die
 *  text-Spalte fehl (Postgres castet text[] nicht implizit nach text). */
function klassenToText(v: string | string[] | null | undefined): string | null {
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : null
  return v ?? null
}

/** CMM-Entity Follow-up (A): hat der Snapshot ein identifizierendes Feld? Verhindert leere
 *  personen-Entitaeten fuer Parteien ohne Identitaet (z.B. Gegner nur per KZ/Versicherung). */
function hasIdentifyingData(s: PersonSnapshot): boolean {
  return Boolean(
    (s.vorname && s.vorname.trim()) ||
    (s.nachname && s.nachname.trim()) ||
    (s.firma && s.firma.trim()) ||
    (s.email && s.email.trim()) ||
    (s.telefon && s.telefon.trim()) ||
    (s.mobil && s.mobil.trim()),
  )
}

function buildPersonInsert(
  snapshot: PersonSnapshot,
  userId: string | null,
): Record<string, unknown> {
  return {
    user_id: userId,
    anrede: snapshot.anrede ?? null,
    titel: snapshot.titel ?? null,
    vorname: snapshot.vorname ?? null,
    nachname: snapshot.nachname ?? null,
    firma: snapshot.firma ?? null,
    ist_gewerbe: snapshot.ist_gewerbe ?? false,
    geburtsdatum: snapshot.geburtsdatum ?? null,
    email: snapshot.email ?? null,
    telefon: snapshot.telefon ?? null,
    mobil: snapshot.mobil ?? null,
    adresse_strasse: snapshot.adresse_strasse ?? null,
    adresse_plz: snapshot.adresse_plz ?? null,
    adresse_ort: snapshot.adresse_ort ?? null,
    adresse_land: snapshot.adresse_land ?? null,
    fuehrerscheinnummer: snapshot.fuehrerscheinnummer ?? null,
    fuehrerscheinklassen: klassenToText(snapshot.fuehrerscheinklassen),
    ust_id: snapshot.ust_id ?? null,
  }
}

/**
 * Resolve (find-or-create) die globale personen-id fuer eine NEUE Partei.
 * Vor dem claim_parties-Insert aufrufen und person_id ins Insert-Payload setzen.
 *
 * - userId gesetzt -> 1 personen pro user_id (find-or-create, Account-Dedup).
 * - userId null    -> immer neue personen (KEIN Auto-Merge).
 */
export async function ensurePersonForData(params: {
  db: SupabaseClient
  userId: string | null | undefined
  snapshot: PersonSnapshot
}): Promise<EnsurePersonResult> {
  const { db } = params
  const userId = params.userId ?? null

  try {
    // CMM-Entity Follow-up (A): ohne Account UND ohne identifizierendes Feld keine personen-Zeile
    // anlegen (sonst Junk-Entitaet pro namenlosem Gegner). person_id bleibt dann NULL.
    if (!userId && !hasIdentifyingData(params.snapshot)) {
      return { ok: true, personId: null, created: false, skipped: true }
    }

    if (userId) {
      const { data: existing, error: selErr } = await db
        .from('personen')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      if (selErr) return { ok: false, error: selErr.message }
      if (existing?.id) {
        return { ok: true, personId: existing.id as string, created: false }
      }
    }

    const { data: created, error: insErr } = await db
      .from('personen')
      .insert(buildPersonInsert(params.snapshot, userId))
      .select('id')
      .single()
    if (insErr || !created) {
      return { ok: false, error: insErr?.message ?? 'personen-Insert lieferte keine id' }
    }
    return { ok: true, personId: created.id as string, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}

/**
 * Account-Nachzug: eine bestehende Partei hat gerade user_id bekommen
 * (anonym -> Account, z.B. finalizeKundeSetup / acceptAirdropInvitation).
 * Stellt sicher, dass claim_parties.person_id auf die Account-Person zeigt:
 *   - Account-Person existiert bereits -> person_id darauf re-pointen.
 *   - sonst, Partei hatte eine No-Account-Person -> diese zur Account-Person
 *     promoten (personen.user_id setzen) — kein Orphan.
 *   - sonst -> neue Account-Person anlegen + verlinken.
 * Aktualisiert claim_parties.person_id selbst. Idempotent, non-throwing.
 */
export async function relinkPartyPersonOnAccount(params: {
  db: SupabaseClient
  partyId: string
  userId: string
  snapshot?: PersonSnapshot
}): Promise<EnsurePersonResult> {
  const { db, partyId, userId } = params
  try {
    const { data: party, error: pErr } = await db
      .from('claim_parties')
      .select('id, person_id, user_id')
      .eq('id', partyId)
      .maybeSingle()
    if (pErr) return { ok: false, error: pErr.message }
    if (!party) return { ok: false, error: `claim_party ${partyId} nicht gefunden` }

    const { data: acct, error: aErr } = await db
      .from('personen')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    if (aErr) return { ok: false, error: aErr.message }

    const currentPersonId = (party.person_id as string | null) ?? null

    // 1) Account-Person existiert -> re-point (falls noetig)
    if (acct?.id) {
      const acctId = acct.id as string
      if (currentPersonId !== acctId) {
        const { error: upErr } = await db
          .from('claim_parties')
          .update({ person_id: acctId })
          .eq('id', partyId)
        if (upErr) return { ok: false, error: upErr.message }
      }
      return { ok: true, personId: acctId, created: false }
    }

    // 2) Keine Account-Person, aber vorhandene No-Account-Person -> promoten
    if (currentPersonId) {
      const { error: promErr } = await db
        .from('personen')
        .update({ user_id: userId })
        .eq('id', currentPersonId)
      if (promErr) return { ok: false, error: promErr.message }
      return { ok: true, personId: currentPersonId, created: false }
    }

    // 3) Weder Account-Person noch vorhandene Person -> neu anlegen + verlinken
    const created = await ensurePersonForData({ db, userId, snapshot: params.snapshot ?? {} })
    if (!created.ok) return created
    const { error: linkErr } = await db
      .from('claim_parties')
      .update({ person_id: created.personId })
      .eq('id', partyId)
    if (linkErr) return { ok: false, error: linkErr.message }
    return created
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unbekannter Fehler' }
  }
}
