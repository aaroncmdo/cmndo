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
  sortiereDirektPaar,
  threadLabel,
  leiteDmKandidaten,
  rolleLabel,
  aggregiereUnreadProClaim,
  type ThreadArt,
  type DmKandidatenClaim,
} from './thread-model'
import { syncGruppenTeilnehmer, resolveClaimUserIds, holeOderErstelleGruppenThreadService } from './thread-service'

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
    .select('id, claim_id, art')
    .eq('id', threadId)
    .maybeSingle()
  return data as { id: string; claim_id: string; art: string } | null
}

/**
 * Prueft ueber die claims-RLS (staff/kunde/sv/dispatch), ob der aktuelle User den Claim sehen
 * darf. Gate fuer die authed Thread-Wrapper: die Thread-Inserts/Teilnehmer-Syncs laufen ueber den
 * Service-Client (RLS-Bypass), also MUSS der Claim-Zugriff vorher explizit auf dem User-Client
 * geprueft werden — sonst IDOR (beliebiger Claim/User).
 */
async function darfClaimSehen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claimId: string,
): Promise<boolean> {
  if (!claimId) return false
  const { data } = await (supabase as unknown as SupabaseClient)
    .from('claims')
    .select('id')
    .eq('id', claimId)
    .maybeSingle()
  return !!data
}

/** Get-or-create kunde_gruppe/team_intern-Thread + Teilnehmer-Sync (authed Wrapper -> Service). */
export async function holeOderErstelleGruppenThread(
  claimId: string,
  art: 'kunde_gruppe' | 'team_intern',
): Promise<Ergebnis<string>> {
  const { supabase, user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  // SICHERHEIT: Claim-Zugriff des Aufrufers verifizieren (der Service-Pfad unten bypasst RLS).
  // Fuer Gruppen weniger kritisch (der Teilnehmer-Sync fuegt nur echte Claim-Parteien hinzu),
  // aber konsistent + defense-in-depth.
  if (!(await darfClaimSehen(supabase, claimId))) return { ok: false, error: 'Kein Zugriff auf diesen Claim.' }
  const admin = createAdminClient() as unknown as SupabaseClient
  const threadId = await holeOderErstelleGruppenThreadService(admin, claimId, art)
  if (!threadId) return { ok: false, error: 'Claim nicht gefunden oder Thread konnte nicht angelegt werden.' }
  return { ok: true, data: threadId }
}

/** Get-or-create Direkt-Thread zwischen aktuellem User und einer anderen Person (on-demand, inkl. Werkstatt/Makler). */
export async function holeOderErstelleDirektThread(claimId: string, andereUserId: string): Promise<Ergebnis<string>> {
  const { supabase, user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  if (!andereUserId || andereUserId === user.id) return { ok: false, error: 'Ungueltiger DM-Partner.' }
  // SICHERHEIT (IDOR): Ohne diesen Check konnte JEDER eingeloggte User einen DM-Thread an einem
  // BELIEBIGEN Claim mit einem BELIEBIGEN User anlegen und sich selbst als Teilnehmer eintragen
  // (Insert + Sync laufen unten ueber den Service-Client = RLS-Bypass) -> Lesen/Senden im
  // fremden Claim-Chat. Der User-Client-Read ist RLS-gescoped (claims-Policies).
  if (!(await darfClaimSehen(supabase, claimId))) return { ok: false, error: 'Kein Zugriff auf diesen Claim.' }
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

  // Zustellungs-Routing (Datenmodell A): Staff-Nachrichten in der kunde_gruppe werden dem
  // Kunden zusaetzlich via WhatsApp zugestellt -> die Zeile traegt dann kanal='whatsapp'
  // (in v1 UND v2 sichtbar). team_intern/direkt + Kunde-Sender bleiben thread-nativ (kanal null).
  // Zustellungs-Routing SCHARF (Aaron 08.07. „stell es scharf"): DEFAULT AN, Kill-Switch
  // CHAT_ZUSTELLUNG_WHATSAPP=0. Verifiziert gegen die prod-Leads der kunde_gruppe-Threads: der
  // Guard unten (istTestEmail + @claimondo.de + email-los) unterdrueckt ALLE aktuellen Test/internen
  // Leads; der einzige nicht-gefangene Rest (disposable @web-library.net) hat eine Test-Telefonnummer
  // (+4915510000099) -> Baileys-No-Op. Kein echter Empfaenger wird gespammt.
  const zustellungAktiv = process.env.CHAT_ZUSTELLUNG_WHATSAPP !== '0'
  const staffInGruppe = thread.art === 'kunde_gruppe' && !!prof?.rolle && prof.rolle !== 'kunde'

  const admin = createAdminClient() as unknown as SupabaseClient

  // Zustell-Kanal VOR dem Insert bestimmen (Datenmodell A: kanal markiert den TATSAECHLICHEN Kanal).
  // WhatsApp bevorzugt (Telefon), sonst E-Mail-Fallback (E-Mail ist outbound-only, kein Inbound-Webhook).
  // Defense-in-Depth: Test-Kunden (@claimondo.de / Test-Marker / email-los) bekommen KEINE echte
  // Zustellung — istTestEmail faengt @claimondo.de nicht, daher hier explizit.
  let zustellKanal: 'whatsapp' | 'email' | null = null
  let zielLead: { email: string | null; telefon: string | null; vorname: string | null } | null = null
  if (zustellungAktiv && staffInGruppe) {
    const { data: claim } = await admin
      .from('claims')
      .select('lead_id, leads(email, telefon, vorname)')
      .eq('id', thread.claim_id)
      .maybeSingle()
    const leadJoin = (claim as { leads?: unknown } | null)?.leads
    zielLead = (Array.isArray(leadJoin) ? leadJoin[0] : leadJoin) as
      | { email: string | null; telefon: string | null; vorname: string | null }
      | null
    const { istTestEmail } = await import('@/lib/testdaten/ist-test-email')
    const zielEmail = zielLead?.email ?? null
    const istTestKunde = !zielEmail || istTestEmail(zielEmail) || /@claimondo\.(de|test)$/i.test(zielEmail)
    if (!istTestKunde) {
      if (zielLead?.telefon) zustellKanal = 'whatsapp'
      else if (zielLead?.email) zustellKanal = 'email'
    }
  }

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
      kanal: zustellKanal,
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }

  // Zustellung via die BESTEHENDE isolierte Send-Infra. Non-critical: ein Fehler bricht NIE den
  // Thread-Save. Test/interne Empfaenger sind oben bereits ausgeschlossen (zustellKanal bleibt null).
  if (zustellKanal === 'whatsapp' && zielLead?.telefon) {
    try {
      const { sendCommunication } = await import('@/lib/communications/send')
      await sendCommunication('freitext', {
        telefon: zielLead.telefon,
        vorname: zielLead.vorname ?? '',
        '1': inhalt,
      }).catch(() => {})
    } catch (err) {
      console.error('[Zustellung] Thread->WhatsApp Fehler:', err)
    }
  } else if (zustellKanal === 'email' && zielLead?.email) {
    try {
      const { sendEmail } = await import('@/lib/email/google/client')
      const sicher = inhalt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      await sendEmail({
        to: zielLead.email,
        subject: 'Neue Nachricht zu Ihrem Schadenfall',
        html: `<p>Sie haben eine neue Nachricht von Ihrem Claimondo-Team:</p><p>${sicher}</p>`,
        text: inhalt,
      }).catch(() => {})
    } catch (err) {
      console.error('[Zustellung] Thread->E-Mail Fehler:', err)
    }
  }

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
/** Resolvt user_ids -> Anzeigenamen (profiles.anzeigename ?? vorname+nachname). Nicht Gefundene fehlen in der Map. */
async function ladeProfilNamen(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(userIds.filter(Boolean))]
  const map = new Map<string, string>()
  if (uniq.length === 0) return map
  const { data } = await admin.from('profiles').select('id, anzeigename, vorname, nachname').in('id', uniq)
  for (const p of (data ?? []) as Array<{ id: string; anzeigename: string | null; vorname: string | null; nachname: string | null }>) {
    const name = p.anzeigename ?? ([p.vorname, p.nachname].filter(Boolean).join(' ') || null)
    if (name) map.set(p.id, name)
  }
  return map
}

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
    .select('thread_id, rolle, user_id')
    .in(
      'thread_id',
      threads.map((t) => t.id),
    )
  const rollenProThread = new Map<string, string[]>()
  const andererUserProThread = new Map<string, string>() // direkt: der Teilnehmer != ich (= der DM-Partner)
  for (const p of (teil ?? []) as { thread_id: string; rolle: string | null; user_id: string }[]) {
    const arr = rollenProThread.get(p.thread_id) ?? []
    if (p.rolle) arr.push(p.rolle)
    rollenProThread.set(p.thread_id, arr)
    if (p.user_id !== user.id) andererUserProThread.set(p.thread_id, p.user_id)
  }

  // Direkt-Threads mit dem Namen des Gegenuebers labeln ("Privat: Max Mueller") statt Rollen-Label.
  const direktUserIds = threads
    .filter((t) => t.art === 'direkt')
    .map((t) => andererUserProThread.get(t.id))
    .filter(Boolean) as string[]
  const namen = await ladeProfilNamen(admin, direktUserIds)

  return {
    ok: true,
    data: threads.map((t) => {
      if (t.art === 'direkt') {
        const other = andererUserProThread.get(t.id)
        const name = other ? namen.get(other) : undefined
        if (name) return { id: t.id, art: t.art, label: `Privat: ${name}` }
      }
      return { id: t.id, art: t.art, label: threadLabel(t.art, rollenProThread.get(t.id) ?? []) }
    }),
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
  const resolved = await resolveClaimUserIds(admin, claim as DmKandidatenClaim)
  const kandidaten = leiteDmKandidaten(resolved, user.id)
  const namen = await ladeProfilNamen(admin, kandidaten.map((k) => k.userId))
  return {
    ok: true,
    data: kandidaten.map((k) => {
      const name = namen.get(k.userId)
      return { userId: k.userId, rolle: k.rolle, label: name ? `${name} · ${rolleLabel(k.rolle)}` : rolleLabel(k.rolle) }
    }),
  }
}

/** Ungelesene Nachrichten pro Claim fuer die Inbox-Sidebar (eigene Thread-Membership + zuletzt_gelesen_am). */
export async function ladeClaimUnreadCounts(claimIds: string[]): Promise<Ergebnis<Record<string, number>>> {
  const { user } = await aktuellerUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  if (claimIds.length === 0) return { ok: true, data: {} }
  const admin = createAdminClient() as unknown as SupabaseClient

  // Eigene Memberships in den betroffenen Claims (+ zuletzt_gelesen_am). !inner-Join auf
  // chat_threads liefert die claim_id; Nested-FK je nach Cardinality Array|Objekt -> normalisieren.
  const { data: membRaw } = await admin
    .from('chat_thread_teilnehmer')
    .select('thread_id, zuletzt_gelesen_am, chat_threads!inner(claim_id)')
    .eq('user_id', user.id)
    .in('chat_threads.claim_id', claimIds)
  const memberships = ((membRaw ?? []) as Array<{
    thread_id: string
    zuletzt_gelesen_am: string | null
    chat_threads: { claim_id: string } | { claim_id: string }[]
  }>)
    .map((m) => {
      const ct = Array.isArray(m.chat_threads) ? m.chat_threads[0] : m.chat_threads
      return { threadId: m.thread_id, claimId: ct?.claim_id ?? '', zuletztGelesenAm: m.zuletzt_gelesen_am }
    })
    .filter((m) => m.claimId)
  if (memberships.length === 0) return { ok: true, data: {} }

  const { data: nachrRaw } = await admin
    .from('nachrichten')
    .select('thread_id, created_at, sender_id')
    .in(
      'thread_id',
      memberships.map((m) => m.threadId),
    )
  const nachrichten = ((nachrRaw ?? []) as Array<{ thread_id: string; created_at: string; sender_id: string | null }>).map(
    (n) => ({ threadId: n.thread_id, createdAt: n.created_at, senderId: n.sender_id }),
  )

  return { ok: true, data: aggregiereUnreadProClaim(memberships, nachrichten, user.id) }
}
