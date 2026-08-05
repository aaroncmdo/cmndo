'use server'

// claimondo-marketing/lib/sv-basic/claim-actions.ts
// Service-role server actions fuer den SV-Basic-Claim-Flow.
// Action 1: sucheSvLeadKandidaten — Suche ohne PII-Exponierung (anon-safe)
// Action 2: beanspracheSvLead     — Account-Erstellung + rollback-safe cascade
// Action 3: registriereSvBasicNeu — Frische SV-Registrierung ohne Cold-Pin
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

// M3: namespace-Parameter eingebaut — jeder Flow bekommt einen eigenen Rate-Limit-Bucket.
// Vorher: alle drei Flows (search/claim/neu) teilten einen einzigen 5/IP/h-Bucket.
async function resolveIpHash(namespace: string): Promise<string | null> {
  const hdrs = await headers()
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip')?.trim() ||
    null
  if (!ip) return null
  return createHash('sha256').update(ip + ':' + namespace).digest('hex')
}

// Gemeinsame Rate-Limit-Prüfung. failClosed=true → RPC-Fehler = ablehnen.
// failClosed=false → RPC-Fehler = durchlassen (Suche ist low-risk).
// namespace trennt die Buckets: 'sv-basic-search' / 'sv-basic-claim' / 'sv-basic-neu'.
async function checkRateLimit(
  failClosed: boolean,
  namespace: string,
): Promise<{ allowed: boolean; noIp: boolean }> {
  const ipHash = await resolveIpHash(namespace)
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
  const rl = await checkRateLimit(false, 'sv-basic-search')
  if (!rl.allowed) {
    return { ok: false, error: 'Zu viele Anfragen, bitte kurz warten.' }
  }

  // Tokenized search — PostgREST-Filter-Injection + LIKE-Wildcard-Abuse verhindern.
  // Pro Token ein .or()-Block; mehrere .or()-Aufrufe verknuepft PostgREST als AND ->
  // jedes Token muss (in irgendeiner Spalte) matchen.
  const tokens = normalisiereSuche(query)
    .replace(/[%,()*.:\\-]/g, ' ').trim()
    .split(/\s+/).filter((t) => t.length >= 2)
  if (tokens.length === 0) return { ok: true, kandidaten: [] }

  const adminDb = createAdminClient()

  // MINIMAL projection — KEIN telefon/email/adresse/dat_id raus (PII-Schutz).
  // Anon-User sieht nur genug um seinen eigenen Eintrag zu erkennen.
  let q = adminDb
    .from('sv_leads')
    .select('id, vorname, name, firma, plz, ort')
    .eq('ist_aktiv', true)
    .eq('claim_status', 'offen')
    .is('konvertiert_zu_sv_id', null)
  for (const t of tokens) {
    q = q.or(
      [
        `name.ilike.%${t}%`,
        `vorname.ilike.%${t}%`,
        `firma.ilike.%${t}%`,
        `plz.ilike.${t}%`,
        `dat_id.ilike.%${t}%`,
        `dat_expert_nr.ilike.%${t}%`,
      ].join(','),
    )
  }
  const { data, error } = await q.limit(20)

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
}): Promise<{ ok: true; svId: string; emailSent: boolean } | { ok: false; error: string }> {
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
  const rl = await checkRateLimit(true, 'sv-basic-claim')
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
    // M1: Kein raw authErr.message an den anon-Client — Postgres/Supabase-Constraints bleiben server-side.
    console.error('[sv-basic/beanspracheSvLead] Konto-Erstellung fehlgeschlagen:', authErr?.message)
    return {
      ok: false,
      error: 'Konto konnte nicht angelegt werden. Bitte versuche es erneut.',
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
    // M1: Kein raw profileErr.message an den anon-Client.
    console.error('[sv-basic/beanspracheSvLead] Profil-Anlage fehlgeschlagen:', profileErr.message)
    return {
      ok: false,
      error: 'Konto konnte nicht angelegt werden. Bitte versuche es erneut.',
    }
  }

  // 7. sachverstaendige-Zeile anlegen
  // H1: KEIN verifizierung_frist_bis fuer Basic: das Feld + verifizierung_status='ausstehend'
  // triggert sonst den Tier-2-Verifizierungs-Cron (api/cron/verifizierung-reminder:
  // selektiert verifizierung_status='ausstehend' AND frist IS NOT NULL, KEIN paket-Guard)
  // -> faelschlich "Verifizierung ueberfaellig"-Mail + frist_ueberschritten-Flip + kritisch-
  // Admin-Task + Tier-2-Countdown auf der SV-Seite. Die 48h-Team-Review-SLA fuer Basic
  // gehoert in P3 (Freigabe-Queue), nicht in dieses Tier-2-Feld. (Review-Finding H1.)
  const svInsert = buildSvInsertAusLead(lead as SvLeadRow, userId)

  const { data: svRow, error: svErr } = await adminDb
    .from('sachverstaendige')
    .insert(svInsert)
    .select('id')
    .single()

  if (svErr || !svRow) {
    // Rollback profil + auth
    await adminDb.from('profiles').delete().eq('id', userId)
    await adminDb.auth.admin.deleteUser(userId)
    // M1: Kein raw svErr.message an den anon-Client.
    console.error('[sv-basic/beanspracheSvLead] SV-Eintrag fehlgeschlagen:', svErr?.message)
    return {
      ok: false,
      error: 'Registrierung fehlgeschlagen. Bitte versuche es erneut.',
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
    if (linkErr) {
      // M1: Kein raw linkErr.message an den anon-Client.
      console.error('[sv-basic/beanspracheSvLead] Claim-Verknuepfung fehlgeschlagen:', linkErr.message)
      return { ok: false, error: 'Registrierung fehlgeschlagen. Bitte versuche es erneut.' }
    }
    // Race verloren — intentionale UX-Nachricht (kein Daten-Leak).
    return { ok: false, error: 'Dieser Eintrag wurde bereits beansprucht.' }
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
  // M2: emailSent tracken — Bestaetigungs-UI zeigt unterschiedlichen Text je nach Ergebnis.
  let emailSent = false
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
      const { sendSvBasicClaimLink } = await import('@/lib/email/google/sv-basic-claim-email')
      const emailResult = await sendSvBasicClaimLink({
        to: input.email,
        vorname: lead.vorname ?? null,
        actionUrl,
      })
      if (emailResult.success === true) {
        emailSent = true
      } else {
        console.error('[sv-basic/beanspracheSvLead] Claim-Link-Email fehlgeschlagen:', emailResult.error)
      }
    }
  } catch (err) {
    console.error('[sv-basic/beanspracheSvLead] Magic-Link-Sub-Op fehlgeschlagen:', err)
  }

  // 8c. Admin-Task "Neue Basic-Claim wartet auf Freigabe"
  // TODO: createLinkedTask aus dem main-App-Helper hat auto-assign + Reminder-Kaskade.
  // Hier direkt insert (marketing-app hat kein lib/tasks/). Non-critical sub-op.
  try {
    await adminDb.from('tasks').insert({
      fall_id: null,
      typ: 'sv_basic_claim_review',
      titel: 'Neue Basic-Claim wartet auf Freigabe',
      beschreibung: `SV-Lead ${input.svLeadId} wurde von ${input.email} beansprucht. Bitte Identitaet pruefen und Konto freigeben.`,
      status: 'offen',
      prioritaet: 'normal',
      zugewiesen_an: null,
      empfaenger_rolle: 'admin',
      empfaenger_user_id: null,
      faellig_am: null,
      auto_erstellt: true,
      phase: null,
      task_code: 'sv_basic_claim_review',
      trigger_event: 'sv_basic_claim_created',
      entity_type: 'gutachter',
      entity_id: svId,
    })
  } catch (err) {
    console.error('[sv-basic/beanspracheSvLead] Admin-Task fehlgeschlagen:', err)
  }

  // 8d. Team-WhatsApp (Helper wirft nie; interne/Test-Identitaeten unterdrueckt er) —
  //     neue Marketing-Funnel-Partner sofort aufs Team-Handy (Aaron-Direktive 05.08.).
  try {
    const { notifyTeamPartnerSignup } = await import('@/lib/partner/notify-team-signup')
    await notifyTeamPartnerSignup({
      typ: 'gutachter',
      art: 'registrierung',
      quelle: 'claimondo.de/gutachter-partner (LP-Karten-Claim)',
      firma: lead.firma,
      name: [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null,
      email: input.email,
      telefon: input.telefon,
      ort: [lead.plz, lead.ort].filter(Boolean).join(' ') || null,
      adminPfad: '/admin/sachverstaendige/basic-freigaben',
    })
  } catch (err) {
    console.error('[sv-basic/beanspracheSvLead] Team-WA-Notify fehlgeschlagen (non-critical):', err)
  }

  // kein revalidatePath — anon-Pfad, kein Admin-Route hier bekannt
  return { ok: true, svId, emailSent }
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
}): Promise<{ ok: true; svId: string; emailSent: boolean } | { ok: false; error: string }> {
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
    return { ok: false, error: 'DAT-Nummer ist ein Pflichtfeld (Identitätsnachweis für die Freigabe).' }
  }

  // 2. Rate-Limit — fail-CLOSED (Account-Erstellung ist sicherheitsrelevant)
  const rl = await checkRateLimit(true, 'sv-basic-neu')
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
    // M1: Kein raw authErr.message an den anon-Client.
    console.error('[sv-basic/registriereSvBasicNeu] Konto-Erstellung fehlgeschlagen:', authErr?.message)
    return {
      ok: false,
      error: 'Konto konnte nicht angelegt werden. Bitte versuche es erneut.',
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
    // M1: Kein raw profileErr.message an den anon-Client.
    console.error('[sv-basic/registriereSvBasicNeu] Profil-Anlage fehlgeschlagen:', profileErr.message)
    return {
      ok: false,
      error: 'Konto konnte nicht angelegt werden. Bitte versuche es erneut.',
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

  // H1: KEIN verifizierung_frist_bis fuer Basic (siehe beanspracheSvLead) — das Feld +
  // verifizierung_status='ausstehend' triggert sonst den Tier-2-Verifizierungs-Cron
  // (ueberfaellig-Mail + frist_ueberschritten-Flip + kritisch-Task + Tier-2-Countdown).
  // Die 48h-Team-Review-SLA fuer Basic gehoert in P3 (Freigabe-Queue). (Review-Finding H1.)
  const svInsert = {
    ...buildSvInsertAusLead(synthetic, userId),
    // Quellen-Override: buildSvInsertAusLead hardcodet 'self_service_claim',
    // fuer Frisch-Registrierung ist 'self_service_neu' korrekt.
    onboarding_quelle: 'self_service_neu',
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
    // M1: Kein raw svErr.message an den anon-Client.
    console.error('[sv-basic/registriereSvBasicNeu] SV-Eintrag fehlgeschlagen:', svErr?.message)
    return {
      ok: false,
      error: 'Registrierung fehlgeschlagen. Bitte versuche es erneut.',
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
  // M2: emailSent tracken — Bestaetigungs-UI zeigt unterschiedlichen Text je nach Ergebnis.
  let emailSent = false
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
      const { sendSvBasicClaimLink } = await import('@/lib/email/google/sv-basic-claim-email')
      const emailResult = await sendSvBasicClaimLink({
        to: input.email,
        vorname: input.vorname.trim(),
        actionUrl,
      })
      if (emailResult.success === true) {
        emailSent = true
      } else {
        console.error('[sv-basic/registriereSvBasicNeu] Claim-Link-Email fehlgeschlagen:', emailResult.error)
      }
    }
  } catch (err) {
    console.error('[sv-basic/registriereSvBasicNeu] Magic-Link-Sub-Op fehlgeschlagen:', err)
  }

  // 9c. Admin-Task "Neue Basic-Registrierung wartet auf Freigabe"
  // TODO: createLinkedTask aus dem main-App-Helper hat auto-assign + Reminder-Kaskade.
  // Hier direkt insert (marketing-app hat kein lib/tasks/). Non-critical sub-op.
  try {
    await adminDb.from('tasks').insert({
      fall_id: null,
      typ: 'sv_basic_claim_review',
      titel: 'Neue Basic-Registrierung wartet auf Freigabe',
      beschreibung: `Frische SV-Selbstregistrierung von ${input.email} (DAT-Nr: ${input.datNr.trim()}). Bitte Identitaet pruefen und Konto freigeben.`,
      status: 'offen',
      prioritaet: 'normal',
      zugewiesen_an: null,
      empfaenger_rolle: 'admin',
      empfaenger_user_id: null,
      faellig_am: null,
      auto_erstellt: true,
      phase: null,
      task_code: 'sv_basic_claim_review',
      trigger_event: 'sv_basic_claim_created',
      entity_type: 'gutachter',
      entity_id: svId,
    })
  } catch (err) {
    console.error('[sv-basic/registriereSvBasicNeu] Admin-Task fehlgeschlagen:', err)
  }

  // 9d. Team-WhatsApp (Helper wirft nie; interne/Test-Identitaeten unterdrueckt er) —
  //     neue Marketing-Funnel-Partner sofort aufs Team-Handy (Aaron-Direktive 05.08.).
  try {
    const { notifyTeamPartnerSignup } = await import('@/lib/partner/notify-team-signup')
    await notifyTeamPartnerSignup({
      typ: 'gutachter',
      art: 'registrierung',
      quelle: 'claimondo.de/gutachter-partner (LP-Neu-Registrierung)',
      name: [input.vorname.trim(), input.nachname.trim()].filter(Boolean).join(' ') || null,
      email: input.email,
      telefon: input.telefon,
      ort: input.plz ?? null,
      adminPfad: '/admin/sachverstaendige/basic-freigaben',
      extraFields: [{ label: 'DAT-Nr', value: input.datNr.trim() }],
    })
  } catch (err) {
    console.error('[sv-basic/registriereSvBasicNeu] Team-WA-Notify fehlgeschlagen (non-critical):', err)
  }

  // kein revalidatePath — anon-Pfad, kein Admin-Route hier bekannt
  return { ok: true, svId, emailSent }
}

// ─── Action 4: Claimbare Cold-Pins fuer die gutachter-partner-Karte ───────────
// Privacy: gibt NUR id/lat/lng offener, claimbarer Cold-Leads zurueck — exakt die
// anon-GRANT-Spalten (#2177/#2208). Kein Name/Firma/PLZ verlaesst den Server.
// Service-Role, weil claim_status NICHT in den anon-Spalten-Grants liegt (ein
// anon-Filter darauf wuerfe "permission denied" und killte den Read — vgl. den
// ist_aktiv-Hinweis in gutachter-finder-actions.ts:ladeAktiveSVs).
// Filter (DB-verifiziert 2026-06-04: 62 Pins, quelle='excel_import_2026-05-11'):
// claim_status='offen' + ist_aktiv; die (stillgelegte) Warteliste-Quelle
// 'gutachter-partner-page' ausschliessen, damit nur echte Cold-Pins (Excel-/DAT-
// Importe) als beanspruchbar erscheinen — robust gegen kuenftige Import-Quellen.
export async function ladeClaimbarePinLeads(): Promise<
  { ok: true; data: Array<{ id: string; lat: number; lng: number }> } | { ok: false; error: string }
> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sv_leads')
    .select('id,lat,lng')
    .eq('ist_aktiv', true)
    .eq('claim_status', 'offen')
    .neq('quelle', 'gutachter-partner-page')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
  if (error) return { ok: false, error: error.message }
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    lat: Number(r.lat),
    lng: Number(r.lng),
  }))
  return { ok: true, data: rows }
}
