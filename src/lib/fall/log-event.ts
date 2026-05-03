// K3-Konsolidierung: Zentraler Helper für timeline-Inserts.
// Vorher: ~80 Stellen mit direktem db.from('timeline').insert(...), jede
// setzte `typ` selber → Drift + Tippfehler. Dieser Helper erzwingt ein
// getyptes Enum und macht die Felder explizit dokumentiert.
//
// Bewusst schlank gehalten: kein Lead-Support (lead_id ist der Alt-Pfad,
// neue Codepfade hängen Events an den Fall). Falls Lead-Events nötig
// werden → zweite Funktion logLeadEvent, nicht hier verwässern.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'

// Die bestehende Timeline hat `typ text NOT NULL` ohne CHECK-Constraint —
// wir vereinheitlichen die erlaubten Werte clientseitig. Neue Typen bitte
// hier ergänzen, nicht inline freistringen.
export type TimelineTyp =
  | 'system'            // Default für generische System-Events
  | 'status_change'     // Fall-Status-Wechsel (state-machine)
  | 'task'              // Task auto-assigned / weitergeleitet / geschlossen
  | 'termin'            // Termin erstellt / geändert / abgesagt
  | 'dokument'          // Dokument hochgeladen / gelöscht / geprüft
  | 'kommunikation'     // Chat-System-Event, WA-Template etc.
  | 'eskalation'        // SLA-Breach, Rüge, Kanzlei-Mahnung
  | 'webhook'           // Stripe, LexDrive, DAT, etc.

export type LogFallEventInput = {
  fallId: string
  typ: TimelineTyp
  titel: string
  beschreibung?: string
  actor?: string | null
  metadata?: Record<string, unknown>
}

type Client = SupabaseClient<Database>

/**
 * Schreibt einen Eintrag in `timeline` für einen Fall. Best-effort —
 * Timeline-Fehler dürfen nie den Business-Call blockieren, weshalb wir
 * hier bewusst nicht throwen sondern den Fehler loggen und weiterlaufen.
 */
export async function logFallEvent(
  db: Client,
  input: LogFallEventInput,
): Promise<void> {
  const { error } = await db.from('timeline').insert({
    fall_id: input.fallId,
    typ: input.typ,
    titel: input.titel,
    beschreibung: input.beschreibung ?? null,
    erstellt_von: input.actor ?? null,
    metadata: (input.metadata ?? {}) as Json,
  })

  if (error) {
    console.error('[logFallEvent] insert failed:', error.message, {
      fallId: input.fallId,
      typ: input.typ,
      titel: input.titel,
    })
  }
}
