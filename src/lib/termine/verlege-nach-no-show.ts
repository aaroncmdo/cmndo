// AAR-939 6b — Self-Service-Verlegung nach embed-B-SV-No-Show.
//
// Gerufen aus bestaetigeSvNoShowVomTeam (nach dem sv_no_show_am-Marker): weist
// automatisch einen Ersatz-SV zu (Auto-Top-1), haengt claims.sv_id um (Reverse-
// Sync -> faelle.sv_id) und schickt dem Kunden einen Re-Termin-Magic-Link, ueber
// den er selbst einen Slot beim Ersatz-SV waehlt (bestehender waehleReTerminSlot).
//
// KEIN 'use server' (interne Lib, vom Dispatcher-Action gerufen). Non-fatal: bei
// fehlendem Ersatz-SV bleibt der Klaerungs-Task offen (Caller resolved ihn nur im
// Erfolgsfall) -> Dispatcher vermittelt manuell. sv_no_show_am steht bereits (Caller),
// daher kein Doppel-Charge-Risiko (€70-Default unveraendert).
import { createAdminClient } from '@/lib/supabase/admin'
import { findBestSV } from '@/lib/dispatch/findBestSV'
import { resolveTerminLeadId } from '@/lib/termine/resolve-lead-id'
import { randomUUID } from 'crypto'

type AdminClient = ReturnType<typeof createAdminClient>

export type VerlegungErgebnis = {
  ok: boolean
  ersatzSvId?: string | null
  manuell?: boolean
  error?: string
}

// Ersatz-SV via Auto-Top-1 (Original ausgeschlossen). Liefert null wenn kein
// Kandidat -> Caller geht in den manuellen Fallback.
async function findReplacementSv(
  db: AdminClient,
  params: { lat: number; lng: number; excludeSvId: string },
): Promise<string | null> {
  const kandidaten = await findBestSV(
    { fallLat: params.lat, fallLng: params.lng, excludeSvId: params.excludeSvId },
    1,
  )
  return kandidaten[0]?.svId ?? null
}

export async function verlegeNachNoShowEmbedB(terminId: string): Promise<VerlegungErgebnis> {
  const db = createAdminClient()

  // Alten Termin laden (sv_id + Standort + status fuer Idempotenz).
  const { data: alt } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, lead_id, assignee_id, assignee_typ, status, besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', terminId)
    .maybeSingle()
  if (!alt) return { ok: false, error: 'Termin nicht gefunden' }

  // Idempotenz (Realtime-Replay): status='verlegt' wird als LETZTER Schritt gesetzt
  // (Completion-Marker) -> bereits verlegt = No-Op (kein doppeltes Umhaengen/Token).
  if ((alt.status as string | null) === 'verlegt') return { ok: true }

  // CMM-49: assignee_id (typ-guarded) statt sv_id — No-Show-Termin ist immer SV, value-identisch.
  const altSvId = (alt.assignee_typ === 'sachverstaendiger' ? (alt.assignee_id as string | null) : null) ?? null
  const claimId = (alt.claim_id as string | null) ?? null
  const fallId = (alt.fall_id as string | null) ?? null

  // Standort-Kaskade: Termin-SSoT (gutachter_termine.besichtigungsort_*) -> claims.schadenort_* (SSoT).
  // CMM-49: faelle.besichtigungsort_*-Tier entfernt (tot auf Realdaten; Termin-Coords resolven davor).
  // HINWEIS: embed-B-Claims tragen heute KEINEN geocodierten Standort (0/45, 31.05.) -> der Auto-Ersatz-SV
  // feuert erst wenn der Upstream-Intake einen Ort persistiert; bis dahin manueller Fallback (graceful).
  let lat = alt.besichtigungsort_lat as number | null
  let lng = alt.besichtigungsort_lng as number | null
  if ((lat == null || lng == null) && claimId) {
    const { data: claimOrt } = await db
      .from('claims')
      .select('schadenort_lat, schadenort_lng')
      .eq('id', claimId)
      .maybeSingle()
    lat = lat ?? ((claimOrt?.schadenort_lat as number | null) ?? null)
    lng = lng ?? ((claimOrt?.schadenort_lng as number | null) ?? null)
  }

  // Ersatz-SV (Auto-Top-1). Kein Standort/SV -> manueller Fallback: KEIN verlegt-Mark
  // (retry-faehig), Caller laesst den Klaerungs-Task offen, Card-Toast weist Dispatcher.
  let ersatzSvId: string | null = null
  if (lat != null && lng != null && altSvId) {
    ersatzSvId = await findReplacementSv(db, { lat, lng, excludeSvId: altSvId })
  }
  if (!ersatzSvId) {
    return { ok: true, ersatzSvId: null, manuell: true }
  }

  // claims.sv_id := Ersatz (SSoT; Reverse-Sync-Trigger -> faelle.sv_id, den
  // waehleReTerminSlot fuer Slot-Anzeige + Konflikt-Check liest).
  if (claimId) {
    const { error: svErr } = await db.from('claims').update({ sv_id: ersatzSvId }).eq('id', claimId)
    if (svErr) return { ok: false, error: 'SV-Umhaengung fehlgeschlagen: ' + svErr.message }
  }

  // Re-Termin-Token NUR auf gutachter_termine (SSoT, CMM-44 SP-D): waehleReTerminSlot
  // sucht den Termin via gutachter_termine.re_termin_token (CMM-49 Option A) und
  // v_claim_full sourct re_termin_token aus dem aktuellen gutachter_termine-Row.
  // eingelaufen_am=null entwertet die Consumed-Sperre auf dem (noch aktuellen) alten
  // Termin, damit der Kunde picken darf.
  // CMM-49 faelle-Drop-Runway: faelle.re_termin_token-Shadow-Write entfernt — reader-frei
  // (kein Consumer liest faelle.re_termin_token; live faelle_only_tok=0).
  const token = randomUUID()
  const { error: tokenFehler } = await db
    .from('gutachter_termine')
    .update({ re_termin_token: token, re_termin_token_eingelaufen_am: null })
    .eq('id', terminId)
  if (tokenFehler) {
    // ABBRUCH VOR dem Versand: der Magic-Link unten traegt genau diesen Token. Steht er nicht
    // in der DB, bekommt der Kunde einen Link, der ins Leere fuehrt (waehleReTerminSlot sucht
    // den Termin ueber re_termin_token). Kein 'verlegt'-Mark gesetzt -> sauberer Retry moeglich.
    return { ok: false, error: 'Re-Termin-Token nicht gespeichert: ' + tokenFehler.message }
  }

  // Magic-Link an Kunde (non-critical: ein Baileys/Send-Fail darf die Umhaengung
  // nicht zuruecknehmen). Pattern wie meldeNoShow (storno-actions, CMM-39).
  try {
    // CMM-49: lead_id faelle-frei (termin.lead_id -> claims.lead_id via claim_id), value-preserving.
    const leadId = await resolveTerminLeadId(db, alt)
    if (leadId) {
      const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', leadId).maybeSingle()
      const telefon = (lead?.telefon as string | null) ?? null
      if (telefon) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
        const reTerminUrl = `${baseUrl}/kunde/re-termin/${token}`
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('no_show_kunde', {
          telefon,
          vorname: (lead?.vorname as string | null) ?? '',
          '1': (lead?.vorname as string | null) ?? '',
          '2': reTerminUrl,
          fall_id: fallId ?? '',
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('[6b] Magic-Link (non-critical):', err)
  }

  // Timeline (non-critical, KB-Sicht).
  if (fallId) {
    try {
      await db.from('timeline').insert({
        fall_id: fallId,
        typ: 'termin',
        titel: 'Verlegung: Ersatz-Gutachter zugewiesen',
        beschreibung:
          'Nach SV-No-Show wurde automatisch ein Ersatz-Gutachter zugewiesen; der Kunde wählt einen neuen Termin.',
        erstellt_von: null,
      })
    } catch {
      /* non-critical */
    }
  }

  // Completion-Marker + Idempotenz-Key: alten Termin verlegt (LETZTER Schritt, damit
  // ein Fehler davor (kein verlegt) einen sauberen Retry erlaubt).
  const { error: markerFehler } = await db
    .from('gutachter_termine')
    .update({ status: 'verlegt' })
    .eq('id', terminId)
    .not('status', 'eq', 'verlegt')
  if (markerFehler) {
    // Ohne den Marker greift die Idempotenz-Sperre oben nicht mehr: ein Replay laeuft komplett
    // durch, sucht erneut einen Ersatz-SV, erzeugt einen NEUEN Token (entwertet den gerade
    // verschickten Link) und schickt dem Kunden eine zweite Nachricht.
    console.error(`[6b] Completion-Marker 'verlegt' nicht gesetzt (${terminId}) — Replay wuerde doppelt laufen:`, markerFehler.message)
  }

  return { ok: true, ersatzSvId }
}
