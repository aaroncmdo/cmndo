'use server'

// AAR-382: Server-Actions für den Fokus-Modus.
// Komponiert bestehende Libs (triggerSvLosgefahren, markArrival, tages-session
// state-machine) zu den vier Übergängen im Fokus-Modus-Lifecycle:
// Losfahren → Ankommen → Abschliessen → Pausieren.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { triggerSvLosgefahren } from '@/lib/termine/trigger-losgefahren'
import { markArrival } from '@/lib/gps/mark-arrival'
import {
  transitionTagesSession,
  advanceToNextTermin,
  pauseTagesSession,
} from '@/lib/sv/tages-session'
import { shouldSkipAdvance } from '@/lib/sv/should-skip-advance'

type Result = { success: boolean; error?: string }

// Sicherheit (rls-safety-net / App-Guard-Audit 2b-iii Write-Half): die feldmodus-Mutationen schreiben
// gutachter_termine via admin-client (RLS umgangen) per terminId. Server-Actions sind von JEDEM
// eingeloggten User aufrufbar — ohne diesen Guard koennte jeder fremde Termine als angekommen/
// abgeschlossen markieren + falsche Kunde-„SV angekommen"-Notifications ausloesen (Write-IDOR).
// Multi-SV-korrekt: ein User kann mehrere sachverstaendige-Rows haben (Buero + Sub-Standorte) ->
// assignee_id muss in der Menge der eigenen sv-ids liegen.
async function svIdsForUser(): Promise<string[] | null> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null
  const admin = createAdminClient()
  const { data: svRows } = await admin.from('sachverstaendige').select('id').eq('profile_id', user.id)
  return (svRows ?? []).map((r) => r.id as string)
}

async function assertSvOwnsTermin(terminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const svIds = await svIdsForUser()
  if (svIds === null) return { ok: false, error: 'Nicht angemeldet' }
  if (svIds.length === 0) return { ok: false, error: 'Kein SV-Profil' }
  const admin = createAdminClient()
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id')
    .eq('id', terminId)
    .eq('assignee_typ', 'sachverstaendiger')
    .in('assignee_id', svIds)
    .maybeSingle()
  if (!termin) return { ok: false, error: 'Termin nicht zugeordnet' }
  return { ok: true }
}

// pauseFokusmodus nimmt nur sessionId (kein terminId) -> eigener Session-Owner-Guard
// (sv_tages_session.sv_id muss in den eigenen sv-ids liegen).
async function assertSvOwnsSession(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const svIds = await svIdsForUser()
  if (svIds === null) return { ok: false, error: 'Nicht angemeldet' }
  if (svIds.length === 0) return { ok: false, error: 'Kein SV-Profil' }
  const admin = createAdminClient()
  const { data: sess } = await admin
    .from('sv_tages_session')
    .select('id')
    .eq('id', sessionId)
    .in('sv_id', svIds)
    .maybeSingle()
  if (!sess) return { ok: false, error: 'Session nicht zugeordnet' }
  return { ok: true }
}

/**
 * „Losfahren zum Stop" — setzt status='en_route', triggert WA an Kunden,
 * generiert Tracking-Token. Delegiert an triggerSvLosgefahren (KFZ-179).
 */
export async function startStop(
  sessionId: string,
  terminId: string,
): Promise<Result & { token?: string; etaMinutes?: number }> {
  const guard = await assertSvOwnsTermin(terminId)
  if (!guard.ok) return { success: false, error: guard.error }
  const res = await triggerSvLosgefahren(terminId)
  if (!res.success) return { success: false, error: res.error ?? 'Losfahren fehlgeschlagen' }

  await transitionTagesSession(sessionId, 'en_route', {
    aktueller_termin_id: terminId,
  })

  revalidatePath('/gutachter/feldmodus')
  return { success: true, token: res.token, etaMinutes: res.etaMinutes }
}

/**
 * SV erreicht den Besichtigungsort: setzt nur sv_angekommen_am.
 * Triggert NICHT besichtigung_gestartet_am — das passiert erst wenn beide
 * Parteien da sind (markBesichtigungGestartet) oder die Zeit erreicht ist.
 * Idempotent: wenn sv_angekommen_am bereits gesetzt, wird nichts überschrieben.
 */
export async function markSvVorOrt(
  terminId: string,
  lat: number,
  lng: number,
  via: 'geofence' | 'manuell',
): Promise<Result> {
  const guard = await assertSvOwnsTermin(terminId)
  if (!guard.ok) return { success: false, error: guard.error }
  const mappedVia: 'gps' | 'manual_swipe' = via === 'geofence' ? 'gps' : 'manual_swipe'
  const res = await markArrival({ termin_id: terminId, lat, lng, via: mappedVia })
  if (!res.success) return { success: false, error: res.error ?? 'Ankunft fehlgeschlagen' }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data: existing } = await admin
    .from('gutachter_termine')
    .select('sv_angekommen_am, fall_id')
    .eq('id', terminId)
    .maybeSingle()
  if (!existing?.sv_angekommen_am) {
    // Der Kunde bekommt die Ankunfts-Benachrichtigung; bleibt der Marker aus,
    // gilt der SV als nicht angekommen und ein Folgelauf meldet es erneut.
    const { error: ankunftFehler } = await admin
      .from('gutachter_termine')
      .update({
        sv_angekommen_am: nowIso,
        notification_angekommen_gesendet_am: nowIso,
      })
      .eq('id', terminId)
    if (ankunftFehler) {
      console.error(`[feldmodus] Ankunft nicht vermerkt (${terminId}):`, ankunftFehler.message)
    }
  }
  revalidatePath('/gutachter/feldmodus')
  if (existing?.fall_id) {
    revalidatePath(`/kunde/faelle/${existing.fall_id}`)
  }
  return { success: true }
}

/**
 * Besichtigung-läuft-Trigger: beide vor Ort ODER Zeit-Fallback.
 * Setzt besichtigung_gestartet_am auf gutachter_termine (SSoT) und
 * transitioniert die Session in den arrived-State (öffnet die Fallakte
 * beim SV via Realtime-Sub im FeldmodusClient).
 */
export async function markBesichtigungGestartet(
  sessionId: string,
  terminId: string,
  via: 'beide_angekommen' | 'termin_uhrzeit' | 'manuell',
): Promise<Result> {
  const guard = await assertSvOwnsTermin(terminId)
  if (!guard.ok) return { success: false, error: guard.error }
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: existing } = await admin
    .from('gutachter_termine')
    .select('besichtigung_gestartet_am, sv_angekommen_am, fall_id')
    .eq('id', terminId)
    .maybeSingle()

  if (existing?.besichtigung_gestartet_am) {
    return { success: true }
  }

  // Bei Zeit-Fallback ODER manueller Ankunft ohne vorheriges Geofence: sv_angekommen_am
  // ebenfalls setzen, damit KundeSvLiveBanner / ClaimStepper-Status konsistent sind.
  const update: Record<string, string> = { besichtigung_gestartet_am: nowIso }
  if ((via === 'termin_uhrzeit' || via === 'manuell') && !existing?.sv_angekommen_am) {
    update.sv_angekommen_am = nowIso
    update.notification_angekommen_gesendet_am = nowIso
  }

  const { error: feldUpdateFehler } = await admin
    .from('gutachter_termine')
    .update(update)
    .eq('id', terminId)
  if (feldUpdateFehler) {
    console.error(`[feldmodus] Termin-Update nicht gespeichert (${terminId}):`, feldUpdateFehler.message)
  }

  // CMM-44 SP-H PR2: der fruehere faelle.besichtigung_gestartet_am-Dual-Write
  // entfaellt. besichtigung_gestartet_am wird von gutachter_termine gelesen
  // (SSoT, oben gesetzt) — der faelle-Mirror wurde nie produktiv gelesen und
  // stirbt mit faelle in Phase 6.

  await transitionTagesSession(sessionId, 'arrived')
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/kunde/termin')
  if (existing?.fall_id) {
    revalidatePath(`/kunde/faelle/${existing.fall_id}`)
  }
  return { success: true }
}

/** @deprecated Übergangs-Wrapper bis alle Caller umgestellt sind. */
export async function markArrived(
  sessionId: string,
  terminId: string,
  lat: number,
  lng: number,
  via: 'geofence' | 'manuell' | 'termin_uhrzeit',
): Promise<Result> {
  if (via === 'termin_uhrzeit') {
    return markBesichtigungGestartet(sessionId, terminId, 'termin_uhrzeit')
  }
  // Sonst: nur SV vor Ort markieren — Besichtigung-läuft kommt separat.
  return markSvVorOrt(terminId, lat, lng, via as 'geofence' | 'manuell')
}

/**
 * Stop abschließen — setzt gutachter_termine.abschluss_zeit und rotiert zur
 * nächsten Position. Wenn es der letzte Stop war, landet die Session
 * automatisch in 'finished'.
 */
export async function completeAndAdvance(
  sessionId: string,
  terminId: string,
  expectedAktuellerTerminId?: string,
): Promise<Result & { nextTerminId?: string | null; skipped?: boolean }> {
  const guard = await assertSvOwnsTermin(terminId)
  if (!guard.ok) return { success: false, error: guard.error }
  const admin = createAdminClient()
  // Slice 1b: IF-NULL-Guard macht den durablen Abschluss-Write idempotent —
  // ein Offline-Doppel-Replay überschreibt abschluss_zeit nicht mit einem
  // späteren Zeitstempel.
  // Abschluss der Vor-Ort-Besichtigung. Der Feldmodus arbeitet OFFLINE-faehig, die
  // `.is('abschluss_zeit', null)`-Bedingung schuetzt gegen Doppel-Replay. Schlaegt der
  // Write still fehl, gilt die Besichtigung als nicht abgeschlossen — der SV steht
  // schon wieder im Auto, und die Folgeprozesse warten.
  const { error: abschlussFehler } = await admin
    .from('gutachter_termine')
    .update({
      abschluss_zeit: new Date().toISOString(),
      status: 'abgeschlossen',
    })
    .eq('id', terminId)
    .is('abschluss_zeit', null)
  if (abschlussFehler) {
    console.error(`[feldmodus] Besichtigungs-Abschluss nicht gespeichert (${terminId}):`, abschlussFehler.message)
  }

  // Slice 1b: Compare-and-Set. Beim Offline-Replay wird terminId als
  // expectedAktuellerTerminId uebergeben. Steht die Session nicht mehr auf
  // diesem Termin (bereits weitergeschaltet / finished), wird der Advance
  // uebersprungen — sonst wuerde ein Doppel-Replay einen Stop ueberspringen.
  // Online-Caller uebergeben den Param nicht -> shouldSkipAdvance=false ->
  // Advance laeuft unveraendert.
  if (expectedAktuellerTerminId !== undefined) {
    const { data: sess } = await admin
      .from('sv_tages_session')
      .select('aktueller_termin_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (shouldSkipAdvance(sess?.aktueller_termin_id ?? null, expectedAktuellerTerminId)) {
      return { success: true, nextTerminId: null, skipped: true }
    }
  }

  // Zwischen-State 'completing' damit Timeline/Reporting es erkennt.
  await transitionTagesSession(sessionId, 'completing')
  const nextId = await advanceToNextTermin(sessionId)
  // 2026-07-17 (500-Attribution der Regel-4-Abnahme, verfeinert nach Prod-Nachsmoke):
  // Im OFFLINE-REPLAY (expectedAktuellerTerminId gesetzt) GAR NICHT revalidieren.
  // Ein Replay ist ein Background-Sync — der Client hat offline bereits optimistisch
  // weitergeschaltet und refresht bei der naechsten Navigation. Ein revalidatePath
  // hier laesst Next die Route IN der Action-Response re-rendern; im Reconnect-Fenster
  // wirft dieser Re-Render transient -> POST /gutachter/feldmodus = 500, die Op landet
  // (dank Drain-Guard) auf 'failed' + braucht einen Retry-Zyklus. Der Prod-Nachsmoke
  // zeigte: der erste Fix (nur feldmodus im finished-Fall auslassen) reichte NICHT —
  // der 500 kam vom /heute-Revalidate-Re-Render. Replay = null Revalidate schliesst
  // die ganze Klasse. Der DB-Write ist da bereits committed (Termin abgeschlossen).
  //
  // ONLINE (kein expectedAktuellerTerminId): normal revalidieren. feldmodus nur mit
  // Folge-Stop (finished-Fall verlaesst die Route ohnehin), /heute immer.
  const istReplay = expectedAktuellerTerminId !== undefined
  if (!istReplay) {
    if (nextId) revalidatePath('/gutachter/feldmodus')
    revalidatePath('/gutachter/heute')
  }
  return { success: true, nextTerminId: nextId }
}

/**
 * Fokus-Modus pausieren (Session bleibt, Status='paused'). UI navigiert
 * danach zurück nach /gutachter/heute, der Fortsetzen-Button greift dort.
 */
export async function pauseFokusmodus(sessionId: string): Promise<Result> {
  const guard = await assertSvOwnsSession(sessionId)
  if (!guard.ok) return { success: false, error: guard.error }
  const res = await pauseTagesSession(sessionId)
  if (!res) return { success: false, error: 'Pausieren fehlgeschlagen' }
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/gutachter/heute')
  return { success: true }
}

/**
 * 2026-05-07 (Aaron-Smoke): Exit-zurück-zur-Anfahrt aus dem arrived-Modus.
 * Setzt session.status zurück auf idle UND macht den Auto-Arrive-Flag am
 * Termin rückgängig (sv_angekommen_am=null, besichtigung_gestartet_am=null)
 * damit der Fallback-Timer nicht direkt wieder triggert.
 *
 * Nutzungsfall: SV ist versehentlich im Vor-Ort-Modus gelandet (Termin-
 * Uhrzeit-Fallback) aber er ist noch nicht da. Click → zurück zur Map.
 */
export async function exitArrivedToRoute(
  sessionId: string,
  terminId: string,
): Promise<Result> {
  const guard = await assertSvOwnsTermin(terminId)
  if (!guard.ok) return { success: false, error: guard.error }
  const admin = createAdminClient()
  const { error: sessErr } = await admin
    .from('sv_tages_session')
    .update({ status: 'idle' })
    .eq('id', sessionId)
  if (sessErr) return { success: false, error: sessErr.message }
  const { error: tErr } = await admin
    .from('gutachter_termine')
    .update({ sv_angekommen_am: null, besichtigung_gestartet_am: null })
    .eq('id', terminId)
  if (tErr) return { success: false, error: tErr.message }
  revalidatePath('/gutachter/feldmodus')
  return { success: true }
}

