'use client'

import { createClient } from '@/lib/supabase/client'
import { getStorageUrl } from '@/lib/storage/url'

// AAR-471 C5: Browser-seitiger Upload von Schadens-Fotos. Komprimiert via
// Canvas auf max. 1600px Longest-Edge + JPG q=0.85 — spart Bandbreite und
// Vision-Token. Upload-Pfad:
//     schadensfotos/leads/{leadId}/{bereich}/{uuid}.jpg
// Der Bucket existiert bereits (20260330_bug21_storage_buckets.sql,
// public:true, image/jpeg/png/webp allowed).

const MAX_EDGE = 1600
const JPG_QUALITY = 0.85
const BUCKET = 'schadensfotos'

export const ALLOWED_FOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_FOTO_BYTES = 10 * 1024 * 1024
export const MAX_FOTO_COUNT = 30

export type FotoUploadResult =
  | { success: true; url: string }
  | { success: false; error: string }

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const targetW = Math.round(width * scale)
  const targetH = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar')
  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close?.()

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas-Export fehlgeschlagen'))),
      'image/jpeg',
      JPG_QUALITY,
    )
  })
}

export async function uploadFoto(
  leadId: string,
  bereich: string,
  file: File,
): Promise<FotoUploadResult> {
  if (!ALLOWED_FOTO_TYPES.includes(file.type as (typeof ALLOWED_FOTO_TYPES)[number])) {
    return {
      success: false,
      error:
        file.type === 'image/heic' || file.type === 'image/heif'
          ? 'HEIC wird nicht unterstützt. Bitte als JPG oder PNG hochladen.'
          : `Dateityp ${file.type || 'unbekannt'} nicht erlaubt. Nur JPG, PNG, WEBP.`,
    }
  }

  if (file.size > MAX_FOTO_BYTES) {
    return { success: false, error: 'Datei ist größer als 10 MB' }
  }

  let blob: Blob
  try {
    blob = await compressImage(file)
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Kompression fehlgeschlagen',
    }
  }

  const uuid = crypto.randomUUID()
  const path = `leads/${leadId}/${bereich}/${uuid}.jpg`

  const supabase = createClient()
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) return { success: false, error: error.message }

  const url = await getStorageUrl(supabase, BUCKET, path)
  if (!url) return { success: false, error: 'URL-Generierung fehlgeschlagen' }
  return { success: true, url }
}

export async function deleteFoto(url: string): Promise<void> {
  // Pfad hinter /object/public/schadensfotos/ extrahieren
  const marker = `/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const path = url.slice(idx + marker.length)
  const supabase = createClient()
  await supabase.storage.from(BUCKET).remove([path])
}
