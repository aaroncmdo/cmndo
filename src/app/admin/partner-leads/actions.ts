'use server'

// Server-Actions fuer das Partner-Vertriebsdashboard (/admin/partner-leads).
// Alle Actions liefern ein Result-Object ({ ok, error? }) — kein throw (AGENTS
// §Server-Actions). Zugriff: admin/dispatch/leadbearbeiter (RLS-Gate
// partner_leads_staff_all). KEINE const/type-Exports hier (AAR-664) → types.ts.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { convertPartnerLead } from '@/lib/partner/convert-partner-lead'
import { revalidatePath } from 'next/cache'
import type { PartnerRolle } from '@/lib/partner/policy'

const VERTRIEB_ROLLEN = ['admin', 'dispatch', 'leadbearbeiter']
const PARTNER_ROLLEN: PartnerRolle[] = ['sachverstaendiger', 'werkstatt', 'makler']
const STATUS_WERTE = [
  'neu',
  'kontaktiert',
  'qualifiziert',
  'onboarding',
  'aktiv',
  'abgelehnt',
  'kein_interesse',
]
const EINSTUFUNG_WERTE = ['heiss', 'warm', 'kalt']
// Typen, die Nutzer manuell protokollieren duerfen. status_aenderung/einstufung
// werden ausschliesslich systemisch (Auto-Log) geschrieben.
const AKTIVITAET_TYP_MANUELL = ['anruf', 'notiz', 'email', 'sonstiges']

// Deutsche Status-/Einstufungs-Labels fuer die Auto-Log-Texte (backend, aber
// der Text landet im UI-Timeline → Umlaute). Klein gehalten, nicht aus types.ts
// importiert (das ist ein reines Typen-/Client-Modul, keine 'use server'-Grenze,
// aber wir halten actions.ts self-contained fuer die Log-Formatierung).
const STATUS_LABEL: Record<string, string> = {
  neu: 'Neu',
  kontaktiert: 'Kontaktiert',
  qualifiziert: 'Qualifiziert',
  onboarding: 'Onboarding',
  aktiv: 'Aktiv',
  abgelehnt: 'Abgelehnt',
  kein_interesse: 'Kein Interesse',
}
const EINSTUFUNG_LABEL: Record<string, string> = {
  heiss: 'Heiß',
  warm: 'Warm',
  kalt: 'Kalt',
}

/**
 * Auth-Guard: eingeloggt + Rolle admin/dispatch/leadbearbeiter. Gibt die
 * User-Id zurueck oder null. Der DB-Enum hat leadbearbeiter bereits (Sub-1),
 * der TS-UserRolle-Typ hinkt hinterher (Types duerfen der DB nachlaufen) —
 * daher String-Vergleich statt Enum.
 */
async function requireVertriebStaff(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  const rolle = (p?.rolle as string | undefined) ?? ''
  return VERTRIEB_ROLLEN.includes(rolle) ? { id: user.id } : null
}

export type CreatePartnerLeadInput = {
  rolle: string
  firma: string
  ansprechpartner_vorname?: string
  ansprechpartner_nachname?: string
  email: string
  telefon?: string
  plz?: string
  ort?: string
  rollen_details?: Record<string, unknown>
}

export async function createPartnerLead(
  input: CreatePartnerLeadInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Prospects anlegen.' }

  const rolle = (input.rolle ?? '').trim()
  const firma = (input.firma ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()

  if (!PARTNER_ROLLEN.includes(rolle as PartnerRolle)) {
    return { ok: false, error: 'Bitte eine gültige Rolle wählen (SV, Werkstatt oder Makler).' }
  }
  if (!firma) {
    return { ok: false, error: 'Firma ist ein Pflichtfeld.' }
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partner_leads')
    .insert({
      rolle,
      status: 'neu',
      source_channel: 'admin',
      firma,
      ansprechpartner_vorname: (input.ansprechpartner_vorname ?? '').trim() || null,
      ansprechpartner_nachname: (input.ansprechpartner_nachname ?? '').trim() || null,
      email,
      telefon: (input.telefon ?? '').trim() || null,
      plz: (input.plz ?? '').trim() || null,
      ort: (input.ort ?? '').trim() || null,
      rollen_details: input.rollen_details ?? {},
      zugewiesen_an: staff.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/partner-leads')
  return { ok: true, id: data.id as string }
}

export type UpdatePartnerLeadInput = {
  status?: string
  zugewiesen_an?: string | null
  notiz?: string | null
  einstufung?: string | null
  email?: string | null
  telefon?: string | null
  ansprechpartner_vorname?: string | null
  ansprechpartner_nachname?: string | null
}

export async function updatePartnerLead(
  id: string,
  patch: UpdatePartnerLeadInput,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Prospects bearbeiten.' }

  const admin = createAdminClient()

  // Ist-Stand laden (nur fuer Auto-Log-Diff bei status/einstufung noetig).
  const { data: vorher, error: loadErr } = await admin
    .from('partner_leads')
    .select('status, einstufung')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return { ok: false, error: loadErr.message }
  if (!vorher) return { ok: false, error: 'Prospect nicht gefunden.' }

  const updates: Record<string, unknown> = { aktualisiert_am: new Date().toISOString() }

  if (patch.status !== undefined) {
    if (!STATUS_WERTE.includes(patch.status)) {
      return { ok: false, error: 'Ungültiger Status.' }
    }
    updates.status = patch.status
  }
  if (patch.einstufung !== undefined) {
    if (patch.einstufung !== null && !EINSTUFUNG_WERTE.includes(patch.einstufung)) {
      return { ok: false, error: 'Ungültige Einstufung.' }
    }
    updates.einstufung = patch.einstufung || null
  }
  if (patch.zugewiesen_an !== undefined) {
    updates.zugewiesen_an = patch.zugewiesen_an || null
  }
  if (patch.notiz !== undefined) {
    updates.notiz = (patch.notiz ?? '').trim() || null
  }
  if (patch.email !== undefined) {
    const email = (patch.email ?? '').trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
    }
    updates.email = email || null
  }
  if (patch.telefon !== undefined) {
    updates.telefon = (patch.telefon ?? '').trim() || null
  }
  if (patch.ansprechpartner_vorname !== undefined) {
    updates.ansprechpartner_vorname = (patch.ansprechpartner_vorname ?? '').trim() || null
  }
  if (patch.ansprechpartner_nachname !== undefined) {
    updates.ansprechpartner_nachname = (patch.ansprechpartner_nachname ?? '').trim() || null
  }

  const { error } = await admin.from('partner_leads').update(updates).eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Auto-Log: Status- bzw. Einstufungs-Wechsel als Aktivitaet festhalten (Historie).
  // Non-critical: ein Log-Fehler bricht den Status-Update nicht (try/catch, AGENTS
  // §Server-Actions — atomarer Status-Write hat Vorrang).
  const autoLogs: { typ: string; text: string }[] = []
  const altStatus = (vorher.status as string | null) ?? null
  if (patch.status !== undefined && patch.status !== altStatus) {
    autoLogs.push({
      typ: 'status_aenderung',
      text: `Status: ${STATUS_LABEL[altStatus ?? ''] ?? altStatus ?? '—'} → ${STATUS_LABEL[patch.status] ?? patch.status}`,
    })
  }
  const altEinstufung = (vorher.einstufung as string | null) ?? null
  const neuEinstufung = patch.einstufung || null
  if (patch.einstufung !== undefined && neuEinstufung !== altEinstufung) {
    autoLogs.push({
      typ: 'einstufung',
      text: `Einstufung: ${altEinstufung ? EINSTUFUNG_LABEL[altEinstufung] : 'uneingestuft'} → ${neuEinstufung ? EINSTUFUNG_LABEL[neuEinstufung] : 'uneingestuft'}`,
    })
  }
  if (autoLogs.length > 0) {
    try {
      const { error: logErr } = await admin.from('partner_lead_aktivitaeten').insert(
        autoLogs.map((l) => ({
          partner_lead_id: id,
          typ: l.typ,
          text: l.text,
          erstellt_von: staff.id,
        })),
      )
      if (logErr) console.error('[updatePartnerLead] Auto-Log fehlgeschlagen (non-fatal):', logErr.message)
    } catch (err) {
      console.error('[updatePartnerLead] Auto-Log-Insert warf (non-fatal):', err)
    }
  }

  revalidatePath('/admin/partner-leads')
  return { ok: true }
}

/**
 * Protokolliert eine manuelle Aktivitaet (Anruf/Notiz/E-Mail/Sonstiges) zum Lead.
 * status_aenderung/einstufung sind hier bewusst NICHT erlaubt — die entstehen
 * ausschliesslich via Auto-Log in updatePartnerLead.
 */
export async function protokolliereAktivitaet(
  leadId: string,
  typ: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Aktivitäten protokollieren.' }

  if (!AKTIVITAET_TYP_MANUELL.includes(typ)) {
    return { ok: false, error: 'Ungültiger Aktivitätstyp.' }
  }
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return { ok: false, error: 'Bitte einen Text eingeben.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('partner_lead_aktivitaeten').insert({
    partner_lead_id: leadId,
    typ,
    text: trimmed,
    erstellt_von: staff.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/partner-leads')
  return { ok: true }
}

export async function konvertierePartnerLead(
  id: string,
): Promise<{ ok: true; userId: string; partnerId: string } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf konvertieren.' }

  // Convert-Guard: convertPartnerLead → anlegePartnerKern legt einen Auth-User an
  // und braucht dafuer zwingend eine E-Mail (die 62 DAT-Import-Leads haben keine).
  // Fehlt sie, hier frueh abbrechen statt in der Account-Anlage zu scheitern.
  const admin = createAdminClient()
  const { data: lead, error: loadErr } = await admin
    .from('partner_leads')
    .select('email')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return { ok: false, error: loadErr.message }
  if (!lead) return { ok: false, error: 'Prospect nicht gefunden.' }
  if (!(lead.email as string | null)?.trim()) {
    return { ok: false, error: 'E-Mail fehlt — bitte erst Kontakt ergänzen, dann konvertieren.' }
  }

  const result = await convertPartnerLead(id, { durchUserId: staff.id })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/partner-leads')
  return { ok: true, userId: result.userId, partnerId: result.partnerId }
}
