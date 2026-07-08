'use server'

// Phase 2a: Server-Layer fuer das Claim-Chat-Thread-Modell.
// Muster: ZUGRIFF wird ueber die RLS von chat_threads (chat_threads_select = Mitglied ODER
// is_staff) geprueft, indem der Thread mit dem AUTHED Client gelesen wird. Danach laufen
// Writes/Reads der Nachrichten ueber den SERVICE-ROLE-Client — so muessen wir die alte
// kanal-basierte nachrichten-RLS in Phase 2 NICHT anfassen (Cutover erst Phase 3).
// Neue Tabellen sind nicht in database.types -> untypisierter Cast (kein Regen des geteilten Files).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  leiteGruppenTeilnehmer,
  sortiereDirektPaar,
  threadLabel,
  leiteDmKandidaten,
  rolleLabel,
  type ClaimZuweisung,
  type ThreadArt,
  type DmKandidatenClaim,
} from './thread-model'

type Ergebnis<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ThreadNachricht {
  id: string
  sender_id: string | null
  sender_rolle: string | null
  nachricht: string
  richtung: string | null
  status: string | null
  created_at: string
}

async function aktuellerUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/** Prueft ueber die RLS (chat_threads_select), ob der aktuelle User Zugriff auf den Thread hat. */
async function hatThreadZugriff(supabase: Awaited<ReturnType<typeof createClient>>, threadId: string) {
  const { data } = await (supabase as unknown as SupabaseClient)
    .from('chat_threads')
    .select('id, claim_id')
    .eq('id', threadId)
    .maybeSingle()
  return data as { id: string; claim_id: string } | null
}

/** Synchronisiert Gruppen-Teilnehmer (nur gueltige auth.users — stale Refs pro Zeile ueberspringen). */
async function syncGruppenTeilnehmer(admin: SupabaseClient, threadId: string, teilnehmer: { userId: string; rolle: string }[]) {
  for (const t of teilnehmer) {
    const { error } = await admin
      .from('chat_thread_teilnehmer')
      .upsert({ thread_id: threadId, user_id: t.userId, rolle: t.rolle }, { onConflict: 'thread_id,user_id', ignoreDuplicates: true })
    if (error) continue // z.B. gedroppte auth.users-Referenz -> ueberspringen
  }
}

/** Get-or-create kunde_gruppe/team_intern-Thread + Teilnehmer-Sync (server-autoritativ via Service-Role). */
export async function holeOderErstelleGruppenThread(
  claimId: string,
  art: 'kunde_gruppe' | 'team_intern',
): Promise<Ergebnis<string>> {
  const { user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient() as unknown as SupabaseClient

  const { data: claim } = await admin
    .from('claims')
    .select('geschaedigter_user_id, kundenbetreuer_id, sv_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden.' }

  const { data: vorhanden } = await admin
    .from('chat_threads')
    .select('id')
    .eq('claim_id', claimId)
    .eq('art', art)
    .maybeSingle()
  let threadId = (vorhanden as { id: string } | null)?.id

  if (!threadId) {
    const { data: neu, error } = await admin
      .from('chat_threads')
      .insert({ claim_id: claimId, art })
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    threadId = (neu as { id: string } | null)?.id
  }
  if (!threadId) return { ok: false, error: 'Thread konnte nicht angelegt werden.' }

  await syncGruppenTeilnehmer(admin, threadId, leiteGruppenTeilnehmer(claim as ClaimZuweisung, art))
  return { ok: true, data: threadId }
}

/** Get-or-create Direkt-Thread zwischen aktuellem User und einer anderen Person (on-demand, inkl. Werkstatt/Makler). */
export async function holeOderErstelleDirektThread(claimId: string, andereUserId: string): Promise<Ergebnis<string>> {
  const { user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  if (!andereUserId || andereUserId === user.id) return { ok: false, error: 'Ungueltiger DM-Partner.' }
  const admin = createAdminClient() as unknown as SupabaseClient

  const [a, b] = sortiereDirektPaar(user.id, andereUserId)

  const { data: vorhanden } = await admin
    .from('chat_threads')
    .select('id')
    .eq('claim_id', claimId)
    .eq('art', 'direkt')
    .eq('direkt_user_a', a)
    .eq('direkt_user_b', b)
    .maybeSingle()
  let threadId = (vorhanden as { id: string } | null)?.id

  if (!threadId) {
    const { data: neu, error } = await admin
      .from('chat_threads')
      .insert({ claim_id: claimId, art: 'direkt', direkt_user_a: a, direkt_user_b: b })
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    threadId = (neu as { id: string } | null)?.id
    if (threadId) {
      await syncGruppenTeilnehmer(admin, threadId, [
        { userId: a, rolle: 'teilnehmer' },
        { userId: b, rolle: 'teilnehmer' },
      ])
    }
  }
  if (!threadId) return { ok: false, error: 'Direkt-Thread konnte nicht angelegt werden.' }
  return { ok: true, data: threadId }
}

/** Persistiert eine Nachricht im Thread (Aaron: der Chat MUSS gespeichert werden). Thread-nativ: kanal=null. */
export async function sendeThreadNachricht(threadId: string, text: string): Promise<Ergebnis<string>> {
  const { supabase, user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const inhalt = text.trim()
  if (!inhalt) return { ok: false, error: 'Nachricht ist leer.' }

  const thread = await hatThreadZugriff(supabase, threadId)
  if (!thread) return { ok: false, error: 'Kein Zugriff auf diesen Thread.' }

  const { data: prof } = await supabase.from('profiles').select('rolle').eq('id', user.id).maybeSingle()

  const admin = createAdminClient() as unknown as SupabaseClient
  const { data: neu, error } = await admin
    .from('nachrichten')
    .insert({
      fall_id: thread.claim_id,
      thread_id: threadId,
      sender_id: user.id,
      sender_rolle: prof?.rolle ?? null,
      nachricht: inhalt,
      richtung: 'outbound',
      status: 'gesendet',
      kanal: null,
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (neu as { id: string } | null)?.id ?? '' }
}

/** Laedt die persistierten Nachrichten eines Threads (Zugriff via RLS geprueft, Read via Service-Role). */
export async function ladeThreadNachrichten(threadId: string): Promise<Ergebnis<ThreadNachricht[]>> {
  const { supabase, user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const thread = await hatThreadZugriff(supabase, threadId)
  if (!thread) return { ok: false, error: 'Kein Zugriff auf diesen Thread.' }

  const admin = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await admin
    .from('nachrichten')
    .select('id, sender_id, sender_rolle, nachricht, richtung, status, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as ThreadNachricht[] }
}

/** Markiert den Thread fuer den aktuellen User als gelesen (update-own-Policy). */
export async function markiereThreadGelesen(threadId: string): Promise<Ergebnis<null>> {
  const { supabase, user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const { error } = await (supabase as unknown as SupabaseClient)
    .from('chat_thread_teilnehmer')
    .update({ zuletzt_gelesen_am: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: null }
}

export interface ClaimThreadInfo {
  id: string
  art: ThreadArt
  label: string
}

/** Listet die fuer den aktuellen User sichtbaren Threads eines Claims (RLS: Mitglied ODER is_staff).
 *  Direkt-Labels werden aus den Teilnehmer-Rollen (via Service-Role) zusammengesetzt. */
export async function ladeClaimThreads(claimId: string): Promise<Ergebnis<ClaimThreadInfo[]>> {
  const { supabase, user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: threadsRaw, error } = await (supabase as unknown as SupabaseClient)
    .from('chat_threads')
    .select('id, art')
    .eq('claim_id', claimId)
    .order('art', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const threads = (threadsRaw ?? []) as { id: string; art: ThreadArt }[]
  if (threads.length === 0) return { ok: true, data: [] }

  const admin = createAdminClient() as unknown as SupabaseClient
  const { data: teil } = await admin
    .from('chat_thread_teilnehmer')
    .select('thread_id, rolle')
    .in(
      'thread_id',
      threads.map((t) => t.id),
    )
  const rollenProThread = new Map<string, string[]>()
  for (const p of (teil ?? []) as { thread_id: string; rolle: string | null }[]) {
    const arr = rollenProThread.get(p.thread_id) ?? []
    if (p.rolle) arr.push(p.rolle)
    rollenProThread.set(p.thread_id, arr)
  }

  return {
    ok: true,
    data: threads.map((t) => ({ id: t.id, art: t.art, label: threadLabel(t.art, rollenProThread.get(t.id) ?? []) })),
  }
}

export interface ClaimBeteiligter {
  userId: string
  rolle: string
  label: string
}

/** DM-Kandidaten eines Claims (zugewiesene Beteiligte ausser dem aktuellen User) fuer "Neue Nachricht". */
export async function ladeClaimBeteiligte(claimId: string): Promise<Ergebnis<ClaimBeteiligter[]>> {
  const { user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient() as unknown as SupabaseClient
  const { data: claim } = await admin
    .from('claims')
    .select('geschaedigter_user_id, kundenbetreuer_id, sv_id, makler_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'Claim nicht gefunden.' }
  const kandidaten = leiteDmKandidaten(claim as DmKandidatenClaim, user.id)
  return { ok: true, data: kandidaten.map((k) => ({ userId: k.userId, rolle: k.rolle, label: rolleLabel(k.rolle) })) }
}
