'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  emailSvZugewiesen,
  emailGutachtenEingegangen,
  emailFilmcheckBestanden,
  emailFallAbgeschlossen,
} from '@/lib/email'
import { sendStatusWhatsApp } from '@/lib/whatsapp'
import { triggerKonversionTasks, triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask } from '@/lib/tasking'
import { createGutachterMitteilung } from '@/lib/mitteilungen'

// ─── Fall Status ────────────────────────────────────────────────────────────

export async function updateFallStatus(fallId: string, newStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const now = new Date().toISOString()
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

  const { error } = await supabase
    .from('faelle')
    .update(updateData)
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  // Fire-and-forget email notifications on status change
  triggerStatusEmail(supabase, fallId, newStatus).catch(() => {})

  // Fire-and-forget WhatsApp notifications on status change
  if (newStatus === 'sv-zugewiesen') {
    sendStatusWhatsApp(fallId, 'nach_gutachter_dispatch').catch(() => {})
    // Auto-Task: Gutachter soll Termin bestaetigen
    const { data: fallInfo } = await supabase.from('faelle').select('sv_id, fall_nummer, schadens_ursache, schadens_adresse, schadens_plz, schadens_ort, lead_id').eq('id', fallId).single()
    triggerGutachterTerminTask(fallId, fallInfo?.sv_id ?? null).catch(() => {})
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
  }

  revalidatePath('/admin/dispatch')
}

// ─── Lead Status ────────────────────────────────────────────────────────────

export async function updateLeadStatus(leadId: string, newStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  // Wenn Status → umgewandelt: automatische Konversion
  if (newStatus === 'umgewandelt') {
    const fallId = await convertLeadToFall(supabase, leadId, user.id)
    revalidatePath('/admin/dispatch')
    return { converted: true, fallId }
  }

  const { error } = await supabase
    .from('leads')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/dispatch')
  return { converted: false }
}

// ─── Flow-Link ──────────────────────────────────────────────────────────────

export async function sendFlowLink(leadId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { data: lead } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon')
    .eq('id', leadId)
    .single()

  if (!lead) throw new Error('Lead nicht gefunden')

  const { error: leadErr } = await supabase
    .from('leads')
    .update({
      status: 'flow-gesendet',
      wa_gesendet: true,
    })
    .eq('id', leadId)

  if (leadErr) throw new Error(`Lead-Update fehlgeschlagen: ${leadErr.message}`)

  revalidatePath('/admin/dispatch')
  revalidatePath(`/admin/dispatch/lead/${leadId}`)

  return { token: lead.id }
}

// ─── Lead → Kundenakte Konversion ───────────────────────────────────────────

async function convertLeadToFall(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  userId: string,
): Promise<string> {
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
      // Flags vom Lead
      gegner_bekannt: lead.gegner_bekannt ?? true,
      personenschaden_flag: lead.personenschaden_flag ?? false,
      mietwagen_flag: lead.mietwagen_flag ?? false,
      leasing_flag: lead.leasing_flag ?? false,
      finanzierung_flag: lead.finanzierung_flag ?? false,
      gewerbe_flag: lead.gewerbe_flag ?? false,
      halter_ungleich_fahrer_flag: lead.halter_ungleich_fahrer_flag ?? false,
      polizei_bericht_vorhanden: lead.polizeibericht_pflicht ?? false,
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

  // 5. Lead-Status auf umgewandelt setzen
  await supabase
    .from('leads')
    .update({ status: 'umgewandelt', updated_at: new Date().toISOString() })
    .eq('id', leadId)

  // 6. Pflichtdokumente erstellen
  await createPflichtdokumente(supabase, fall.id, lead)

  // 7. Timeline-Eintrag erstellen
  const betreuerName = await getProfileName(supabase, kundenbetreuerId)
  await supabase.from('timeline').insert({
    fall_id: fall.id,
    lead_id: leadId,
    typ: 'system',
    titel: 'Lead konvertiert zu Kundenakte',
    beschreibung: `Fallnummer ${fallNummer} erstellt. Kundenbetreuer: ${betreuerName}.`,
    erstellt_von: userId,
  })

  // 8. WhatsApp: Unterlagen eingegangen + Gutachter wird beauftragt
  sendStatusWhatsApp(fall.id, 'nach_sa_unterschrift').catch(() => {})

  // 9. Auto-Tasks: Konversion
  triggerKonversionTasks(fall.id, kundenbetreuerId, null).catch(() => {})

  return fall.id
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

  // Immer Pflicht
  docs.push({ fall_id: fallId, dokument_typ: 'fahrzeugschein', pflicht: true })
  docs.push({ fall_id: fallId, dokument_typ: 'fuehrerschein', pflicht: true })
  docs.push({ fall_id: fallId, dokument_typ: 'schadensfotos', pflicht: true })

  // Gegnerdaten wenn Gegner bekannt
  if (lead.gegner_bekannt !== false) {
    docs.push({ fall_id: fallId, dokument_typ: 'gegner_daten', pflicht: true })
  }

  // Polizeibericht
  if (lead.polizeibericht_pflicht) {
    docs.push({ fall_id: fallId, dokument_typ: 'polizeibericht', pflicht: true })
  }

  // Leasing
  if (lead.leasing_flag) {
    docs.push({ fall_id: fallId, dokument_typ: 'leasingvertrag', pflicht: true })
  }

  // Finanzierung
  if (lead.finanzierung_flag) {
    docs.push({ fall_id: fallId, dokument_typ: 'finanzierungsvertrag', pflicht: true })
  }

  // Gewerbe
  if (lead.gewerbe_flag) {
    docs.push({ fall_id: fallId, dokument_typ: 'gewerbenachweis', pflicht: true })
    docs.push({ fall_id: fallId, dokument_typ: 'gf_vollmacht', pflicht: true })
  }

  // Halter ≠ Fahrer
  if (lead.halter_ungleich_fahrer_flag) {
    docs.push({ fall_id: fallId, dokument_typ: 'halter_vollmacht', pflicht: true })
    docs.push({ fall_id: fallId, dokument_typ: 'halter_ausweis', pflicht: true })
  }

  // Personenschaden
  if (lead.personenschaden_flag) {
    docs.push({ fall_id: fallId, dokument_typ: 'aerztliches_attest', pflicht: true })
    docs.push({ fall_id: fallId, dokument_typ: 'krankenhausbericht', pflicht: false })
    docs.push({ fall_id: fallId, dokument_typ: 'au_bescheinigung', pflicht: false })
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
