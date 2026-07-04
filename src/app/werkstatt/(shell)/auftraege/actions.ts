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
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { notifyKundeReparaturtermin } from '@/lib/werkstatt/notify-kunde-reparaturtermin'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'

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

// ─────────────────────────────────────────────────────────────────────────────
// P2 — Nachtraegliche Aktionen: Kunden-Link erneut senden + Flow selbst oeffnen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ownership-Gate + claim->lead-Aufloesung. Die Werkstatt darf nur ihre EIGENEN
 * Auftraege anfassen: v_werkstatt_auftrag laeuft auf der auth-aware Session und
 * ist is_werkstatt_for_claim-gegatet -> ein Fremd-Claim liefert 0 Zeilen = kein
 * IDOR. Danach service-role fuer die leads-Aufloesung (leads = default-deny fuer
 * werkstatt). claim <- leads.konvertiert_zu_claim_id.
 */
async function ladeEigenenAuftragLead(
  claimId: string,
): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  if (!claimId) return { ok: false, error: 'Auftrag fehlt' }
  const supabase = await createClient()
  const { data: owned } = await supabase
    .from('v_werkstatt_auftrag')
    .select('claim_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (!owned) return { ok: false, error: 'Kein Zugriff auf diesen Auftrag' }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id')
    .eq('konvertiert_zu_claim_id', claimId)
    .maybeSingle()
  if (!lead?.id) return { ok: false, error: 'Kein Kunden-Flow zu diesem Auftrag gefunden' }
  return { ok: true, leadId: lead.id as string }
}

/**
 * Werkstatt sendet dem Kunden den Flow-Link erneut. WhatsApp bevorzugt (Telefon),
 * Fallback Email. Ensure-Semantik: ein abgelaufener Token wird neu ausgestellt
 * (72h) — genau der Fall bei den steckengebliebenen Self-Service-Kunden.
 */
export async function resendeKundenLink(
  claimId: string,
): Promise<{ ok: boolean; error?: string; kanal?: 'whatsapp' | 'email' }> {
  await requirePortalAccess(['werkstatt'])
  const supabase = await createClient()
  const actorId = (await supabase.auth.getUser()).data.user?.id
  if (!actorId) return { ok: false, error: 'Nicht angemeldet' }

  const auf = await ladeEigenenAuftragLead(claimId)
  if (!auf.ok) return { ok: false, error: auf.error }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('telefon, email')
    .eq('id', auf.leadId)
    .maybeSingle()
  const hatTelefon = Boolean(lead?.telefon)
  const hatEmail = Boolean(lead?.email)
  if (!hatTelefon && !hatEmail) {
    return { ok: false, error: 'Kein Kontaktkanal (Telefon/E-Mail) beim Kunden hinterlegt' }
  }

  // Bevorzugt WhatsApp; scheitert der WA-Versand und es gibt eine E-Mail -> Fallback.
  let kanal: 'whatsapp' | 'email' = hatTelefon ? 'whatsapp' : 'email'
  let res = await sendFlowLinkMultiChannelCore(admin, auf.leadId, kanal, actorId)
  if (!res.success && kanal === 'whatsapp' && hatEmail) {
    kanal = 'email'
    res = await sendFlowLinkMultiChannelCore(admin, auf.leadId, kanal, actorId)
  }
  if (!res.success) return { ok: false, error: res.error ?? 'Versand fehlgeschlagen' }

  revalidatePath('/werkstatt/auftraege')
  return { ok: true, kanal }
}

/**
 * Werkstatt oeffnet den Kunden-Flow selbst (vor Ort mit dem Kunden). Liefert einen
 * GUELTIGEN /flow/<token>-Link (ensure: neu ausgestellt falls abgelaufen); der Client
 * navigiert dorthin. Gegatet auf is_werkstatt_for_claim (nur eigener Auftrag).
 *
 * Security-Hinweis (Aaron-Anforderung „den Flow durchklicken"): exponiert den
 * kunden-scoped Flow-Token an die verifiziert-ownende Werkstatt. Nicht weiter als
 * der Kunden-Magic-Link selbst (derselbe Token, dieselbe RLS-Sichtbarkeit).
 */
export async function oeffneKundenFlow(
  claimId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  const auf = await ladeEigenenAuftragLead(claimId)
  if (!auf.ok) return { ok: false, error: auf.error }

  const flRes = await ensureCanonicalFlowLinkForLead(auf.leadId, { admin: createAdminClient() })
  if (!flRes.ok) return { ok: false, error: flRes.error }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  return { ok: true, url: `${appUrl}/flow/${flRes.token}` }
}
