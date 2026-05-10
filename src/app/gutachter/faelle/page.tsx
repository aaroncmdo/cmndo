// CMM-32f: SV-Fälle-Liste zeigt nur noch Regulierungs-Phase (kanzlei_faelle).
// Aktive Aufträge bis QC-Freigabe leben in /gutachter/auftraege. Sobald der KB
// das Gutachten freigibt (gutachten_final_freigegeben = true), wird ein
// kanzlei_faelle-Eintrag angelegt — ab da erscheint der Fall hier.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SchadensUrsacheBadge from '@/components/shared/SchadensUrsacheBadge'
import EmptyState from '@/components/shared/EmptyState'
import PageHeader from '@/components/shared/PageHeader'
import { FolderIcon } from 'lucide-react'

type FilterKey = 'alle' | 'versicherungskontakt' | 'auszahlung'

const KANZLEI_STATUS_LABEL: Record<string, string> = {
  versicherungskontakt: 'In Regulierung',
  auszahlung: 'Auszahlung',
}

function normalizeFilter(raw: string | undefined): FilterKey {
  if (raw === 'versicherungskontakt' || raw === 'auszahlung') return raw
  return 'alle'
}

export default async function GutachterFaellePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const { filter, q } = await searchParams
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) {
    return (
      <div className="h-full flex flex-col">
        <EmptyState title="Kein Sachverständigen-Profil gefunden." />
      </div>
    )
  }

  const activeFilter = normalizeFilter(filter)
  const searchTerm = (q ?? '').trim()
  const admin = createAdminClient()

  // CMM-32f: Schritt 1 — alle abgeschlossenen Aufträge des SV finden.
  const { data: meineAuftraege } = await admin
    .from('auftraege')
    .select('fall_id')
    .eq('sv_id', sv.id)
    .eq('gutachten_final_freigegeben', true)

  const meineFallIds = Array.from(
    new Set((meineAuftraege ?? []).map((a) => a.fall_id as string).filter(Boolean)),
  )

  if (meineFallIds.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="w-full space-y-6">
          <PageHeader title="Meine Fälle" description="0 Fälle in Regulierung" icon={FolderIcon} />
          <EmptyState title="Noch keine Fälle in Regulierung." />
        </div>
      </div>
    )
  }

  // CMM-32f: Schritt 2 — kanzlei_faelle für genau diese Fälle.
  let kanzleiQuery = admin
    .from('kanzlei_faelle')
    .select('id, fall_id, status, vs_kontakt_am, ausgezahlt_am, erstellt_am')
    .in('fall_id', meineFallIds)
    .order('erstellt_am', { ascending: false })

  if (activeFilter !== 'alle') {
    kanzleiQuery = kanzleiQuery.eq('status', activeFilter)
  }

  const { data: kanzleiFaelle } = await kanzleiQuery
  const kanzleiList = kanzleiFaelle ?? []
  const fallIds = kanzleiList.map((k) => k.fall_id as string)

  if (fallIds.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="w-full space-y-6">
          <PageHeader title="Meine Fälle" description="0 Fälle in Regulierung" icon={FolderIcon} />
          <FilterTabs activeFilter={activeFilter} />
          <EmptyState title="Keine Fälle für diesen Filter." />
        </div>
      </div>
    )
  }

  const [faelleRes, leadsRes] = await Promise.all([
    admin
      .from('faelle')
      .select('id, fall_nummer, schadens_ursache, schadens_datum, schadens_ort, lead_id')
      .in('id', fallIds),
    Promise.resolve(null), // placeholder, leads kommen unten via leadIds
  ])
  void leadsRes

  const fallMap = Object.fromEntries((faelleRes.data ?? []).map((f) => [f.id, f]))
  const leadIds = (faelleRes.data ?? []).map((f) => f.lead_id).filter(Boolean) as string[]
  const { data: leads } = leadIds.length
    ? await admin.from('leads').select('id, vorname, nachname').in('id', leadIds)
    : { data: [] as { id: string; vorname: string | null; nachname: string | null }[] }
  const leadMap = Object.fromEntries((leads ?? []).map((l) => [l.id, l]))

  // Freitextsuche über Fall-Nr / Kunde / Ort
  const needle = searchTerm.toLowerCase()
  const filtered = needle
    ? kanzleiList.filter((k) => {
        const f = fallMap[k.fall_id as string]
        if (!f) return false
        const lead = f.lead_id ? leadMap[f.lead_id as string] : null
        const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim().toLowerCase() : ''
        return (
          ((f.fall_nummer as string | null) ?? '').toLowerCase().includes(needle) ||
          name.includes(needle) ||
          ((f.schadens_ort as string | null) ?? '').toLowerCase().includes(needle)
        )
      })
    : kanzleiList

  return (
    <div className="h-full flex flex-col">
      <div className="w-full space-y-6">
        <PageHeader
          title="Meine Fälle"
          description={`${filtered.length} ${filtered.length === 1 ? 'Fall' : 'Fälle'} in Regulierung`}
          icon={FolderIcon}
        />

        <FilterTabs activeFilter={activeFilter} />

        {filtered.length === 0 ? (
          <EmptyState title={searchTerm ? `Keine Fälle passen zu „${searchTerm}".` : 'Keine Fälle gefunden.'} />
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden border border-claimondo-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-claimondo-border">
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium whitespace-nowrap">Fall-Nr.</th>
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium">Kunde</th>
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium">Schadentyp</th>
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium">Ort</th>
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium whitespace-nowrap">Seit</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((k) => {
                    const f = fallMap[k.fall_id as string]
                    if (!f) return null
                    const lead = f.lead_id ? leadMap[f.lead_id as string] : null
                    const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
                    return (
                      <tr
                        key={k.id}
                        className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/gutachter/fall/${f.id}`}
                            className="text-[var(--brand-accent)] hover:text-[var(--brand-accent)] font-mono text-xs"
                          >
                            {(f.fall_nummer as string | null) ?? (f.id as string).slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-claimondo-navy">{name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <SchadensUrsacheBadge ursache={f.schadens_ursache as string | null} plain />
                        </td>
                        <td className="px-4 py-3 text-claimondo-ondo text-xs">
                          {(f.schadens_ort as string | null) ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              k.status === 'auszahlung'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-violet-50 text-violet-800 border border-violet-200'
                            }`}
                          >
                            {KANZLEI_STATUS_LABEL[k.status as string] ?? (k.status as string)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-claimondo-ondo text-xs whitespace-nowrap">
                          {k.erstellt_am
                            ? new Date(k.erstellt_am as string).toLocaleDateString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterTabs({ activeFilter }: { activeFilter: FilterKey }) {
  const tabs: [FilterKey, string][] = [
    ['alle', 'Alle'],
    ['versicherungskontakt', 'In Regulierung'],
    ['auszahlung', 'Auszahlung'],
  ]
  return (
    <div className="flex gap-2 overflow-x-auto">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={key === 'alle' ? '/gutachter/faelle' : `/gutachter/faelle?filter=${key}`}
          className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
            activeFilter === key
              ? 'bg-[var(--brand-primary)] text-white'
              : 'bg-white text-claimondo-ondo hover:text-claimondo-navy border border-claimondo-border'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
