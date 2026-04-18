// AAR-483 (M1) + AAR-484 (M2): Query-Helper für Makler-Portal. Jede Funktion
// nutzt die auth-aware SSR-Client-Instanz, sodass die RLS-Policies aus
// aar483_m1_makler_additive_rls greifen und Makler nur ihre eigenen Rows
// sehen. Admins/KB/Dispatch sehen via anderer Policies weiterhin alles.

import { createClient } from '@/lib/supabase/server'

export type MaklerRow = {
  id: string
  user_id: string | null
  firma: string
  ansprechpartner_vorname: string
  status: string
  erstellt_am: string
}

/** Holt die Makler-Row für den eingeloggten User (oder null). */
export async function getCurrentMakler(): Promise<MaklerRow | null> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null
  const { data } = await supabase
    .from('makler')
    .select('id, user_id, firma, ansprechpartner_vorname, status, erstellt_am')
    .eq('user_id', user.id)
    .maybeSingle()
  return data
}

/**
 * Leads für einen Makler — über promotion_code_id → promotion_codes.makler_id.
 * Nutzt Nested-FK-Filter via `!inner`, damit Leads ohne Promo-Code (optional
 * nullable FK) für Makler unsichtbar bleiben.
 */
export async function getMaklerLeads(maklerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leads')
    .select(`
      id, vorname, nachname, service_typ, status, created_at,
      promotion_code:promotion_codes!inner(id, code, makler_id)
    `)
    .eq('promotion_code.makler_id', maklerId)
    .order('created_at', { ascending: false })
  return data ?? []
}

/**
 * Fälle eines Maklers — nur mit aktivem Consent (widerrufen_am IS NULL).
 * Cardinality ist many-to-one, dennoch kann Supabase den Nested-Select je
 * nach Session als Array liefern — Consumer muss `Array.isArray(x) ? x[0] : x`
 * normalisieren.
 */
export async function getMaklerFaelle(maklerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('makler_fall_consent')
    .select(`
      id, consent_scope, consent_gegeben_am, widerrufen_am,
      fall:faelle!inner(id, status, service_typ)
    `)
    .eq('makler_id', maklerId)
    .is('widerrufen_am', null)
    .order('consent_gegeben_am', { ascending: false })
  return data ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-484 (M2) — Dashboard-Daten
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardActivityItem =
  | {
      kind: 'lead'
      id: string
      timestamp: string
      titel: string
      status: string
    }
  | {
      kind: 'provision'
      id: string
      timestamp: string
      betrag_netto_eur: number
      status: string
      fall_id: string | null
    }

export type DashboardData = {
  stats: {
    offeneLeads: number
    aktiveAkten: number
    monatPending: number
    monatFreigegeben: number
    konversion: number
  }
  activity: DashboardActivityItem[]
}

/**
 * AAR-484: Parallel-Fetch aller Dashboard-Kennzahlen für einen Makler.
 *
 * Leads-Scope: alle Leads deren promotion_code_id zu einem eigenen Promo-Code
 * gehört. Wir holen die Promo-IDs zuerst und filtern dann via `.in()` — das
 * vermeidet die SQL-Injection-Gefahr der ticket-Spec (wo `.filter(..., 'in',
 * '(SELECT ...)')` mit Template-Literal zusammengebaut war).
 */
export async function getMaklerDashboardData(maklerId: string): Promise<DashboardData> {
  const supabase = await createClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Promo-Code-IDs einmal auflösen, dann als IN-Liste wiederverwenden.
  const { data: promoRows } = await supabase
    .from('promotion_codes')
    .select('id')
    .eq('makler_id', maklerId)
  const promoIds = (promoRows ?? []).map((p) => p.id)

  // Wenn keine Promo-Codes existieren → alle lead-basierten Queries sind leer
  // und müssen nicht gefeuert werden.
  const hasPromos = promoIds.length > 0

  const [
    leadsOpenRes,
    leadsTotalRes,
    faelleRes,
    provPendingRes,
    provReleasedRes,
    activityLeadsRes,
    activityProvRes,
  ] = await Promise.all([
    hasPromos
      ? supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .in('status', ['neu', 'qualifiziert'])
          .in('promotion_code_id', promoIds)
      : Promise.resolve({ data: null, count: 0, error: null }),
    hasPromos
      ? supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .in('promotion_code_id', promoIds)
      : Promise.resolve({ data: null, count: 0, error: null }),
    supabase
      .from('makler_fall_consent')
      .select('fall_id', { count: 'exact', head: true })
      .eq('makler_id', maklerId)
      .is('widerrufen_am', null),
    supabase
      .from('makler_provisionen')
      .select('betrag_netto_eur')
      .eq('makler_id', maklerId)
      .eq('status', 'pending'),
    supabase
      .from('makler_provisionen')
      .select('betrag_netto_eur')
      .eq('makler_id', maklerId)
      .eq('status', 'freigegeben')
      .gte('trigger_at', monthStart),
    hasPromos
      ? supabase
          .from('leads')
          .select('id, vorname, nachname, created_at, status')
          .in('promotion_code_id', promoIds)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('makler_provisionen')
      .select('id, betrag_netto_eur, status, trigger_at, fall_id')
      .eq('makler_id', maklerId)
      .order('trigger_at', { ascending: false })
      .limit(5),
  ])

  const monatPending = (provPendingRes.data ?? []).reduce(
    (s, r) => s + Number(r.betrag_netto_eur ?? 0),
    0,
  )
  const monatFreigegeben = (provReleasedRes.data ?? []).reduce(
    (s, r) => s + Number(r.betrag_netto_eur ?? 0),
    0,
  )

  const offeneLeads = leadsOpenRes.count ?? 0
  const totalLeads = leadsTotalRes.count ?? 0
  const aktiveAkten = faelleRes.count ?? 0
  const konversion = totalLeads > 0 ? aktiveAkten / totalLeads : 0

  // Activity-Merge: Leads + Provisionen nach Timestamp DESC, Top 10
  const leadsActivity: DashboardActivityItem[] = (activityLeadsRes.data ?? []).map(
    (l) => ({
      kind: 'lead' as const,
      id: l.id,
      timestamp: l.created_at,
      titel: [l.vorname, l.nachname].filter(Boolean).join(' ').trim() || 'Neuer Lead',
      status: l.status,
    }),
  )
  const provActivity: DashboardActivityItem[] = (activityProvRes.data ?? []).map(
    (p) => ({
      kind: 'provision' as const,
      id: p.id,
      timestamp: p.trigger_at,
      betrag_netto_eur: Number(p.betrag_netto_eur ?? 0),
      status: p.status,
      fall_id: p.fall_id,
    }),
  )

  const activity = [...leadsActivity, ...provActivity]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 10)

  return {
    stats: {
      offeneLeads,
      aktiveAkten,
      monatPending,
      monatFreigegeben,
      konversion,
    },
    activity,
  }
}
