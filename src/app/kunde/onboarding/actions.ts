'use server'

// AAR-100: Kunden-Portal Onboarding Server Actions
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getSlotsFuerFall, type DokumentKatalogRow, type DokumentKategorie } from '@/lib/dokumente/katalog'
import { buildKatalogContext } from '@/lib/dokumente/ruleEvaluator'

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

// AAR-324 (Child 4 von AAR-320): Freie, conditional Slots für den Kunden.
// Anders als getPflichtdokumenteStand (pflichtdokumente-Tabelle) liest diese
// Funktion direkt den Katalog und evaluiert freigeschaltet_wenn gegen den
// Lead/Fall-Kontext. Filter:
//   1. 'kunde' IN uploadbar_von
//   2. freigeschaltet_wenn Rule evaluiert true
//   3. slot_id ist NICHT bereits als pflichtdokumente für den Fall vorhanden
//      (würde sonst doppelt in Step 3 + Step 4 auftauchen)
//   4. slot_id != 'kunde-nachreichung' (eigener Sonstiges-Upload unten im UI)
export type FreierSlot = {
  slot_id: string
  label: string
  beschreibung: string | null
  kategorie: DokumentKategorie
  multi_file: boolean
  max_mb: number
  akzeptierte_mime_types: string[]
  sort_order: number
  hochgeladene_anzahl: number
}

/**
 * Lädt alle Katalog-Slots die der Kunde im optional-Step hochladen darf.
 * Ausgeschlossen: Slots die bereits als pflichtdokumente angelegt sind
 * (diese rendert Step 3) und der spezielle 'kunde-nachreichung'-Slot
 * (der hat im UI einen eigenen Block mit Freitext-Beschreibung).
 */
export async function getFreieSlotsFuerKunde(fallId: string): Promise<FreierSlot[]> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return []

  // Ownership-Check
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, kunde_id, lead_id, zeugen_vorhanden, technische_stellungnahme_status, nachbesichtigung_status')
    .eq('id', fallId)
    .single()
  if (!fall || fall.kunde_id !== user.id) return []

  // Lead für Rule-Evaluation — enthält polizei_vor_ort, personenschaden_flag,
  // hat_vorschaeden, mietwagen_flag, zeugen_vorhanden etc. die die Seeds referenzieren.
  const admin = createAdminClient()
  let lead: Record<string, unknown> | null = null
  if (fall.lead_id) {
    const { data } = await admin
      .from('leads')
      .select('zb1_status, service_typ, wa_gesendet, polizei_vor_ort, polizeibericht_pflicht, zeugen_vorhanden, personenschaden_flag, hat_vorschaeden, vorschaden_vorhanden, mietwagen_flag, nutzungsausfall')
      .eq('id', fall.lead_id)
      .maybeSingle()
    lead = data
  }

  const ctx = buildKatalogContext({
    lead,
    fall: {
      zeugen_vorhanden: fall.zeugen_vorhanden,
      technische_stellungnahme_status: fall.technische_stellungnahme_status,
      nachbesichtigung_status: fall.nachbesichtigung_status,
    },
  })

  // Katalog-Slots die freigeschaltet sind
  const freie = await getSlotsFuerFall(supabase, ctx)

  // Slots die schon als Pflicht angelegt sind → nicht nochmal zeigen
  const { data: pflicht } = await admin
    .from('pflichtdokumente')
    .select('dokument_typ')
    .eq('fall_id', fallId)
  const pflichtSlots = new Set((pflicht ?? []).map(p => p.dokument_typ as string))

  // Bestehende fall_dokumente-Counts pro slot → für "(N hochgeladen)" Anzeige
  const { data: vorhandene } = await admin
    .from('fall_dokumente')
    .select('dokument_typ')
    .eq('fall_id', fallId)
    .is('geloescht_am', null)
  const counts = new Map<string, number>()
  for (const d of vorhandene ?? []) {
    const k = d.dokument_typ as string
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  return freie
    .filter((s: DokumentKatalogRow) => s.uploadbar_von.includes('kunde'))
    .filter((s) => !pflichtSlots.has(s.slot_id))
    .filter((s) => s.slot_id !== 'kunde-nachreichung')
    .map((s): FreierSlot => ({
      slot_id: s.slot_id,
      label: s.label,
      beschreibung: s.beschreibung,
      kategorie: s.kategorie,
      multi_file: s.multi_file,
      max_mb: s.max_mb,
      akzeptierte_mime_types: s.akzeptierte_mime_types,
      sort_order: s.sort_order,
      hochgeladene_anzahl: counts.get(s.slot_id) ?? 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order)
}

/**
 * Upload eines freiwilligen Kunden-Dokuments (Onboarding Step 4).
 * Anders als uploadPflichtdokument wird hier KEIN pflichtdokumente-Row
 * aktualisiert oder angelegt — es landet nur in fall_dokumente. Der
 * AAR-325-Trigger erzeugt daraus automatisch einen KB-Task (Prüfen bei
 * bekanntem Slot, Zuordnen wenn 'kunde-nachreichung'/'sonstiges').
 *
 * slotId = null → 'kunde-nachreichung' (unklarer Upload, Kunde hat Sonstiges gewählt).
 * beschreibung optional — bei 'kunde-nachreichung' i.d.R. gesetzt.
 */
export async function uploadKundenDokument(
  fallId: string,
  slotId: string | null,
  fileBase64: string,
  fileName: string,
  contentType: string,
  beschreibung?: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, kunde_id')
    .eq('id', fallId)
    .single()
  if (!fall || fall.kunde_id !== user.id) {
    return { success: false, error: 'Fall nicht zugeordnet' }
  }

  // Slot-Validation: wenn slotId gesetzt → muss 'kunde' in uploadbar_von sein.
  // Sonst könnte der Client durch Manipulation des slotId-Params Slots
  // hochladen die nur SV/KB dürfen.
  const admin = createAdminClient()
  let effektiverSlot: string
  if (slotId && slotId !== 'kunde-nachreichung') {
    const { data: katalogRow } = await admin
      .from('dokument_katalog')
      .select('slot_id, uploadbar_von, max_mb, akzeptierte_mime_types, aktiv')
      .eq('slot_id', slotId)
      .single()
    if (!katalogRow || !katalogRow.aktiv) {
      return { success: false, error: 'Slot nicht verfügbar' }
    }
    const uploadbar = (katalogRow.uploadbar_von as string[] | null) ?? []
    if (!uploadbar.includes('kunde')) {
      return { success: false, error: 'Dieser Slot ist nicht für Kunden-Upload freigegeben' }
    }
    // Mime-Type-Check gegen Katalog
    const akzeptiert = (katalogRow.akzeptierte_mime_types as string[] | null) ?? []
    if (akzeptiert.length > 0 && !akzeptiert.includes(contentType)) {
      return { success: false, error: `Dateityp nicht erlaubt. Erlaubt: ${akzeptiert.join(', ')}` }
    }
    effektiverSlot = slotId
  } else {
    effektiverSlot = 'kunde-nachreichung'
  }

  // Storage + Insert
  const ts = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `kunde-uploads/${user.id}/${fallId}/${effektiverSlot}_${ts}_${safeName}`

  try {
    const buffer = Buffer.from(fileBase64.split(',').pop() ?? fileBase64, 'base64')
    const { error: upErr } = await admin.storage
      .from('dokumente')
      .upload(path, buffer, { contentType, upsert: false })
    if (upErr) return { success: false, error: upErr.message }

    const { data: { publicUrl } } = admin.storage.from('dokumente').getPublicUrl(path)

    // AAR-324: Insert ohne pflichtdokumente-Update — das sind optionale Slots.
    // AAR-325-Trigger feuert auf uploaded_by_kunde=true → dokument-pruefen Task
    // und bei slot='kunde-nachreichung' zusätzlich dokument-zuordnen.
    await admin.from('fall_dokumente').insert({
      fall_id: fallId,
      dokument_typ: effektiverSlot,
      storage_path: path,
      original_filename: fileName,
      mime_type: contentType,
      groesse_bytes: buffer.length,
      hochgeladen_von_user_id: user.id,
      uploaded_by_kunde: true,
      beschreibung: beschreibung && beschreibung.trim().length > 0 ? beschreibung.trim() : null,
      hochgeladen_am: new Date().toISOString(),
    })

    revalidatePath('/kunde/onboarding')
    revalidatePath('/kunde')
    return { success: true, url: publicUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
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

    // AAR-323: Slot-Typ aus pflichtdokumente laden, damit der
    // fall_dokumente-Eintrag den korrekten dokument_typ bekommt.
    const { data: pd } = await admin
      .from('pflichtdokumente')
      .select('dokument_typ, status')
      .eq('id', pflichtdokumentId)
      .single()
    const slotTyp = pd?.dokument_typ ?? 'kunde-nachreichung'

    // Pflichtdokument aktualisieren — Replace setzt status=hochgeladen
    // auch wenn vorher 'abgelehnt'. Alter fall_dokumente-Eintrag bleibt als
    // Audit-Trail bestehen (wir insert'en immer neu, überschreiben nie).
    await admin.from('pflichtdokumente').update({
      status: 'hochgeladen',
      dokument_url: publicUrl,
      hochgeladen_am: new Date().toISOString(),
    }).eq('id', pflichtdokumentId)

    // AAR-323 + AAR-325: fall_dokumente-Eintrag mit echten Tabellen-Spalten
    // (storage_path, original_filename, uploaded_by_kunde). Vorher waren hier
    // Spalten aus der alten `dokumente`-Tabelle gemischt → Insert schlug still
    // fehl und fall_dokumente blieb leer. AAR-325-Trigger feuert auf
    // uploaded_by_kunde=true und erzeugt den KB-Task automatisch.
    await admin.from('fall_dokumente').insert({
      fall_id: fallId,
      dokument_typ: slotTyp,
      storage_path: path,
      original_filename: fileName,
      mime_type: contentType,
      groesse_bytes: buffer.length,
      hochgeladen_von_user_id: user.id,
      uploaded_by_kunde: true,
      hochgeladen_am: new Date().toISOString(),
    })

    revalidatePath('/kunde/onboarding')
    return { success: true, url: publicUrl }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
