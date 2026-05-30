// AAR-939 · Monika-Embed · Stream 7 — SV-Lead-Inbox.
//
// Liest aus der View v_sv_inbox (spaltenreduziert, Owner-Scope ueber
// embed_site_id → embed_sites.inhaber_profile_id — NICHT zugeordneter_sv_id,
// die ist bei sv_embed immer NULL). gclid/utm bleiben in der View aussen vor.
// v_sv_inbox fehlt (wie embed_sites) in database.types.ts → Cast-Idiom.

import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Badge } from '@/components/primitives'
import { Chip, ChipRow } from '@/components/ui/Chip'
import { InboxIcon } from 'lucide-react'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

interface InboxRow {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  schadentyp: string | null
  wunschtermin_wann: string | null
  status: string | null
  variante: string | null
  site_name: string | null
  abrechnungs_relevant: boolean | null
  abrechnungs_betrag_eur: number | null
  erstellt_am: string
}

function statusTone(status: string | null): 'neutral' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'termin_bestaetigt':
    case 'abgeschlossen':
      return 'success'
    case 'storniert':
    case 'abgelehnt':
      return 'warning'
    case 'neu':
    case 'in_bearbeitung':
    case 'sv_kontaktiert':
      return 'info'
    default:
      return 'neutral'
  }
}

const VARIANTE_FILTER = [
  { value: '', label: 'Alle' },
  { value: 'B', label: 'Variante B' },
  { value: 'A', label: 'Variante A' },
]

export default async function SVPortalAnfragen({
  searchParams,
}: {
  searchParams: Promise<{ variante?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('v_sv_inbox')
    .select(
      'id, vorname, nachname, telefon, schadentyp, wunschtermin_wann, status, variante, site_name, abrechnungs_relevant, abrechnungs_betrag_eur, erstellt_am',
    )
    .order('erstellt_am', { ascending: false })
    .limit(200)

  if (params.variante === 'A' || params.variante === 'B') {
    query = query.eq('variante', params.variante)
  }

  const { data } = await query
  const rows = (data ?? []) as InboxRow[]
  const active = params.variante ?? ''

  return (
    <div className="py-6 space-y-4">
      <PageHeader
        title="Anfragen"
        size="lg"
        actions={<span className="text-sm text-claimondo-ondo">{rows.length} Anfragen</span>}
      />

      <ChipRow>
        {VARIANTE_FILTER.map((f) => (
          <Chip
            key={f.value || 'alle'}
            href={f.value ? `/sv-portal/anfragen?variante=${f.value}` : '/sv-portal/anfragen'}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              active === f.value
                ? 'bg-claimondo-navy text-white'
                : 'bg-white border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg'
            }`}
          >
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      {rows.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Noch keine Anfragen"
          description="Sobald über dein Widget eine Anfrage eingeht, erscheint sie hier."
        />
      ) : (
        <DataTableContainer variant="card">
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Telefon</Th>
                <Th>Schadentyp</Th>
                <Th>Wunschtermin</Th>
                <Th>Quelle</Th>
                <Th>Status</Th>
                <Th>Eingegangen</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>{[r.vorname, r.nachname].filter(Boolean).join(' ') || '—'}</Td>
                  <Td>{r.telefon ?? '—'}</Td>
                  <Td>{r.schadentyp ?? '—'}</Td>
                  <Td>{r.wunschtermin_wann ?? '—'}</Td>
                  <Td>{r.site_name ?? '—'}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={statusTone(r.status)}>{r.status ?? '—'}</Badge>
                      {r.variante === 'B' && r.abrechnungs_relevant && (
                        <Badge tone="ondo">
                          {(r.abrechnungs_betrag_eur ?? 70).toFixed(0)} €
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>{new Date(r.erstellt_am).toLocaleDateString('de-DE')}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}
    </div>
  )
}
