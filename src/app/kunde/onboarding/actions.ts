'use server'

// AAR-100: Kunden-Portal Onboarding Server Actions
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// AAR-323: Angereicherter Pflichtdokument-Eintrag für den Onboarding-Wizard.
// Joined pflichtdokumente + dokument_katalog (ohne SQL-JOIN weil Supabase-Policies
// dokument_katalog erlauben, pflichtdokumente aber mit FK auf katalog nicht). Ein
// separater Lookup ist schneller + weniger brüchig gegenüber RLS-Änderungen.
export type PflichtdokumentStand = {
  id: string
  slot_id: string
  label: string
  beschreibung: string | null
  status: 'ausstehend' | 'hochgeladen' | 'abgelehnt' | string
  pflicht: boolean
  dokument_url: string | null
  hochgeladen_am: string | null
  frist: string | null
  begruendung: string | null
  angefordert_von_rolle: string | null
  angefordert_am: string | null
  multi_file: boolean
  max_mb: number
  akzeptierte_mime_types: string[]
  sort_order: number
}

/**
 * Lädt alle Pflichtdokumente eines Falls inkl. Katalog-Metadaten.
 * Sortierung: pflichtdokumente.sort_order zuerst, dann katalog.sort_order.
 */
export async function getPflichtdokumenteStand(
  fallId: string,
): Promise<PflichtdokumentStand[]> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return []

  const { data: fall } = await supabase
    .from('faelle').select('id, kunde_id').eq('id', fallId).single()
  if (!fall || fall.kunde_id !== user.id) return []

  const { data: docs } = await supabase
    .from('pflichtdokumente')
    .select('id, dokument_typ, status, pflicht, dokument_url, hochgeladen_am, frist, begruendung, angefordert_von_rolle, angefordert_am, sort_order')
    .eq('fall_id', fallId)
  if (!docs || docs.length === 0) return []

  const admin = createAdminClient()
  const { data: katalog } = await admin
    .from('dokument_katalog')
    .select('slot_id, label, beschreibung, multi_file, max_mb, akzeptierte_mime_types, sort_order')
    .eq('aktiv', true)
  const byId = new Map<string, {
    slot_id: string
    label: string
    beschreibung: string | null
    multi_file: boolean
    max_mb: number
    akzeptierte_mime_types: string[]
    sort_order: number
  }>()
  for (const row of katalog ?? []) byId.set(row.slot_id, row)

  const mapped: PflichtdokumentStand[] = docs.map((d) => {
    const k = byId.get(d.dokument_typ)
    return {
      id: d.id,
      slot_id: d.dokument_typ,
      label: k?.label ?? d.dokument_typ,
      beschreibung: k?.beschreibung ?? null,
      status: d.status ?? 'ausstehend',
      pflicht: !!d.pflicht,
      dokument_url: d.dokument_url ?? null,
      hochgeladen_am: d.hochgeladen_am ?? null,
      frist: d.frist ?? null,
      begruendung: d.begruendung ?? null,
      angefordert_von_rolle: d.angefordert_von_rolle ?? null,
      angefordert_am: d.angefordert_am ?? null,
      multi_file: k?.multi_file ?? false,
      max_mb: k?.max_mb ?? 10,
      akzeptierte_mime_types: k?.akzeptierte_mime_types ?? ['image/jpeg', 'image/png', 'application/pdf'],
      sort_order: d.sort_order ?? k?.sort_order ?? 999,
    }
  })

  mapped.sort((a, b) => {
    // offen → abgelehnt → hochgeladen (Priorität auf das was der Kunde noch tun muss)
    const prio = (s: string) => (s === 'hochgeladen' ? 2 : s === 'abgelehnt' ? 0 : 1)
    const d = prio(a.status) - prio(b.status)
    if (d !== 0) return d
    return (a.sort_order ?? 999) - (b.sort_order ?? 999)
  })
  return mapped
}

export async function completeOnboarding(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }

  // AAR-228 Bug 2: faelle.onboarding_complete MUSS synchron gesetzt werden —
  // sonst sieht /kunde/page.tsx weiter onboarding_complete=false → Redirect-Loop.
  // Admin-Client weil Kunde keine direkte Update-Policy auf faelle hat.
  const admin = createAdminClient()
  await admin.from('faelle')
    .update({ onboarding_complete: true })
    .eq('kunde_id', user.id)
    .is('onboarding_complete', false)

  revalidatePath('/kunde')
  return { success: true }
}

/**
 * Upload eines Pflichtdokuments durch den Kunden.
 * Speichert File in Storage, legt fall_dokumente-Eintrag an und
 * markiert pflichtdokument als hochgeladen.
 */
export async function uploadPflichtdokument(
  pflichtdokumentId: string,
  fallId: string,
  fileBase64: string,
  fileName: string,
  contentType: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Ownership-Check: gehoert der Fall diesem Kunden?
  const { data: fall } = await supabase.from('faelle').select('id, kunde_id').eq('id', fallId).single()
  if (!fall || fall.kunde_id !== user.id) {
    return { success: false, error: 'Fall nicht zugeordnet' }
  }

  // Storage Upload via Admin
  const admin = createAdminClient()
  const ts = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `kunde-uploads/${user.id}/${fallId}/${ts}_${safeName}`

  try {
    const buffer = Buffer.from(fileBase64.split(',').pop() ?? fileBase64, 'base64')
    const { error: upErr } = await admin.storage
      .from('dokumente')
      .upload(path, buffer, { contentType, upsert: false })
    if (upErr) return { success: false, error: upErr.message }

    const { data: { publicUrl } } = admin.storage.from('dokumente').getPublicUrl(path)

    // AAR-323: Slot-Typ + Sichtbarkeit aus dokument_katalog laden, damit der
    // fall_dokumente-Eintrag den korrekten dokument_typ UND die Katalog-
    // Sichtbarkeit bekommt (statt generischem 'kunde-upload' + hardcoded Array).
    const { data: pd } = await admin
      .from('pflichtdokumente')
      .select('dokument_typ, status')
      .eq('id', pflichtdokumentId)
      .single()
    const slotTyp = pd?.dokument_typ ?? 'kunde-upload'
    const { data: katalog } = await admin
      .from('dokument_katalog')
      .select('sichtbar_fuer')
      .eq('slot_id', slotTyp)
      .maybeSingle()
    const sichtbarFuer = katalog?.sichtbar_fuer
      ?? ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde']

    // Pflichtdokument aktualisieren — Replace setzt status=hochgeladen
    // auch wenn vorher 'abgelehnt'. Alter fall_dokumente-Eintrag bleibt als
    // Audit-Trail bestehen (wir insert'en immer neu, überschreiben nie).
    await admin.from('pflichtdokumente').update({
      status: 'hochgeladen',
      dokument_url: publicUrl,
      hochgeladen_am: new Date().toISOString(),
    }).eq('id', pflichtdokumentId)

    // fall_dokumente-Eintrag mit korrektem Slot-Typ + Katalog-Sichtbarkeit
    await admin.from('fall_dokumente').insert({
      fall_id: fallId,
      typ: slotTyp,
      kategorie: 'kundendokument',
      datei_url: publicUrl,
      datei_name: fileName,
      quelle: 'kunde-onboarding',
      hochgeladen_von_rolle: 'kunde',
      sichtbar_fuer: sichtbarFuer,
    })

    revalidatePath('/kunde/onboarding')
    return { success: true, url: publicUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
