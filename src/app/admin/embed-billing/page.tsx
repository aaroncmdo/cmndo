import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { EmbedBillingClient } from './EmbedBillingClient'

export const dynamic = 'force-dynamic'

/**
 * AAR-939 Stream 8 — Admin Embed-Billing-Review-Queue.
 * Nur Admin. Drei Ansichten:
 *   1. Faellig-Vorschau (v_embed_billing_faellig) — was der Monats-Cron buchen wird.
 *   2. Review-Queue (billing_review_status='pending') — SV-gemeldete Kunden-Gruende,
 *      Admin entscheidet: stornieren (Void) oder doch berechnen.
 *   3. Storniert (Historie) — bereits ge-void-ete Anfragen.
 */
export default async function EmbedBillingPage() {
  const auth = await requireRole(['admin'])
  if (!auth.success) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const [faelligRes, pendingRes, storniertRes] = await Promise.all([
    db
      .from('v_embed_billing_faellig')
      .select('anfrage_id, vorname, nachname, schadentyp, sv_id, betrag_netto, site_name, termin_end_zeit')
      .order('termin_end_zeit', { ascending: true }),
    db
      .from('gutachter_finder_anfragen')
      .select(
        'id, vorname, nachname, schadentyp, billing_review_grund, billing_review_erstellt_am, abrechnung_id, abrechnung_sv_id, embed_site_id',
      )
      .eq('source', 'sv_embed')
      .eq('variante', 'B')
      .eq('billing_review_status', 'pending')
      .order('billing_review_erstellt_am', { ascending: true }),
    db
      .from('gutachter_finder_anfragen')
      .select('id, vorname, nachname, schadentyp, abrechnung_storno_grund, abrechnung_storniert_am')
      .eq('source', 'sv_embed')
      .eq('variante', 'B')
      .not('abrechnung_storniert_am', 'is', null)
      .order('abrechnung_storniert_am', { ascending: false })
      .limit(50),
  ])

  const faellig = faelligRes.data ?? []
  const pending = pendingRes.data ?? []
  const storniert = storniertRes.data ?? []

  // SV-Namen aufloesen (sv_id -> sachverstaendige.profile_id -> profiles).
  const svIds = Array.from(
    new Set(
      [
        ...faellig.map((r: { sv_id: string | null }) => r.sv_id),
        ...pending.map((r: { abrechnung_sv_id: string | null }) => r.abrechnung_sv_id),
      ].filter(Boolean) as string[],
    ),
  )
  const svNameMap: Record<string, string> = {}
  if (svIds.length) {
    const { data: svs } = await db.from('sachverstaendige').select('id, profile_id').in('id', svIds)
    const profileIds = (svs ?? []).map((s: { profile_id: string | null }) => s.profile_id).filter(Boolean)
    const profMap: Record<string, string> = {}
    if (profileIds.length) {
      const { data: profs } = await db.from('profiles').select('id, vorname, nachname').in('id', profileIds)
      for (const p of profs ?? []) {
        profMap[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
      }
    }
    for (const s of svs ?? []) {
      if (s.id) svNameMap[s.id] = s.profile_id ? (profMap[s.profile_id] ?? '—') : '—'
    }
  }

  return (
    <EmbedBillingClient
      faellig={faellig.map((r: Record<string, unknown>) => ({
        anfrage_id: r.anfrage_id as string,
        kunde: [r.vorname, r.nachname].filter(Boolean).join(' ') || 'Anfrage',
        schadentyp: (r.schadentyp as string | null) ?? null,
        sv_name: r.sv_id ? (svNameMap[r.sv_id as string] ?? '—') : '—',
        betrag_netto: Number(r.betrag_netto ?? 70),
        termin_end_zeit: (r.termin_end_zeit as string | null) ?? null,
      }))}
      pending={pending.map((r: Record<string, unknown>) => ({
        anfrage_id: r.id as string,
        kunde: [r.vorname, r.nachname].filter(Boolean).join(' ') || 'Anfrage',
        schadentyp: (r.schadentyp as string | null) ?? null,
        grund: (r.billing_review_grund as string | null) ?? null,
        gemeldet_am: (r.billing_review_erstellt_am as string | null) ?? null,
        sv_name: r.abrechnung_sv_id ? (svNameMap[r.abrechnung_sv_id as string] ?? '—') : '—',
        bereits_abgerechnet: !!r.abrechnung_id,
      }))}
      storniert={storniert.map((r: Record<string, unknown>) => ({
        anfrage_id: r.id as string,
        kunde: [r.vorname, r.nachname].filter(Boolean).join(' ') || 'Anfrage',
        grund: (r.abrechnung_storno_grund as string | null) ?? null,
        storniert_am: (r.abrechnung_storniert_am as string | null) ?? null,
      }))}
    />
  )
}
