'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertSvLead } from '@/lib/sv-leads/upsert'
import { importSvLeads } from '@/lib/sv-leads/bulk-import'
import { ladeSvLeadEinladung } from '@/lib/sv-leads/claim-einladung'
import { syncSvLeadsFromSource } from '@/lib/sv-leads/sources/sync'
import { datStubSource } from '@/lib/sv-leads/sources/dat-stub'
import { revalidatePath } from 'next/cache'
import type { SvLeadRow } from './types'

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

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, id: result.id }
}

export async function importSvLeadsAction(csvText: string): Promise<
  | { ok: true; importiert: number; fehler: string[] }
  | { ok: false; error: string }
> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen SV-Leads importieren.' }

  const result = await importSvLeads(csvText)
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, importiert: result.importiert, fehler: result.fehler }
}

export async function getSvLeads(): Promise<SvLeadRow[]> {
  // Audit 2026-08-04: einziger Export des Files OHNE Guard — service-role-Read
  // auf sv_leads-PII war fuer JEDEN eingeloggten User als POST-Endpoint
  // erreichbar. Array-Signatur bleibt (SSR-Consumer); unauthorized -> leer.
  const gate = await requireAdmin()
  if (!gate) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sv_leads')
    .select('id, name, firma, ort, plz, telefon, email, ist_aktiv, claim_status, konvertiert_zu_sv_id, quelle, aktualisiert_am')
    .order('aktualisiert_am', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[getSvLeads] Fehler beim Laden:', error.message)
    return []
  }
  return (data ?? []) as SvLeadRow[]
}

// ─── Task 6: Claim-Einladung (Admin-only, kein Auto-Send) ────────────────────

export async function sendeSvLeadEinladung(
  leadId: string,
): Promise<{ ok: true; gesendet: boolean } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Einladungen senden.' }

  const result = await ladeSvLeadEinladung(leadId)
  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return result
}

// ─── Task 7: DAT-Sync-Trigger (Admin-only) ──────────────────────────────────

export async function datSyncAusfuehren(): Promise<
  | { ok: true; importiert: number; fehler: string[] }
  | { ok: false; error: string }
> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen den DAT-Sync auslösen.' }

  const result = await syncSvLeadsFromSource(datStubSource)
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, importiert: result.importiert, fehler: result.fehler }
}

export async function sendeAlleOffenenEinladungen(): Promise<
  { ok: true; gesendet: number; uebersprungen: number } | { ok: false; error: string }
> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Einladungen senden.' }

  const admin = createAdminClient()
  // Alle offenen Leads mit mindestens einem Kontaktweg laden
  const { data, error } = await admin
    .from('sv_leads')
    .select('id, telefon, email')
    .eq('claim_status', 'offen')
    .is('konvertiert_zu_sv_id', null)
    .or('telefon.not.is.null,email.not.is.null')
    .order('aktualisiert_am', { ascending: false })
    .limit(500)

  if (error) {
    return { ok: false, error: 'Laden der Leads fehlgeschlagen: ' + error.message }
  }

  const leads = (data ?? []) as { id: string; telefon: string | null; email: string | null }[]

  let gesendet = 0
  let uebersprungen = 0

  for (const lead of leads) {
    const result = await ladeSvLeadEinladung(lead.id)
    if (result.ok && result.gesendet) {
      gesendet++
    } else {
      uebersprungen++
    }
  }

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, gesendet, uebersprungen }
}
