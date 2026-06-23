'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertSvLead } from '@/lib/sv-leads/upsert'
import { revalidatePath } from 'next/cache'

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('id, rolle').eq('id', user.id).single()
  return p?.rolle === 'admin' ? { id: user.id } : null
}

export async function createSvLead(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen SV-Leads anlegen.' }

  const name = String(formData.get('name') ?? '').trim()
  const firma = String(formData.get('firma') ?? '').trim() || null
  const adresse = String(formData.get('adresse') ?? '').trim()
  const plz = String(formData.get('plz') ?? '').trim() || null
  const ort = String(formData.get('ort') ?? '').trim() || null
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const dat_expert_nr = String(formData.get('dat_expert_nr') ?? '').trim() || null
  const dat_id = String(formData.get('dat_id') ?? '').trim() || null

  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const lat = latRaw !== null && latRaw !== '' ? Number(latRaw) : NaN
  const lng = lngRaw !== null && lngRaw !== '' ? Number(lngRaw) : NaN

  const qualifikationenRaw = String(formData.get('qualifikationen') ?? '').trim()
  const qualifikationen = qualifikationenRaw
    ? qualifikationenRaw.split(',').map(q => q.trim()).filter(Boolean)
    : null

  const paketRaw = formData.get('paket_umkreis_km')
  const paket_umkreis_km =
    paketRaw !== null && paketRaw !== '' ? Number(paketRaw) : 15

  if (!name) {
    return { ok: false, error: 'Name ist ein Pflichtfeld.' }
  }
  if (!adresse || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Standort ist Pflicht — bitte Adresse über die Suche auswählen.' }
  }

  const result = await upsertSvLead({
    name,
    adresse,
    lat,
    lng,
    firma,
    plz,
    ort,
    telefon,
    email,
    dat_id: dat_id || null,
    dat_expert_nr,
    qualifikationen,
    paket_umkreis_km,
    quelle: 'admin',
    ist_aktiv: true,
  })

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/sv-leads')
  return { ok: true, id: result.id }
}

export type SvLeadRow = {
  id: string
  name: string
  firma: string | null
  ort: string | null
  plz: string | null
  ist_aktiv: boolean | null
  claim_status: string | null
  konvertiert_zu_sv_id: string | null
  quelle: string | null
  aktualisiert_am: string | null
}

export async function getSvLeads(): Promise<SvLeadRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sv_leads')
    .select('id, name, firma, ort, plz, ist_aktiv, claim_status, konvertiert_zu_sv_id, quelle, aktualisiert_am')
    .order('aktualisiert_am', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[getSvLeads] Fehler beim Laden:', error.message)
    return []
  }
  return (data ?? []) as SvLeadRow[]
}
