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

  // Werkstatt aus Claim lesen (Kunde liest via claims-Owner-RLS)
  const { data: claim } = await supabase
    .from('claims')
    .select('reparatur_werkstatt_id')
    .eq('id', claimId)
    .maybeSingle()
  const werkstattId = (claim as { reparatur_werkstatt_id: string | null } | null)?.reparatur_werkstatt_id ?? null
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt hinterlegt.' }

  // Pruefen ob bereits ein aktiver Terminwunsch vorliegt
  const { data: aktiv } = await supabase
    .from('reparatur_termine')
    .select('id')
    .eq('claim_id', claimId)
    .in('status', ['angefragt', 'anruf_erbeten', 'bestaetigt'])
    .limit(1)
  if (aktiv && aktiv.length > 0) {
    return { ok: false, error: 'Es liegt bereits ein Terminwunsch vor.' }
  }

  // Berlin-Wandzeit → UTC-ISO (resolveWunschterminIso wirft nicht, gibt null zurueck)
  const utc = resolveWunschterminIso(wunschterminLokal)
  if (!utc) return { ok: false, error: 'Ungültiger Wunschtermin.' }

  const { error } = await supabase.from('reparatur_termine').insert({
    claim_id: claimId,
    werkstatt_id: werkstattId,
    wunschtermin: utc,
    status: 'angefragt',
    erstellt_von: user.id,
  })
  if (error) return { ok: false, error: error.message }

  // Werkstatt benachrichtigen — non-fatal
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
