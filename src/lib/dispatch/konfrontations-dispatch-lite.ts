// AAR-561 (C12): Konfrontations-Dispatch-Lite.
// Reduzierter Dispatch-Flow für SV-Konfrontations-Begleitung bei der
// Nachbesichtigung. KEIN SV-Match (fix der SV der bereits auf fall.sv_id
// liegt), KEIN Lead-Preis, KEIN Stripe-Checkout, KEIN SA-Versand.
// Erstellt nur eine neue gutachter_termine-Row mit typ='konfrontation',
// bezahlt=false, honorar_betrag=0 und triggert danach das
// sv_konfrontation_anfrage_versendet-Event (Mitteilung + Audit via C3).

import { createAdminClient } from '@/lib/supabase/admin'
import { processLexDriveEvent } from '@/lib/lexdrive/process-event'
import { pruefeBelegungStrict } from '@/lib/termine/engine'
import { checkSvReachability } from '@/lib/dispatch/reachability'

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
  // CMM-44 SP-D PR2a: nachbesichtigung_sv_konfrontation_gewuenscht + _termin_vereinbart_am
  // aus gutachter_termine (SSoT) geladen.
  // CMM-49 Display-Sweep: faelle-frei via Bridge (fall_id->claim_id) + claims.sv_id (sv_id-Sync).
  // claim_nummer im alten Select war ungenutzt; id == input.fallId. Admin-Client -> RLS-neutral.
  const { data: bridgeRow } = await db
    .from('faelle_claim_bridge')
    .select('claim_id, claims:claims!fk_bridge_claim(sv_id, claim_nummer)')
    .eq('fall_id', input.fallId)
    .maybeSingle()
  const bridgeClaim = Array.isArray(bridgeRow?.claims) ? bridgeRow?.claims[0] : bridgeRow?.claims
  const fall = bridgeRow
    ? { sv_id: (bridgeClaim?.sv_id ?? null) as string | null, claim_id: bridgeRow.claim_id as string | null, claims: bridgeRow.claims }
    : null

  if (!fall) return { success: false, error: 'Fall nicht gefunden' }
  if (!fall.sv_id) {
    return {
      success: false,
      error: 'Kein SV dem Fall zugewiesen — Konfrontations-Dispatch-Lite nicht möglich',
    }
  }

  let aktTerminKonfr: {
    nachbesichtigung_sv_konfrontation_gewuenscht: boolean | null
    nachbesichtigung_sv_termin_vereinbart_am: string | null
    besichtigungsort_lat: number | null
    besichtigungsort_lng: number | null
  } | null = null
  if (fall.claim_id) {
    const { data: at } = await db
      .from('gutachter_termine')
      .select('nachbesichtigung_sv_konfrontation_gewuenscht, nachbesichtigung_sv_termin_vereinbart_am, besichtigungsort_lat, besichtigungsort_lng')
      .eq('claim_id', fall.claim_id as string)
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle()
    aktTerminKonfr = at
  }

  if (!aktTerminKonfr?.nachbesichtigung_sv_konfrontation_gewuenscht) {
    return {
      success: false,
      error: 'Kunde hat keine SV-Konfrontation gewünscht (flag nicht gesetzt)',
    }
  }
  if (aktTerminKonfr?.nachbesichtigung_sv_termin_vereinbart_am) {
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

  // Fail-closed Verfuegbarkeits-Check: der Konfrontations-Slot ist kunde-vorgeschlagen + KB-gewaehlt,
  // also NICHT gegen die SV-Verfuegbarkeit vorgeprueft. pruefeBelegungStrict liest v_belegung
  // (Buchung ∪ externer CalDAV-Kalender ∪ Urlaub/Sperre) → verhindert Doppelbuchung ueber den
  // Privatkalender/Urlaub des SV; die DB-Exclusion-Constraint deckt nur Buchung<->Buchung.
  const belegung = await pruefeBelegungStrict(
    { typ: 'sachverstaendiger', id: fall.sv_id as string },
    startDate.toISOString(),
    endDate.toISOString(),
    db,
  )
  if (!belegung.ok) {
    return { success: false, error: 'Verfügbarkeit konnte nicht geprüft werden — bitte erneut versuchen' }
  }
  if (!belegung.frei) {
    return {
      success: false,
      error: 'Der SV ist zu dieser Zeit bereits verplant (Termin, Kalender-Eintrag oder Urlaub)',
    }
  }

  // ETA-Hard-Check (analog reserveSvTerminForLead): schafft der fixe SV die Anfahrt zur Konfrontation
  // zwischen seinen Nachbar-Terminen? Ziel-Ort = besichtigungsort des Claim-Termins (Proxy fuer den
  // Nachbesichtigungs-Ort — die Konfrontation traegt keinen eigenen Ort). Null-Guard: ohne Koordinaten
  // kein ETA-Check (graceful degradation, wie beim Lead-Pfad). checkSvReachability ermittelt die
  // Nachbar-Termine + deren Orte selbst.
  const konfrLat = aktTerminKonfr?.besichtigungsort_lat ?? null
  const konfrLng = aktTerminKonfr?.besichtigungsort_lng ?? null
  if (konfrLat != null && konfrLng != null) {
    const reach = await checkSvReachability(db, {
      svId: fall.sv_id as string,
      candidateLat: konfrLat,
      candidateLng: konfrLng,
      candidateStartIso: startDate.toISOString(),
      candidateEndIso: endDate.toISOString(),
    })
    if (!reach.reachable) {
      return {
        success: false,
        error: reach.grund ?? 'Der SV kann den Konfrontations-Termin nicht rechtzeitig erreichen',
      }
    }
  }

  const { data: inserted, error: insertError } = await db
    .from('gutachter_termine')
    .insert({
      fall_id: input.fallId,
      claim_id: fall.claim_id,
      assignee_id: fall.sv_id as string,
      assignee_typ: 'sachverstaendiger',
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
    // 23P01 = Exclusion-Constraint: SV wurde in der TOCTOU-Luecke anderweitig verplant.
    if (insertError?.code === '23P01') {
      return {
        success: false,
        error: 'Der SV wurde zwischenzeitlich anderweitig verplant — bitte anderen Slot wählen',
      }
    }
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
