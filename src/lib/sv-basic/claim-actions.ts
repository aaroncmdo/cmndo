'use server'

// src/lib/sv-basic/claim-actions.ts
// Service-role server actions fuer den SV-Basic-Claim-Flow.
// Action 1: sucheSvLeadKandidaten — Suche ohne PII-Exponierung (anon-safe)
// Action 2: beanspracheSvLead     — Account-Erstellung + rollback-safe cascade
//
// RULE: Kein throw — alle Fehler als { ok: false; error: string }.
// RULE: Kein Export von Typen/Konstanten ausser async functions (AAR-664).

import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import {
  istClaimbar,
  buildSvInsertAusLead,
  normalisiereSuche,
  type SvLeadRow,
} from './claim-eligibility'

// ─── Helpers (modul-private, nicht exportiert) ─────────────────────────────

function randomPassword(length: number): string {
  // Lesbare Zeichen — verwirrt angemeldete SVs nicht beim Copy-Paste
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('')
}

async function resolveIpHash(): Promise<string | null> {
  const hdrs = await headers()
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip')?.trim() ||
    null
  if (!ip) return null
  return createHash('sha256').update(ip).digest('hex')
}

// Gemeinsame Rate-Limit-Prüfung. failClosed=true → RPC-Fehler = ablehnen.
// failClosed=false → RPC-Fehler = durchlassen (Suche ist low-risk).
async function checkRateLimit(
  failClosed: boolean,
): Promise<{ allowed: boolean; noIp: boolean }> {
  const ipHash = await resolveIpHash()
  if (!ipHash) {
    // Keine IP = kein Rate-Limit moeglich. Bei fail-closed ablehnen.
    return { allowed: !failClosed, noIp: true }
  }

  const adminDb = createAdminClient()
  const { data: allowed, error: rlErr } = await adminDb.rpc('check_gfa_rate_limit', {
    p_ip_hash: ipHash,
  })
  if (rlErr) {
    console.error('[sv-basic/claim-actions] rate-limit rpc failed:', rlErr.message)
    // failClosed: transient RPC error = ablehnen. failOpen: durchlassen.
    return { allowed: !failClosed, noIp: false }
  }
  return { allowed: allowed !== false, noIp: false }
}

// ─── Action 1: sucheSvLeadKandidaten ──────────────────────────────────────

export async function sucheSvLeadKandidaten(query: string): Promise<
  | { ok: true; kandidaten: Array<{ id: string; vorname: string | null; name: string | null; firma: string | null; plz: string | null; ort: string | null }> }
  | { ok: false; error: string }
> {
  // Rate-Limit — fail-OPEN (Suche ist low-risk; transiente RPC-Fehler sollen
  // legitime Suchen nicht blockieren. IP-Dedup ist best-effort hier.)
  const rl = await checkRateLimit(false)
  if (!rl.allowed) {
    return { ok: false, error: 'Zu viele Anfragen, bitte kurz warten.' }
  }

  const normalized = normalisiereSuche(query)
  if (normalized.length < 2) {
    return { ok: true, kandidaten: [] }
  }

  const adminDb = createAdminClient()

  // MINIMAL projection — KEIN telefon/email/adresse/dat_id raus (PII-Schutz).
  // Anon-User sieht nur genug um seinen eigenen Eintrag zu erkennen.
  const { data, error } = await adminDb
    .from('sv_leads')
    .select('id, vorname, name, firma, plz, ort')
    .eq('ist_aktiv', true)
    .eq('claim_status', 'offen')
    .is('konvertiert_zu_sv_id', null)
    .or(
      [
        `name.ilike.%${normalized}%`,
        `vorname.ilike.%${normalized}%`,
        `firma.ilike.%${normalized}%`,
        `plz.ilike.${normalized}%`,
        `dat_id.ilike.%${normalized}%`,
        `dat_expert_nr.ilike.%${normalized}%`,
      ].join(','),
    )
    .limit(20)

  if (error) {
    console.error('[sv-basic/sucheSvLeadKandidaten] DB-Fehler:', error.message)
    return { ok: false, error: 'Suche fehlgeschlagen. Bitte versuche es erneut.' }
  }

  return {
    ok: true,
    kandidaten: (data ?? []).map((r) => ({
      id: r.id as string,
      vorname: (r.vorname as string | null) ?? null,
      name: (r.name as string | null) ?? null,
      firma: (r.firma as string | null) ?? null,
      plz: (r.plz as string | null) ?? null,
      ort: (r.ort as string | null) ?? null,
    })),
  }
}

// ─── Action 2: beanspracheSvLead ──────────────────────────────────────────

export async function beanspracheSvLead(input: {
  svLeadId: string
  email: string
  telefon: string
}): Promise<{ ok: true; svId: string } | { ok: false; error: string }> {
  // 1. Validierung
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRx.test(input.email)) {
    return { ok: false, error: 'Ungültige E-Mail-Adresse.' }
  }
  if (!input.telefon || input.telefon.trim().length < 5) {
    return { ok: false, error: 'Telefonnummer ist ein Pflichtfeld.' }
  }

  // Rate-Limit — fail-CLOSED (Account-Erstellung ist sicherheitsrelevant;
  // transiente RPC-Fehler = ablehnen, IP-fehlt = ablehnen).
  const rl = await checkRateLimit(true)
  if (!rl.allowed) {
    if (rl.noIp) {
      console.error('[sv-basic/beanspracheSvLead] Claim-Anfrage ohne ableitbare IP — abgelehnt')
    }
    return { ok: false, error: 'Zu viele Anfragen, bitte kurz warten.' }
  }

  const adminDb = createAdminClient()

  // 2. Lead laden (Service-Role — alle Spalten fuer buildSvInsertAusLead)
  type LeadFullRow = SvLeadRow & {
    id: string
    claim_status: string | null
    konvertiert_zu_sv_id: string | null
    nachname: string | null
  }
  const { data: lead, error: leadErr } = await adminDb
    .from('sv_leads')
    .select('*')
    .eq('id', input.svLeadId)
    .single<LeadFullRow>()

  if (leadErr || !lead) {
    return { ok: false, error: 'Eintrag nicht gefunden.' }
  }

  // 3. Eligibility-Gate
  if (!istClaimbar({ claim_status: lead.claim_status, konvertiert_zu_sv_id: lead.konvertiert_zu_sv_id })) {
    return { ok: false, error: 'Dieser Eintrag wurde bereits beansprucht.' }
  }

  // 4. Email-Dedupe: kein zweiter Account auf dieselbe Adresse
  const { data: existingProfile } = await adminDb
    .from('profiles')
    .select('id')
    .eq('email', input.email)
    .maybeSingle()

  if (existingProfile) {
    return {
      ok: false,
      error:
        'Zu dieser E-Mail existiert bereits ein Konto. Bitte melde dich an.',
    }
  }

  // 5. Auth-User anlegen
  const initialPassword = randomPassword(16)
  const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
    email: input.email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: {
      force_password_change: true,
      onboarding_quelle: 'self_service_claim',
    },
  })

  if (authErr || !authData?.user) {
    return {
      ok: false,
      error: `Konto-Erstellung fehlgeschlagen: ${authErr?.message ?? 'unbekannt'}`,
    }
  }
  const userId = authData.user.id

  // 6. Profil anlegen
  const { error: profileErr } = await adminDb.from('profiles').insert({
    id: userId,
    email: input.email,
    rolle: 'sachverstaendiger',
    vorname: lead.vorname ?? null,
    nachname: lead.nachname ?? null,
    telefon: input.telefon.trim(),
    force_password_change: true,
    // AAR-697-Muster: 2FA explizit AUS — sonst landet der SV beim ersten
    // Login auf /login/2fa statt im Onboarding.
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
  })

  if (profileErr) {
    // Rollback auth user
    await adminDb.auth.admin.deleteUser(userId)
    return {
      ok: false,
      error: `Profil-Anlage fehlgeschlagen: ${profileErr.message}`,
    }
  }

  // 7. sachverstaendige-Zeile anlegen
  const svInsert = {
    ...buildSvInsertAusLead(lead as SvLeadRow, userId),
    // 48h-Frist bis Freigabe-Pruefung (P3-Admin-Freigabe)
    verifizierung_frist_bis: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  }

  const { data: svRow, error: svErr } = await adminDb
    .from('sachverstaendige')
    .insert(svInsert)
    .select('id')
    .single()

  if (svErr || !svRow) {
    // Rollback profil + auth
    await adminDb.from('profiles').delete().eq('id', userId)
    await adminDb.auth.admin.deleteUser(userId)
    return {
      ok: false,
      error: `SV-Eintrag fehlgeschlagen: ${svErr?.message ?? 'unbekannt'}`,
    }
  }

  const svId = (svRow as { id: string }).id

  // 8. sv_leads claim-link setzen
  // Design-Lock: ist_aktiv BLEIBT true — der neue Account ist NICHT verifiziert
  // und erscheint daher NICHT auf der oeffentlichen Karte. Die Cold-Pin (ist_aktiv=true)
  // muss waehrend des 48h-Pending-Fensters sichtbar bleiben, sonst entsteht ein
  // Karten-Loch. P3-Freigabe deaktiviert den Pin, wenn der Account live geht.
  const { error: linkErr } = await adminDb
    .from('sv_leads')
    .update({
      konvertiert_zu_sv_id: svId,
      konvertiert_am: new Date().toISOString(),
      claim_status: 'beansprucht_pending',
      // ist_aktiv = unveraendert (kein Update hier — Cold-Pin bleibt aktiv)
    })
    .eq('id', input.svLeadId)

  if (linkErr) {
    // Rollback SV + profil + auth
    await adminDb.from('sachverstaendige').delete().eq('id', svId)
    await adminDb.from('profiles').delete().eq('id', userId)
    await adminDb.auth.admin.deleteUser(userId)
    return {
      ok: false,
      error: `Claim-Verknuepfung fehlgeschlagen: ${linkErr.message}`,
    }
  }

  // ─── Sub-Operationen (alle non-critical, eigener try/catch) ─────────────

  // 8a. WhatsApp-Verfuegbarkeits-Cache (fire-and-forget)
  try {
    const { checkAndCacheAvailability } = await import('@/lib/whatsapp/availability')
    void checkAndCacheAvailability('profile', userId, input.telefon.trim())
  } catch (err) {
    console.error('[sv-basic/beanspracheSvLead] WA-Cache fehlgeschlagen:', err)
  }

  // 8b. Magic-Link-Email (Eigentumsnachweis — Recovery-Link an beanspruchte Adresse)
  try {
    const { data: linkData, error: linkGenErr } =
      await adminDb.auth.admin.generateLink({
        type: 'recovery',
        email: input.email,
      })
    if (linkGenErr || !linkData?.properties?.action_link) {
      console.error('[sv-basic/beanspracheSvLead] Magic-Link-Generierung fehlgeschlagen:', linkGenErr?.message)
    } else {
      const actionUrl = linkData.properties.action_link
      const { sendSvBasicClaimLink } = await import('@/lib/email/google/flows')
      const emailResult = await sendSvBasicClaimLink({
        to: input.email,
        vorname: lead.vorname ?? null,
        actionUrl,
      })
      if (!emailResult.success) {
        console.error('[sv-basic/beanspracheSvLead] Claim-Link-Email fehlgeschlagen:', emailResult.error)
      }
    }
  } catch (err) {
    console.error('[sv-basic/beanspracheSvLead] Magic-Link-Sub-Op fehlgeschlagen:', err)
  }

  // 8c. Admin-Task "Neue Basic-Claim wartet auf Freigabe"
  try {
    const { createLinkedTask } = await import('@/lib/tasks/create-task')
    await createLinkedTask({
      titel: 'Neue Basic-Claim wartet auf Freigabe',
      beschreibung: `SV-Lead ${input.svLeadId} wurde von ${input.email} beansprucht. Bitte Identität prüfen und Konto freigeben.`,
      prioritaet: 'normal',
      typ: 'sv_basic_claim_review',
      entity_type: 'gutachter',
      entity_id: svId,
      empfaenger_rolle: 'admin',
      task_code: 'sv_basic_claim_review',
      trigger_event: 'sv_basic_claim_created',
      auto_erstellt: true,
    })
  } catch (err) {
    console.error('[sv-basic/beanspracheSvLead] Admin-Task fehlgeschlagen:', err)
  }

  // kein revalidatePath — anon-Pfad, kein Admin-Route hier bekannt
  return { ok: true, svId }
}
