'use server'

// SP4b Task 2 — Kunde schlaegt Reparatur-Wunschtermin vor.
// Laeuft ueber die Kunde-Session (createClient): RLS-Policy
// reparatur_termine_kunde_insert erzwingt status='angefragt' + Owner-Check.
// Werkstatt-Notify loest user_id via Service-Client auf (Kunde kann
// werkstaetten nicht lesen) — non-fatal, INSERT bleibt atomar.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { resolveWunschterminIso } from '@/app/flow/[token]/wunschtermin'
import { revalidatePath } from 'next/cache'
import { notifyWerkstattKundenreaktion } from '@/lib/werkstatt/notify-werkstatt-kundenreaktion'
import { advanceReparaturCursorTo, fallIdForClaim } from '@/lib/faelle/reparatur-cursor'

/**
 * Werkstatt-Notify (non-fatal) + Kunde-Akte revalidieren. Von beiden Erfolgs-Pfaden von
 * schlageReparaturTerminVorPortal genutzt (Neu-Insert + angefragt-Nachtrag) statt dupliziert.
 * revalidatePath laeuft immer (ausserhalb des non-fatalen Notify-try).
 */
async function notifyWerkstattTerminwunschUndRevalidate(claimId: string, werkstattId: string): Promise<void> {
  try {
    const svc = createServiceClient()
    const { data: w } = await svc
      .from('werkstaetten')
      .select('user_id')
      .eq('id', werkstattId)
      .maybeSingle()
    const wUser = (w as { user_id: string | null } | null)?.user_id
    if (wUser) {
      await createNotification(
        wUser,
        'reparatur_termin',
        'Neuer Terminwunsch',
        'Ein Kunde hat einen Reparatur-Wunschtermin vorgeschlagen.',
        '/werkstatt/auftraege',
      )
    }
  } catch (err) {
    console.error('[schlageReparaturTerminVorPortal] Werkstatt-Notify (non-fatal):', err)
  }

  revalidatePath(`/kunde/faelle/${claimId}`)
}

export async function schlageReparaturTerminVorPortal(
  claimId: string,
  wunschterminLokal: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId || !wunschterminLokal) {
    return { ok: false, error: 'Claim und Wunschtermin sind erforderlich.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Werkstatt aus Claim lesen (Kunde liest via claims-Owner-RLS). Genau dieser user-scoped
  // Read ist zugleich die Owner-Legitimation fuer den Service-Client-Nachtrag unten — nur
  // der Claim-Owner kommt ueber die RLS bis hierher.
  const { data: claim } = await supabase
    .from('claims')
    .select('reparatur_werkstatt_id')
    .eq('id', claimId)
    .maybeSingle()
  const werkstattId = (claim as { reparatur_werkstatt_id: string | null } | null)?.reparatur_werkstatt_id ?? null
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt hinterlegt.' }

  // Berlin-Wandzeit → UTC-ISO (resolveWunschterminIso wirft nicht, gibt null zurueck).
  // Vor den Aktiv-Check gezogen: Nachtrag- UND Insert-Zweig brauchen utc.
  const utc = resolveWunschterminIso(wunschterminLokal)
  if (!utc) return { ok: false, error: 'Ungültiger Wunschtermin.' }

  // Aktiven Terminwunsch pruefen. Offene Menge = die "max. 1 offene Row"-Invariante der
  // Tranche W (angefragt/werkstatt_vorschlag/anruf_erbeten/bestaetigt), konsistent mit
  // ensureReparaturTerminAngefragt. status + wunschtermin mitlesen: eine offene 'angefragt'-
  // Row OHNE Wunschtermin ist der neue Werkstatt-ensure-Zustand (W2) — dort traegt der Kunde
  // den Wunschtermin NACH, statt blockiert zu werden.
  const { data: aktiv } = await supabase
    .from('reparatur_termine')
    .select('id, status, wunschtermin')
    .eq('claim_id', claimId)
    .in('status', ['angefragt', 'werkstatt_vorschlag', 'anruf_erbeten', 'bestaetigt'])
    .limit(1)
  const aktiveRow = (aktiv?.[0] ?? null) as { id: string; status: string; wunschtermin: string | null } | null

  if (aktiveRow) {
    // Nachtrag: offene 'angefragt'-Row ohne Wunschtermin -> Wunschtermin per Service-Client
    // setzen. Die Kunde-RLS-UPDATE-Policy erlaubt nur werkstatt_vorschlag-Uebergaenge (kein
    // user-scoped angefragt-Update moeglich), daher der Service-Client; Owner ist oben erbracht.
    // Das doppelte eq('status','angefragt') + is('wunschtermin', null) macht den Write racefrei
    // (verlorenes Update -> 0 Zeilen -> Fehlermeldung statt stillem Ueberschreiben).
    if (aktiveRow.status === 'angefragt' && aktiveRow.wunschtermin == null) {
      const svc = createServiceClient()
      const { data: updated, error: updErr } = await svc
        .from('reparatur_termine')
        .update({ wunschtermin: utc, updated_at: new Date().toISOString() } as never)
        .eq('id', aktiveRow.id)
        .eq('status', 'angefragt')
        .is('wunschtermin', null)
        .select('id')
      if (updErr) return { ok: false, error: updErr.message }
      if (!updated || updated.length === 0) {
        return { ok: false, error: 'Terminwunsch wurde gerade aktualisiert – bitte neu laden.' }
      }
      await notifyWerkstattTerminwunschUndRevalidate(claimId, werkstattId)
      return { ok: true }
    }
    // Alle anderen offenen Rows (bestaetigt/anruf_erbeten/werkstatt_vorschlag bzw. angefragt
    // MIT Wunschtermin) blocken unveraendert.
    return { ok: false, error: 'Es liegt bereits ein Terminwunsch vor.' }
  }

  // Keine offene Row -> neuen Wunschtermin anlegen (bestehender Pfad).
  const { error } = await supabase.from('reparatur_termine').insert({
    claim_id: claimId,
    werkstatt_id: werkstattId,
    wunschtermin: utc,
    status: 'angefragt',
    erstellt_von: user.id,
  })
  if (error) return { ok: false, error: error.message }

  await notifyWerkstattTerminwunschUndRevalidate(claimId, werkstattId)
  return { ok: true }
}

/**
 * Kunde nimmt den Werkstatt-Terminvorschlag an: werkstatt_vorschlag -> bestaetigt.
 * RLS-Policy reparatur_termine_kunde_update erzwingt Owner + Ausgangsstatus.
 */
export async function akzeptiereWerkstattTermin(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!terminId) return { ok: false, error: 'Kein Termin.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update({ status: 'bestaetigt', updated_at: new Date().toISOString() } as never)
    .eq('id', terminId)
    .eq('status', 'werkstatt_vorschlag')
    .select('claim_id, werkstatt_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder nicht mehr offen.' }

  const row = data as unknown as { claim_id: string; werkstatt_id: string }
  revalidatePath(`/kunde/faelle/${row.claim_id}`)
  revalidatePath('/werkstatt/auftraege')
  try {
    const svc = createServiceClient()
    await notifyWerkstattKundenreaktion({ werkstattId: row.werkstatt_id, ereignis: 'bestaetigt', svc })
  } catch (err) {
    console.error('[akzeptiereWerkstattTermin] Werkstatt-Notify (non-fatal):', err)
  }

  // Reparatur-Cursor: Kunde bestaetigt den Werkstatt-Termin -> reparatur-laeuft
  // (nur reduced-repair, non-fatal, forward-only — Gate im Helper).
  const fid = await fallIdForClaim(row.claim_id)
  if (fid) {
    await advanceReparaturCursorTo(fid, 'reparatur-laeuft', {
      user_id: user.id,
      grund: 'reparaturtermin_bestaetigt',
    })
  }
  return { ok: true }
}

/**
 * Kunde: der Werkstatt-Vorschlag passt nicht -> anruf_erbeten + optionale Wunsch-Rueckrufzeit.
 * Die Werkstatt ruft zurueck (sie hat den Kalender).
 * RLS-Policy reparatur_termine_kunde_update erzwingt Owner + Ausgangsstatus.
 * @param rueckrufWunschzeitLokal Berlin-Wandzeit "YYYY-MM-DDTHH:mm" (optional).
 */
export async function werkstattTerminPasstNicht(
  terminId: string,
  rueckrufWunschzeitLokal?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!terminId) return { ok: false, error: 'Kein Termin.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  const rueckrufUtc = rueckrufWunschzeitLokal ? resolveWunschterminIso(rueckrufWunschzeitLokal) : null

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update({ status: 'anruf_erbeten', rueckruf_wunschzeit: rueckrufUtc, updated_at: new Date().toISOString() } as never)
    .eq('id', terminId)
    .eq('status', 'werkstatt_vorschlag')
    .select('claim_id, werkstatt_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder nicht mehr offen.' }

  const row = data as unknown as { claim_id: string; werkstatt_id: string }
  revalidatePath(`/kunde/faelle/${row.claim_id}`)
  revalidatePath('/werkstatt/auftraege')
  try {
    const svc = createServiceClient()
    await notifyWerkstattKundenreaktion({ werkstattId: row.werkstatt_id, ereignis: 'rueckruf_erbeten', rueckrufWunschzeit: rueckrufUtc, svc })
  } catch (err) {
    console.error('[werkstattTerminPasstNicht] Werkstatt-Notify (non-fatal):', err)
  }
  return { ok: true }
}
