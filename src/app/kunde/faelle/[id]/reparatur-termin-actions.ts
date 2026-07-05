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
