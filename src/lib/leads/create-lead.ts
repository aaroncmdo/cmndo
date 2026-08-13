// Zentrale Lead-Erzeugung — erzwingt das gemeinsame Basis-Feld-Set.
//
// Hintergrund: leads-Audit 15.05.2026 (docs/15.05.2026/leads-writer-konsistenz-
// audit.md). `leads` hat 201 Spalten, 8 Produktions-Eintrittspunkte legten je
// eine eigene Teilmenge an. Worst-Case-Drift: der öffentliche Rückruf-Flow
// erzeugte Leads mit NULL `source_channel`/`status`, die der Dispatcher
// unvollständig sah; `dispatch_spontan` schrieb sogar einen ungültigen
// lead_status-Enum-Wert.
//
// Lösung: jeder Lead-Eintrittspunkt geht durch `createLead()`. Der `LeadBase`-
// Typ erzwingt zur Compile-Zeit, dass `source_channel` gesetzt ist und `status`
// ein gültiger lead_status-Enum-Wert — ein neuer Contributor, der driftet,
// kompiliert nicht. Quellen-spezifische Felder kommen über `extra` rein.
//
// Kontaktfelder (vorname/nachname/telefon/email) sind bewusst optional: der
// Dispatcher-Quick-Create legt absichtlich leere Lead-Stubs an und füllt sie
// in der Lead-Maske nach. Die Drift-Gefahr lag nie bei den Kontaktfeldern
// (die setzt fast jeder Contributor), sondern bei source_channel + status.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
// type-only: verschwindet zur Laufzeit, belastet den Trichter nicht.
import type { SkizzeLeadClient } from '@/lib/unfallskizze/erzeuge-fuer-lead'

type LeadInsert = Database['public']['Tables']['leads']['Insert']
type LeadStatus = Database['public']['Enums']['lead_status']

/**
 * Pflicht-Basis das JEDER Lead-Eintrittspunkt mitbringen muss:
 * - `source_channel`: woher der Lead kam (z.B. 'rueckruf', 'aircall-inbound',
 *   'mini_wizard', 'admin-direkt', 'dispatch_spontan').
 * - `status`: lead_status-Enum — kein NULL, kein Freitext mehr.
 * Kontaktfelder sind optional (Quick-Create-Stubs).
 */
export type LeadBase = {
  source_channel: string
  status: LeadStatus
  vorname?: string | null
  nachname?: string | null
  telefon?: string | null
  email?: string | null
}

/** Quellen-spezifische Zusatzfelder — alles außer dem LeadBase-Set. */
export type LeadExtra = Omit<Partial<LeadInsert>, keyof LeadBase>

type CreateLeadResult =
  | { ok: true; leadId: string }
  | { ok: false; error: string }

/**
 * Legt einen Lead an und liefert die ID zurück.
 *
 * @param client  Supabase-Client (Admin- oder User-scoped — RLS-Policy
 *                `leads_staff_all_consolidated` erlaubt admin/dispatch/kb).
 * @param base    Pflicht-Basis (Typ erzwingt source_channel + gültigen status).
 * @param extra   Quellen-spezifische Zusatzfelder (Fahrzeug, Schaden, FKs, …).
 */
export async function createLead(
  client: SupabaseClient<Database>,
  base: LeadBase,
  extra?: LeadExtra,
): Promise<CreateLeadResult> {
  const { data, error } = await client
    .from('leads')
    .insert({
      ...extra,
      vorname: base.vorname?.trim() || null,
      nachname: base.nachname?.trim() || null,
      telefon: base.telefon?.trim() || null,
      email: base.email?.trim() || null,
      source_channel: base.source_channel,
      status: base.status,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Lead-Anlage fehlgeschlagen' }
  }

  // Unfallskizze — hier, weil createLead der gemeinsame Trichter ALLER Eintrittspunkte ist.
  //
  // Messung prod 13.08.: 18 Leads mit Unfallhergang, davon 0 mit Skizze. Der Generator
  // (AAR-317) war nur im Dispatch-Portal verdrahtet und wurde dort nie angestossen. Die
  // Kanaele, die den Hergang schon beim Anlegen mitschicken — Kunde-Portal, Schaden-Karte,
  // Werkstatt-Finder, Flotte, Makler-FlowLink — bekommen ihn damit alle auf einmal, statt
  // je einzeln nachgeruestet zu werden. Der Flow-Feststellungs-Schritt bleibt der zweite
  // Ausloeser: dort entsteht der Lead frueher als der Hergangstext.
  //
  // Billiger Vorab-Check (String, nicht leer): spart Admin-Client + Query bei Stub-Leads
  // (Quick-Create, Rueckruf) — das ist die Mehrheit. Die eigentliche Regel (Mindestlaenge,
  // schon vorhandene Skizze) liegt ungeteilt in erzeugeSkizzeFuerLead.
  const hergang = (extra as { unfallhergang?: unknown } | undefined)?.unfallhergang
  if (typeof hergang === 'string' && hergang.trim() !== '') {
    const neueLeadId = data.id
    // FIRE-AND-FORGET (bewusst kein await): der Claude-Call braucht 5-15 s — niemand soll
    // beim Absenden einer Schadenmeldung darauf warten. Die App laeuft als langlebiger
    // Node-Prozess auf dem VPS (kein Serverless-Freeze), die Promise laeuft also zu Ende.
    // Geht sie bei einem Deploy verloren, bleibt der manuelle Dispatch-Weg — die Skizze
    // ist nirgends Voraussetzung, sie ist eine Zugabe.
    void (async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { erzeugeSkizzeFuerLead } = await import('@/lib/unfallskizze/erzeuge-fuer-lead')
      await erzeugeSkizzeFuerLead({
        leadId: neueLeadId,
        hergang,
        // createAdminClient() ist ungetypt; SkizzeLeadClient beschreibt strukturell
        // genau die zwei Queries, die die Funktion faehrt.
        admin: createAdminClient() as unknown as SkizzeLeadClient,
        kontext: 'create-lead',
      })
    })().catch((err) => {
      // erzeugeSkizzeFuerLead wirft nicht — die dynamischen Imports koennten es.
      console.warn('[create-lead] Unfallskizze (non-critical):', err)
    })
  }

  return { ok: true, leadId: data.id }
}
