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
}

export async function updatePartnerLead(
  id: string,
  patch: UpdatePartnerLeadInput,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Prospects bearbeiten.' }

  const updates: Record<string, unknown> = { aktualisiert_am: new Date().toISOString() }

  if (patch.status !== undefined) {
    if (!STATUS_WERTE.includes(patch.status)) {
      return { ok: false, error: 'Ungültiger Status.' }
    }
    updates.status = patch.status
  }
  if (patch.zugewiesen_an !== undefined) {
    updates.zugewiesen_an = patch.zugewiesen_an || null
  }
  if (patch.notiz !== undefined) {
    updates.notiz = (patch.notiz ?? '').trim() || null
  }

  const admin = createAdminClient()
  const { error } = await admin.from('partner_leads').update(updates).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/partner-leads')
  return { ok: true }
}

export async function konvertierePartnerLead(
  id: string,
): Promise<{ ok: true; userId: string; partnerId: string } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf konvertieren.' }

  const result = await convertPartnerLead(id, { durchUserId: staff.id })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/partner-leads')
  return { ok: true, userId: result.userId, partnerId: result.partnerId }
}
