// Facade fuer die Admin-Makler-Akte (/admin/vertrieb/makler/[id]) — B3 des CRM-Drawer-
// Programms (Phase-A-Befund a3: Makler hatte keine Detail-View). Result-Objects statt
// throw (AGENTS §Server-Actions). adminClient ist UNGETYPT — Spalten hier sind gegen
// bestehende Queries verifiziert (Stammdaten: admin/makler/page.tsx; Provisionen:
// lib/werkstatt/queries.ts partner_provisionen-Select), NICHT geraten.
import { createAdminClient } from '@/lib/supabase/admin'

export type MaklerStammdaten = {
  id: string
  firma: string | null
  email: string | null
  telefon: string | null
  status: string | null
  provision_betrag_komplett_netto: number | null
  provision_betrag_nur_gutachter_netto: number | null
  aktiviert_am: string | null
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
}

export type MaklerProvisionRow = {
  id: string
  betrag_netto_eur: number | null
  status: string | null
  trigger_event: string | null
  trigger_at: string | null
  storniert_am: string | null
  storno_grund: string | null
  erstellt_am: string | null
  claim_nummer: string | null
}

const STAMM_SELECT =
  'id, firma, email, telefon, status, provision_betrag_komplett_netto, ' +
  'provision_betrag_nur_gutachter_netto, aktiviert_am, ansprechpartner_vorname, ansprechpartner_nachname'

export async function getMaklerAdminDetail(
  id: string,
): Promise<{ ok: true; data: MaklerStammdaten } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('makler').select(STAMM_SELECT).eq('id', id).single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as unknown as MaklerStammdaten }
}

/** Provisions-Ledger des Maklers (neueste zuerst, gedeckelt). Nur laden, wenn der Tab aktiv ist. */
export async function getMaklerProvisionen(
  maklerId: string,
): Promise<{ ok: true; data: MaklerProvisionRow[] } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partner_provisionen')
    .select(
      'id, betrag_netto_eur, status, trigger_event, trigger_at, storniert_am, storno_grund, erstellt_am, claim_nummer',
    )
    .eq('partner_typ', 'makler')
    .eq('partner_id', maklerId)
    .order('erstellt_am', { ascending: false })
    .limit(200)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []) as unknown as MaklerProvisionRow[] }
}
