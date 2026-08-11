'use server'

import { createClient } from '@/lib/supabase/server'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { postChatSystemMessage } from '@/lib/chat/system-messages'
import { generateReminderForTermin, cancelRemindersForTermin } from '@/lib/reminders/generate'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { emitEvent } from '@/lib/notifications/emit'
import { revalidatePath } from 'next/cache'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'
import { ladeBelegung } from '@/lib/termine/engine'
import { touchClaimRecencyByFall } from '@/lib/claims/touch-recency'

type ActionResult = { success: boolean; error?: string }

// CMM-23: Termin-Dauer in ms aus zentraler Konstante (45 Min). Vorher
// hardcoded 90 Min an drei Stellen — fließte als 1,5h-Block in den Kalender.
const TERMIN_DAUER_MS = TERMIN_DAUER_MIN * 60 * 1000

/**
 * CMM-23: Free/Busy-Check vor Termin-Bestätigung. Aaron-Spec: muss auch
 * über CalDAV laufen — wird via checkSvFreeBusy geleistet (Google-First mit
 * CalDAV-Fallback, AAR-717).
 *
 * Returns:
 *   - null = frei oder Status unbekannt (kein Token / API-Timeout) → weiter
 *   - ActionResult-Error = belegt → buchen abbrechen
 */
async function assertSvKalenderFrei(
  admin: ReturnType<typeof createAdminClient>,
  svId: string,
  slotIso: string,
): Promise<ActionResult | null> {
  // Externe-Kalender-Busy (Google/CalDAV) via v_belegung (belegung_typ='extern' =
  // sv_kalender_events_cache, vom Cron befüllt). Bewusst NUR 'extern': Buchungen/
  // Reservierungen (inkl. des eigenen, gerade zu bestätigenden Termins) sind
  // 'buchung' und werden separat behandelt → kein Self-Konflikt. Asymmetrisches
  // Fenster [t-60, t+dauer+60] (identisch zum früheren checkSvFreeBusy).
  const t = new Date(slotIso).getTime()
  const von = new Date(t - 60 * 60_000).toISOString()
  const bis = new Date(t + (TERMIN_DAUER_MIN + 60) * 60_000).toISOString()
  const fenster = await ladeBelegung({ typ: 'sachverstaendiger', id: svId }, von, bis, admin)
  if (fenster.some((f) => f.belegungTyp === 'extern')) {
    return {
      success: false,
      error: 'Sachverständiger ist zu diesem Zeitpunkt anderweitig gebucht (Kalender). Bitte einen anderen Slot wählen.',
    }
  }
  // frei oder DB-Fehler (ladeBelegung fail-open → []) → fail-open, weiter buchen.
  return null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDatumDE(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function getSvName(admin: ReturnType<typeof createAdminClient>, svId: string): Promise<string> {
  const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
  if (!sv?.profile_id) return 'Unbekannt'
  const { data: p } = await admin.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
  return p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || 'Unbekannt' : 'Unbekannt'
}

async function getKundeName(admin: ReturnType<typeof createAdminClient>, kundeId: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('vorname, nachname').eq('id', kundeId).single()
  return p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || 'Unbekannt' : 'Unbekannt'
}

function revalidateTerminPaths(fallId: string) {
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/gutachter/faelle')
  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath('/kunde')
  revalidatePath(`/faelle/${fallId}`)
}

// ─── AUTH: SV Portal ────────────────────────────────────────────────────────

async function authSvPortal(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { error: 'Kein SV-Profil' }
  // CMM-49 (faelle-Drop-Runway): Auth-Gate via v_claim_full (flat, faelle-frei). sv_id-Filter = self-scope.
  const { data: fall } = await supabase.from('v_claim_full').select('fall_id').eq('fall_id', fallId).eq('sv_id', sv.id).single()
  if (!fall) return { error: 'Fall nicht gefunden' }
  return { userId: user.id, svId: sv.id, fallId: fall.fall_id }
}

// ─── AUTH: SV Token ─────────────────────────────────────────────────────────

async function authSvToken(token: string) {
  const svc = createServiceClient()
  const { data: termin } = await svc
    .from('gutachter_termine')
    // CMM-49 (sv_id-Drop): assignee_id statt sv_id. ablehnen_token-Termine sind
    // SV-Termine (assignee_typ='sachverstaendiger') → assignee_id == sv_id, value-identisch.
    .select('id, assignee_id, fall_id, start_zeit, status')
    .eq('ablehnen_token', token)
    .maybeSingle()
  if (!termin) return { error: 'Token ungültig' }
  if (!['reserviert', 'gegenvorschlag'].includes(termin.status)) {
    return { error: `Aktion im Status "${termin.status}" nicht möglich` }
  }
  return { terminId: termin.id, svId: termin.assignee_id, fallId: termin.fall_id, startZeit: termin.start_zeit, status: termin.status }
}

// ─── AUTH: Kunde Portal ─────────────────────────────────────────────────────

async function authKundePortal(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet' }
  const admin = createAdminClient()
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat; kunde_id/sv_id/lead_id SSoT, faelle-frei).
  const { data: fall } = await admin.from('v_claim_full').select('kunde_id, sv_id, lead_id').eq('fall_id', fallId).single()
  if (!fall) return { error: 'Fall nicht gefunden' }
  // Ownership: kunde_id oder lead-email
  if (fall.kunde_id !== user.id) {
    if (fall.lead_id) {
      const { data: lead } = await admin.from('leads').select('email').eq('id', fall.lead_id).single()
      if (lead?.email !== user.email) return { error: 'Kein Zugriff' }
    } else {
      return { error: 'Kein Zugriff' }
    }
  }
  return { userId: user.id, fallId, svId: fall.sv_id }
}

// ─── 1. terminAblehnen ─────────────────────────────────────────────────────

export async function terminAblehnen({
  terminId,
  grund,
  source,
  token,
  fallId: fallIdArg,
}: {
  terminId?: string
  grund: string
  source: 'sv_portal' | 'sv_token'
  token?: string
  fallId?: string
}): Promise<ActionResult> {
  const admin = createAdminClient()
  let tId: string
  let svId: string
  let fId: string
  let startZeit: string | null = null

  if (source === 'sv_token' && token) {
    const auth = await authSvToken(token)
    if ('error' in auth) return { success: false, error: auth.error }
    tId = auth.terminId
    svId = auth.svId
    fId = auth.fallId
    startZeit = auth.startZeit
  } else if (source === 'sv_portal' && fallIdArg) {
    const auth = await authSvPortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    // Find the active termin for this fall
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id, start_zeit')
      .or(bezugOrExpr('fall', fallIdArg))
      .eq('assignee_id', auth.svId)
      .eq('assignee_typ', 'sachverstaendiger')
      .in('status', ['reserviert', 'gegenvorschlag'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Termin gefunden' }
    tId = termin.id
    svId = auth.svId
    fId = fallIdArg
    startZeit = termin.start_zeit
  } else {
    return { success: false, error: 'Ungültige Parameter' }
  }

  // 1. DB Update
  const { error: updateErr } = await admin.from('gutachter_termine').update({
    status: 'abgelehnt',
    abgelehnt_am: new Date().toISOString(),
    abgelehnt_grund: grund || 'Ohne Begründung',
  }).eq('id', tId)

  if (updateErr) return { success: false, error: updateErr.message }

  // AAR-694 Teil B: SV-Kalender-Event löschen (non-critical)
  import('@/lib/google-calendar/sv-event-sync').then(({ syncSvCalendarEvent }) =>
    syncSvCalendarEvent(tId).catch((err) =>
      console.warn('[terminAblehnen] syncSvCalendarEvent:', err instanceof Error ? err.message : err),
    ),
  )

  // KFZ-136: Reminder stornieren
  try { await cancelRemindersForTermin(tId) } catch (err) { console.error('[KFZ-136] Reminder-Cancel fehlgeschlagen:', err) }

  // 2. Fall updaten — sv_id freigeben (claims = SSoT); Termin-Status spiegelt die View aus gutachter_termine
  // CMM-49 (faelle-Drop-Runway): sv_id claims-direkt statt faelle.sv_id; claims.id == fall_id.
  // claims.updated_at bumpt automatisch (+ claims-Realtime-Subscription).
  await admin.from('claims').update({
    sv_id: null,
  }).eq('id', fId)

  // 3. Timeline
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: 'Gutachter hat Termin abgelehnt',
    beschreibung: `Grund: ${grund || 'Nicht angegeben'}. Neuer Gutachter wird gesucht.`,
  })

  // 4. Chat System-Message
  const svName = await getSvName(admin, svId)
  const terminDatum = startZeit ? formatDatumDE(startZeit) : '?'
  const grundText = grund ? ` Grund: "${grund}"` : ''
  await postChatSystemMessage({
    fallId: fId,
    text: `❌ Sachverständiger ${svName} hat den Termin am ${terminDatum} abgelehnt.${grundText}`,
    event: 'termin_abgelehnt',
    templateKey: 'terminAbgelehnt',
    templateParams: { svName, terminDatum, hatGrund: grund ? 'ja' : 'nein', grund: grund ?? '' },
  })

  // 5. Notifications: Kunde + Admin
  try {
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT). CMM-49: via v_claim_full (flat, faelle-frei).
    const { data: fallData } = await admin.from('v_claim_full').select('kunde_id, claim_nummer, kundenbetreuer_id').eq('fall_id', fId).single()
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    // Kunde benachrichtigen
    if (fallData?.kunde_id) {
      const { data: kundeProfile } = await admin.from('profiles').select('telefon').eq('id', fallData.kunde_id).single()
      if (kundeProfile?.telefon) {
        await sendManualWhatsApp(kundeProfile.telefon,
          `⚠️ Der Sachverständige hat den Termin am ${terminDatum} für Ihren Fall ${fallData?.claim_nummer ?? ''} abgelehnt. Wir suchen umgehend einen neuen Gutachter für Sie.`,
          fId)
      }
    }

    // Admin benachrichtigen
    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `⚠️ Gutachter ${svName} hat den Termin am ${terminDatum} für ${fallData?.claim_nummer ?? 'Fall'} ABGELEHNT. Bitte neuen Gutachter zuweisen.`,
          fId)
      }
    }

    // Task erstellen (KFZ-151: verknuepft mit case)
    const { createLinkedTask } = await import('@/lib/tasks/create-task')
    await createLinkedTask({
      fall_id: fId,
      titel: `Neuen Gutachter zuweisen für ${fallData?.claim_nummer ?? 'Fall'}`,
      typ: 'dispatch',
      prioritaet: 'dringend',
      faellig_am: new Date(),
      zugewiesen_an: fallData?.kundenbetreuer_id ?? null,
      entity_type: 'case',
      entity_id: fId,
    })
  } catch { /* non-critical */ }

  // AAR-501 N6: Event emittieren
  try {
    await emitEvent(
      'termin.sv_abgelehnt',
      { fallId: fId, terminId: tId, grund: grund || undefined },
      { fallId: fId },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent termin.sv_abgelehnt failed:', err)
  }

  revalidateTerminPaths(fId)
  return { success: true }
}

// ─── 2. terminGegenvorschlag ────────────────────────────────────────────────

export async function terminGegenvorschlag({
  terminId,
  neuesDatum,
  grund,
  source,
  token,
  fallId: fallIdArg,
}: {
  terminId?: string
  neuesDatum: string
  grund: string
  source: 'sv_portal' | 'sv_token' | 'kunde'
  token?: string
  fallId?: string
}): Promise<ActionResult> {
  const admin = createAdminClient()
  let tId: string
  let fId: string
  let svId: string | null = null
  let kundeId: string | null = null
  const vonWem: 'sv' | 'kunde' = source === 'kunde' ? 'kunde' : 'sv'

  if (source === 'sv_token' && token) {
    const auth = await authSvToken(token)
    if ('error' in auth) return { success: false, error: auth.error }
    tId = auth.terminId
    fId = auth.fallId
    svId = auth.svId
  } else if (source === 'sv_portal' && fallIdArg) {
    const auth = await authSvPortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    // Aaron 2026-04-30: 'bestaetigt' mit aufgenommen — Verlegung
    // bestätigter Termine geht über denselben Pfad (status wandert
    // zurück auf 'gegenvorschlag', Kunde muss neu bestätigen).
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id')
      .or(bezugOrExpr('fall', fallIdArg))
      .eq('assignee_id', auth.svId)
      .eq('assignee_typ', 'sachverstaendiger')
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Termin gefunden' }
    tId = termin.id
    fId = fallIdArg
    svId = auth.svId
  } else if (source === 'kunde' && fallIdArg) {
    const auth = await authKundePortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    kundeId = auth.userId
    fId = auth.fallId
    svId = auth.svId
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id')
      .or(bezugOrExpr('fall', fallIdArg))
      .eq('status', 'gegenvorschlag')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Gegenvorschlag gefunden' }
    tId = termin.id
  } else {
    return { success: false, error: 'Ungültige Parameter' }
  }

  // AAR-704B: Backend-Validierung — leeres oder Invalid-Datum führte zu
  // „leerem Vorschlag" beim SV (Notification mit „Invalid Date" oder NaN).
  // Frontend hat zwar Date-Picker, aber wir wollen den Bug-Pfad sauber
  // schließen falls eine Action-Variante doch ohne Datum aufgerufen wird.
  const neueStartZeit = new Date(neuesDatum)
  if (!neuesDatum || Number.isNaN(neueStartZeit.getTime())) {
    return { success: false, error: 'Bitte einen gültigen Termin angeben.' }
  }
  const neueEndZeit = new Date(neueStartZeit.getTime() + TERMIN_DAUER_MS)

  // 1. DB Update
  const { error: updateErr } = await admin.from('gutachter_termine').update({
    status: 'gegenvorschlag',
    vorgeschlagenes_datum: neueStartZeit.toISOString(),
    gegenvorschlag_grund: grund || null,
    gegenvorschlag_von: vonWem,
  }).eq('id', tId)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Bestehende Reminder stornieren (Termin noch nicht final)
  try { await cancelRemindersForTermin(tId) } catch (err) { console.error('[KFZ-136] Reminder-Cancel fehlgeschlagen:', err) }

  // 2. Fall touchen — Termin-Status spiegelt die View aus gutachter_termine
  // CMM-65: Recency-Bump auf claims (SSoT) statt faelle.updated_at.
  await touchClaimRecencyByFall(admin, fId)

  // 3. Timeline
  const terminStr = formatDatumDE(neueStartZeit.toISOString())
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: vonWem === 'sv' ? 'Gutachter hat Gegenvorschlag gemacht' : 'Kunde hat Gegenvorschlag gemacht',
    beschreibung: `Neuer Terminvorschlag: ${terminStr}.${grund ? ` Grund: ${grund}` : ''}`,
  })

  // 4. Chat System-Message
  let rollenName: string
  // i18n Phase 1: templateName traegt den geholten SV-/Kunde-Namen (oder null im
  // else-Zweig ohne Namen), woraus hatName fuer das ICU-select abgeleitet wird.
  let templateName: string | null = null
  if (vonWem === 'sv' && svId) {
    const name = await getSvName(admin, svId)
    templateName = name
    rollenName = `Sachverständiger ${name}`
  } else if (vonWem === 'kunde' && kundeId) {
    const name = await getKundeName(admin, kundeId)
    templateName = name
    rollenName = `Kunde ${name}`
  } else {
    rollenName = vonWem === 'sv' ? 'Sachverständiger' : 'Kunde'
  }

  const grundText = grund ? ` Grund: "${grund}"` : ''
  await postChatSystemMessage({
    fallId: fId,
    text: `📅 ${rollenName} hat einen neuen Termin vorgeschlagen: ${terminStr}.${grundText}`,
    event: 'termin_gegenvorschlag',
    templateKey: 'terminGegenvorschlag',
    templateParams: {
      rolle: vonWem,
      hatName: templateName ? 'ja' : 'nein',
      name: templateName ?? '',
      terminStr,
      hatGrund: grund ? 'ja' : 'nein',
      grund: grund ?? '',
    },
  })

  // 5. Notifications
  try {
    const { data: fallData } = await admin.from('v_claim_full').select('kunde_id, claim_nummer').eq('fall_id', fId).single()
    const fallDataClaimNummer = fallData?.claim_nummer ?? null
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    if (vonWem === 'sv') {
      // AAR-702: Magic-Link-Token für Kunde-Response generieren + Email senden,
      // damit der Kunde ohne Login annehmen oder gegenvorschlagen kann.
      try {
        const { randomBytes } = await import('crypto')
        const responseToken = randomBytes(24).toString('hex')
        const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        await admin
          .from('gutachter_termine')
          .update({
            kunde_response_token: responseToken,
            kunde_response_token_expires_at: tokenExpiresAt,
          })
          .eq('id', tId)

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
        const responseUrl = `${baseUrl}/kunde-termin/${responseToken}`

        // Kunden-Email (anhand fall.lead_id → leads.email, fallback profiles.email)
        let kundenEmail: string | null = null
        let kundenVorname: string | null = null
        let kundenSprache: string | null = null
        const { data: fallEmail } = await admin
          .from('v_claim_full')
          .select('lead_id, kunde_id')
          .eq('fall_id', fId)
          .single()
        if (fallEmail?.lead_id) {
          const { data: lead } = await admin
            .from('leads')
            .select('email, vorname, sprache')
            .eq('id', fallEmail.lead_id)
            .single()
          kundenEmail = lead?.email ?? null
          kundenVorname = lead?.vorname ?? null
          kundenSprache = (lead?.sprache as string | null) ?? null
        }
        if (!kundenEmail && fallEmail?.kunde_id) {
          const { data: prof } = await admin
            .from('profiles')
            .select('email, vorname')
            .eq('id', fallEmail.kunde_id)
            .single()
          kundenEmail = prof?.email ?? null
          kundenVorname = kundenVorname ?? prof?.vorname ?? null
        }

        if (kundenEmail) {
          // SV-Name + altes/neues Datum für Template
          let svNameForMail = 'Ihr Sachverständiger'
          if (svId) svNameForMail = await getSvName(admin, svId)
          const { data: terminFull } = await admin
            .from('gutachter_termine')
            .select('start_zeit, vorgeschlagenes_datum')
            .eq('id', tId)
            .single()
          const altDate = terminFull?.start_zeit ? new Date(terminFull.start_zeit) : neueStartZeit
          const neuDate = terminFull?.vorgeschlagenes_datum
            ? new Date(terminFull.vorgeschlagenes_datum)
            : neueStartZeit

          const locale = kundenSprache ?? 'de'
          const props = {
            locale,
            kundenVorname: kundenVorname ?? 'Kunde',
            fallNummer: fallDataClaimNummer ?? '—',
            alterTerminDatum: formatBerlin(altDate.toISOString(), {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
            }),
            alterTerminUhrzeit: formatBerlin(altDate.toISOString(), { hour: '2-digit', minute: '2-digit' }),
            neuerTerminDatum: formatBerlin(neuDate.toISOString(), {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
            }),
            neuerTerminUhrzeit: formatBerlin(neuDate.toISOString(), { hour: '2-digit', minute: '2-digit' }),
            grund: grund || null,
            svName: svNameForMail,
            responseUrl,
            // AAR-branding-rest: SV-Whitelabel wenn der SV verifiziert+branded ist
            brand: svId ? await (await import('@/lib/branding/token-theme')).resolveEmailBranding({ svId }) : undefined,
          }
          const { render } = await import('@react-email/render')
          const { KundeTerminGegenvorschlagEmail, subject } = await import(
            '@/lib/email/google/templates/KundeTerminGegenvorschlag'
          )
          const html = await render(KundeTerminGegenvorschlagEmail(props))
          const { sendCommunication } = await import('@/lib/communications/send')
          await sendCommunication('kunde_termin_gegenvorschlag', {
            email: kundenEmail,
            vorname: props.kundenVorname,
            subject: subject(props, locale),
            html,
          })
        }
      } catch (mailErr) {
        console.warn('[AAR-702] Kunde-Response-Email fehlgeschlagen:', mailErr)
      }

      // Zusätzlich WhatsApp wie bisher
      if (fallData?.kunde_id) {
        const { data: kundeProfile } = await admin.from('profiles').select('telefon').eq('id', fallData.kunde_id).single()
        if (kundeProfile?.telefon) {
          await sendManualWhatsApp(kundeProfile.telefon,
            `📅 Der Sachverständige schlägt einen neuen Termin vor: ${terminStr}. Sie haben eine Email mit Direktlink bekommen.`,
            fId)
        }
      }
    } else {
      // Notification an SV
      if (svId) {
        const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
        if (sv?.profile_id) {
          const { data: svProfile } = await admin.from('profiles').select('telefon').eq('id', sv.profile_id).single()
          if (svProfile?.telefon) {
            await sendManualWhatsApp(svProfile.telefon,
              `📅 Kunde schlägt stattdessen ${terminStr} vor für Fall ${fallDataClaimNummer ?? ''}. Bitte prüfen Sie den Vorschlag im Portal.`,
              fId)
          }
        }
      }
    }

    // Admin Info
    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `ℹ️ Gegenvorschlag für ${fallDataClaimNummer ?? 'Fall'}: ${rollenName} schlägt ${terminStr} vor.`,
          fId)
      }
    }
  } catch { /* non-critical */ }

  // AAR-501 N6: Event emittieren
  try {
    const altDatum = neueStartZeit.toISOString().slice(0, 10)
    const altUhrzeit = neueStartZeit.toISOString().slice(11, 16)
    await emitEvent(
      'termin.sv_gegenvorschlag',
      { fallId: fId, terminId: tId, alt_datum: altDatum, alt_uhrzeit: altUhrzeit, grund: grund || undefined },
      { fallId: fId, triggeredBy: kundeId ?? undefined },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent termin.sv_gegenvorschlag failed:', err)
  }

  revalidateTerminPaths(fId)
  return { success: true }
}

// ─── 3. terminAnnehmen ──────────────────────────────────────────────────────

export async function terminAnnehmen({
  terminId,
  source,
  fallId: fallIdArg,
}: {
  terminId?: string
  source: 'kunde' | 'sv_portal'
  fallId?: string
}): Promise<ActionResult> {
  const admin = createAdminClient()
  let fId: string
  let tId: string
  let svId: string | null = null

  if (source === 'kunde' && fallIdArg) {
    const auth = await authKundePortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    fId = auth.fallId
    svId = auth.svId
    // Gap E (05.08.): auch den initialen reservierten SV-Vorschlag annehmen, nicht nur
    // Gegenvorschlaege — sonst fuehrt die "Besichtigungstermin bestaetigen"-Aufgabe
    // (jetzt-zu-tun.ts) ins Leere (reserviert hatte bisher keine Kunde-Annehmen-Aktion).
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id, vorgeschlagenes_datum')
      .or(bezugOrExpr('fall', fId))
      .in('status', ['gegenvorschlag', 'reserviert'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Terminvorschlag gefunden' }
    tId = termin.id

    // start_zeit = vorgeschlagenes_datum (nur bei Gegenvorschlag gesetzt; bei reserviert
    // null → neueStartZeit=null → start_zeit bleibt der bereits reservierte Slot).
    const neueStartZeit = termin.vorgeschlagenes_datum ? new Date(termin.vorgeschlagenes_datum) : null
    // CMM-23: Kalender-Check vor Bestätigung
    if (neueStartZeit && svId) {
      const conflict = await assertSvKalenderFrei(admin, svId, neueStartZeit.toISOString())
      if (conflict) return conflict
    }
    const updateData: Record<string, unknown> = {
      status: 'bestaetigt',
      gegenvorschlag_von: null,
    }
    if (neueStartZeit) {
      updateData.start_zeit = neueStartZeit.toISOString()
      updateData.end_zeit = new Date(neueStartZeit.getTime() + TERMIN_DAUER_MS).toISOString()
    }
    const { error: updateErr } = await admin.from('gutachter_termine').update(updateData).eq('id', tId)
    if (updateErr) return { success: false, error: updateErr.message }
  } else if (source === 'sv_portal' && fallIdArg) {
    const auth = await authSvPortal(fallIdArg)
    if ('error' in auth) return { success: false, error: auth.error }
    fId = auth.fallId
    svId = auth.svId
    const { data: termin } = await admin.from('gutachter_termine')
      .select('id, vorgeschlagenes_datum')
      .or(bezugOrExpr('fall', fId))
      .eq('assignee_id', auth.svId)
      .eq('assignee_typ', 'sachverstaendiger')
      .eq('status', 'gegenvorschlag')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (!termin) return { success: false, error: 'Kein aktiver Gegenvorschlag gefunden' }
    tId = termin.id

    const neueStartZeit = termin.vorgeschlagenes_datum ? new Date(termin.vorgeschlagenes_datum) : null
    // CMM-23: Kalender-Check vor Bestätigung
    if (neueStartZeit && svId) {
      const conflict = await assertSvKalenderFrei(admin, svId, neueStartZeit.toISOString())
      if (conflict) return conflict
    }
    const updateData: Record<string, unknown> = {
      status: 'bestaetigt',
      gegenvorschlag_von: null,
    }
    if (neueStartZeit) {
      updateData.start_zeit = neueStartZeit.toISOString()
      updateData.end_zeit = new Date(neueStartZeit.getTime() + TERMIN_DAUER_MS).toISOString()
    }
    const { error: updateErr } = await admin.from('gutachter_termine').update(updateData).eq('id', tId)
    if (updateErr) return { success: false, error: updateErr.message }
  } else {
    return { success: false, error: 'Ungültige Parameter' }
  }

  // KFZ-136: Reminder neu generieren (Termin ist jetzt bestaetigt)
  try { await generateReminderForTermin(tId) } catch (err) { console.error('[KFZ-136] Reminder-Generierung fehlgeschlagen:', err) }

  // AAR-694 Teil B: SV-Google-Kalender-Event anlegen/aktualisieren (non-critical)
  import('@/lib/google-calendar/sv-event-sync').then(({ syncSvCalendarEvent }) =>
    syncSvCalendarEvent(tId).catch((err) =>
      console.warn('[terminAnnehmen] syncSvCalendarEvent:', err instanceof Error ? err.message : err),
    ),
  )

  // SV-CalDAV-Sync (Apple/Fastmail/…) parallel — non-critical, no-op wenn der
  // SV keine CalDAV-Verbindung hat. Schließt die Lücke, dass terminAnnehmen
  // bisher nur Google schrieb, während setTermin/Magic-Link/Dispatch alle
  // beide Provider schreiben.
  import('@/lib/kalender/caldav/sv-termin-sync').then(({ syncSvTerminToCalDav }) =>
    syncSvTerminToCalDav(tId, fId).catch((err) =>
      console.warn('[terminAnnehmen] syncSvTerminToCalDav:', err instanceof Error ? err.message : err),
    ),
  )
  // SP5b: Outlook (Graph) parallel — no-op ohne MS-Verbindung/dormant.
  import('@/lib/microsoft/sv-termin-sync').then(({ syncSvTerminToOutlook }) =>
    syncSvTerminToOutlook(tId, fId).catch((err) =>
      console.warn('[terminAnnehmen] syncSvTerminToOutlook:', err instanceof Error ? err.message : err),
    ),
  )

  // KFZ-137: SV Auftragszusammenfassung Email
  try {
    const { sendSvAuftragszusammenfassung } = await import('@/lib/email/google/flows')
    if (svId) await sendSvAuftragszusammenfassung(fId, svId)
  } catch (err) { console.error('[KFZ-137] SV-Email fehlgeschlagen:', err) }

  // KFZ-151: Auto-Resolve aller offenen Termin-Tasks (z.B. "Termin bestaetigen")
  try { await resolveTasksForEntity('termin', tId, 'Termin bestaetigt') } catch (err) { console.error('[KFZ-151] resolveTasks termin:', err) }

  // Fall touchen — Termin-Status spiegelt die View aus gutachter_termine
  // CMM-65: Recency-Bump auf claims (SSoT) statt faelle.updated_at.
  await touchClaimRecencyByFall(admin, fId)

  // Timeline
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: source === 'kunde' ? 'Kunde hat Terminvorschlag angenommen' : 'Gutachter hat Kunden-Vorschlag angenommen',
    beschreibung: 'Termin ist jetzt bestätigt.',
  })

  // KEINE Chat-System-Message bei Annahme (laut Ticket)

  // Notifications
  try {
    const { data: fallData } = await admin.from('v_claim_full').select('kunde_id, claim_nummer').eq('fall_id', fId).single()
    const fallDataClaimNummer = fallData?.claim_nummer ?? null
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    if (source === 'kunde' && svId) {
      // Notification an SV
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
      if (sv?.profile_id) {
        const { data: svProfile } = await admin.from('profiles').select('telefon').eq('id', sv.profile_id).single()
        if (svProfile?.telefon) {
          const { data: termin } = await admin.from('gutachter_termine').select('start_zeit').or(bezugOrExpr('fall', fId)).eq('status', 'bestaetigt').single()
          const terminStr = termin?.start_zeit ? formatDatumDE(termin.start_zeit) : ''
          await sendManualWhatsApp(svProfile.telefon,
            `✅ Kunde akzeptiert ${terminStr} für Fall ${fallDataClaimNummer ?? ''}.`,
            fId)
        }
      }
    } else if (source === 'sv_portal' && fallData?.kunde_id) {
      // Notification an Kunde
      const { data: kundeProfile } = await admin.from('profiles').select('telefon').eq('id', fallData.kunde_id).single()
      if (kundeProfile?.telefon) {
        const { data: termin } = await admin.from('gutachter_termine').select('start_zeit').or(bezugOrExpr('fall', fId)).eq('status', 'bestaetigt').single()
        const terminStr = termin?.start_zeit ? formatDatumDE(termin.start_zeit) : ''
        await sendManualWhatsApp(kundeProfile.telefon,
          `✅ Der Sachverständige akzeptiert Ihren Terminvorschlag: ${terminStr}.`,
          fId)
      }
    }

    // Admin Info
    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `ℹ️ Termin für ${fallDataClaimNummer ?? 'Fall'} wurde bestätigt.`,
          fId)
      }
    }
  } catch { /* non-critical */ }

  // AAR-501 N6: Event emittieren
  try {
    const { data: termin } = await admin
      .from('gutachter_termine')
      .select('start_zeit')
      .eq('id', tId)
      .single()
    const startIso = (termin?.start_zeit as string | null) ?? new Date().toISOString()
    const dt = new Date(startIso)
    const svName = svId ? await getSvName(admin, svId) : 'Gutachter'
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
    const { data: ortRow } = await admin
      .from('v_claim_full')
      .select('schadenort_adresse, schadenort_plz, schadenort_ort')
      .eq('fall_id', fId)
      .single()
    const ort = [ortRow?.schadenort_adresse, ortRow?.schadenort_plz, ortRow?.schadenort_ort]
      .filter(Boolean)
      .join(', ')
    await emitEvent(
      'termin.sv_bestaetigt',
      {
        fallId: fId,
        terminId: tId,
        datum: dt.toISOString().slice(0, 10),
        uhrzeit: dt.toISOString().slice(11, 16),
        ort: ort || '—',
        svName,
      },
      { fallId: fId },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent termin.sv_bestaetigt failed:', err)
  }

  revalidateTerminPaths(fId)
  return { success: true }
}

// ─── 4. terminBuchen (Kunde wählt Slot aus SV-Kalender) ───────────────────

export async function terminBuchen({
  terminId,
  slot,
  source,
  fallId: fallIdArg,
}: {
  terminId?: string
  slot: string
  source: 'kunde_kalender'
  fallId?: string
}): Promise<ActionResult> {
  if (!fallIdArg) return { success: false, error: 'Ungültige Parameter' }

  const auth = await authKundePortal(fallIdArg)
  if ('error' in auth) return { success: false, error: auth.error }

  const admin = createAdminClient()
  const fId = auth.fallId
  const svId = auth.svId

  // Find the active termin
  const { data: termin } = await admin.from('gutachter_termine')
    .select('id')
    .or(bezugOrExpr('fall', fId))
    .in('status', ['gegenvorschlag', 'reserviert'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  // Kunde-sichtbarer Text (einziger Consumer ist der Kunde-Kalender) — keine Entwickler-Sprache.
  // Tritt auf, wenn ein SV zugewiesen ist, aber (noch) kein reservierter/vorgeschlagener Termin
  // existiert; der Slot-Picker rendert dann trotzdem (prod-belegt 11.08. an CLM-2026-00834).
  if (!termin) {
    return {
      success: false,
      error: 'Aktuell liegt für Ihren Fall kein buchbarer Termin vor. Ihr Sachverständiger meldet sich zur Terminabstimmung — bei Fragen wenden Sie sich bitte an Ihren Betreuer.',
    }
  }

  const slotDate = new Date(slot)
  const endDate = new Date(slotDate.getTime() + TERMIN_DAUER_MS)

  // CMM-23: Kalender-Check (Google + CalDAV) gegen Doppelbuchung
  if (svId) {
    const conflict = await assertSvKalenderFrei(admin, svId, slotDate.toISOString())
    if (conflict) return conflict
  }

  // 1. DB Update
  const { error: updateErr } = await admin.from('gutachter_termine').update({
    status: 'bestaetigt',
    start_zeit: slotDate.toISOString(),
    end_zeit: endDate.toISOString(),
    gegenvorschlag_von: null,
  }).eq('id', termin.id)

  if (updateErr) return { success: false, error: updateErr.message }

  // KFZ-136: Reminder generieren (Termin gebucht)
  try { await generateReminderForTermin(termin.id) } catch (err) { console.error('[KFZ-136] Reminder-Generierung fehlgeschlagen:', err) }

  // AAR-694 Teil B: SV-Google-Kalender-Event anlegen/aktualisieren (non-critical)
  import('@/lib/google-calendar/sv-event-sync').then(({ syncSvCalendarEvent }) =>
    syncSvCalendarEvent(termin.id).catch((err) =>
      console.warn('[terminBuchen] syncSvCalendarEvent:', err instanceof Error ? err.message : err),
    ),
  )

  // SV-CalDAV-Sync (Apple/Fastmail/…) parallel — non-critical, no-op wenn der
  // SV keine CalDAV-Verbindung hat. Schließt die Lücke, dass terminBuchen
  // bisher nur Google schrieb, während setTermin/Magic-Link/Dispatch alle
  // beide Provider schreiben.
  import('@/lib/kalender/caldav/sv-termin-sync').then(({ syncSvTerminToCalDav }) =>
    syncSvTerminToCalDav(termin.id, fId).catch((err) =>
      console.warn('[terminBuchen] syncSvTerminToCalDav:', err instanceof Error ? err.message : err),
    ),
  )
  // SP5b: Outlook (Graph) parallel — no-op ohne MS-Verbindung/dormant.
  import('@/lib/microsoft/sv-termin-sync').then(({ syncSvTerminToOutlook }) =>
    syncSvTerminToOutlook(termin.id, fId).catch((err) =>
      console.warn('[terminBuchen] syncSvTerminToOutlook:', err instanceof Error ? err.message : err),
    ),
  )

  // KFZ-137: SV Auftragszusammenfassung Email
  try {
    const { sendSvAuftragszusammenfassung } = await import('@/lib/email/google/flows')
    if (svId) await sendSvAuftragszusammenfassung(fId, svId)
  } catch (err) { console.error('[KFZ-137] SV-Email fehlgeschlagen:', err) }

  // 2. Fall touchen — Termin-Datum + Status spiegelt die View aus gutachter_termine
  // CMM-65: Recency-Bump auf claims (SSoT) statt faelle.updated_at.
  await touchClaimRecencyByFall(admin, fId)

  // 3. Timeline
  const terminStr = formatDatumDE(slotDate.toISOString())
  await admin.from('timeline').insert({
    fall_id: fId,
    typ: 'system',
    titel: 'Kunde hat Termin aus SV-Kalender gebucht',
    beschreibung: `Verbindlich gebucht: ${terminStr}`,
  })

  // KEINE Chat-System-Message bei Buchung (laut Ticket)

  // Notifications an SV + Admin
  try {
    const { data: fallData } = await admin.from('v_claim_full').select('claim_nummer').eq('fall_id', fId).single()
    const fallDataClaimNummer = fallData?.claim_nummer ?? null
    const { sendManualWhatsApp } = await import('@/lib/whatsapp')

    if (svId) {
      const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
      if (sv?.profile_id) {
        const { data: svProfile } = await admin.from('profiles').select('telefon').eq('id', sv.profile_id).single()
        if (svProfile?.telefon) {
          await sendManualWhatsApp(svProfile.telefon,
            `✅ Kunde hat verbindlich ${terminStr} gebucht für Fall ${fallDataClaimNummer ?? ''}.`,
            fId)
        }
      }
    }

    const { data: admins } = await admin.from('profiles').select('telefon').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.telefon) {
        await sendManualWhatsApp(a.telefon,
          `ℹ️ Kunde hat Termin ${terminStr} für ${fallDataClaimNummer ?? 'Fall'} aus SV-Kalender gebucht.`,
          fId)
      }
    }
  } catch { /* non-critical */ }

  // AAR-501 N6: Event emittieren
  try {
    const svName = svId ? await getSvName(admin, svId) : 'Gutachter'
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
    const { data: ortRow } = await admin
      .from('v_claim_full')
      .select('schadenort_adresse, schadenort_plz, schadenort_ort')
      .eq('fall_id', fId)
      .single()
    const ort = [ortRow?.schadenort_adresse, ortRow?.schadenort_plz, ortRow?.schadenort_ort]
      .filter(Boolean)
      .join(', ')
    await emitEvent(
      'termin.sv_bestaetigt',
      {
        fallId: fId,
        terminId: termin.id,
        datum: slotDate.toISOString().slice(0, 10),
        uhrzeit: slotDate.toISOString().slice(11, 16),
        ort: ort || '—',
        svName,
      },
      { fallId: fId, triggeredBy: auth.userId },
    )
  } catch (err) {
    console.error('[AAR-501] emitEvent termin.sv_bestaetigt failed:', err)
  }

  revalidateTerminPaths(fId)
  return { success: true }
}
