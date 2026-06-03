'use server'

// AAR-Phase0 (0.4): Kleiner Storage-Helper für Signed-URLs.
// Einheitlicher Aufruf aus Cards/Actions, die ein Dokument herunterladen
// oder öffnen lassen wollen (Gutachten, Fall-Dokumente, etc.).

import { createClient } from '@/lib/supabase/server'

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Gibt eine signierte URL für eine Datei im gegebenen Bucket zurück.
 * Default-Bucket: 'fall-dokumente' (Hauptspeicher für Fall-Anhänge).
 */
export async function getSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 60,
  bucket: string = 'fall-dokumente',
): Promise<SignedUrlResult> {
  if (!storagePath) return { ok: false, error: 'Kein Pfad übergeben' }

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Signed-URL-Fehler' }
  }
  return { ok: true, url: data.signedUrl }
}
