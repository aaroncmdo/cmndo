'use server'

// Server-action orchestrator for the opponent accident-report flow.
// Receives the karten_token + GegnerFormData, validates consent + name,
// resolves vehicle/firma context, then writes a draft Lead via createLead().
//
// Note: leads.firma_id does NOT exist as a column (only claim_parties has it).
// Instead we store firma_name (string) on the lead for reference, and the
// vehicle_id FK is the primary link back to the fleet. The flottenmanager
// query in fahrzeug-schaeden.ts uses vehicle_id exclusively to find drafts.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSchadenTokenContext } from '@/lib/schadenkarte/gegner-flow'
import { createLead } from '@/lib/leads/create-lead'
import type { GegnerFormData } from './gegner-form-types'

type SubmitResult =
  | { ok: true; leadId: string; vehicleId: string }
  | { ok: false; error: string }

/**
 * Verarbeitet das Gegner-Formular des NFC-Schaden-Flows.
 * Legt einen Draft-Lead an, der auf der Fahrzeug-Detailseite des Flottenmanagers erscheint.
 *
 * @param token  karten_token der Schadenkarte (URL-Parameter)
 * @param data   Formularwerte des Unfallgegners
 */
export async function submitSchadenGegner(
  token: string,
  data: GegnerFormData,
): Promise<SubmitResult> {
  // 1. Guard: Consent muss gegeben sein (DSGVO-Pflicht)
  if (!data.consent) {
    return {
      ok: false,
      error: 'Bitte stimmen Sie der Datenverarbeitung zu, um fortzufahren.',
    }
  }

  // 2. Guard: Name ist Pflichtfeld
  if (!data.name?.trim()) {
    return { ok: false, error: 'Bitte geben Sie Ihren Namen an.' }
  }

  // 3. Token -> Fahrzeug/Firma-Kontext auflösen
  const db = createAdminClient()
  const ctx = await resolveSchadenTokenContext(db, token)

  if (!ctx.ok) {
    return {
      ok: false,
      error: 'Diese Schadenkarte ist ungültig oder keinem Fahrzeug zugewiesen.',
    }
  }

  // 4. Draft-Lead anlegen
  // source_channel: 'schaden-karte' — neuer Kanal fuer NFC-Schadenkarten-Flows;
  //   source_channel ist typed as string (open union), kein Closed-Union-Fallback noetig.
  // status: 'neu' — gueltiger lead_status-Enum-Wert fuer unbearbeitete Eingangs-Leads.
  // firma_id: existiert NICHT auf leads (nur auf claim_parties) → nicht geschrieben;
  //   firma_name (string-Spalte auf leads) wird stattdessen gesetzt.
  // dsgvo_zustimmung_am: existiert NICHT auf leads (nur auf anfragen/sv_termine) →
  //   nicht geschrieben; Consent wird via guard Z.38 erzwungen + consent-Timestamp
  //   liegt im created_at des Leads implizit vor.
  const res = await createLead(
    db,
    {
      source_channel: 'schaden-karte',
      status: 'neu',
    },
    {
      vehicle_id: ctx.context.fahrzeugId,
      firma_name: ctx.context.firmaName,
      gegner_name: data.name.trim(),
      gegner_telefon: data.telefon || null,
      gegner_email: data.email || null,
      gegner_kennzeichen: data.kennzeichen || null,
      gegner_fahrzeugtyp: data.fahrzeugtyp || null,
      gegner_versicherung_id: data.versicherungId || null,
      gegner_schadennummer: data.schadennummer || null,
      unfallhergang: data.hergang || null,
    },
  )

  if (!res.ok) {
    return { ok: false, error: res.error ?? 'Fehler beim Speichern.' }
  }

  // 5. Fahrzeug-Detailseite revalidieren — dort erscheint der neue Draft
  revalidatePath('/flotte/fahrzeug/' + ctx.context.fahrzeugId)

  return { ok: true, leadId: res.leadId, vehicleId: ctx.context.fahrzeugId }
}
