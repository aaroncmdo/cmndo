'use server'

// AAR-864: Server-Actions für SV-Termin-Verlegung.
// Phase 3 liefert hier nur den Loader (Top-3 Vorschläge); die State-
// Machine-Actions (Vorschlagen / Bestätigen / Ablehnen) folgen in
// Phase 4 in derselben Datei.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { findVerlegungsVorschlaege, type VerlegungsVorschlag } from '@/lib/termine/verlegung-vorschlaege'

type LoaderResult =
  | { ok: true; vorschlaege: VerlegungsVorschlag[]; slotDauerMin: number }
  | { ok: false; error: string }

/**
 * Lädt Top-3 Vorschläge für die Verlegung eines bestätigten Termins.
 * Authoritative SV-Auflösung über die Session; nutzt RLS-Client (SV
 * sieht nur seine eigenen Termine über die existierenden Policies).
 */
export async function getVerlegungsVorschlaegeAction(input: {
  terminId: string
  fallId: string
}): Promise<LoaderResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  // Termin laden — wir brauchen Adresse + Dauer + sv_id zum Filtern
  const { data: termin, error: terminErr } = await supabase
    .from('gutachter_termine')
    .select('id, sv_id, start_zeit, end_zeit, status, fall_id')
    .eq('id', input.terminId)
    .maybeSingle()
  if (terminErr || !termin) return { ok: false, error: 'Termin nicht gefunden.' }

  // Fall + Adresse laden
  const { data: fall } = await supabase
    .from('faelle')
    .select('id, besichtigungsort_adresse, besichtigungsort_plz')
    .eq('id', input.fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'Fall nicht gefunden.' }

  const adresse = [fall.besichtigungsort_adresse, fall.besichtigungsort_plz]
    .filter(Boolean)
    .join(', ')
  if (!adresse) return { ok: false, error: 'Besichtigungsort-Adresse fehlt am Fall.' }

  // Slot-Dauer aus altem Termin (default 45 wenn unplausibel)
  const dauerMin = Math.round(
    (new Date(termin.end_zeit as string).getTime() -
      new Date(termin.start_zeit as string).getTime()) /
      60_000,
  )
  const slotDauerMin = dauerMin >= 30 && dauerMin <= 240 ? dauerMin : 45

  const vorschlaege = await findVerlegungsVorschlaege(supabase, termin.sv_id as string, {
    besichtigungsortAdresse: adresse,
    slotDauerMin,
    exkludiereTerminId: termin.id as string,
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
    .select('id, sv_id, fall_id, kb_id, kanal, typ, status')
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
 * Bestätigt die Verlegung. Aufrufbar durch Kunde, KB oder Admin.
 * Auth läuft über die existierenden RLS-Policies — wenn der UPDATE
 * fehlschlägt, kommt Supabase-Error zurück.
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: neu, error: neuErr } = await supabase
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

  // 1) Neuer Slot → bestaetigt
  const { error: bestErr } = await supabase
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.id)
    .eq('status', 'verlegung_pending')
  if (bestErr) return { ok: false, error: `Bestätigen fehlgeschlagen: ${bestErr.message}` }

  // 2) Alter Termin → verschoben (terminal)
  const { error: altErr } = await supabase
    .from('gutachter_termine')
    .update({
      status: 'verschoben',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (altErr) {
    // Rollback: neuer Slot zurück auf pending
    await supabase
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending' })
      .eq('id', neu.id)
    return { ok: false, error: `Alten Termin schließen fehlgeschlagen: ${altErr.message}` }
  }

  revalidateFallPaths(neu.fall_id as string | null)
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }

  const { data: neu, error: neuErr } = await supabase
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

  // 1) Neuer Slot → storniert
  const { error: stoErr } = await supabase
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
  const { error: rbErr } = await supabase
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', neu.verlegung_quelle_id)
    .eq('status', 'verlegt')
  if (rbErr) {
    // Rollback des Rollbacks: neuer Slot zurück auf pending
    await supabase
      .from('gutachter_termine')
      .update({ status: 'verlegung_pending', cancelled_at: null })
      .eq('id', neu.id)
    return { ok: false, error: `Alter Termin Rollback fehlgeschlagen: ${rbErr.message}` }
  }

  revalidateFallPaths(neu.fall_id as string | null)
  return { ok: true }
}
