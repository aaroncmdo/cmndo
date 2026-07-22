'use server'

// B (Fahrzeug-Zustandsdoku) Task 4: Server-Actions. Alles firma-scoped über den Admin-Client
// (kein RLS-Pfad); Ownership im Code (flotten_fahrzeuge.firma_id = FM-Firma). Result-Object,
// KI fail-soft, human-in-the-loop (Vorschäden erst in finalisiereScan aus bestätigten Funden).
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getStorageUrl } from '@/lib/storage/url'
import { recordVehicleDamage } from '@/lib/vehicles/vehicle-damage'
import { analysiereFotos, type ZustandFund } from '@/lib/vehicles/zustand-scan-ki'
import { PFLICHT_PERSPEKTIVEN, OPTIONALE_PERSPEKTIVEN } from '@/lib/vehicles/zustand-perspektiven'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

const BUCKET = 'fahrzeug-zustand'
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FOTO_BYTES = 8 * 1024 * 1024
const VALID_PERSPEKTIVEN = new Set<string>([...PFLICHT_PERSPEKTIVEN, ...OPTIONALE_PERSPEKTIVEN, 'nahaufnahme'])

/** Ownership: gehört das Fahrzeug der Firma des eingeloggten FM? */
async function fmBesitztFahrzeug(db: AnyDb, userId: string, vehicleId: string): Promise<boolean> {
  const firma = await getFlottenmanagerFirma(db, userId)
  if (!firma) return false
  const { data } = await db
    .from('flotten_fahrzeuge')
    .select('id')
    .eq('firma_id', firma.id)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
  return !!data
}

/** scan → vehicle_id, wenn der FM das Fahrzeug besitzt (sonst null). */
async function scanVehicleId(db: AnyDb, userId: string, scanId: string): Promise<string | null> {
  const { data: scan } = await db.from('vehicle_scans').select('vehicle_id').eq('id', scanId).maybeSingle()
  const vehicleId = (scan?.vehicle_id as string | null) ?? null
  if (!vehicleId) return null
  return (await fmBesitztFahrzeug(db, userId, vehicleId)) ? vehicleId : null
}

export async function starteScan(
  vehicleId: string,
): Promise<{ ok: true; scanId: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  if (!(await fmBesitztFahrzeug(db, user.id, vehicleId))) {
    return { ok: false, error: 'Fahrzeug gehört nicht zu Ihrer Flotte.' }
  }
  const { data, error } = await db
    .from('vehicle_scans')
    .insert({ vehicle_id: vehicleId, status: 'offen', erstellt_von: user.id })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Scan konnte nicht gestartet werden.' }
  return { ok: true, scanId: data.id as string }
}

export async function ladeFotoHoch(
  scanId: string,
  perspektive: string,
  dataUrl: string,
  istNahaufnahme: boolean,
  vorschadenId?: string | null,
): Promise<{ ok: true; fotoId: string; storagePath: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const vehicleId = await scanVehicleId(db, user.id, scanId)
  if (!vehicleId) return { ok: false, error: 'Kein Zugriff auf diesen Scan.' }
  if (!VALID_PERSPEKTIVEN.has(perspektive)) return { ok: false, error: 'Ungültige Perspektive.' }

  // MIME + Byte-Guard (Server-Boundary — Wizard-Umgehung möglich).
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  const contentType = mimeMatch?.[1] ?? 'image/jpeg'
  const b64 = mimeMatch?.[2] ?? (dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl)
  if (!ALLOWED_MIME.has(contentType)) return { ok: false, error: 'Ungültiges Bildformat.' }
  let buf: Buffer
  try {
    buf = Buffer.from(b64, 'base64')
  } catch {
    return { ok: false, error: 'Ungültige Bilddaten.' }
  }
  if (buf.length === 0) return { ok: false, error: 'Bilddaten leer.' }
  if (buf.length > MAX_FOTO_BYTES) return { ok: false, error: 'Bilddaten zu groß.' }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = `${vehicleId}/${scanId}/${randomUUID()}.${ext}`
  const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, buf, { contentType, upsert: false })
  if (upErr) return { ok: false, error: `Foto-Upload fehlgeschlagen: ${upErr.message}` }

  const { data, error } = await db
    .from('vehicle_scan_fotos')
    .insert({ scan_id: scanId, storage_path: storagePath, perspektive, ist_nahaufnahme: istNahaufnahme, vorschaden_id: vorschadenId ?? null })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Foto-Datensatz fehlgeschlagen.' }
  return { ok: true, fotoId: data.id as string, storagePath }
}

export async function analysiereZustandsFotos(
  scanId: string,
): Promise<{ ok: true; funde: ZustandFund[] } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const vehicleId = await scanVehicleId(db, user.id, scanId)
  if (!vehicleId) return { ok: false, error: 'Kein Zugriff auf diesen Scan.' }

  // Standard-Fotos (keine Nahaufnahmen) des Scans + signierte URLs für die Vision-Analyse.
  const { data: fotos } = await db
    .from('vehicle_scan_fotos')
    .select('storage_path, perspektive')
    .eq('scan_id', scanId)
    .eq('ist_nahaufnahme', false)
  const rows = (fotos ?? []) as Array<{ storage_path: string; perspektive: string }>
  const mitUrl: { url: string; perspektive: string }[] = []
  for (const f of rows) {
    const url = await getStorageUrl(db, BUCKET, f.storage_path, { context: 'ui' })
    if (url) mitUrl.push({ url, perspektive: f.perspektive })
  }
  // Fail-soft: KI-Fehler / kein Client -> leere Fund-Liste (nie falsch-positiv).
  const funde = await analysiereFotos(mitUrl)
  return { ok: true, funde }
}

export async function finalisiereScan(
  scanId: string,
  bestaetigteFunde: (ZustandFund & { nahaufnahmeFotoId?: string | null })[],
  kilometerstand?: number | null,
): Promise<{ ok: true; angelegt: number } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const vehicleId = await scanVehicleId(db, user.id, scanId)
  if (!vehicleId) return { ok: false, error: 'Kein Zugriff auf diesen Scan.' }

  let angelegt = 0
  for (const fund of bestaetigteFunde) {
    const res = await recordVehicleDamage({
      db,
      damage: {
        vehicleId,
        state: 'vorschaden',
        art: fund.art,
        schwere: fund.schwere,
        beschreibung: fund.beschreibung,
        quelle: 'zustandsdoku',
        rohdaten: fund,
      },
    })
    if (!res.ok) {
      console.error('[zustandsdoku] recordVehicleDamage fehlgeschlagen:', res.error)
      continue
    }
    angelegt++
    // Vorschaden-Beleg an den Scan hängen.
    await db.from('vehicle_vorschaeden').update({ scan_id: scanId }).eq('id', res.damageId)
    // Optionale Nahaufnahme dieses Funds mit dem Vorschaden verknüpfen.
    if (fund.nahaufnahmeFotoId) {
      await db.from('vehicle_scan_fotos').update({ vorschaden_id: res.damageId }).eq('id', fund.nahaufnahmeFotoId)
    }
  }

  const { error } = await db
    .from('vehicle_scans')
    .update({ status: 'abgeschlossen', kilometerstand: kilometerstand ?? null })
    .eq('id', scanId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/flotte/fahrzeug/' + vehicleId)
  revalidatePath('/flotte/flotte')
  return { ok: true, angelegt }
}
