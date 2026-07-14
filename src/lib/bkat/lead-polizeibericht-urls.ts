// BKat-Reader-Fix (FG5-C4-Session, 14.07.): die Polizeibericht-Bilder für die BKat-Vision-OCR
// kommen aus `leads.polizeibericht_url`. Diese URL wird beim Upload und beim Twilio-Inbound als
// public-URL gespeichert (getPublicUrl) → direkt fetchbar, kein Signieren nötig. Der frühere
// bkat-inference-Pfad las `fall_dokumente.dokument_url` — die Spalte existiert nicht (heißt
// storage_path), die Query schlug still fehl, BKat bekam nie Bilder. Pure + unit-getestet;
// separat, weil bkat-inference.ts ein 'use server'-File ist (nur async Exports erlaubt).

/** Bildet die Polizeibericht-URL-Liste aus einem Lead. Leere/whitespace-only URLs gelten als abwesend. */
export function polizeiberichtUrlsFromLead(lead: { polizeibericht_url?: string | null }): string[] {
  const url = lead.polizeibericht_url?.trim()
  return url ? [url] : []
}
