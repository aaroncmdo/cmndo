'use server'

// Aaron 2026-04-30 / 2026-05-02: Vertragseditor — Server-Actions für PDF-
// Upload mit Unterschriftsposition. Pro Slot UND pro Sachverstaendigem
// kann eine eigene Vorlage hinterlegt werden, plus eine "_default"-
// Vorlage als Fallback fuer SVs ohne eigene Konfig.
//
// Storage-Layout (Bucket fall-dokumente):
//   vertraege-vorlagen/{slotId}/_default/{ts}.pdf      (+ .json Sidecar)
//   vertraege-vorlagen/{slotId}/{svId}/{ts}.pdf        (+ .json Sidecar)
//
// Legacy: vertraege-vorlagen/{slotId}/{ts}.pdf (ohne Unter-Ordner) wird
// vom Loader noch als zweiter Fallback gelesen, damit alte Uploads nicht
// neu hochgeladen werden muessen.

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

/** svId=null → Default-Vorlage, sonst SV-spezifisch. */
export async function uploadVertragPdf(
  slotId: SlotId,
  svId: string | null,
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
  const targetKey = svId ?? '_default'
  const path = `vertraege-vorlagen/${slotId}/${targetKey}/${ts}.pdf`
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
  /** Quelle: 'sv' wenn dieser SV eine eigene Vorlage hat, 'default' wenn auf
   *  die Default-Vorlage zurueckgefallen wurde, 'legacy' fuer alte
   *  flat-uploads ohne Unter-Ordner. */
  quelle: 'sv' | 'default' | 'legacy'
}

async function ladeJuengstePdf(
  db: ReturnType<typeof createAdminClient>,
  dir: string,
): Promise<{ name: string; ts: number } | null> {
  const { data: files, error } = await db.storage
    .from('fall-dokumente')
    .list(dir, { sortBy: { column: 'name', order: 'desc' }, limit: 50 })
  if (error || !files) return null
  const pdf = files.find((f) => f.name.endsWith('.pdf'))
  if (!pdf) return null
  const stem = pdf.name.replace(/\.pdf$/, '')
  return { name: pdf.name, ts: Number(stem) || 0 }
}

async function ladeKonfig(
  db: ReturnType<typeof createAdminClient>,
  jsonPath: string,
): Promise<VertragsKonfig | null> {
  const { data: jsonBlob } = await db.storage.from('fall-dokumente').download(jsonPath)
  if (!jsonBlob) return null
  try {
    return JSON.parse(await jsonBlob.text()) as VertragsKonfig
  } catch {
    return null
  }
}

/** svId=null → Default-Vorlagen. Sonst: erst SV, dann Default, dann Legacy. */
export async function listVertragsVorlagen(svId?: string | null): Promise<{
  ok: boolean
  vorlagen: VorlageEntry[]
  error?: string
}> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, vorlagen: [], error: auth.error }

  const db = createAdminClient()
  const result: VorlageEntry[] = []

  for (const slotId of SLOT_IDS) {
    let pdfPath: string | null = null
    let ts = 0
    let quelle: VorlageEntry['quelle'] = 'default'

    if (svId) {
      const svDir = `vertraege-vorlagen/${slotId}/${svId}`
      const found = await ladeJuengstePdf(db, svDir)
      if (found) {
        pdfPath = `${svDir}/${found.name}`
        ts = found.ts
        quelle = 'sv'
      }
    }

    if (!pdfPath) {
      const defDir = `vertraege-vorlagen/${slotId}/_default`
      const found = await ladeJuengstePdf(db, defDir)
      if (found) {
        pdfPath = `${defDir}/${found.name}`
        ts = found.ts
        quelle = 'default'
      }
    }

    // Legacy-Fallback: vertraege-vorlagen/{slot}/{ts}.pdf (flat)
    if (!pdfPath) {
      const flatDir = `vertraege-vorlagen/${slotId}`
      const { data: files } = await db.storage
        .from('fall-dokumente')
        .list(flatDir, { sortBy: { column: 'name', order: 'desc' }, limit: 50 })
      const flat = (files ?? []).find((f) => f.name.endsWith('.pdf') && /^\d+\.pdf$/.test(f.name))
      if (flat) {
        pdfPath = `${flatDir}/${flat.name}`
        ts = Number(flat.name.replace(/\.pdf$/, '')) || 0
        quelle = 'legacy'
      }
    }

    if (!pdfPath) continue

    const { data: signed } = await db.storage
      .from('fall-dokumente')
      .createSignedUrl(pdfPath, 3600)
    const konfig = await ladeKonfig(db, pdfPath.replace(/\.pdf$/, '.json'))

    result.push({
      slotId,
      storage_path: pdfPath,
      signed_url: signed?.signedUrl ?? null,
      ts,
      konfig,
      quelle,
    })
  }

  return { ok: true, vorlagen: result }
}

export type SvOption = { id: string; label: string }

/** Liste aller aktiven SVs für die Editor-Auswahl. */
export async function listSvsForEditor(): Promise<{
  ok: boolean
  svs: SvOption[]
  error?: string
}> {
  const auth = await requireAdmin()
  if (!auth.ok) return { ok: false, svs: [], error: auth.error }

  const db = createAdminClient()
  const { data, error } = await db
    .from('sachverstaendige')
    .select('id, profiles:profile_id(vorname, nachname, email)')
    .order('id')
  if (error) return { ok: false, svs: [], error: error.message }

  type Row = { id: string; profiles: { vorname: string | null; nachname: string | null; email: string | null } | { vorname: string | null; nachname: string | null; email: string | null }[] | null }
  const svs: SvOption[] = ((data ?? []) as Row[]).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const name = p ? [p.vorname, p.nachname].filter(Boolean).join(' ').trim() || p.email || row.id : row.id
    return { id: row.id, label: name as string }
  })
  return { ok: true, svs }
}
