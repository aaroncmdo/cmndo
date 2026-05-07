// CMM-32f: SV-Fälle-Liste zeigt nur noch Regulierungs-Phase (kanzlei_faelle).
// Aktive Aufträge bis QC-Freigabe leben in /gutachter/auftraege. Sobald der KB
// das Gutachten freigibt (gutachten_final_freigegeben = true), wird ein
// kanzlei_faelle-Eintrag angelegt — ab da erscheint der Fall hier.
//
// Phase 1.5b Cleanup (2026-05-05): Datenpfad direkt auftraege.claim_id →
// kanzlei_faelle, ohne Umweg über faelle.claim_id-Lookup. Anzeige-Joins
// (faelle, leads) folgen via FK-Chain in einer Supabase-Query.

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

  // Schritt 1: claim_ids aller abgeschlossenen Aufträge des SV.
  // Phase 1.5b: auftraege.claim_id ist NOT NULL — kein faelle-Hop mehr.
  const { data: meineAuftraege } = await admin
    .from('auftraege')
    .select('claim_id')
    .eq('sv_id', sv.id)
    .eq('gutachten_final_freigegeben', true)

  const meineClaimIds = Array.from(
    new Set((meineAuftraege ?? []).map((a) => a.claim_id as string).filter(Boolean)),
  )

  if (meineClaimIds.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="w-full space-y-6">
          <PageHeader title="Meine Fälle" description="0 Fälle in Regulierung" icon={FolderIcon} />
          <EmptyState title="Noch keine Fälle in Regulierung." />
        </div>
      </div>
    )
  }

  // Schritt 2: kanzlei_faelle inkl. faelle-/lead-Anzeige-Daten via FK-Chain.
  // Eine Query statt drei — kanzlei_faelle.fall_id → faelle.id, faelle.lead_id → leads.id.
  let kanzleiQuery = admin
    .from('kanzlei_faelle')
    .select(
      'id, fall_id, claim_id, status, vs_kontakt_am, ausgezahlt_am, erstellt_am, ' +
        'faelle:faelle!fall_id(id, fall_nummer, schadens_ursache, schadens_datum, schadens_ort, lead_id, ' +
        'leads:leads!lead_id(id, vorname, nachname))',
    )
    .in('claim_id', meineClaimIds)
    .order('erstellt_am', { ascending: false })

  if (activeFilter !== 'alle') {
    kanzleiQuery = kanzleiQuery.eq('status', activeFilter)
  }

  const { data: kanzleiFaelleRaw } = await kanzleiQuery

  // Nested-FK-Normalisierung: Supabase liefert je nach Cardinality Array oder Objekt.
  type KanzleiRow = {
    id: string
    fall_id: string
    claim_id: string
    status: string
    vs_kontakt_am: string | null
    ausgezahlt_am: string | null
    erstellt_am: string
    faelle:
      | { id: string; fall_nummer: string | null; schadens_ursache: string | null; schadens_datum: string | null; schadens_ort: string | null; lead_id: string | null; leads: { id: string; vorname: string | null; nachname: string | null } | { id: string; vorname: string | null; nachname: string | null }[] | null }
      | null
  }
  const kanzleiList: KanzleiRow[] = ((kanzleiFaelleRaw ?? []) as unknown as KanzleiRow[]).map((k) => {
    const f = Array.isArray(k.faelle) ? (k.faelle[0] ?? null) : k.faelle
    if (f && f.leads) {
      f.leads = Array.isArray(f.leads) ? (f.leads[0] ?? null) : f.leads
    }
    return { ...k, faelle: f }
  })

  if (kanzleiList.length === 0) {
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

  // Freitextsuche über Fall-Nr / Kunde / Ort
  const needle = searchTerm.toLowerCase()
  const filtered = needle
    ? kanzleiList.filter((k) => {
        const f = k.faelle
        if (!f) return false
        const lead = (f.leads as { vorname: string | null; nachname: string | null } | null) ?? null
        const name = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim().toLowerCase() : ''
        return (
          (f.fall_nummer ?? '').toLowerCase().includes(needle) ||
          name.includes(needle) ||
          (f.schadens_ort ?? '').toLowerCase().includes(needle)
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
                    const f = k.faelle
                    if (!f) return null
                    const lead = (f.leads as { vorname: string | null; nachname: string | null } | null) ?? null
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
                            {f.fall_nummer ?? f.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-claimondo-navy">{name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <SchadensUrsacheBadge ursache={f.schadens_ursache} plain />
                        </td>
                        <td className="px-4 py-3 text-claimondo-ondo text-xs">
                          {f.schadens_ort ?? '—'}
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
                            ? new Date(k.erstellt_am as string).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
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
