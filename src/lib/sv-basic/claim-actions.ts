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
  // PostgREST-Filter-Injection + LIKE-Wildcard-Abuse verhindern: normalisiereSuche
  // (trim+lowercase) escapt PostgREST-Metazeichen NICHT. Der Term wird unten roh in
  // den .or()-Filter-String interpoliert -> ',' '(' ')' '.' ':' wuerden als
  // PostgREST-Syntax geparst, '%' '*' als SQL-LIKE-Wildcard. Alle entfernen.
  const safe = normalized.replace(/[%,()*.:\\]/g, ' ').trim()
  if (safe.length < 2) {
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
        `name.ilike.%${safe}%`,
        `vorname.ilike.%${safe}%`,
        `firma.ilike.%${safe}%`,
        `plz.ilike.${safe}%`,
        `dat_id.ilike.%${safe}%`,
        `dat_expert_nr.ilike.%${safe}%`,
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
  // Optimistic Lock gegen Doppel-Claim-Race (TOCTOU): das zusaetzliche
  // .eq('claim_status','offen') sorgt dafuer, dass nur der ERSTE parallele Claim
  // den Pin umschreibt. Verliert ein zweiter Claim das Rennen (zwischen
  // Eligibility-Gate oben und diesem UPDATE), liefert das UPDATE 0 Zeilen
  // -> wir rollen den gerade angelegten Account zurueck.
  const { data: linkedRows, error: linkErr } = await adminDb
    .from('sv_leads')
    .update({
      konvertiert_zu_sv_id: svId,
      konvertiert_am: new Date().toISOString(),
      claim_status: 'beansprucht_pending',
      // ist_aktiv = unveraendert (kein Update hier — Cold-Pin bleibt aktiv)
    })
    .eq('id', input.svLeadId)
    .eq('claim_status', 'offen')
    .select('id')

  if (linkErr || !linkedRows || linkedRows.length === 0) {
    // Rollback SV + profil + auth (linkErr ODER Race verloren = 0 Zeilen)
    await adminDb.from('sachverstaendige').delete().eq('id', svId)
    await adminDb.from('profiles').delete().eq('id', userId)
    await adminDb.auth.admin.deleteUser(userId)
    return {
      ok: false,
      error: linkErr
        ? `Claim-Verknuepfung fehlgeschlagen: ${linkErr.message}`
        : 'Dieser Eintrag wurde bereits beansprucht.',
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

// ─── Action 3: registriereSvBasicNeu ──────────────────────────────────────
// Frische SV-Registrierung ohne Cold-Pin (kein sv_leads-Eintrag vorhanden).
// datNr ist Pflicht — dient als Identitaetsgrundlage fuer die P3-Pruefung.

export async function registriereSvBasicNeu(input: {
  vorname: string
  nachname: string
  email: string
  telefon: string
  adresse: string
  plz?: string
  datNr: string
}): Promise<{ ok: true; svId: string } | { ok: false; error: string }> {
  // 1. Validierung
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRx.test(input.email)) {
    return { ok: false, error: 'Ungültige E-Mail-Adresse.' }
  }
  if (!input.telefon || input.telefon.trim().length < 5) {
    return { ok: false, error: 'Telefonnummer ist ein Pflichtfeld.' }
  }
  if (!input.vorname?.trim()) {
    return { ok: false, error: 'Vorname ist ein Pflichtfeld.' }
  }
  if (!input.nachname?.trim()) {
    return { ok: false, error: 'Nachname ist ein Pflichtfeld.' }
  }
  if (!input.adresse?.trim()) {
    return { ok: false, error: 'Adresse ist ein Pflichtfeld.' }
  }
  if (!input.datNr?.trim()) {
    return { ok: false, error: 'DAT-Nummer ist ein Pflichtfeld (Identitaetsnachweis fuer die Freigabe).' }
  }

  // 2. Rate-Limit — fail-CLOSED (Account-Erstellung ist sicherheitsrelevant)
  const rl = await checkRateLimit(true)
  if (!rl.allowed) {
    if (rl.noIp) {
      console.error('[sv-basic/registriereSvBasicNeu] Registrierungsanfrage ohne ableitbare IP — abgelehnt')
    }
    return { ok: false, error: 'Zu viele Anfragen, bitte kurz warten.' }
  }

  // 3. Admin-Client
  const adminDb = createAdminClient()

  // 4. Email-Dedupe: kein zweiter Account auf dieselbe Adresse
  const { data: existingProfile } = await adminDb
    .from('profiles')
    .select('id')
    .eq('email', input.email)
    .maybeSingle()

  if (existingProfile) {
    return {
      ok: false,
      error: 'Zu dieser E-Mail existiert bereits ein Konto. Bitte melde dich an.',
    }
  }

  // 5. Geocoding der Adresse — best-effort, blockiert NICHT bei Fehler.
  // Das pendende Konto ist bis zur P3-Freigabe ohnehin nicht kartensichtbar.
  let geoLat: number | null = null
  let geoLng: number | null = null
  try {
    const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
    const geo = await geocodeAdresse(input.adresse.trim())
    if (geo) {
      geoLat = geo.lat
      geoLng = geo.lng
    } else {
      console.warn('[sv-basic/registriereSvBasicNeu] Geocoding lieferte kein Ergebnis fuer Adresse:', input.adresse)
    }
  } catch (err) {
    console.error('[sv-basic/registriereSvBasicNeu] Geocoding fehlgeschlagen (non-blocking):', err)
  }

  // 6. Auth-User anlegen
  const initialPassword = randomPassword(16)
  const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
    email: input.email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: {
      force_password_change: true,
      onboarding_quelle: 'self_service_neu',
    },
  })

  if (authErr || !authData?.user) {
    return {
      ok: false,
      error: `Konto-Erstellung fehlgeschlagen: ${authErr?.message ?? 'unbekannt'}`,
    }
  }
  const userId = authData.user.id

  // 7. Profil anlegen
  const { error: profileErr } = await adminDb.from('profiles').insert({
    id: userId,
    email: input.email,
    rolle: 'sachverstaendiger',
    vorname: input.vorname.trim(),
    nachname: input.nachname.trim(),
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

  // 8. sachverstaendige-Zeile anlegen.
  // Synthetisches SvLeadRow-Objekt aus dem Eingabe-Input aufbauen.
  const synthetic: SvLeadRow = {
    vorname: input.vorname.trim(),
    name: input.nachname.trim(),
    nachname: input.nachname.trim(),
    firma: null,
    telefon: input.telefon.trim(),
    email: input.email,
    adresse: input.adresse.trim(),
    plz: input.plz ?? null,
    ort: null,
    lat: geoLat,
    lng: geoLng,
    dat_id: null,
    dat_expert_nr: input.datNr.trim(),
    bvsk_nr: null,
    ihk_zertifikat: null,
    oebuv_nr: null,
    qualifikationen: null,
    fachschwerpunkte: null,
    jahre_erfahrung: null,
    isochrone_polygon: null,
    paket_umkreis_km: null,
  }

  const svInsert = {
    ...buildSvInsertAusLead(synthetic, userId),
    // Quellen-Override: buildSvInsertAusLead hardcodet 'self_service_claim',
    // fuer Frisch-Registrierung ist 'self_service_neu' korrekt.
    onboarding_quelle: 'self_service_neu',
    // 48h-Frist bis P3-Admin-Freigabe
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

  // ─── Sub-Operationen (alle non-critical, eigener try/catch) ─────────────

  // 9a. WhatsApp-Verfuegbarkeits-Cache (fire-and-forget)
  try {
    const { checkAndCacheAvailability } = await import('@/lib/whatsapp/availability')
    void checkAndCacheAvailability('profile', userId, input.telefon.trim())
  } catch (err) {
    console.error('[sv-basic/registriereSvBasicNeu] WA-Cache fehlgeschlagen:', err)
  }

  // 9b. Magic-Link-Email (Eigentumsnachweis — Recovery-Link an neue Adresse)
  try {
    const { data: linkData, error: linkGenErr } =
      await adminDb.auth.admin.generateLink({
        type: 'recovery',
        email: input.email,
      })
    if (linkGenErr || !linkData?.properties?.action_link) {
      console.error('[sv-basic/registriereSvBasicNeu] Magic-Link-Generierung fehlgeschlagen:', linkGenErr?.message)
    } else {
      const actionUrl = linkData.properties.action_link
      const { sendSvBasicClaimLink } = await import('@/lib/email/google/flows')
      const emailResult = await sendSvBasicClaimLink({
        to: input.email,
        vorname: input.vorname.trim(),
        actionUrl,
      })
      if (!emailResult.success) {
        console.error('[sv-basic/registriereSvBasicNeu] Claim-Link-Email fehlgeschlagen:', emailResult.error)
      }
    }
  } catch (err) {
    console.error('[sv-basic/registriereSvBasicNeu] Magic-Link-Sub-Op fehlgeschlagen:', err)
  }

  // 9c. Admin-Task "Neue Basic-Registrierung wartet auf Freigabe"
  try {
    const { createLinkedTask } = await import('@/lib/tasks/create-task')
    await createLinkedTask({
      titel: 'Neue Basic-Registrierung wartet auf Freigabe',
      beschreibung: `Frische SV-Selbstregistrierung von ${input.email} (DAT-Nr: ${input.datNr.trim()}). Bitte Identitaet pruefen und Konto freigeben.`,
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
    console.error('[sv-basic/registriereSvBasicNeu] Admin-Task fehlgeschlagen:', err)
  }

  // kein revalidatePath — anon-Pfad, kein Admin-Route hier bekannt
  return { ok: true, svId }
}
