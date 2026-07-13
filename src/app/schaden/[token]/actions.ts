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
import { convertLeadToClaim } from '@/lib/leads/convert-lead-to-claim'
import {
  phoneWriteCapExceeded,
  globalWriteCapExceeded,
  recordGlobalWrite,
} from '@/lib/api-v1/write-abuse-guard'
import {
  speichereGegnerFoto,
  speichereGegnerUnterschrift,
} from '@/lib/schadenkarte/gegner-dokumente'
import type { GegnerFormData } from './gegner-form-types'

type SubmitResult =
  | { ok: true; leadId: string; vehicleId: string; claimId?: string }
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

  // 3b. Abuse-Cap (public unauth Write-Pfad). Reuse der melde-schaden-Backstops:
  //   Per-Telefon-Velocity (nur wenn der Gegner eine Nummer angab) + globaler
  //   Circuit-Breaker. Best-effort/fail-open in phoneWriteCapExceeded (DB-Fehler
  //   -> durchlassen; der globale Breaker faengt Massen-Missbrauch).
  const telefon = data.telefon?.trim()
  if (telefon && (await phoneWriteCapExceeded(telefon))) {
    return {
      ok: false,
      error: 'Von dieser Telefonnummer wurden zu viele Meldungen erfasst. Bitte später erneut versuchen.',
    }
  }
  if (globalWriteCapExceeded()) {
    return {
      ok: false,
      error: 'Der Dienst ist aktuell stark ausgelastet. Bitte in einigen Minuten erneut versuchen.',
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

  // Write akzeptiert -> globalen Rolling-Counter zaehlen (nur tatsaechlich erfolgte Writes).
  recordGlobalWrite()

  // 5. Claim-first: Lead sofort zu einem echten Claim konvertieren.
  //   convertLeadToClaim ist idempotent + kanonisch: mappt den Gegner-Lead auf
  //   claims + claim_parties (geschaedigter = Flotten-Fahrzeug via vehicle_id/firma_name,
  //   verursacher = Gegner via gegner_* — data-driven). Kein triggerByUserId (anon Gegner-Flow).
  //   FAIL-SOFT: schlaegt der Convert fehl, bleibt der Draft-Lead am Fahrzeug sichtbar und
  //   der Convert ist spaeter idempotent nachholbar — der Gegner-Submit darf deshalb NICHT
  //   hart fehlschlagen (seine Daten sind erfasst).
  //   HINWEIS (a6c863e2-koordiniert): der Gegner-Unfallhergang landet aktuell via Pipeline in
  //   claims.hergang_kunde_text; die saubere Trennung (claims.hergang_gegner_text) folgt, sobald
  //   die claim-dokumente-kanon-Lane die claims-DDL freigibt.
  let claimId: string | undefined
  let fallId: string | undefined
  try {
    const conv = await convertLeadToClaim({ leadId: res.leadId })
    if (conv.ok) {
      claimId = conv.claimId
      fallId = conv.fallId
    } else {
      console.error(
        '[schaden-gegner] convertLeadToClaim fehlgeschlagen (Draft bleibt, idempotent nachholbar):',
        conv.error,
      )
    }
  } catch (err) {
    console.error('[schaden-gegner] convertLeadToClaim warf (Draft bleibt):', err)
  }

  // 5b. Foto- + Unterschrift-Upload (fail-soft).
  //   Nur wenn der Convert erfolgreich war (fallId + claimId bekannt).
  //   Ein fehlgeschlagener Upload darf den Gesamt-Submit NICHT abbrechen —
  //   der Claim existiert bereits und ist idempotent nachholbar.
  if (fallId && claimId) {
    if (data.fotos?.length) {
      for (const foto of data.fotos) {
        try {
          const fotoRes = await speichereGegnerFoto(db, fallId, claimId, foto)
          if (!fotoRes.ok) {
            console.error('[schaden-gegner] Foto-Upload fehlgeschlagen:', fotoRes.error, foto.typ)
          }
        } catch (err) {
          console.error('[schaden-gegner] Foto-Upload warf:', err)
        }
      }
    }

    if (data.unterschrift) {
      try {
        const sigRes = await speichereGegnerUnterschrift(db, fallId, claimId, data.unterschrift)
        if (!sigRes.ok) {
          console.error('[schaden-gegner] Unterschrift-Upload fehlgeschlagen:', sigRes.error)
        }
      } catch (err) {
        console.error('[schaden-gegner] Unterschrift-Upload warf:', err)
      }
    }
  }

  // 6. Fahrzeug-Detailseite revalidieren — dort erscheint der neue Schaden (Claim oder Draft)
  revalidatePath('/flotte/fahrzeug/' + ctx.context.fahrzeugId)

  return { ok: true, leadId: res.leadId, vehicleId: ctx.context.fahrzeugId, claimId }
}
