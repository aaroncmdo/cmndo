'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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
import { createPflichtdokumenteFromKatalog } from '@/lib/dokumente/create-pflicht'

// ─── Fall Status ────────────────────────────────────────────────────────────

export async function updateFallStatus(fallId: string, newStatus: string) {
  const supabase = await createClient()
  const serviceClient = createServiceClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  // KFZ-153: Block status change to regulierung/abgeschlossen without Klassifizierung
  if (newStatus === 'regulierung' || newStatus === 'abgeschlossen') {
    const { data: klassifizierung } = await serviceClient
      .from('regulierungs_klassifizierung')
      .select('id')
      .eq('fall_id', fallId)
      .maybeSingle()
    if (!klassifizierung) {
      throw new Error('Regulierungs-Klassifizierung fehlt. Bitte im Tab "Abrechnung" die Pflicht-Klassifizierung ausfüllen.')
    }
  }

  // AAR-88: Zentraler Status-Wechsel via state-machine
  // (validiert Uebergaenge, setzt Timestamps, schreibt Timeline,
  // triggert LexDrive-Email + SLA-Hooks)
  await transitionFallStatus(fallId, newStatus, { user_id: user.id })

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
    const { data: fallInfo } = await supabase.from('faelle').select('sv_id, fall_nummer, sv_termin').eq('id', fallId).single()
    if (fallInfo?.sv_id) {
      const terminDate = fallInfo.sv_termin ? new Date(fallInfo.sv_termin) : null
      createGutachterMitteilung(fallInfo.sv_id, 'termin_bestaetigt', fallId, {
        datum: terminDate?.toLocaleDateString('de-DE') ?? undefined,
        uhrzeit: terminDate?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) ?? undefined,
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
    const { data: fallInfo } = await supabase.from('faelle').select('kundenbetreuer_id').eq('id', fallId).single()
    triggerQcTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
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
    const { data: fallInfo } = await serviceClient.from('faelle').select('kundenbetreuer_id, sv_id, fall_nummer').eq('id', fallId).single()
    triggerKanzleiPaketTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
    triggerAsSendedatumTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
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
    const { data: fallInfo } = await serviceClient.from('faelle').select('kundenbetreuer_id').eq('id', fallId).single()
    triggerArchivierungTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
  }
  // AAR-91: Storno-Workflow (Cleanup + Mitteilungen + Refund)
  if (newStatus === 'storniert') {
    const { data: fallInfo } = await serviceClient.from('faelle')
      .select('id, fall_nummer, sv_id, kundenbetreuer_id, status, storno_grund')
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

    // Phase 2c: Kanzlei-Email wenn schon uebergeben
    const KANZLEI_RELEVANT = ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'regulierung-laeuft', 'nachbesichtigung-laeuft']
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
    const { data: fallInfo } = await serviceClient.from('faelle').select('kundenbetreuer_id, fall_nummer').eq('id', fallId).single()
    if (fallInfo?.kundenbetreuer_id) {
      createNotification(
        fallInfo.kundenbetreuer_id,
        'vs-abgelehnt',
        `VS Ablehnung — Fall ${fallInfo.fall_nummer ?? fallId.slice(0, 8)}`,
        'Versicherung hat abgelehnt. Bitte Eskalations-Schritte einleiten.',
        `/admin/faelle/${fallId}`,
      ).catch(() => {})
    }
  }

  revalidatePath('/admin/dispatch')
  revalidatePath(`/admin/faelle/${fallId}`)
}

// ─── Lead Status ────────────────────────────────────────────────────────────

// ─── Neuen Lead erstellen (BUG-14) ─────────────────────────────────────────

export async function createLead(data: {
  vorname: string
  nachname: string
  telefon: string
  email: string
  source_channel: string
  schadenfall_typ?: string
  // KFZ-154: Spezifikation + Schadenart fuer Dispatcher-Match. Optional bei
  // schnellem Quick-Add (kann nachtraeglich via LeadInlineFields gesetzt werden)
  // oder beim manuellen Anlegen direkt mitgegeben werden.
  spezifikation?: string
  schadenart?: string
  // AAR-90: optional FIN bei manuellem Lead-Anlegen → Cardentity-Anreicherung
  fin?: string
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase.from('leads').insert({
    vorname: data.vorname,
    nachname: data.nachname,
    telefon: data.telefon || null,
    email: data.email || null,
    source_channel: data.source_channel || 'telefon',
    schadenfall_typ: data.schadenfall_typ || null,
    spezifikation: data.spezifikation || null,
    schadenart: data.schadenart || null,
    fin: data.fin ? data.fin.toUpperCase() : null,
    status: 'neu',
    qualifizierungs_phase: 'neu',
    kunden_konstellation: 'kk-01',
    zugewiesen_an: user.id,
  })

  if (error) throw new Error(error.message)

  // Phase 1: Lead-Tasks + Notification
  const { data: newLead } = await supabase.from('leads').select('id').eq('vorname', data.vorname).eq('nachname', data.nachname).order('created_at', { ascending: false }).limit(1).single()
  if (newLead) {
    triggerLeadTasks(newLead.id, user.id).catch(() => {})
    createNotification(user.id, 'neuer-lead', `Neuer Lead: ${data.vorname} ${data.nachname}`, `${data.source_channel} · ${data.schadenfall_typ || 'Kein Typ'}`, `/admin/dispatch/lead/${newLead.id}`).catch(() => {})

    // AAR-90: Cardentity-Anreicherung wenn FIN angegeben
    if (data.fin) {
      try {
        const { enrichLeadByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
        enrichLeadByFin(newLead.id).catch(() => {})
      } catch { /* */ }
    }

    // AAR-92: Maik-Provision tracken bei Google-Ads/SEA Leads
    if (data.source_channel === 'google-ads' || data.source_channel === 'sea') {
      const monat = new Date().toISOString().slice(0, 7)
      await supabase.from('provisionen_maik').insert({
        lead_id: newLead.id,
        monat,
        basis_provision: 150.00,
        source_channel: data.source_channel,
        status: 'pending',
      }).then(({ error }) => { if (error) console.error('[AAR-92] Provision-Insert:', error.message) })
    }
  }

  revalidatePath('/admin/dispatch')
}

// Valid qualification phases (BUG-27 new + old for backward compat)
const QUALI_PHASES = new Set([
  'neu', 'nicht-erreicht', 'rueckruf', 'in-qualifizierung',
  'flow-versendet', 'sa-ausstehend', 'konvertiert',
  // old phases still valid
  'erstkontakt', 'schadentyp-erfasst', 'konstellation-erfasst',
  'gegner-daten', 'gutachtertermin', 'sa-unterschrieben', 'flow-gesendet', 'abgeschlossen',
])

export async function updateLeadStatus(leadId: string, newStatus: string) {
  const supabase = await createClient()
  const svc = createServiceClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

  // Konversion triggers
  if (newStatus === 'umgewandelt' || newStatus === 'abgeschlossen' || newStatus === 'konvertiert') {
    const result = await convertLeadToFall(svc, leadId, user.id)
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
    revalidatePath('/admin/dispatch')
    return { converted: true, fallId: result.fallId, linked: result.linked }
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

  if (error) throw new Error(error.message)

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

  revalidatePath('/admin/dispatch')
  return { converted: false }
}

// ─── KFZ-192: Service-Typ setzen ────────────────────────────────────────────

export async function updateServiceTyp(
  leadId: string,
  serviceTyp: 'komplett' | 'nur_gutachter',
) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { error } = await supabase
    .from('leads')
    .update({ service_typ: serviceTyp, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  revalidatePath(`/admin/dispatch/lead/${leadId}`)
  revalidatePath('/admin/dispatch')
}

// ─── Flow-Link ──────────────────────────────────────────────────────────────

export async function sendFlowLink(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, service_typ')
    .eq('id', leadId)
    .single()

  if (!lead) throw new Error('Lead nicht gefunden')

  // KFZ-192: service_typ aus Lead in FlowLink kopieren
  const serviceTyp = (lead as Record<string, unknown>).service_typ as string ?? 'komplett'

  // Create flow_links entry with unique token
  const { data: flowLink, error: flowErr } = await supabase
    .from('flow_links')
    .insert({ lead_id: leadId, expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), service_typ: serviceTyp })
    .select('token')
    .single()

  if (flowErr) throw new Error(`Flow-Link Erstellung fehlgeschlagen: ${flowErr.message}`)

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
      .select('start_zeit, sachverstaendige(profiles(vorname, nachname))')
      .eq('lead_id', leadId)
      .in('status', ['reserviert', 'bestaetigt'])
      .order('start_zeit', { ascending: true })
      .limit(1)
      .maybeSingle()
    // Nested-FK-Relations kommen je nach Cardinality als Array ODER Objekt zurück.
    // Safe-Normalisierung via Array.isArray (siehe SvKalenderModal.tsx Pattern).
    const termin = terminRaw as { start_zeit: string; sachverstaendige: unknown } | null
    const svRaw = termin?.sachverstaendige
    const sv = (Array.isArray(svRaw) ? svRaw[0] : svRaw) as { profiles: unknown } | null
    const profileRaw = sv?.profiles
    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as
      | { vorname: string | null; nachname: string | null }
      | null
    const svVorname = profile?.vorname ?? ''
    const svNachname = profile?.nachname ?? ''
    const terminDate = termin?.start_zeit ? new Date(termin.start_zeit) : null
    const datum = terminDate ? terminDate.toLocaleDateString('de-DE') : ''
    const uhrzeit = terminDate
      ? terminDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
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
  revalidatePath('/admin/dispatch')
  revalidatePath(`/admin/dispatch/lead/${leadId}`)

  return { token: flowLink.token, url: flowUrl }
}

// ─── Lead → Kundenakte Konversion ───────────────────────────────────────────

type ConvertResult = {
  fallId: string
  linked: { calls: number; tasks: number; emails: number; termine: number; nachrichten: number; dokumente: number }
}

async function convertLeadToFall(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  userId: string,
): Promise<ConvertResult> {
  // 1. Lead-Daten laden
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) throw new Error('Lead nicht gefunden')

  // 2. Fallnummer generieren (CLM-YYYYMMDD-NNN)
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const { count } = await supabase
    .from('faelle')
    .select('id', { count: 'exact', head: true })
    .like('fall_nummer', `CLM-${dateStr}-%`)
  const nr = String((count ?? 0) + 1).padStart(3, '0')
  const fallNummer = `CLM-${dateStr}-${nr}`

  // 3. Kundenbetreuer per Round-Robin zuweisen
  const kundenbetreuerId = await findNextKundenbetreuer(supabase)

  // 4. Fall erstellen mit Lead-Daten
  const { data: fall, error: fallErr } = await supabase
    .from('faelle')
    .insert({
      fall_nummer: fallNummer,
      lead_id: leadId,
      status: 'ersterfassung',
      // Stammdaten vom Lead
      schadenfall_typ: lead.schadenfall_typ,
      kunden_konstellation: lead.kunden_konstellation,
      kennzeichen: lead.kennzeichen,
      fahrzeug_hersteller: lead.fahrzeug_hersteller,
      fahrzeug_modell: lead.fahrzeug_modell,
      // KFZ-154: Spezifikation + Schadenart fuer den Dispatcher-Match.
      // Werden vom Lead uebernommen wenn der Lead-Import die Felder mitliefert,
      // sonst null (Dispatcher faellt ohne Spez-Filter zurueck).
      spezifikation: lead.spezifikation ?? null,
      schadenart: lead.schadenart ?? null,
      // KFZ-153: Unfall + Gegner Daten vom Lead
      unfall_konstellation: lead.unfall_konstellation ?? null,
      gegner_anzahl_beteiligte: lead.gegner_anzahl_beteiligte ?? null,
      gegner_fahrzeugtyp: lead.gegner_fahrzeugtyp ?? null,
      // Flags vom Lead
      gegner_bekannt: lead.gegner_bekannt ?? true,
      personenschaden_flag: lead.personenschaden_flag ?? false,
      mietwagen_flag: lead.mietwagen_flag ?? false,
      leasing_flag: lead.leasing_flag ?? false,
      finanzierung_flag: lead.finanzierung_flag ?? false,
      gewerbe_flag: lead.gewerbe_flag ?? false,
      halter_ungleich_fahrer_flag: lead.halter_ungleich_fahrer_flag ?? false,
      polizei_bericht_vorhanden: lead.polizeibericht_pflicht ?? false,
      // KFZ-35: Erweiterte Qualifizierungsdaten
      gegner_name: lead.gegner_name ?? null,
      gegner_versicherung: lead.gegner_versicherung ?? null,
      gegner_kennzeichen: lead.gegner_kennzeichen ?? null,
      // BUG-58 Mapping: Lead-Spalten → korrekte Faelle-Spalten
      versicherung_name: lead.eigene_versicherung ?? null,
      versicherung_schaden_nr: lead.eigene_policennr ?? null,
      polizei_aktenzeichen: lead.polizei_aktenzeichen ?? null,
      schadensursache: lead.schadensursache ?? null,
      leasinggeber_name: lead.leasing_geber ?? null,
      bank_name: lead.finanzierung_bank ?? null,
      firma_name: lead.firma_name ?? null,
      ust_id: lead.firma_ustid ?? null,
      halter_name: lead.halter_name ?? null,
      // KFZ-146: Erweiterte Fahrzeugdaten
      fahrzeug_farbe: lead.fahrzeug_farbe ?? null,
      erstzulassung: lead.erstzulassung ?? null,
      fin_vin: lead.fin ?? null,
      kilometerstand: lead.kilometerstand ?? null,
      unfallhergang: lead.unfallhergang ?? null,
      // KFZ-140: Fehlende Felder aus signSAandCreateFall uebernehmen
      schadens_datum: lead.unfalldatum ?? null,
      schadens_adresse: lead.fahrzeug_standort_adresse ?? null,
      schadens_plz: lead.fahrzeug_standort_plz ?? null,
      schadens_ort: lead.unfallort ?? null,
      polizei_vor_ort: lead.polizei_vor_ort ?? null,
      wunschtermin: lead.wunschtermin ?? null,
      // KFZ-146: Lead-Source uebernehmen
      source_channel: lead.source_channel ?? null,
      source_domain: lead.source_domain ?? null,
      // KFZ-208: Mandantenfragebogen-Felder
      ist_fahrzeughalter: lead.ist_fahrzeughalter ?? true,
      finanzierung_leasing: lead.finanzierung_leasing ?? 'keine',
      vorsteuerabzugsberechtigt: lead.vorsteuerabzugsberechtigt ?? false,
      schadenhergang: lead.schadenhergang ?? null,
      halter_vorname: lead.halter_vorname ?? null,
      halter_nachname: lead.halter_nachname ?? null,
      halter_strasse: lead.halter_strasse ?? null,
      halter_plz: lead.halter_plz ?? null,
      halter_stadt: lead.halter_stadt ?? null,
      halter_telefon: lead.halter_telefon ?? null,
      halter_email: lead.halter_email ?? null,
      finanzierungsgeber_name: lead.finanzierungsgeber_name ?? null,
      finanzierungsgeber_adresse: lead.finanzierungsgeber_adresse ?? null,
      finanzierungsgeber_vertragsnr: lead.finanzierungsgeber_vertragsnr ?? null,
      // KFZ-202: Vorschaeden
      hat_vorschaeden: lead.hat_vorschaeden ?? false,
      vorschaeden_beschreibung: lead.vorschaeden_beschreibung ?? null,
      // Konversions-Metadaten
      leadbearbeiter_id: userId,
      kundenbetreuer_id: kundenbetreuerId,
      konvertiert_am: new Date().toISOString(),
      konvertiert_von_lead: leadId,
      // SV-Termin übernehmen falls gesetzt
      sv_termin: lead.gutachter_termin,
    })
    .select('id')
    .single()

  if (fallErr || !fall) throw new Error(`Fall-Erstellung fehlgeschlagen: ${fallErr?.message}`)

  // 5. Lead-Status auf umgewandelt setzen + konvertiert_zu_fall_id verlinken
  await supabase
    .from('leads')
    .update({
      status: 'umgewandelt',
      konvertiert_zu_fall_id: fall.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)

  // 5b. KFZ-146: Alle verbundenen Daten (Calls, Tasks, Emails, Termine, Nachrichten, Dokumente) verlinken
  type LinkResult = { calls: number; tasks: number; emails: number; termine: number; nachrichten: number; dokumente: number }
  let linked: LinkResult = { calls: 0, tasks: 0, emails: 0, termine: 0, nachrichten: 0, dokumente: 0 }
  const { data: linkData, error: linkErr } = await supabase.rpc('link_lead_data_to_fall', {
    p_lead_id: leadId,
    p_fall_id: fall.id,
  })
  if (linkErr) {
    console.error('[KFZ-146] link_lead_data_to_fall failed:', linkErr.message)
  } else if (linkData) {
    linked = linkData as unknown as LinkResult
  }

  // 5c. KFZ-146: Lead-Notiz als Timeline-Eintrag übertragen
  if (lead.notiz && String(lead.notiz).trim()) {
    await supabase.from('timeline').insert({
      fall_id: fall.id,
      lead_id: leadId,
      typ: 'notiz',
      titel: 'Notiz aus Lead-Phase',
      beschreibung: String(lead.notiz).trim(),
      erstellt_von: userId,
    })
  }

  // 6. Pflichtdokumente erstellen (AAR-322: Katalog-driven)
  await createPflichtdokumenteFromKatalog(supabase, fall.id, lead)

  // AAR-90: Cardentity-Anreicherung wenn Lead FIN hat (kopiert vom Lead in Fall)
  if (lead.fin) {
    try {
      const { enrichFallByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
      enrichFallByFin(fall.id).catch(() => {})
    } catch { /* */ }
  }

  // 7. Timeline-Eintrag erstellen (mit Zähler der übertragenen Entitäten)
  const betreuerName = await getProfileName(supabase, kundenbetreuerId)
  const parts = [
    linked.calls > 0 ? `${linked.calls} Calls` : null,
    linked.tasks > 0 ? `${linked.tasks} Tasks` : null,
    linked.emails > 0 ? `${linked.emails} E-Mails` : null,
    linked.termine > 0 ? `${linked.termine} Termine` : null,
    linked.nachrichten > 0 ? `${linked.nachrichten} Nachrichten` : null,
    linked.dokumente > 0 ? `${linked.dokumente} Dokumente` : null,
  ].filter(Boolean)
  const linkedSummary = parts.length > 0 ? ` Übertragen: ${parts.join(', ')}.` : ''
  await supabase.from('timeline').insert({
    fall_id: fall.id,
    lead_id: leadId,
    typ: 'system',
    titel: 'Lead konvertiert zu Kundenakte',
    beschreibung: `Fallnummer ${fallNummer} erstellt. Kundenbetreuer: ${betreuerName}.${linkedSummary}`,
    erstellt_von: userId,
  })

  // 8. WhatsApp: Unterlagen eingegangen + Gutachter wird beauftragt
  sendFallCommunication(fall.id, 'fall_eroeffnet').catch(() => {})

  // 9. Auto-Tasks: Konversion
  triggerKonversionTasks(fall.id, kundenbetreuerId, null).catch(() => {})

  return { fallId: fall.id, linked }
}

// ─── Kundenbetreuer Load Balancing ──────────────────────────────────────────

async function findNextKundenbetreuer(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data: betreuer } = await supabase
    .from('profiles')
    .select('id, kapazitaet_max')
    .eq('rolle', 'kundenbetreuer')
    .eq('aktiv', true)

  if (!betreuer || betreuer.length === 0) {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, kapazitaet_max')
      .eq('rolle', 'admin')
      .eq('aktiv', true)
    if (!admins || admins.length === 0) return null
    return await findLeastBusyKundenbetreuer(supabase, admins)
  }

  return await findLeastBusyKundenbetreuer(supabase, betreuer)
}

async function findLeastBusyKundenbetreuer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profiles: { id: string; kapazitaet_max: number | null }[],
): Promise<string | null> {
  if (profiles.length === 0) return null

  const ids = profiles.map(p => p.id)
  const { data: faelle } = await supabase
    .from('faelle')
    .select('kundenbetreuer_id')
    .in('kundenbetreuer_id', ids)
    .not('status', 'in', '("abgeschlossen","storniert")')

  const counts: Record<string, number> = {}
  for (const id of ids) counts[id] = 0
  for (const f of faelle ?? []) {
    if (f.kundenbetreuer_id) counts[f.kundenbetreuer_id] = (counts[f.kundenbetreuer_id] ?? 0) + 1
  }

  // Nur Betreuer unter Kapazitaetsgrenze, dann wenigste offene Faelle
  const eligible = profiles.filter(p => counts[p.id] < (p.kapazitaet_max ?? 100))
  if (eligible.length === 0) {
    // Fallback: der mit den wenigsten Faellen (auch ueber Kapazitaet)
    return ids.reduce((min, id) => (counts[id] < counts[min] ? id : min), ids[0])
  }
  return eligible.reduce((min, p) => (counts[p.id] < counts[min.id] ? p : min), eligible[0]).id
}

// ─── Pflichtdokumente automatisch erstellen ─────────────────────────────────

// AAR-322: Katalog-driven — delegiert an createPflichtdokumenteFromKatalog.
// Der dokument_katalog + JSON-Rule-DSL ist die Quelle der Wahrheit; vorher
// war die Logik hier + in flow/[token]/actions.ts dupliziert.
// Export bleibt bestehen, damit flow/[token]/actions.ts den gleichen
// Einstiegspunkt nutzen kann.
export async function createPflichtdokumente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fallId: string,
  lead: Record<string, unknown>,
) {
  await createPflichtdokumenteFromKatalog(supabase, fallId, lead)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getProfileName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string | null,
): Promise<string> {
  if (!profileId) return '—'
  const { data } = await supabase
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', profileId)
    .single()
  if (!data) return '—'
  return `${data.vorname ?? ''} ${data.nachname ?? ''}`.trim() || '—'
}

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
