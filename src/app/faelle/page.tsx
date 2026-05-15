// Top-Level /faelle: rolle-aware Liste, gespeist aus `v_claim_listing`
// (claims-SSoT, CMM-Strecke). Detail-Route bleibt /faelle/[id].
//
// Vorher: /faelle (top-level) → 404 (Post-Merge-Audit von PR #1322 hat das
// gefunden, siehe `docs/15.05.2026/cluster-fg-pr2b-post-merge-audit.md`
// Finding #2). Die Hub-Liste lebt unter /admin/faelle/(hub) als Kanban.
// Diese Page hier ist die schmale, claim-source-getriebene Listen-Alternative
// für Direktzugriffe auf /faelle.
//
// Rollen:
//   - admin / dispatch         → alle Claims (nicht-storniert)
//   - kundenbetreuer (KB)      → eigene (`faelle_kundenbetreuer_id` ODER
//                                `claim_kundenbetreuer_id` = userId)
//   - kanzlei                  → service_typ='komplett' (analog zur RLS)
//   - Sonstige (kunde/sv/...)  → redirect via /faelle/layout.tsx

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import FallStatusBadge from '@/components/shared/FallStatusBadge'

export const dynamic = 'force-dynamic'

type ListingRow = {
  claim_id: string
  claim_nummer: string | null
  phase: string | null
  status: string | null
  schadentag: string | null
  kunden_konstellation: string | null
  created_at: string | null
  fall_id: string | null
  fall_nummer: string | null
  sv_id: string | null
  faelle_kundenbetreuer_id: string | null
  claim_kundenbetreuer_id: string | null
  service_typ: string | null
  kunde_anzeigename: string | null
  kunde_vorname: string | null
  kunde_nachname: string | null
  kennzeichen: string | null
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function kundenName(r: ListingRow): string {
  if (r.kunde_anzeigename && r.kunde_anzeigename.trim()) return r.kunde_anzeigename
  const vn = [r.kunde_vorname, r.kunde_nachname].filter(Boolean).join(' ').trim()
  return vn || '—'
}

export default async function FaelleListPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  // Layout (/faelle/layout.tsx) hat User-Existenz + Rolle bereits verifiziert
  // und unerlaubte Rollen wegredirected. Hier nur noch Rollen-Filter.
  const { data: profile } = user
    ? await supabase.from('profiles').select('rolle').eq('id', user.id).single()
    : { data: null }
  const rolle = profile?.rolle as string | undefined

  let query = supabase
    .from('v_claim_listing')
    .select(
      'claim_id, claim_nummer, phase, status, schadentag, kunden_konstellation, created_at, fall_id, fall_nummer, sv_id, faelle_kundenbetreuer_id, claim_kundenbetreuer_id, service_typ, kunde_anzeigename, kunde_vorname, kunde_nachname, kennzeichen',
    )
    .not('status', 'eq', 'storniert')
    .order('created_at', { ascending: false })
    .limit(200)

  if (rolle === 'kundenbetreuer' && user) {
    // KB sieht die ihm zugewiesenen Fälle. Sowohl faelle_kundenbetreuer_id
    // als auch claim_kundenbetreuer_id zählen (Sync-Trigger hält beide
    // konsistent, aber während des Cluster-Walks gibt es noch Drift).
    query = query.or(
      `faelle_kundenbetreuer_id.eq.${user.id},claim_kundenbetreuer_id.eq.${user.id}`,
    )
  } else if (rolle === 'kanzlei') {
    query = query.eq('service_typ', 'komplett')
  }

  const { data: rows, error } = await query
  const listing = (rows ?? []) as ListingRow[]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-claimondo-navy">Fälle</h1>
        <Link
          href="/admin/faelle"
          className="text-sm text-claimondo-ondo hover:underline"
        >
          Zur Kanban-Ansicht →
        </Link>
      </div>

      {error ? (
        <div className="rounded-ios-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Fehler beim Laden: {error.message}
        </div>
      ) : listing.length === 0 ? (
        <div className="rounded-ios-md border border-claimondo-border bg-white p-8 text-center text-sm text-claimondo-ondo">
          Keine Fälle gefunden.
        </div>
      ) : (
        <DataTableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Fall-Nr.</Th>
                <Th>Kunde</Th>
                <Th>Kennzeichen</Th>
                <Th>Status</Th>
                <Th>Phase</Th>
                <Th>Schadentag</Th>
                <Th>Erstellt</Th>
              </Tr>
            </Thead>
            <Tbody>
              {listing.map((r) => {
                const linkId = r.fall_id ?? r.claim_id
                return (
                  <Tr key={r.claim_id} className="hover:bg-claimondo-bg">
                    <Td className="font-medium">
                      <Link href={`/faelle/${linkId}`} className="hover:underline">
                        {r.fall_nummer ?? r.claim_nummer ?? '—'}
                      </Link>
                    </Td>
                    <Td>{kundenName(r)}</Td>
                    <Td>{r.kennzeichen ?? '—'}</Td>
                    <Td>
                      {r.status ? <FallStatusBadge status={r.status} /> : '—'}
                    </Td>
                    <Td className="text-xs">{r.phase ?? '—'}</Td>
                    <Td>{formatDate(r.schadentag)}</Td>
                    <Td>{formatDate(r.created_at)}</Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}

      <p className="mt-4 text-xs text-claimondo-ondo">
        Quelle: <code>v_claim_listing</code> (Single-Source <code>claims</code>).
        Detail-Ansicht: <code>/faelle/[id]</code>. Kanban: <code>/admin/faelle</code>.
        Zeige max. 200 Einträge.
      </p>
    </div>
  )
}
