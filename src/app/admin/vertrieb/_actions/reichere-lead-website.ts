'use server'

// Staff-Action: reichert einen Partner-Lead mit Ansprechpartner-Daten aus seiner Firmen-Website
// an (Impressum/Kontakt via LLM). Füllt NUR leere ansprechpartner_*-Felder (überschreibt keine
// Admin-Eingaben). partner_leads ist nicht in database.types -> AnyDb-Cast.
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { reichereAusWebsite } from '@/lib/vertrieb/lead-website-enrichment'

export async function reichereLeadAusWebsite(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: lead } = await admin
    .from('partner_leads')
    .select(
      'firma, rollen_details, ansprechpartner_vorname, ansprechpartner_nachname, ansprechpartner_position, ansprechpartner_email, ansprechpartner_telefon',
    )
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Lead nicht gefunden.' }

  const website =
    typeof lead.rollen_details?.website === 'string' ? (lead.rollen_details.website as string) : ''
  if (!website.trim()) {
    return { ok: false, error: 'Keine Website hinterlegt — Anreicherung nicht möglich.' }
  }

  const enr = await reichereAusWebsite(website, (lead.firma as string | null) ?? '')
  if (!enr) return { ok: false, error: 'Konnte keine Kontaktdaten von der Website extrahieren.' }

  // Nur LEERE Felder füllen — Admin-Eingaben nie überschreiben.
  const updates: Record<string, unknown> = {}
  if (!lead.ansprechpartner_vorname && enr.vorname) updates.ansprechpartner_vorname = enr.vorname
  if (!lead.ansprechpartner_nachname && enr.nachname) updates.ansprechpartner_nachname = enr.nachname
  if (!lead.ansprechpartner_position && enr.position) updates.ansprechpartner_position = enr.position
  if (!lead.ansprechpartner_email && enr.email) updates.ansprechpartner_email = enr.email
  if (!lead.ansprechpartner_telefon && enr.telefon) updates.ansprechpartner_telefon = enr.telefon

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Nichts Neues gefunden (Felder bereits befüllt oder keine Kontaktdaten auf der Website).' }
  }

  const { error } = await admin
    .from('partner_leads')
    .update({ ...updates, aktualisiert_am: new Date().toISOString() })
    .eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/vertrieb')
  revalidatePath('/admin/partner-leads')
  return { ok: true }
}
