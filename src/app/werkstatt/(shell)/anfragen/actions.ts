'use server'

// Werkstatt bearbeitet ihre eigenen OFFENEN Leads (Kunde/Fahrzeug/Schaden korrigieren
// & vervollstaendigen — z.B. einen aus dem KVA-Upload halb-leeren Lead fertigstellen).
// Ownership via v_werkstatt_lead (auth-aware RLS-Gate) -> Fremd-Lead = 0 Zeilen = kein
// IDOR (dasselbe Muster wie die auftraege-Actions). Update via service-role, weil leads
// keine werkstatt-UPDATE-RLS hat.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { SCHADENTYP_VALUES } from '@/lib/werkstatt/schadentyp-options'
import { sendFlowLinkMultiChannelCore } from '@/lib/start-link/send-flowlink-multichannel'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'

// Whitelist der editierbaren Felder (kein arbitraerer Write). Lokal, NICHT exportiert
// (Konstanten aus 'use server' werden im Client-Bundle undefined — AGENTS §Server-Actions).
const EDITIERBARE_FELDER = [
  'vorname', 'nachname', 'telefon', 'email',
  'fahrzeug_hersteller', 'fahrzeug_modell', 'kennzeichen', 'fin', 'erstzulassung',
  'schadentyp', 'schadens_hergang', 'unfalldatum', 'unfallort',
]

/**
 * Bearbeitet die Kunde-/Fahrzeug-/Schaden-Felder eines eigenen offenen Leads.
 * @param leadId  leads.id
 * @param patch   Feld -> Wert (leere Strings werden zu null)
 */
export async function bearbeiteWerkstattLead(
  leadId: string,
  patch: Record<string, string | null>,
): Promise<{ ok: boolean; error?: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!leadId) return { ok: false, error: 'Anfrage fehlt' }

  // Ownership-Gate: v_werkstatt_lead (auth-aware) liefert nur eigene offene Leads.
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: owned } = await (supabase as any)
    .from('v_werkstatt_lead')
    .select('id')
    .eq('id', leadId)
    .maybeSingle()
  if (!owned) return { ok: false, error: 'Kein Zugriff auf diese Anfrage' }

  // Whitelist-Filter: nur erlaubte Felder; leere Strings -> null.
  const clean: Record<string, string | null> = {}
  for (const f of EDITIERBARE_FELDER) {
    if (f in patch) {
      const v = patch[f]
      clean[f] = typeof v === 'string' && v.trim() === '' ? null : (v ?? null)
    }
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: 'Nichts zu speichern' }

  // schadentyp ist DB-CHECK-constrainted (leads_schadentyp_check) -> serverseitig gegen die
  // erlaubten Werte pruefen (Defense-in-Depth: der Select bietet nur gueltige an, aber ein
  // roher POST koennte sonst den DB-CHECK treffen -> saubere Meldung statt roher PG-Error).
  if ('schadentyp' in clean && clean.schadentyp !== null && !SCHADENTYP_VALUES.includes(clean.schadentyp)) {
    return { ok: false, error: 'Ungültiger Schadentyp' }
  }

  // Update via service-role (Ownership oben geprueft; leads default-deny fuer werkstatt).
  const admin = createAdminClient()
  const { error } = await admin.from('leads').update(clean as never).eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/werkstatt/anfragen')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow-Push — den Kunden durch seinen OFFENEN Vorgang holen (Link senden / Flow öffnen).
// Gehoert hierher (offene Anfrage = Lead), NICHT zu /auftraege (konvertierte Claims):
// ein Flowlink-Resend auf einem fertigen Auftrag ist sinnlos. Lead-basiert -> kein
// Claim->Lead-Resolve. Ownership via v_werkstatt_lead (auth-aware, Fremd-Lead=0 Zeilen).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sendet dem Kunden den Flow-Link erneut (WhatsApp bevorzugt, Email-Fallback).
 * Ensure-Semantik im Core: ein abgelaufener Token wird neu ausgestellt (72h) — genau
 * der Fall bei steckengebliebenen Self-Service-Kunden.
 */
export async function resendeAnfrageFlowLink(
  leadId: string,
): Promise<{ ok: boolean; error?: string; kanal?: 'whatsapp' | 'email' }> {
  await requirePortalAccess(['werkstatt'])
  if (!leadId) return { ok: false, error: 'Anfrage fehlt' }

  const supabase = await createClient()
  const actorId = (await supabase.auth.getUser()).data.user?.id
  if (!actorId) return { ok: false, error: 'Nicht angemeldet' }

  // Ownership-Gate + Kontakt in einem: v_werkstatt_lead liefert nur eigene offene Leads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: owned } = await (supabase as any)
    .from('v_werkstatt_lead')
    .select('id, telefon, email')
    .eq('id', leadId)
    .maybeSingle()
  if (!owned) return { ok: false, error: 'Kein Zugriff auf diese Anfrage' }

  const hatTelefon = Boolean((owned as { telefon: string | null }).telefon)
  const hatEmail = Boolean((owned as { email: string | null }).email)
  if (!hatTelefon && !hatEmail) {
    return { ok: false, error: 'Kein Kontaktkanal (Telefon/E-Mail) bei der Anfrage hinterlegt' }
  }

  const admin = createAdminClient()
  let kanal: 'whatsapp' | 'email' = hatTelefon ? 'whatsapp' : 'email'
  let res = await sendFlowLinkMultiChannelCore(admin, leadId, kanal, actorId)
  if (!res.success && kanal === 'whatsapp' && hatEmail) {
    kanal = 'email'
    res = await sendFlowLinkMultiChannelCore(admin, leadId, kanal, actorId)
  }
  if (!res.success) return { ok: false, error: res.error ?? 'Versand fehlgeschlagen' }

  revalidatePath('/werkstatt/anfragen')
  return { ok: true, kanal }
}

/**
 * Oeffnet den Kunden-Flow selbst (vor Ort mit dem Kunden). Liefert einen GUELTIGEN
 * /flow/<token>-Link (ensure: neu ausgestellt falls abgelaufen). Gegatet auf die
 * eigene offene Anfrage (v_werkstatt_lead).
 */
export async function oeffneAnfrageFlow(
  leadId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!leadId) return { ok: false, error: 'Anfrage fehlt' }

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: owned } = await (supabase as any)
    .from('v_werkstatt_lead')
    .select('id')
    .eq('id', leadId)
    .maybeSingle()
  if (!owned) return { ok: false, error: 'Kein Zugriff auf diese Anfrage' }

  const flRes = await ensureCanonicalFlowLinkForLead(leadId, { admin: createAdminClient() })
  if (!flRes.ok) return { ok: false, error: flRes.error }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  return { ok: true, url: `${appUrl}/flow/${flRes.token}` }
}
