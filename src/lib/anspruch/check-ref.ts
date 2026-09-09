// Nachtraegliche Verknuepfung Foto-Check <-> Lead (2026-09-09, Design
// docs/superpowers/specs/2026-09-09-foto-check-nachtraegliche-verknuepfung-design.md).
//
// claimondo.de/check haengt eine Browser-Kennung (`?ref=`, UUID v4 aus dem Cookie claimondo_check_ref)
// an den Foto-CTA. Sie kommt aus der URL, also aus fremder Hand: nur eine echte UUID (v1-v5, dieselbe
// Regel wie fuer `?lead=`) darf in anspruch_schaetzungen.check_ref landen — alles andere wird NULL.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Liefert die kleingeschriebene UUID oder null — nie einen Fehler, nie einen anderen String. */
export function normalisiereCheckRef(wert: unknown): string | null {
  if (typeof wert !== 'string') return null
  return UUID_RE.test(wert) ? wert.toLowerCase() : null
}
