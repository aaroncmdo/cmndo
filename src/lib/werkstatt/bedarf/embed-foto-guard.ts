// Abuse-Guard fuer transiente Embed-Fotos: begrenzt Anzahl, Groesse und Media-Type
// bevor ein Vision-Call ausgeloest wird. Rein (keine Seiteneffekte).

export type EmbedFoto = { data: string; media_type: string }

export const MAX_FOTOS = 3
export const MAX_BYTES = 5_000_000
export const ERLAUBTE_TYPEN = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Schaetzt die Byte-Groesse eines base64-kodierten Strings. */
const bytesFromBase64 = (data: string): number => Math.floor((data.length * 3) / 4)

/**
 * Prueft und filtert Embed-Fotos:
 * - Nur erlaubte Media-Types (jpeg/png/webp)
 * - Maximal MAX_BYTES decoded pro Bild
 * - Maximal MAX_FOTOS Bilder (erste N behalten)
 *
 * Gibt {ok:false} zurueck wenn nach Filterung keine Bilder uebrig bleiben.
 */
export function pruefeEmbedFotos(images: EmbedFoto[]): { ok: true; images: EmbedFoto[] } | { ok: false } {
  const gefiltert = (images ?? [])
    .filter((i) => i && typeof i.data === 'string' && (ERLAUBTE_TYPEN as readonly string[]).includes(i.media_type))
    .filter((i) => bytesFromBase64(i.data) <= MAX_BYTES)
    .slice(0, MAX_FOTOS)
  return gefiltert.length > 0 ? { ok: true, images: gefiltert } : { ok: false }
}
