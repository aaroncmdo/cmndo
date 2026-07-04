'use server'

// SP2 Task 5 — Werkstatt-Reparaturtermin-Aktionen.
// Drei Status-Uebergaenge fuer die Werkstatt-Session: bestaetigen / Rueckruf erbitten /
// ablehnen. Alle nutzen den auth-aware createClient() — RLS-Gate (is_werkstatt_for_claim)
// auf reparatur_termine.UPDATE schlaegt automatisch an. Kein Admin-Client fuer den
// Status-Wechsel noetig.
//
// Kunde-Benachrichtigung (Email, non-fatal) liest claim_id via service-role-Client —
// der auth-aware Client kann claims ohne werkstatt-RLS-Policy nicht lesen.

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { notifyKundeReparaturtermin } from '@/lib/werkstatt/notify-kunde-reparaturtermin'

// ─────────────────────────────────────────────────────────────────────────────
// bestaetigeReparaturtermin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werkstatt bestaetigt den Reparaturtermin und setzt (optional) einen festen
 * Terminzeitpunkt. RLS-Gate laeuft auf der auth-aware Session.
 *
 * @param terminId   UUID der reparatur_termine-Row.
 * @param bestaetigterTermin  ISO-String fuer den bestaetigen Termin (optional;
 *                            wenn leer → bestaetigter_termin bleibt null).
 */
export async function bestaetigeReparaturtermin(
  terminId: string,
  bestaetigterTermin?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const supabase = await createClient()

  const update: Record<string, unknown> = {
    status: 'bestaetigt',
    updated_at: new Date().toISOString(),
  }
  if (bestaetigterTermin?.trim()) {
    update.bestaetigter_termin = bestaetigterTermin.trim()
  }

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update(update as never)
    .eq('id', terminId)
    .select('claim_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  revalidatePath('/werkstatt/auftraege')

  // Kunden-Benachrichtigung (non-fatal)
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({
      claimId: (data as unknown as { claim_id: string }).claim_id,
      ereignis: 'bestaetigt',
      bestaetigterTermin: bestaetigterTermin ?? null,
      svc,
    })
  } catch (err) {
    console.warn('[SP2 T5] Kunden-Notify bestaetigt fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// erbitteRueckruf
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werkstatt signalisiert, dass sie den Kunden anrufen wird — Status → anruf_erbeten.
 */
export async function erbitteRueckruf(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update({ status: 'anruf_erbeten', updated_at: new Date().toISOString() } as never)
    .eq('id', terminId)
    .select('claim_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  revalidatePath('/werkstatt/auftraege')

  // Kunden-Benachrichtigung (non-fatal)
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({
      claimId: (data as unknown as { claim_id: string }).claim_id,
      ereignis: 'anruf_erbeten',
      bestaetigterTermin: null,
      svc,
    })
  } catch (err) {
    console.warn('[SP2 T5] Kunden-Notify anruf_erbeten fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// lehneReparaturterminAb
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Werkstatt lehnt den Wunschtermin ab (optionaler Absagegrund).
 */
export async function lehneReparaturterminAb(
  terminId: string,
  absageGrund?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])

  const supabase = await createClient()

  const update: Record<string, unknown> = {
    status: 'abgelehnt',
    updated_at: new Date().toISOString(),
  }
  if (absageGrund?.trim()) {
    update.absage_grund = absageGrund.trim()
  }

  const { data, error } = await supabase
    .from('reparatur_termine')
    .update(update as never)
    .eq('id', terminId)
    .select('claim_id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder kein Zugriff' }

  revalidatePath('/werkstatt/auftraege')

  // Kunden-Benachrichtigung (non-fatal)
  try {
    const svc = createServiceClient()
    await notifyKundeReparaturtermin({
      claimId: (data as unknown as { claim_id: string }).claim_id,
      ereignis: 'abgelehnt',
      bestaetigterTermin: null,
      svc,
    })
  } catch (err) {
    console.warn('[SP2 T5] Kunden-Notify abgelehnt fehlgeschlagen (non-fatal):', err)
  }

  return { ok: true }
}
