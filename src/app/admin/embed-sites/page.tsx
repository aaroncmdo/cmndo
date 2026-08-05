import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { EmbedSitesAdminClient } from './EmbedSitesAdminClient'

export const dynamic = 'force-dynamic'

/**
 * AAR-939 Embed-B — Admin: Funnel-Modus pro SV-Embed.
 * Nur Admin. Listet alle embed_sites + erlaubt das Umschalten callback<->flowlink.
 * Self-Service (flowlink) ist admin-kontrolliert (Flow-/Billing-Impact, Aaron).
 */
export default async function AdminEmbedSitesPage() {
  const auth = await requireRole(['admin'])
  if (!auth.success) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: siteRows } = await db
    .from('embed_sites')
    .select('id, name, slug, variante, aktiv, funnel_modus, sv_id, anfragen_gesamt, letzte_anfrage_am, config_hits, letzter_config_hit_am, letzter_config_origin, erstellt_am')
    .order('erstellt_am', { ascending: false })

  const sites = siteRows ?? []

  // SV-Namen aufloesen (sv_id -> sachverstaendige.profile_id -> profiles), wie embed-billing.
  const svIds = Array.from(
    new Set(sites.map((r: { sv_id: string | null }) => r.sv_id).filter(Boolean) as string[]),
  )
  const svNameMap: Record<string, string> = {}
  if (svIds.length) {
    const { data: svs } = await db.from('sachverstaendige').select('id, profile_id').in('id', svIds)
    const profileIds = (svs ?? []).map((s: { profile_id: string | null }) => s.profile_id).filter(Boolean)
    const profMap: Record<string, string> = {}
    if (profileIds.length) {
      const { data: profs } = await db.from('profiles').select('id, vorname, nachname').in('id', profileIds)
      for (const p of profs ?? []) profMap[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
    }
    for (const s of svs ?? []) if (s.id) svNameMap[s.id] = s.profile_id ? (profMap[s.profile_id] ?? '—') : '—'
  }

  return (
    <EmbedSitesAdminClient
      sites={sites.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: (r.name as string | null) ?? '—',
        slug: (r.slug as string | null) ?? '—',
        variante: (r.variante as string | null) ?? 'A',
        aktiv: !!r.aktiv,
        funnel_modus: ((r.funnel_modus as string | null) === 'flowlink' ? 'flowlink' : 'callback') as
          | 'callback'
          | 'flowlink',
        sv_name: r.sv_id ? (svNameMap[r.sv_id as string] ?? '—') : '—',
        anfragen_gesamt: Number(r.anfragen_gesamt ?? 0),
        letzte_anfrage_am: (r.letzte_anfrage_am as string | null) ?? null,
        config_hits: Number(r.config_hits ?? 0),
        letzter_config_hit_am: (r.letzter_config_hit_am as string | null) ?? null,
        letzter_config_origin: (r.letzter_config_origin as string | null) ?? null,
      }))}
    />
  )
}
