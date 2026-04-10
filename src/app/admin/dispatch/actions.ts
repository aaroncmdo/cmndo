'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createNotification } from '@/lib/notifications'
import { triggerSV01 } from '@/lib/gutachterTasking'
import {
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
  emailFallAbgeschlossen,
} from '@/lib/email'
import { sendStatusWhatsApp } from '@/lib/whatsapp'
import { triggerKonversionTasks, triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerLeadTasks, triggerOnboardingTasks, resolveGates, autoCompleteTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'

// ─── Fall Status ────────────────────────────────────────────────────────────

export async function updateFallStatus(fallId: string, newStatus: string) {
  const supabase = await createClient()
  const serviceClient = createServiceClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()

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

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: now,
    status_changed_at: now,
  }

  // Set regulierung_am when entering regulierung status
  if (newStatus === 'regulierung' || newStatus === 'vs-regulierung') {
    updateData.regulierung_am = now
    updateData.regulierung_angekuendigt_am = now
  }

  // Set abgeschlossen_am when case is closed
  if (newStatus === 'abgeschlossen') {
    updateData.abgeschlossen_am = now
  }

  const { error } = await serviceClient
    .from('faelle')
    .update(updateData)
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  // Fire-and-forget email notifications on status change
  triggerStatusEmail(serviceClient, fallId, newStatus).catch(() => {})

  // Fire-and-forget WhatsApp notifications on status change
  if (newStatus === 'sv-zugewiesen') {
    sendStatusWhatsApp(fallId, 'nach_gutachter_dispatch').catch(() => {})
    // Auto-Task: Gutachter soll Termin bestaetigen
    const { data: fallInfo } = await supabase.from('faelle').select('sv_id, fall_nummer, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, lead_id').eq('id', fallId).single()
    triggerGutachterTerminTask(fallId, fallInfo?.sv_id ?? null).catch(() => {})
    // SV-01: Neuer Auftrag Task für Gutachter
    if (fallInfo?.sv_id) {
      const { data: svData } = await serviceClient.from('sachverstaendige').select('profile_id').eq('id', fallInfo.sv_id).single()
      if (svData?.profile_id) {
        let kundeName2 = ''; let addr = [fallInfo.schadens_adresse, fallInfo.schadens_plz, fallInfo.schadens_ort].filter(Boolean).join(', ')
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
    sendStatusWhatsApp(fallId, 'nach_terminbestaetigung').catch(() => {})
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
  }
  if (newStatus === 'gutachten-eingegangen') {
    // Auto-Task: QC-Pruefung durchfuehren (2h)
    const { data: fallInfo } = await supabase.from('faelle').select('kundenbetreuer_id').eq('id', fallId).single()
    triggerQcTask(fallId, fallInfo?.kundenbetreuer_id ?? null).catch(() => {})
  }
  if (newStatus === 'regulierung' || newStatus === 'vs-regulierung') {
    sendStatusWhatsApp(fallId, 'nach_regulierung').catch(() => {})
    // Gutachter-Mitteilung: Regulierung angekuendigt
    const { data: fallInfo } = await supabase.from('faelle').select('sv_id, fall_nummer').eq('id', fallId).single()
    if (fallInfo?.sv_id) {
      createGutachterMitteilung(fallInfo.sv_id, 'kanzlei_regulierung', fallId, {
        fall_nummer: fallInfo.fall_nummer ?? undefined,
      }).catch(() => {})
    }
  }
  if (newStatus === 'abgeschlossen') {
    sendStatusWhatsApp(fallId, 'nach_abschluss').catch(() => {})
    // KFZ-151: Auto-Resolve aller offenen Fall- und Case-Tasks
    try {
      const { resolveTasksForEntity } = await import('@/lib/tasks/resolve-tasks')
      await resolveTasksForEntity('fall', fallId, 'Fall abgeschlossen')
      await resolveTasksForEntity('case', fallId, 'Fall abgeschlossen')
    } catch (err) { console.error('[KFZ-151] resolveTasks fall abschluss:', err) }
  }

  revalidatePath('/admin/dispatch')
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

  revalidatePath('/admin/dispatch')
  return { converted: false }
}

// ─── Flow-Link ──────────────────────────────────────────────────────────────

export async function sendFlowLink(leadId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon')
    .eq('id', leadId)
    .single()

  if (!lead) throw new Error('Lead nicht gefunden')

  // Create flow_links entry with unique token
  const { data: flowLink, error: flowErr } = await supabase
    .from('flow_links')
    .insert({ lead_id: leadId })
    .select('token')
    .single()

  if (flowErr) throw new Error(`Flow-Link Erstellung fehlgeschlagen: ${flowErr.message}`)

  const { error: leadErr } = await supabase
    .from('leads')
    .update({
      status: 'flow-gesendet',
      qualifizierungs_phase: 'flow-versendet',
      wa_gesendet: true,
    })
    .eq('id', leadId)

  if (leadErr) throw new Error(`Lead-Update fehlgeschlagen: ${leadErr.message}`)

  revalidatePath('/admin/dispatch')
  revalidatePath(`/admin/dispatch/lead/${leadId}`)

  return { token: flowLink.token }
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
      eigene_versicherung: lead.eigene_versicherung ?? null,
      eigene_policennr: lead.eigene_policennr ?? null,
      polizei_aktenzeichen: lead.polizei_aktenzeichen ?? null,
      schadensursache: lead.schadensursache ?? null,
      leasing_geber: lead.leasing_geber ?? null,
      finanzierung_bank: lead.finanzierung_bank ?? null,
      firma_name: lead.firma_name ?? null,
      firma_ustid: lead.firma_ustid ?? null,
      halter_name: lead.halter_name ?? null,
      // KFZ-146: Erweiterte Fahrzeugdaten
      fahrzeug_farbe: lead.fahrzeug_farbe ?? null,
      erstzulassung: lead.erstzulassung ?? null,
      fin: lead.fin ?? null,
      kilometerstand: lead.kilometerstand ?? null,
      unfallhergang: lead.unfallhergang ?? null,
      // KFZ-146: Schadens-Adresse vom Fahrzeugstandort
      schadens_adresse: lead.fahrzeug_standort_adresse ?? null,
      schadens_plz: lead.fahrzeug_standort_plz ?? null,
      // KFZ-146: Lead-Source uebernehmen
      source_channel: lead.source_channel ?? null,
      source_domain: lead.source_domain ?? null,
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

  // 6. Pflichtdokumente erstellen
  await createPflichtdokumente(supabase, fall.id, lead)

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
  sendStatusWhatsApp(fall.id, 'nach_sa_unterschrift').catch(() => {})

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

async function createPflichtdokumente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fallId: string,
  lead: Record<string, unknown>,
) {
  const docs: { fall_id: string; dokument_typ: string; pflicht: boolean }[] = []
  const add = (typ: string, pflicht = true) => docs.push({ fall_id: fallId, dokument_typ: typ, pflicht })

  const sf = String(lead.schadenfall_typ ?? '').toLowerCase()
  const kk = String(lead.kunden_konstellation ?? 'kk-01').toLowerCase()

  // ─── Immer Pflicht ──────────────────────────────────────────────────────
  add('fahrzeugschein')
  add('fuehrerschein')
  add('schadensfotos') // min 4

  // ─── SF-abhängig ────────────────────────────────────────────────────────
  // SF-01: Gegnerische Daten PFLICHT
  if (sf === 'sf-01') {
    add('gegner_daten')
  }

  // SF-02: Gegnerische + eigene Versicherungsdaten, Polizeibericht PFLICHT, Anwalt empfohlen
  if (sf === 'sf-02') {
    add('gegner_daten')
    add('eigene_versicherung')
    add('polizeibericht')
  }

  // SF-03: variante-abhängig
  if (sf === 'sf-03') {
    if (lead.gegner_bekannt !== false) {
      // Variante A: Gegner bekannt
      add('gegner_daten')
    } else {
      // Variante B: Fahrerflucht — Polizeibericht + eigene Kasko PFLICHT
      add('polizeibericht')
      add('eigene_versicherung')
    }
  }

  // SF-04: Eigene Versicherung PFLICHT
  if (sf === 'sf-04') {
    add('eigene_versicherung')
  }

  // SF-05: Personenschaden — Med. Docs + Anwalt PFLICHT
  if (sf === 'sf-05' || lead.personenschaden_flag) {
    add('aerztliches_attest')
    add('krankenhausbericht', false)
    add('au_bescheinigung', false)
  }

  // Extra: Polizeibericht wenn Flag gesetzt (unabhängig von SF)
  if (lead.polizeibericht_pflicht && sf !== 'sf-02' && !(sf === 'sf-03' && lead.gegner_bekannt === false)) {
    add('polizeibericht')
  }

  // ─── KK-abhängig ───────────────────────────────────────────────────────
  // KK-02: Leasingvertrag, Leasinggeber-Info
  if (kk === 'kk-02' || lead.leasing_flag) {
    add('leasingvertrag')
  }

  // KK-03: Finanzierungsvertrag, Bank-Abtretung
  if (kk === 'kk-03' || lead.finanzierung_flag) {
    add('finanzierungsvertrag')
  }

  // KK-04: Gewerbenachweis, Vollmacht GF, USt-IdNr
  if (kk === 'kk-04' || lead.gewerbe_flag) {
    add('gewerbenachweis')
    add('gf_vollmacht')
  }

  // KK-05: Vollmacht Halter, Ausweis Halter, SA vom HALTER
  if (kk === 'kk-05' || lead.halter_ungleich_fahrer_flag) {
    add('halter_vollmacht')
    add('halter_ausweis')
  }

  if (docs.length > 0) {
    await supabase.from('pflichtdokumente').insert(docs)
  }
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

  if (status === 'abgeschlossen' && fall.lead_id) {
    const { data: lead } = await supabase.from('leads').select('email').eq('id', fall.lead_id).single()
    if (lead?.email) {
      const betrag = fall.regulierung_betrag
        ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(fall.regulierung_betrag))
        : '—'
      await emailFallAbgeschlossen(lead.email, fallNr, betrag)
    }
  }
}
