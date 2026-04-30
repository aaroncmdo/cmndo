'use server'

// AAR-864: Server-Actions für SV-Termin-Verlegung.
// Phase 3 liefert hier nur den Loader (Top-3 Vorschläge); die State-
// Machine-Actions (Vorschlagen / Bestätigen / Ablehnen) folgen in
// Phase 4 in derselben Datei.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findVerlegungsVorschlaege, type VerlegungsVorschlag } from '@/lib/termine/verlegung-vorschlaege'
import { emitEvent } from '@/lib/notifications/emit'

// Datum/Uhrzeit-Formatter für Notifikations-Payloads (de-DE)
function fmtDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
function fmtUhrzeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function lookupSvVorname(svId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', svId)
      .maybeSingle()
    if (!sv?.profile_id) return ''
    const { data: prof } = await admin
      .from('profiles')
      .select('vorname, anzeigename')
      .eq('id', sv.profile_id)
      .maybeSingle()
    return (prof?.vorname ?? prof?.anzeigename ?? '') as string
  } catch {
    return ''
  }
}

async function lookupKundenVorname(kundeUserId: string | null): Promise<string> {
  if (!kundeUserId) return ''
  try {
    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('vorname, anzeigename')
      .eq('id', kundeUserId)
      .maybeSingle()
    return (prof?.vorname ?? prof?.anzeigename ?? '') as string
  } catch {
    return ''
  }
}

async function lookupUserRolle(userId: string): Promise<'kunde' | 'kundenbetreuer' | 'admin' | 'unknown'> {
  try {
    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('rolle')
      .eq('id', userId)
      .maybeSingle()
    const r = (prof?.rolle as string | undefined) ?? ''
    if (r === 'admin' || r === 'staff') return 'admin'
    if (r === 'kundenbetreuer') return 'kundenbetreuer'
    if (r === 'kunde') return 'kunde'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

type LoaderResult =
  | { ok: true; vorschlaege: VerlegungsVorschlag[]; slotDauerMin: number }
  | { ok: false; error: string }

/**
 * Lädt Top-3 Vorschläge für die Verlegung eines bestätigten Termins.
 * Nutzt Admin-Client für alle Loads — SV-RLS auf `faelle` (Schaden-
 * Adresse, Besichtigungsort) und `sachverstaendige` ist nicht garantiert
 * vollständig, und die Engine braucht zudem fall-übergreifende Termin-
 * Adressen für die Routen-Berechnung. Auth-Guard prüft dass der eingelogte
 * User der SV des Termins ist (oder Admin/Staff).
 */
export async function getVerlegungsVorschlaegeAction(input: {
  terminId: string
  fallId: string
}): Promise<LoaderResult> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  if (!input.terminId) {
    return { ok: false, error: 'Kein Termin in der Auftragsansicht — Verlegung nicht möglich.' }
  }

  // Termin laden über Admin-Client
  const { data: termin, error: terminErr } = await admin
    .from('gutachter_termine')
    .select('id, sv_id, start_zeit, end_zeit, status, fall_id')
    .eq('id', input.terminId)
    .maybeSingle()
  if (terminErr || !termin) {
    return { ok: false, error: `Termin ${input.terminId} nicht gefunden.` }
  }

  // Auth-Guard: User muss der SV des Termins sein, oder Admin/Staff
  if (termin.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', termin.sv_id as string)
      .maybeSingle()
    const istEigenerTermin = sv?.profile_id === user.id
    if (!istEigenerTermin) {
      const rolle = await lookupUserRolle(user.id)
      if (rolle !== 'admin') {
        return { ok: false, error: 'Keine Berechtigung für diesen Termin.' }
      }
    }
  }

  // AAR-864: fall_id aus dem Termin nehmen — der Caller-Prop fallId kann
  // bei AuftragHeaderPanel über mehrere Layer übergeben werden, der DB-
  // Eintrag ist die Quelle der Wahrheit.
  const fallId = (termin.fall_id as string | null) ?? input.fallId
  if (!fallId) {
    return { ok: false, error: 'Termin ist nicht mit einem Fall verknüpft.' }
  }

  // Fall + Adresse laden — Admin damit garantiert alle Spalten sichtbar
  const { data: fall } = await admin
    .from('faelle')
    .select('id, besichtigungsort_adresse, besichtigungsort_plz, schadens_adresse, schadens_plz, schadens_ort')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: `Fall ${fallId} nicht gefunden.` }

  // Bevorzugt besichtigungsort_*, Fallback schadens_*
  const adresse =
    [fall.besichtigungsort_adresse, fall.besichtigungsort_plz].filter(Boolean).join(', ') ||
    [fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ')
  if (!adresse) return { ok: false, error: 'Keine Adresse am Fall hinterlegt.' }

  // Slot-Dauer aus altem Termin (default 45 wenn unplausibel)
  const dauerMin = Math.round(
    (new Date(termin.end_zeit as string).getTime() -
      new Date(termin.start_zeit as string).getTime()) /
      60_000,
  )
  const slotDauerMin = dauerMin >= 30 && dauerMin <= 240 ? dauerMin : 45

  // SV-Standort als Fallback wenn an einem Tag kein Vor-Termin existiert
  let svStandortAdresse: string | null = null
  if (termin.sv_id) {
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('standort_adresse, standort_plz')
      .eq('id', termin.sv_id as string)
      .maybeSingle()
    const teile = [sv?.standort_adresse, sv?.standort_plz].filter(Boolean)
    if (teile.length) svStandortAdresse = teile.join(', ')
  }

  // Engine bekommt Admin-Client damit der Tagesplan-Loader fall-übergreifend
  // alle Adressen für die Routen-Berechnung sieht
  const vorschlaege = await findVerlegungsVorschlaege(admin, termin.sv_id as string, {
    besichtigungsortAdresse: adresse,
    slotDauerMin,
    exkludiereTerminId: termin.id as string,
    svStandortAdresse,
  })

  return { ok: true, vorschlaege, slotDauerMin }
}

type SubmitResult = { ok: true; neuerTerminId: string } | { ok: false; error: string }

/**
 * SV schlägt eine Verlegung vor. State-Machine:
 *  - Alter Termin: status='bestaetigt' → 'verlegt' (Slot bleibt blockiert)
 *  - Neuer Slot: INSERT mit status='verlegung_pending',
 *    verlegung_quelle_id=<alt.id>, eigene start_zeit/end_zeit
 *
 * Idempotenz: doppeltes Submit (z.B. Doppelklick) erzeugt keinen weiteren
 * Pending-Slot — wenn der alte Termin bereits 'verlegt' ist, wird abgebrochen.
 *
 * Notifikationen (WhatsApp/In-App/E-Mail) folgen in Phase 5; hier nur
 * DB-State + revalidatePath.
 */
export async function terminVerlegungVorschlagen(input: {
  terminId: string
  neuesStartIso: string
  neuesEndeIso: string
  grund?: string
}): Promise<SubmitResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  // Alter Termin laden — muss bestaetigt sein und dem SV gehören
  const { data: alt, error: altErr } = await supabase
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, kb_id, kanal, typ, status, start_zeit')
    .eq('id', input.terminId)
    .maybeSingle()
  if (altErr || !alt) return { ok: false, error: 'Termin nicht gefunden.' }
  if (alt.status !== 'bestaetigt') {
    return {
      ok: false,
      error: `Termin ist nicht im Status 'bestaetigt' (aktuell: ${alt.status}).`,
    }
  }

  // 1) Alten Termin auf 'verlegt' setzen
  const { error: updErr } = await supabase
    .from('gutachter_termine')
    .update({
      status: 'verlegt',
      verlegung_grund: input.grund?.trim() || null,
    })
    .eq('id', alt.id)
    .eq('status', 'bestaetigt') // Idempotenz: nur wenn noch bestaetigt
  if (updErr) {
    return { ok: false, error: `Verlegung fehlgeschlagen: ${updErr.message}` }
  }

  // 2) Neuen Slot anlegen
  const { data: neu, error: insErr } = await supabase
    .from('gutachter_termine')
    .insert({
      sv_id: alt.sv_id,
      fall_id: alt.fall_id,
      kb_id: alt.kb_id,
      kanal: alt.kanal,
      typ: alt.typ ?? 'sv_begutachtung',
      start_zeit: input.neuesStartIso,
      end_zeit: input.neuesEndeIso,
      status: 'verlegung_pending',
      verlegung_quelle_id: alt.id,
      verlegung_grund: input.grund?.trim() || null,
      verlegung_kunde_benachrichtigt_an: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insErr || !neu) {
    // Rollback: alter Termin zurück auf bestaetigt
    await supabase
      .from('gutachter_termine')
      .update({ status: 'bestaetigt', verlegung_grund: null })
      .eq('id', alt.id)
    return { ok: false, error: `Pending-Slot anlegen fehlgeschlagen: ${insErr?.message ?? 'unbekannt'}` }
  }

  if (alt.fall_id) {
    revalidatePath(`/gutachter/fall/${alt.fall_id}`)
    revalidatePath(`/faelle/${alt.fall_id}`)
    revalidatePath(`/kunde/faelle/${alt.fall_id}`)
  }
  revalidatePath('/gutachter/auftraege')
  revalidatePath('/gutachter/heute')

  // Notifikation fire-and-forget — Worker nimmt's auf, Caller wird nicht blockiert
  if (alt.fall_id && alt.sv_id) {
    const svVorname = await lookupSvVorname(alt.sv_id as string)
    emitEvent(
      'termin.verlegung_vorgeschlagen',
      {
        fallId: alt.fall_id as string,
        terminId: neu.id as string,
        alterTerminId: alt.id as string,
        alterDatum: fmtDatum(alt.start_zeit as string),
        alterUhrzeit: fmtUhrzeit(alt.start_zeit as string),
        neuesDatum: fmtDatum(input.neuesStartIso),
        neuesUhrzeit: fmtUhrzeit(input.neuesStartIso),
        svVorname,
        grund: input.grund?.trim() || undefined,
      },
      { fallId: alt.fall_id as string, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_vorgeschlagen failed', e))
  }

  return { ok: true, neuerTerminId: neu.id as string }
}

type DecisionResult = { ok: true } | { ok: false; error: string }

function revalidateFallPaths(fallId: string | null) {
  if (fallId) {
    revalidatePath(`/gutachter/fall/${fallId}`)
    revalidatePath(`/faelle/${fallId}`)
    revalidatePath(`/kunde/faelle/${fallId}`)
    revalidatePath(`/mitarbeiter/faelle/${fallId}`)
  }
  revalidatePath('/gutachter/auftraege')
  revalidatePath('/gutachter/heute')
  revalidatePath('/kunde')
  revalidatePath('/mitarbeiter/faelle')
  revalidatePath('/admin/faelle')
}

/**
 * Prüft ob der eingeloggte User die Verlegung für diesen Fall entscheiden
 * darf: Kunde des Falls, KB des Falls, oder Admin/Staff.
 * Liefert null wenn ok, sonst Fehler-String.
 */
async function assertDarfVerlegungEntscheiden(
  userId: string,
  fallId: string,
): Promise<string | null> {
  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('rolle')
    .eq('id', userId)
    .maybeSingle()
  const rolle = (prof?.rolle as string | undefined) ?? ''
  if (rolle === 'admin' || rolle === 'staff' || rolle === 'dispatch') return null

  const { data: fall } = await admin
    .from('faelle')
    .select('kunde_id, kundenbetreuer_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return 'Fall nicht gefunden.'
  if (fall.kunde_id === userId) return null
  if (fall.kundenbetreuer_id === userId) return null
  return 'Keine Berechtigung für diese Verlegung.'
}

/**
 * Bestätigt die Verlegung. Aufrufbar durch Kunde, KB oder Admin.
 * Nutzt Admin-Client für UPDATE — der Kunde hat nur SELECT-RLS auf
 * gutachter_termine. Auth-Guard wird vorher manuell geprüft
 * (assertDarfVerlegungEntscheiden).
 *
 * State-Transition:
 *   alter Termin: 'verlegt' → 'verschoben' (terminal) + cancelled_at
 *   neuer Slot:   'verlegung_pending' → 'bestaetigt'
 *
 * Idempotent: wenn der Pending-Slot schon nicht mehr 'verlegung_pending'
 * ist (z.B. weil schon abgelehnt oder doppelt bestätigt), Abbruch.
 */
export async function terminVerlegungBestaetigen(input: {
  neuerTerminId: string
}): Promise<DecisionResult> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: neu, error: neuErr } = await admin
    .from('gutachter_termine')
    .select('id, status, verlegung_quelle_id, fall_id, start_zeit')
    .eq('id', input.neuerTerminId)
    .maybeSingle()
  if (neuErr || !neu) return { ok: false, error: 'Verlegungs-Slot nicht gefunden.' }
  if (neu.status !== 'verlegung_pending') {
    return {
      ok: false,
      error: `Slot ist nicht im Status 'verlegung_pending' (aktuell: ${neu.status}).`,
    }
  }
  if (!neu.verlegung_quelle_id) {
    return { ok: false, error: 'Kein verlegung_quelle_id auf dem Pending-Slot.' }
  }
  if (!neu.fall_id) {
    return { ok: false, error: 'Pending-Slot hat keine fall_id.' }
  }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, neu.fall_id as string)
  if (guardErr) return { ok: false, error: guardErr }

  // 1) Neuer Slot → bestaetigt (Admin-Client, weil Kunde nur SELECT hat)
  const { error: bestErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.id)
    .eq('status', 'verlegung_pending')
  if (bestErr) return { ok: false, error: `Bestätigen fehlgeschlagen: ${bestErr.message}` }

  // 2) Alter Termin → verschoben (terminal)
  const { error: altErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'verschoben',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (altErr) {
    // Rollback: neuer Slot zurück auf pending
    await admin
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending' })
      .eq('id', neu.id)
    return { ok: false, error: `Alten Termin schließen fehlgeschlagen: ${altErr.message}` }
  }

  revalidateFallPaths(neu.fall_id as string | null)

  // Notifikation an SV
  if (neu.fall_id) {
    const { data: fall } = await admin
      .from('faelle')
      .select('kunde_id')
      .eq('id', neu.fall_id as string)
      .maybeSingle()
    const kundenVorname = await lookupKundenVorname((fall?.kunde_id as string | null) ?? null)
    const von_wem = await lookupUserRolle(user.id)
    const von_wem_safe: 'kunde' | 'kundenbetreuer' | 'admin' =
      von_wem === 'unknown' ? 'kunde' : von_wem

    emitEvent(
      'termin.verlegung_bestaetigt',
      {
        fallId: neu.fall_id as string,
        terminId: neu.id as string,
        alterTerminId: neu.verlegung_quelle_id as string,
        neuesDatum: fmtDatum(neu.start_zeit as string),
        neuesUhrzeit: fmtUhrzeit(neu.start_zeit as string),
        kundenVorname,
        von_wem: von_wem_safe,
      },
      { fallId: neu.fall_id as string, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_bestaetigt failed', e))
  }

  return { ok: true }
}

/**
 * Lehnt die Verlegung ab. Aufrufbar durch Kunde, KB oder Admin.
 * State-Transition:
 *   alter Termin: 'verlegt' → 'bestaetigt' (Rollback)
 *   neuer Slot:   'verlegung_pending' → 'storniert'
 *
 * Optional: Grund wird in verlegung_grund des storno-Slots persistiert
 * (überschreibt den SV-Grund — die Ablehnung ist die finale Wahrheit).
 */
export async function terminVerlegungAblehnen(input: {
  neuerTerminId: string
  grund?: string
}): Promise<DecisionResult> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: neu, error: neuErr } = await admin
    .from('gutachter_termine')
    .select('id, status, verlegung_quelle_id, fall_id')
    .eq('id', input.neuerTerminId)
    .maybeSingle()
  if (neuErr || !neu) return { ok: false, error: 'Verlegungs-Slot nicht gefunden.' }
  if (neu.status !== 'verlegung_pending') {
    return {
      ok: false,
      error: `Slot ist nicht im Status 'verlegung_pending' (aktuell: ${neu.status}).`,
    }
  }
  if (!neu.verlegung_quelle_id) {
    return { ok: false, error: 'Kein verlegung_quelle_id auf dem Pending-Slot.' }
  }
  if (!neu.fall_id) {
    return { ok: false, error: 'Pending-Slot hat keine fall_id.' }
  }

  const guardErr = await assertDarfVerlegungEntscheiden(user.id, neu.fall_id as string)
  if (guardErr) return { ok: false, error: guardErr }

  // 1) Neuer Slot → storniert (Admin-Client)
  const { error: stoErr } = await admin
    .from('gutachter_termine')
    .update({
      status: 'storniert',
      cancelled_at: new Date().toISOString(),
      verlegung_grund: input.grund?.trim() || null,
    })
    .eq('id', neu.id)
    .eq('status', 'verlegung_pending')
  if (stoErr) return { ok: false, error: `Stornieren fehlgeschlagen: ${stoErr.message}` }

  // 2) Alter Termin → bestaetigt (Rollback)
  const { error: rbErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (rbErr) {
    // Rollback des Rollbacks: neuer Slot zurück auf pending
    await admin
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending', cancelled_at: null })
      .eq('id', neu.id)
    return { ok: false, error: `Alter Termin Rollback fehlgeschlagen: ${rbErr.message}` }
  }

  revalidateFallPaths(neu.fall_id as string | null)

  // Notifikation an SV (mit Grund)
  if (neu.fall_id) {
    const { data: fall } = await admin
      .from('faelle')
      .select('kunde_id')
      .eq('id', neu.fall_id as string)
      .maybeSingle()
    const kundenVorname = await lookupKundenVorname((fall?.kunde_id as string | null) ?? null)
    const von_wem = await lookupUserRolle(user.id)
    const von_wem_safe: 'kunde' | 'kundenbetreuer' | 'admin' =
      von_wem === 'unknown' ? 'kunde' : von_wem

    emitEvent(
      'termin.verlegung_abgelehnt',
      {
        fallId: neu.fall_id as string,
        terminId: neu.id as string,
        alterTerminId: neu.verlegung_quelle_id as string,
        kundenVorname,
        grund: input.grund?.trim() || undefined,
        von_wem: von_wem_safe,
      },
      { fallId: neu.fall_id as string, triggeredBy: user.id },
    ).catch((e) => console.error('[AAR-864] emit verlegung_abgelehnt failed', e))
  }

  return { ok: true }
}
