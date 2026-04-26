'use server'

// AAR-833: Gutachten-Fotos Server Actions — registrieren, löschen, Kategorie setzen

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const STORAGE_BUCKET = 'gutachten-fotos'

type FotoKategorie = 'uebersicht' | 'vin' | 'kennzeichen' | 'tacho' | 'schadenstelle' | 'innen' | 'sonstiges'

type FotoMetadaten = {
  storagePath: string
  uploadQuelle: 'sv' | 'laeufer' | 'kunde' | 'admin'
  uploadedBy?: string | null
  originalFilename?: string | null
  mimeType?: string | null
  fileSizeBytes?: number | null
  aufnahmeZeitpunkt?: string | null
  beschreibung?: string | null
  positionNr?: number | null
  kategorie?: FotoKategorie | null
}

export async function registriereFoto(
  gutachtenId: string,
  claimId: string,
  data: FotoMetadaten,
): Promise<{ ok: boolean; error?: string; fotoId?: string }> {
  const supabase = await createClient()
  const { data: neu, error } = await supabase
    .from('gutachten_fotos')
    .insert({
      gutachten_id:       gutachtenId,
      claim_id:           claimId,
      storage_path:       data.storagePath,
      upload_quelle:      data.uploadQuelle,
      uploaded_by:        data.uploadedBy        ?? null,
      original_filename:  data.originalFilename  ?? null,
      mime_type:          data.mimeType           ?? null,
      file_size_bytes:    data.fileSizeBytes      ?? null,
      aufnahme_zeitpunkt: data.aufnahmeZeitpunkt  ?? null,
      beschreibung:       data.beschreibung       ?? null,
      position_nr:        data.positionNr         ?? null,
      kategorie:          data.kategorie          ?? null,
      exif_processed:     false,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true, fotoId: neu.id }
}

export async function deleteFoto(
  fotoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: foto, error: fetchErr } = await supabase
    .from('gutachten_fotos')
    .select('storage_path')
    .eq('id', fotoId)
    .single()

  if (fetchErr || !foto) return { ok: false, error: fetchErr?.message ?? 'Foto nicht gefunden' }

  // Storage-Objekt löschen (non-critical — DB-Record wird trotzdem entfernt)
  try {
    await supabase.storage.from(STORAGE_BUCKET).remove([foto.storage_path])
  } catch (err) {
    console.error('[AAR-833] deleteFoto storage remove:', err)
  }

  const { error } = await supabase
    .from('gutachten_fotos')
    .delete()
    .eq('id', fotoId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true }
}

export async function setFotoKategorie(
  fotoId: string,
  kategorie: FotoKategorie,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gutachten_fotos')
    .update({ kategorie })
    .eq('id', fotoId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/faelle`)
  return { ok: true }
}
