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
