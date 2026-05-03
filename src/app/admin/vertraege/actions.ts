'use server'

// Aaron 2026-04-30: Vertragseditor — Server-Actions für PDF-Upload mit
// Unterschriftsposition. PDFs landen in Storage-Bucket `fall-dokumente`
// unter `vertraege-vorlagen/{slotId}/{ts}.pdf`. Daneben wird die
// Konfig (page, x, y, w, h) als JSON-Sidecar abgelegt:
// `vertraege-vorlagen/{slotId}/{ts}.json`. Die jüngste Version je
// Slot ist die aktive.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PDFDocument } from 'pdf-lib'
import { revalidatePath } from 'next/cache'

const SLOT_IDS = [
  'sicherungsabtretung',
  'honorarvereinbarung',
  'datenschutzerklaerung',
  'widerrufsbelehrung',
] as const

export type SlotId = (typeof SLOT_IDS)[number]

export type VertragsKonfig = {
  page: number
  x: number
  y: number
  width: number
  height: number
  /** Datum-Position (optional). */
  datum_x?: number
  datum_y?: number
  /** Name-Position (optional). */
  name_x?: number
  name_y?: number
}

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false as const, error: 'Nicht angemeldet' }
  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') {
    return { ok: false as const, error: 'Nur Admins' }
  }
  return { ok: true as const, userId: user.id }
}

export type UploadResult =
  | {
      ok: true
      storage_path: string
      page_count: number
      first_page_size: { width: number; height: number }
      ts: number
    }
  | { ok: false; error: string }

/** Lädt ein PDF hoch, ermittelt die Größe der ersten Seite und
 *  speichert es mit Timestamp im Storage. Konfig kommt im zweiten
 *  Schritt via saveVertragsKonfig. */
export async function uploadVertragPdf(
  slotId: SlotId,
  formData: FormData,
): Promise<UploadResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!SLOT_IDS.includes(slotId)) {
    return { ok: false, error: `Ungültiger Slot: ${slotId}` }
  }
  const file = formData.get('datei') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'Keine Datei' }
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: 'Datei zu groß (max 25 MB)' }
  if (file.type !== 'application/pdf') {
    return { ok: false, error: 'Nur PDF erlaubt' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // Größe der ersten Seite ermitteln
  let pageCount = 0
  let firstPageW = 595
  let firstPageH = 842
  try {
    const pdf = await PDFDocument.load(bytes)
    pageCount = pdf.getPageCount()
    const p0 = pdf.getPage(0)
    const { width, height } = p0.getSize()
    firstPageW = width
    firstPageH = height
  } catch (err) {
    return {
      ok: false,
      error: `PDF nicht lesbar: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const ts = Date.now()
  const path = `vertraege-vorlagen/${slotId}/${ts}.pdf`
  const db = createAdminClient()
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const { error: upErr } = await db.storage
    .from('fall-dokumente')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true })
  if (upErr) return { ok: false, error: `Upload: ${upErr.message}` }

  revalidatePath('/admin/vertraege')

  return {
    ok: true,
    storage_path: path,
    page_count: pageCount,
    first_page_size: { width: firstPageW, height: firstPageH },
    ts,
  }
}

/** Speichert die Signaturposition als JSON-Sidecar zum PDF. */
export async function saveVertragsKonfig(
  storagePath: string,
  konfig: VertragsKonfig,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!storagePath.startsWith('vertraege-vorlagen/') || !storagePath.endsWith('.pdf')) {
    return { ok: false, error: 'Ungültiger Storage-Pfad' }
  }
  const jsonPath = storagePath.replace(/\.pdf$/, '.json')
  const db = createAdminClient()
  const blob = new Blob([JSON.stringify({ ...konfig, gespeichert_am: new Date().toISOString() }, null, 2)], {
    type: 'application/json',
  })
  const { error } = await db.storage
    .from('fall-dokumente')
    .upload(jsonPath, blob, { contentType: 'application/json', upsert: true })
  if (error) return { ok: false, error: `Konfig-Upload: ${error.message}` }

  revalidatePath('/admin/vertraege')
  return { ok: true }
}

export type VorlageEntry = {
  slotId: SlotId
  storage_path: string
  signed_url: string | null
  ts: number
  konfig: VertragsKonfig | null
}

/** Listet pro Slot die jüngste Vorlage (PDF + Konfig falls vorhanden). */
export async function listVertragsVorlagen(): Promise<{
  ok: boolean
  vorlagen: VorlageEntry[]
  error?: string
}> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, vorlagen: [], error: auth.error }

  const db = createAdminClient()
  const result: VorlageEntry[] = []

  for (const slotId of SLOT_IDS) {
    const { data: files, error } = await db.storage
      .from('fall-dokumente')
      .list(`vertraege-vorlagen/${slotId}`, {
        sortBy: { column: 'name', order: 'desc' },
        limit: 50,
      })
    if (error || !files) continue
    const pdf = files.find((f) => f.name.endsWith('.pdf'))
    if (!pdf) continue
    const stem = pdf.name.replace(/\.pdf$/, '')
    const ts = Number(stem) || 0
    const pdfPath = `vertraege-vorlagen/${slotId}/${pdf.name}`
    const jsonPath = `vertraege-vorlagen/${slotId}/${stem}.json`

    const { data: signed } = await db.storage
      .from('fall-dokumente')
      .createSignedUrl(pdfPath, 3600)

    let konfig: VertragsKonfig | null = null
    const { data: jsonBlob } = await db.storage.from('fall-dokumente').download(jsonPath)
    if (jsonBlob) {
      try {
        const text = await jsonBlob.text()
        konfig = JSON.parse(text) as VertragsKonfig
      } catch {
        konfig = null
      }
    }

    result.push({
      slotId,
      storage_path: pdfPath,
      signed_url: signed?.signedUrl ?? null,
      ts,
      konfig,
    })
  }

  return { ok: true, vorlagen: result }
}
