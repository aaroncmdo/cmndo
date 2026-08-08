'use server'

// Server-Actions fuer das Partner-Aktivitaets-Cockpit. Result-Object ({ ok, error }),
// staff-gated (requireVertriebStaff). Reads laufen ueber den authenticated-Client ->
// RLS partner_aktivitaeten_staff_all (admin/dispatch/leadbearbeiter role-list, bewusst NICHT
// is_staff() — das omittiert leadbearbeiter) greift. KEINE const/type-Exports (AAR-664).
import { createClient } from '@/lib/supabase/server'
import { requireVertriebStaff } from '@/lib/auth/require-vertrieb-staff'
import { PARTNER_AKTIVITAET_MANUELL } from '@/lib/partner/aktivitaet-types'
import type { PartnerTyp, PartnerAktivitaetRow } from '@/lib/partner/aktivitaet-types'
import { revalidatePath } from 'next/cache'

const DETAIL_PATH: Record<PartnerTyp, (id: string) => string> = {
  sv: (id) => `/admin/vertrieb/sachverstaendige/${id}`,
  makler: (id) => `/admin/vertrieb/makler/${id}`,
  werkstatt: (id) => `/admin/vertrieb/werkstaetten/${id}`,
  flotte: (id) => `/admin/vertrieb/firmen-flotte/${id}`,
}

export async function getPartnerAktivitaeten(
  partnerTyp: PartnerTyp,
  partnerId: string,
): Promise<{ ok: true; data: PartnerAktivitaetRow[] } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partner_aktivitaeten')
    .select('id, partner_typ, partner_id, typ, text, meta, ist_system, erstellt_von, erstellt_am')
    .eq('partner_typ', partnerTyp)
    .eq('partner_id', partnerId)
    .order('erstellt_am', { ascending: false })
    .limit(200)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as PartnerAktivitaetRow[] }
}

export async function logManuelleAktivitaet(input: {
  partnerTyp: PartnerTyp
  partnerId: string
  typ: string
  text: string
  meta?: Record<string, unknown> | null
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Aktivitäten protokollieren.' }

  if (!PARTNER_AKTIVITAET_MANUELL.includes(input.typ as (typeof PARTNER_AKTIVITAET_MANUELL)[number])) {
    return { ok: false, error: 'Ungültiger Aktivitätstyp.' }
  }
  const trimmed = (input.text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Bitte einen Text eingeben.' }

  const supabase = await createClient()
  // Autor-Namen aufloesen -> meta.autor_name, damit der Feed den echten Namen zeigt
  // (statt Fallback "Team") — konsistent zum werkstatt_notizen-Backfill-Format.
  const { data: prof } = await supabase
    .from('profiles')
    .select('anzeigename, vorname, nachname')
    .eq('id', staff.id)
    .maybeSingle()
  const autorName =
    (prof?.anzeigename?.trim() || [prof?.vorname, prof?.nachname].filter(Boolean).join(' ').trim()) || null
  const { error } = await supabase.from('partner_aktivitaeten').insert({
    partner_typ: input.partnerTyp,
    partner_id: input.partnerId,
    typ: input.typ,
    text: trimmed,
    meta: autorName ? { ...(input.meta ?? {}), autor_name: autorName } : (input.meta ?? null),
    ist_system: false,
    erstellt_von: staff.id,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(DETAIL_PATH[input.partnerTyp](input.partnerId))
  return { ok: true }
}
