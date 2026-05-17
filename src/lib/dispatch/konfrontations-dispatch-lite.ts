// AAR-561 (C12): Konfrontations-Dispatch-Lite.
// Reduzierter Dispatch-Flow für SV-Konfrontations-Begleitung bei der
// Nachbesichtigung. KEIN SV-Match (fix der SV der bereits auf fall.sv_id
// liegt), KEIN Lead-Preis, KEIN Stripe-Checkout, KEIN SA-Versand.
// Erstellt nur eine neue gutachter_termine-Row mit typ='konfrontation',
// bezahlt=false, honorar_betrag=0 und triggert danach das
// sv_konfrontation_anfrage_versendet-Event (Mitteilung + Audit via C3).

import { createAdminClient } from '@/lib/supabase/admin'
import { processLexDriveEvent } from '@/lib/lexdrive/process-event'

export interface TriggerKonfrontationsDispatchInput {
  fallId: string
  /** ISO-Timestamp des vom Kunden vorgeschlagenen und vom KB gewählten Slots. */
  terminIso: string
  /** Dauer in Minuten — Konfrontation ist meistens kurz (VS-Gutachter-Begleitung). */
  dauerMinuten?: number
  /** Profil-ID des auslösenden Users (KB oder Admin), für Audit-Trail. */
  triggeredByProfileId?: string | null
}

export interface TriggerKonfrontationsDispatchResult {
  success: boolean
  terminId?: string
  error?: string
}

/**
 * Erstellt einen Konfrontations-Termin für den bereits zugewiesenen SV
 * (fall.sv_id) und triggert das Event-System für Mitteilung/WA.
 *
 * Edge-Case "SV inaktiv": wird geprüft — bei Inaktivität Fehler-Return mit
 * Hinweis, dass manuell ein bezahlter Ersatz-SV via normalem Dispatch
 * zugewiesen werden muss.
 */
export async function triggerKonfrontationsDispatch(
  input: TriggerKonfrontationsDispatchInput,
): Promise<TriggerKonfrontationsDispatchResult> {
  if (!input.fallId) return { success: false, error: 'fallId fehlt' }
  if (!input.terminIso) return { success: false, error: 'terminIso fehlt' }

  const startDate = new Date(input.terminIso)
  if (Number.isNaN(startDate.getTime())) {
    return { success: false, error: 'terminIso ist kein gültiges Datum' }
  }
  if (startDate.getTime() < Date.now()) {
    return { success: false, error: 'Termin darf nicht in der Vergangenheit liegen' }
  }

  const dauer = input.dauerMinuten ?? 60
  const endDate = new Date(startDate.getTime() + dauer * 60_000)

  const db = createAdminClient()

  // Fall + SV laden (SV muss aktiv sein und der Fall muss einen SV haben)
  // AAR-607 B1: .single() wirft bei 0 Rows unkontrolliert — stumm failed der
  // Konfrontations-Dispatch wenn der Fall gerade gelöscht wurde (Race).
  const { data: fall } = await db
    .from('faelle')
    .select('id, sv_id, nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am, claims:claim_id(claim_nummer)')
    .eq('id', input.fallId)
    .maybeSingle()

  if (!fall) return { success: false, error: 'Fall nicht gefunden' }
  if (!fall.sv_id) {
    return {
      success: false,
      error: 'Kein SV dem Fall zugewiesen — Konfrontations-Dispatch-Lite nicht möglich',
    }
  }
  if (!fall.nachbesichtigung_sv_konfrontation_gewuenscht) {
    return {
      success: false,
      error: 'Kunde hat keine SV-Konfrontation gewünscht (flag nicht gesetzt)',
    }
  }
  if (fall.nachbesichtigung_sv_termin_vereinbart_am) {
    return {
      success: false,
      error: 'Konfrontations-Termin wurde bereits vereinbart',
    }
  }

  const { data: sv } = await db
    .from('sachverstaendige')
    .select('id, ist_aktiv, deaktiviert_am, gesperrt_seit, profile_id')
    .eq('id', fall.sv_id as string)
    .maybeSingle()

  if (!sv) return { success: false, error: 'SV-Profil nicht gefunden' }
  const svInaktiv =
    sv.ist_aktiv === false || sv.deaktiviert_am != null || sv.gesperrt_seit != null
  if (svInaktiv) {
    return {
      success: false,
      error:
        'Der zugewiesene SV ist inaktiv/gesperrt — bitte alternativen SV via normalen (bezahlten) Dispatch zuweisen',
    }
  }

  // Optional: existiert bereits ein offener Konfrontations-Termin für diesen
  // Fall? → dann nicht doppelt anlegen (Idempotenz für Re-Trigger).
  const { data: existingOffen } = await db
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', input.fallId)
    .eq('typ', 'konfrontation')
    .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag'])
    .limit(1)
    .maybeSingle()

  if (existingOffen?.id) {
    return {
      success: false,
      error: 'Es gibt bereits einen offenen Konfrontations-Termin für diesen Fall',
    }
  }

  const { data: inserted, error: insertError } = await db
    .from('gutachter_termine')
    .insert({
      fall_id: input.fallId,
      sv_id: fall.sv_id as string,
      start_zeit: startDate.toISOString(),
      end_zeit: endDate.toISOString(),
      typ: 'konfrontation',
      status: 'reserviert',
      bezahlt: false,
      honorar_betrag: 0,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return {
      success: false,
      error: insertError?.message ?? 'gutachter_termine-Insert fehlgeschlagen',
    }
  }

  // Event-System für Mitteilung (+ später WA-Template) + Audit.
  // Schlägt der Event-Trigger fehl, bleibt die Row erhalten — KB kann den
  // Fehler in den Mitteilungen sehen und manuell nachziehen.
  const eventResult = await processLexDriveEvent({
    fallId: input.fallId,
    fallNr: (Array.isArray(fall.claims) ? fall.claims[0] : fall.claims)?.claim_nummer ?? input.fallId.slice(0, 8),
    eventType: 'sv_konfrontation_anfrage_versendet',
    payload: {
      termin_id: inserted.id,
      termin_datum: startDate.toISOString(),
      beschreibung: `Konfrontations-Termin angefragt für ${startDate.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
    },
    externalEventId: null,
    source: 'manual',
    triggeredByProfileId: input.triggeredByProfileId ?? undefined,
  })

  if (!eventResult.success) {
    return {
      success: true,
      terminId: inserted.id as string,
      error: `Termin angelegt, aber Event-Trigger fehlgeschlagen: ${eventResult.error ?? 'unbekannt'}`,
    }
  }

  return { success: true, terminId: inserted.id as string }
}
