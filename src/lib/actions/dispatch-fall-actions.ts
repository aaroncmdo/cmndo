'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
// Alias: die exportierte Server-Action in dieser Datei heißt selbst `createLead`.
import { createLead as insertLeadRow } from '@/lib/leads/create-lead'
import { createNotification } from '@/lib/notifications'
import { triggerSV01, triggerSV04 } from '@/lib/gutachterTasking'
import {
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
} from '@/lib/email'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { triggerKonversionTasks, triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerLeadTasks, triggerOnboardingTasks, resolveGates, autoCompleteTask, triggerKanzleiPaketTask, triggerAsSendedatumTask, triggerArchivierungTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { convertLeadToFall, type ConvertResult } from '@/lib/leads/convert-lead-to-fall'

// ─── Fall Status ────────────────────────────────────────────────────────────

export async function updateFallStatus(
  fallId: string,
  newStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const serviceClient = createServiceClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // KFZ-153: Block status change to regulierung/abgeschlossen without Klassifizierung
  if (newStatus === 'regulierung' || newStatus === 'abgeschlossen') {
    const { data: klassifizierung } = await serviceClient
      .from('regulierungs_klassifizierung')
      .select('id')
      .eq('fall_id', fallId)
      .maybeSingle()
    if (!klassifizierung) {
      return {
        ok: false,
        error: 'Regulierungs-Klassifizierung fehlt. Bitte im Tab "Abrechnung" die Pflicht-Klassifizierung ausfüllen.',
      }
    }
  }

  // AAR-88: Zentraler Status-Wechsel via state-machine
  // (validiert Uebergaenge, setzt Timestamps, schreibt Timeline,
  // triggert LexDrive-Email + SLA-Hooks)
  try {
    await transitionFallStatus(fallId, newStatus, { user_id: user.id })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Status-Wechsel fehlgeschlagen' }
  }

  // Fire-and-forget email notifications on status change
  triggerStatusEmail(serviceClient, fallId, newStatus).catch(() => {})

  // Fire-and-forget WhatsApp notifications on status change
  if (newStatus === 'sv-zugewiesen') {
    sendFallCommunication(fallId, 'sv_losgefahren').catch(() => {})
    // Auto-Task: Gutachter soll Termin bestaetigen
    const { data: fallInfo } = await supabase.from('faelle').select('sv_id, fall_nummer, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, lead_id').eq('id', fallId).single()
    triggerGutachterTerminTask(fallId, fallInfo?.sv_id ?? null).catch(() => {})
    // SV-01: Neuer Auftrag Task für Gutachter
    if (fallInfo?.sv_id) {
      const { data: svData } = await serviceClient.from('sachverstaendige').select('profile_id').eq('id', fallInfo.sv_id).single()
      if (svData?.profile_id) {
        let kundeName2 = ''; const addr = [fallInfo.schadens_adresse, fallInfo.schadens_plz, fallInfo.schadens_ort].filter(Boolean).join(', ')
        if (fallInfo.lead_id) { const { data: ld } = await serviceClient.from('leads').select('vorname, nachname').eq('id', fallInfo.lead_id).single(); kundeName2 = [ld?.vorname, ld?.nachname].filter(Boolean).join(' ') }
        triggerSV01(fallId, svData.profile_id, kundeName2, addr, '', fallInfo.schadens_ursache ?? '', null).catch(() => {})
      }
    }
    // Gutachter-Mitteilung: Neuer Auftrag
    if (fallInfo?.sv_id) {
      let kundeName = ''
      if (fallInfo.lead_id) {
        const { data: lead } = await supabase.from('leads').select('vorname, nachname').eq('id', fallInfo.lead_id).single()
        kundeName = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ')
      }
      createGutachterMitteilung(fallInfo.sv_id, 'neuer_auftrag', fallId, {
        kunde_name: kundeName || undefined,
        schadentyp: fallInfo.schadens_ursache ?? undefined,
        adresse: [fallInfo.schadens_adresse, fallInfo.schadens_plz, fallInfo.schadens_ort].filter(Boolean).join(', ') || undefined,
        fall_nummer: fallInfo.fall_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'sv-termin') {
    sendFallCommunication(fallId, 'termin_bestaetigt').catch(() => {})
    // Gutachter-Mitteilung: Termin bestaetigt
    const { data: fallInfo } = await supabase.from('v_faelle_mit_aktuellem_termin').select('sv_id, fall_nummer, sv_termin').eq('id', fallId).single()
    if (fallInfo?.sv_id) {
      const terminDate = fallInfo.sv_termin ? new Date(fallInfo.sv_termin) : null
      createGutachterMitteilung(fallInfo.sv_id, 'termin_bestaetigt', fallId, {
        datum: terminDate?.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) ?? undefined,
        uhrzeit: terminDate?.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }) ?? undefined,
        fall_nummer: fallInfo.fall_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'besichtigung') {
    // Auto-Task: Gutachter soll Gutachten hochladen (48h)
    const { data: fallInfo } = await supabase.from('faelle').select('sv_id').eq('id', fallId).single()
    triggerGutachtenUploadTask(fallId, fallInfo?.sv_id ?? null).catch(() => {})
    // AAR-89: SV-04 Task (mit profile_id)
    if (fallInfo?.sv_id) {
      const { data: svData } = await serviceClient.from('sachverstaendige').select('profile_id').eq('id', fallInfo.sv_id).single()
      if (svData?.profile_id) {
        triggerSV04(fallId, svData.profile_id).catch(() => {})
      }
    }
  }
  if (newStatus === 'gutachten-eingegangen') {
    // Auto-Task: QC-Pruefung durchfuehren (2h)
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
    const { data: fallInfo } = await supabase.from('faelle').select('claims:claim_id(kundenbetreuer_id)').eq('id', fallId).single()
    const fallInfoClaim = fallInfo ? (Array.isArray(fallInfo.claims) ? fallInfo.claims[0] : fallInfo.claims) : null
    triggerQcTask(fallId, fallInfoClaim?.kundenbetreuer_id ?? null).catch(() => {})
  }
  if (newStatus === 'regulierung' || newStatus === 'vs-regulierung') {
    sendFallCommunication(fallId, 'regulierung_angekuendigt').catch(() => {})
    // Gutachter-Mitteilung: Regulierung angekuendigt
    const { data: fallInfo } = await supabase.from('faelle').select('sv_id, fall_nummer').eq('id', fallId).single()
    if (fallInfo?.sv_id) {
      createGutachterMitteilung(fallInfo.sv_id, 'kanzlei_regulierung', fallId, {
        fall_nummer: fallInfo.fall_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'abgeschlossen') {
    sendFallCommunication(fallId, 'fall_abgeschlossen').catch(() => {})
    // KFZ-151: Auto-Resolve aller offenen Fall- und Case-Tasks
    try {
      const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
      await resolveTasksForEntity('fall', fallId, 'Fall abgeschlossen')
      await resolveTasksForEntity('case', fallId, 'Fall abgeschlossen')
    } catch (err) { console.error('[KFZ-151] resolveTasks fall abschluss:', err) }
  }

  // AAR-88: Neue Trigger fuer bisher fehlende Status
  if (newStatus === 'kanzlei-uebergeben') {
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
    const { data: fallInfo } = await serviceClient.from('faelle').select('sv_id, fall_nummer, claims:claim_id(kundenbetreuer_id)').eq('id', fallId).single()
    const fallInfoClaim = fallInfo ? (Array.isArray(fallInfo.claims) ? fallInfo.claims[0] : fallInfo.claims) : null
    triggerKanzleiPaketTask(fallId, fallInfoClaim?.kundenbetreuer_id ?? null).catch(() => {})
    triggerAsSendedatumTask(fallId, fallInfoClaim?.kundenbetreuer_id ?? null).catch(() => {})
    sendFallCommunication(fallId, 'kanzlei_uebergabe').catch(() => {})
    if (fallInfo?.sv_id) {
      createGutachterMitteilung(fallInfo.sv_id, 'qc_bestanden', fallId, {
        fall_nummer: fallInfo.fall_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'anschlussschreiben') {
    sendFallCommunication(fallId, 'as_gesendet').catch(() => {})
    autoCompleteTask(fallId, 'as_sendedatum_gesetzt').catch(() => {})
  }
  if (newStatus === 'zahlung-eingegangen') {
    sendFallCommunication(fallId, 'zahlung_eingegangen').catch(() => {})
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
    const { data: fallInfo } = await serviceClient.from('faelle').select('claims:claim_id(kundenbetreuer_id)').eq('id', fallId).single()
    const fallInfoClaim = fallInfo ? (Array.isArray(fallInfo.claims) ? fallInfo.claims[0] : fallInfo.claims) : null
    triggerArchivierungTask(fallId, fallInfoClaim?.kundenbetreuer_id ?? null).catch(() => {})
  }
  // AAR-91: Storno-Workflow (Cleanup + Mitteilungen + Refund)
  if (newStatus === 'storniert') {
    // CMM-44 SP-A: kundenbetreuer_id wird hier nicht genutzt — aus dem Select
    // entfernt (die Spalte liegt jetzt auf claims als SSoT).
    const { data: fallInfo } = await serviceClient.from('faelle')
      .select('id, fall_nummer, sv_id, status, storno_grund')
      .eq('id', fallId).single()

    // Phase 1: Tasks aufloesen
    try {
      const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
      await resolveTasksForEntity('fall', fallId, 'Fall storniert')
      await resolveTasksForEntity('case', fallId, 'Fall storniert')
    } catch (err) { console.error('[AAR-91] resolveTasks storniert:', err) }

    // Phase 2a: WhatsApp an Kunde
    sendFallCommunication(fallId, 'termin_storniert').catch(() => {})

    // Phase 2b/3: SV-Mitteilung + Email + Refund
    if (fallInfo?.sv_id) {
      createGutachterMitteilung(fallInfo.sv_id, 'auftrag_storniert', fallId, {
        fall_nummer: fallInfo.fall_nummer ?? undefined,
        grund: fallInfo.storno_grund ?? undefined,
      }).catch(() => {})

      const { data: svData } = await serviceClient.from('sachverstaendige').select('profile_id').eq('id', fallInfo.sv_id).single()
      if (svData?.profile_id) {
        const { data: svProfile } = await serviceClient.from('profiles').select('email').eq('id', svData.profile_id).single()
        if (svProfile?.email) {
          const { emailSvAuftragStorniert } = await import('@/lib/email')
          emailSvAuftragStorniert(svProfile.email, fallInfo.fall_nummer ?? '', fallInfo.storno_grund ?? '').catch(() => {})
        }
      }

      // Refund
      try {
        const { refundLeadpreis } = await import('@/lib/gutachterTasking')
        refundLeadpreis(fallInfo.sv_id, fallId, fallInfo.fall_nummer ?? fallId.slice(0, 8)).catch(() => {})
      } catch { /* */ }
    }

    // Phase 2c: Kanzlei-Email wenn schon übergeben
    const KANZLEI_RELEVANT = ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'regulierung-laeuft', 'kanzlei', 'vs_kontakt']
    if (fallInfo?.status && KANZLEI_RELEVANT.includes(fallInfo.status)) {
      const { data: kanzleiUsers } = await serviceClient.from('profiles').select('email').eq('rolle', 'kanzlei')
      for (const k of kanzleiUsers ?? []) {
        if (k.email) {
          const { emailKanzleiAuftragStorniert } = await import('@/lib/email')
          emailKanzleiAuftragStorniert(k.email, fallInfo.fall_nummer ?? '', fallInfo.storno_grund ?? '', fallInfo.status).catch(() => {})
        }
      }
    }
  }

  if (newStatus === 'vs-abgelehnt') {
    sendFallCommunication(fallId, 'chat_fallback_kunde').catch(() => {})
    // CMM-44 SP-A: kundenbetreuer_id liegt auf claims (SSoT) — via Nested-Embed lesen.
    const { data: fallInfo } = await serviceClient.from('faelle').select('fall_nummer, claims:claim_id(kundenbetreuer_id)').eq('id', fallId).single()
    const fallInfoClaim = fallInfo ? (Array.isArray(fallInfo.claims) ? fallInfo.claims[0] : fallInfo.claims) : null
    if (fallInfoClaim?.kundenbetreuer_id) {
      createNotification(
        fallInfoClaim.kundenbetreuer_id,
        'vs-abgelehnt',
        `VS Ablehnung — Fall ${fallInfo?.fall_nummer ?? fallId.slice(0, 8)}`,
        'Versicherung hat abgelehnt. Bitte Eskalations-Schritte einleiten.',
        `/faelle/${fallId}`,
      ).catch(() => {})
    }
  }

  revalidatePath('/dispatch/dashboard')
  revalidatePath(`/faelle/${fallId}`)
  return { ok: true }
}

// ─── Lead Status ────────────────────────────────────────────────────────────

// ─── Neuen Lead erstellen (BUG-14) ─────────────────────────────────────────

export async function createLead(data: {
  vorname: string
  nachname: string
  telefon: string
  email: string
  source_channel: string
  schadens_fall_typ?: string
  // KFZ-154: Spezifikation + Schadensart für Dispatcher-Match. Optional bei
  // schnellem Quick-Add (kann nachträglich via LeadInlineFields gesetzt werden)
  // oder beim manuellen Anlegen direkt mitgegeben werden.
  spezifikation?: string
  schadens_art?: string
  // AAR-90: optional FIN bei manuellem Lead-Anlegen → Cardentity-Anreicherung
  fin?: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // Via zentrale createLead() (Writer-Konsistenz, leads-Audit 15.05.2026).
  // Liefert die leadId direkt zurück — vorher wurde der frisch angelegte Lead
  // per vorname/nachname-Query nachgeschlagen (fragil bei Namensgleichheit).
  const created = await insertLeadRow(
    supabase,
    {
      source_channel: data.source_channel || 'telefon',
      status: 'neu',
      vorname: data.vorname,
      nachname: data.nachname,
      telefon: data.telefon || null,
      email: data.email || null,
    },
    {
      schadens_fall_typ: data.schadens_fall_typ || null,
      spezifikation: data.spezifikation || null,
      schadens_art: data.schadens_art || null,
      fin: data.fin ? data.fin.toUpperCase() : null,
      qualifizierungs_phase: 'neu',
      kunden_konstellation: 'kk-01',
      zugewiesen_an: user.id,
    },
  )

  if (!created.ok) return { ok: false, error: created.error }

  // Phase 1: Lead-Tasks + Notification
  const leadId = created.leadId
  triggerLeadTasks(leadId, user.id).catch(() => {})
  createNotification(user.id, 'neuer-lead', `Neuer Lead: ${data.vorname} ${data.nachname}`, `${data.source_channel} · ${data.schadens_fall_typ || 'Kein Typ'}`, `/dispatch/leads/${leadId}`).catch(() => {})

  // AAR-90: Cardentity-Anreicherung wenn FIN angegeben
  if (data.fin) {
    try {
      const { enrichLeadByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
      enrichLeadByFin(leadId).catch(() => {})
    } catch { /* */ }
  }

  // AAR-92: Maik-Provision tracken bei Google-Ads/SEA Leads
  if (data.source_channel === 'google-ads' || data.source_channel === 'sea') {
    const monat = new Date().toISOString().slice(0, 7)
    await supabase.from('provisionen_maik').insert({
      lead_id: leadId,
      monat,
      basis_provision: 150.00,
      source_channel: data.source_channel,
      status: 'pending',
    }).then(({ error }) => { if (error) console.error('[AAR-92] Provision-Insert:', error.message) })
  }

  revalidatePath('/dispatch/dashboard')
  return { ok: true }
}

// Valid qualification phases (BUG-27 new + old for backward compat)
const QUALI_PHASES = new Set([
  'neu', 'nicht-erreicht', 'rueckruf', 'in-qualifizierung',
  'flow-versendet', 'sa-ausstehend', 'konvertiert',
  // old phases still valid
  'erstkontakt', 'schadentyp-erfasst', 'konstellation-erfasst',
  'gegner-daten', 'gutachtertermin', 'sa-unterschrieben', 'flow-gesendet', 'abgeschlossen',
])

type UpdateLeadStatusResult =
  | { ok: true; converted: true; fallId: string; linked: ConvertResult['linked'] }
  | { ok: true; converted: false }
  | { ok: false; error: string }

export async function updateLeadStatus(
  leadId: string,
  newStatus: string,
): Promise<UpdateLeadStatusResult> {
  const supabase = await createClient()
  const svc = createServiceClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const now = new Date().toISOString()

  // Konversion triggers
  if (newStatus === 'umgewandelt' || newStatus === 'abgeschlossen' || newStatus === 'konvertiert') {
    let result: ConvertResult
    try {
      result = await convertLeadToFall(svc, leadId, user.id)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Konversion fehlgeschlagen' }
    }
    await svc.from('leads').update({
      qualifizierungs_phase: 'konvertiert',
      status: 'umgewandelt',
      updated_at: now,
    }).eq('id', leadId)
    // KFZ-151: Auto-Resolve aller offenen Lead-Tasks
    try {
      const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
      await resolveTasksForEntity('lead', leadId, 'Lead konvertiert')
    } catch (err) { console.error('[KFZ-151] resolveTasks lead konvertiert:', err) }
    revalidatePath('/dispatch/dashboard')
    return { ok: true, converted: true, fallId: result.fallId, linked: result.linked }
  }

  const updateData: Record<string, unknown> = { updated_at: now }

  if (QUALI_PHASES.has(newStatus)) {
    updateData.qualifizierungs_phase = newStatus

    // Phase-specific side effects
    if (newStatus === 'nicht-erreicht') {
      // Increment anruf_versuche
      const { data: lead } = await supabase.from('leads').select('anruf_versuche').eq('id', leadId).single()
      updateData.anruf_versuche = ((lead?.anruf_versuche as number) ?? 0) + 1
      updateData.letzter_anruf_am = now
      updateData.letzter_anruf_status = 'nicht-erreicht'
    } else if (newStatus === 'in-qualifizierung') {
      updateData.letzter_anruf_am = now
      updateData.letzter_anruf_status = 'erreicht'
    } else if (newStatus === 'flow-versendet' || newStatus === 'flow-gesendet') {
      updateData.status = 'flow-gesendet'
      updateData.wa_gesendet = true
    }
  } else {
    // Terminal statuses (disqualifiziert, kalt)
    updateData.status = newStatus
  }

  const { error } = await svc
    .from('leads')
    .update(updateData)
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  // AAR-92: Maik-Provision reversen bei Disqualifikation/Kalt
  if (newStatus === 'disqualifiziert' || newStatus === 'kalt') {
    await svc.from('provisionen_maik').update({
      status: 'reversed',
      reversed_grund: `Lead status: ${newStatus}`,
      updated_at: now,
    }).eq('lead_id', leadId).neq('status', 'paid').then(({ error: revErr }) => {
      if (revErr) console.error('[AAR-92] Provision-Reverse:', revErr.message)
    })
  }

  revalidatePath('/dispatch/dashboard')
  return { ok: true, converted: false }
}

// ─── KFZ-192: Service-Typ setzen ────────────────────────────────────────────

export async function updateServiceTyp(
  leadId: string,
  serviceTyp: 'komplett' | 'nur_gutachter',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('leads')
    .update({ service_typ: serviceTyp, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  revalidatePath('/dispatch/dashboard')
  return { ok: true }
}

// ─── Flow-Link ──────────────────────────────────────────────────────────────

type SendFlowLinkResult =
  | { ok: true; token: string; url: string }
  | { ok: false; error: string }

export async function sendFlowLink(leadId: string): Promise<SendFlowLinkResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, service_typ')
    .eq('id', leadId)
    .single()

  if (!lead) return { ok: false, error: 'Lead nicht gefunden' }

  // KFZ-192: service_typ aus Lead in FlowLink kopieren
  const serviceTyp = (lead as Record<string, unknown>).service_typ as string ?? 'komplett'

  // Create flow_links entry with unique token.
  // RLS-Phase-1 (#3): flow_links default-deny für authenticated → service-client.
  const svc = createServiceClient()
  const { data: flowLink, error: flowErr } = await svc
    .from('flow_links')
    .insert({ lead_id: leadId, expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), service_typ: serviceTyp })
    .select('token')
    .single()

  if (flowErr) return { ok: false, error: `Flow-Link Erstellung fehlgeschlagen: ${flowErr.message}` }

  // AAR-52: FlowLink per WhatsApp an Kunden senden
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const flowUrl = `${baseUrl}/flow/${flowLink.token}`

  // AAR-116 Hardening: Lead-Status wird erst NACH erfolgreichem WA-Send aktualisiert
  // (siehe unten). Ohne Termin gibt es keinen WA-Send und der Lead bleibt in der
  // vorherigen Phase — sonst zeigt er "flow-versendet" obwohl keine Nachricht
  // angekommen ist (KFZ-Bug 14.04.2026, DB-Evidenz siehe AAR-116).

  if (lead.telefon) {
    // AAR-116: Template flowlink_versand erwartet 6 Variablen (Vorname, SV-Vorname,
    // SV-Nachname, Datum, Uhrzeit, FlowLink-URL). Wir suchen den reservierten
    // Gutachter-Termin zum Lead und liefern alle Felder. Ohne Termin waere das
    // Template leer und Twilio wuerde die Nachricht mit leeren Placeholdern rendern.
    const { data: terminRaw } = await supabase
      .from('gutachter_termine')
      .select('start_zeit, sv_id, sachverstaendige(profile_id, profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
      .eq('lead_id', leadId)
      .in('status', ['reserviert', 'bestaetigt'])
      .order('start_zeit', { ascending: true })
      .limit(1)
      .maybeSingle()
    // Nested-FK-Relations kommen je nach Cardinality als Array ODER Objekt zurück.
    // Safe-Normalisierung via Array.isArray (siehe SvKalenderModal.tsx Pattern).
    const termin = terminRaw as { start_zeit: string; sv_id: string | null; sachverstaendige: unknown } | null
    const svRaw = termin?.sachverstaendige
    const sv = (Array.isArray(svRaw) ? svRaw[0] : svRaw) as { profile_id: string | null; profiles: unknown } | null
    const profileRaw = sv?.profiles
    let profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
    // AAR-607 B2: Wenn Nested-FK leer ist, Profile separat per profile_id laden —
    // sonst kommt die FlowLink-Email mit leeren Placeholder-Namen raus.
    if (!profile && sv?.profile_id) {
      const { data: p } = await supabase
        .from('profiles')
        .select('vorname, nachname')
        .eq('id', sv.profile_id)
        .maybeSingle()
      profile = p
    }
    const svVorname = profile?.vorname ?? ''
    const svNachname = profile?.nachname ?? ''
    if (termin && !svVorname && !svNachname) {
      console.warn('[sendFlowLink] SV-Name nicht auflösbar für Termin', { leadId, svId: termin.sv_id })
    }
    const terminDate = termin?.start_zeit ? new Date(termin.start_zeit) : null
    const datum = terminDate ? terminDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
    const uhrzeit = terminDate
      ? terminDate.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
      : ''

    if (!termin) {
      console.warn('[sendFlowLink] Kein reservierter Gutachter-Termin für Lead', leadId, '— WhatsApp übersprungen (AAR-115 notwendig)')
    } else {
      try {
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('flowlink_versand', {
          telefon: lead.telefon,
          vorname: lead.vorname ?? '',
          '1': lead.vorname ?? '',
          '2': svVorname,
          '3': svNachname,
          '4': datum,
          '5': uhrzeit,
          '6': flowUrl,
        })
        // AAR-67: wa_gesendet=true NUR bei erfolgreichem WA-Send
        // AAR-116 Hardening: Lead-Status erst HIER setzen (nach bestätigtem WA-Send),
        // damit ein fehlgeschlagener Send den Lead nicht in 'flow-versendet' hängen lässt.
        await supabase.from('leads').update({
          wa_gesendet: true,
          status: 'flow-gesendet',
          qualifizierungs_phase: 'flow-versendet',
        }).eq('id', leadId)
        // Timeline-Eintrag: FlowLink versendet
        await supabase.from('timeline').insert({
          fall_id: null,
          typ: 'system',
          titel: 'FlowLink versendet',
          beschreibung: `Per WhatsApp an ${lead.telefon} — SV ${svVorname} ${svNachname} am ${datum} ${uhrzeit}`,
          erstellt_von: user.id,
        }).then(() => {}, () => {})
      } catch (err) {
        console.error('[sendFlowLink] WA-Send fehlgeschlagen:', err)
        // wa_gesendet + qualifizierungs_phase bleiben unverändert — Token ist aber
        // gültig, kann manuell erneut gesendet werden
      }
    }
  }
  revalidatePath('/dispatch/dashboard')
  revalidatePath(`/dispatch/leads/${leadId}`)

  return { ok: true, token: flowLink.token, url: flowUrl }
}

// ─── Lead → Kundenakte Konversion ───────────────────────────────────────────
// convertLeadToFall lebt jetzt in `@/lib/leads/convert-lead-to-fall` (oben
// importiert) — wegen Server-Action-Serialisierungs-Konflikt mit der
// `'use server'`-Direktive dieser Datei.

// ─── E-Mail Notifications ───────────────────────────────────────────────────

async function triggerStatusEmail(supabase: Awaited<ReturnType<typeof createClient>>, fallId: string, status: string) {
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, fall_nummer, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, sv_id, lead_id, regulierung_betrag')
    .eq('id', fallId)
    .single()
  if (!fall) return

  const fallNr = fall.fall_nummer ?? fall.id.slice(0, 8)

  if (status === 'sv-zugewiesen' && fall.sv_id) {
    const { data: sv } = await supabase.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
    const { data: profile } = sv ? await supabase.from('profiles').select('email').eq('id', sv.profile_id).single() : { data: null }
    if (profile?.email) {
      let kunde = '—'
      if (fall.lead_id) {
        const { data: lead } = await supabase.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
        if (lead) kunde = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
      }
      const adr = [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'
      await emailSvZugewiesen(profile.email, fallNr, kunde, adr)
    }
  }

  if (status === 'gutachten-eingegangen') {
    const { data: admins } = await supabase.from('profiles').select('email').eq('rolle', 'admin')
    for (const a of admins ?? []) {
      if (a.email) await emailGutachtenEingegangen(a.email, fallNr)
    }
  }

  if (status === 'kanzlei-uebergeben') {
    const { data: kanzlei } = await supabase.from('profiles').select('email').eq('rolle', 'kanzlei')
    for (const k of kanzlei ?? []) {
      if (k.email) await emailFilmcheckBestanden(k.email, fallNr)
    }
  }

}
