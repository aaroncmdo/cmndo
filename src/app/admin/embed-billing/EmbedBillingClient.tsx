'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import { stornoEmbedBilling, markBillingReviewClosed } from '@/lib/embed/billing-actions'

interface FaelligRow {
  anfrage_id: string
  kunde: string
  schadentyp: string | null
  sv_name: string
  betrag_netto: number
  termin_end_zeit: string | null
}
interface PendingRow {
  anfrage_id: string
  kunde: string
  schadentyp: string | null
  grund: string | null
  gemeldet_am: string | null
  sv_name: string
  bereits_abgerechnet: boolean
}
interface StorniertRow {
  anfrage_id: string
  kunde: string
  grund: string | null
  storniert_am: string | null
}

function fmtDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
}
function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
}
const GRUND_LABEL: Record<string, string> = {
  kunde_absage: 'Kunde hat abgesagt',
  kunde_no_show: 'Kunde nicht erschienen',
}

export function EmbedBillingClient({
  faellig,
  pending,
  storniert,
}: {
  faellig: FaelligRow[]
  pending: PendingRow[]
  storniert: StorniertRow[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function doStorno(anfrageId: string) {
    const grund = window.prompt('Storno-Grund (wird protokolliert):')
    if (grund === null) return
    if (!grund.trim()) {
      toast.error('Storno-Grund erforderlich')
      return
    }
    setBusyId(anfrageId)
    startTransition(async () => {
      const res = await stornoEmbedBilling(anfrageId, grund.trim())
      setBusyId(null)
      if (!res.ok) {
        toast.error(res.error ?? 'Storno fehlgeschlagen')
        return
      }
      if (res.warnung) toast.warning(res.warnung)
      else toast.success('Position storniert')
      router.refresh()
    })
  }

  function doReviewClose(anfrageId: string) {
    if (!window.confirm('Diese Meldung verwerfen und die 70 € DOCH berechnen?')) return
    setBusyId(anfrageId)
    startTransition(async () => {
      const res = await markBillingReviewClosed(anfrageId)
      setBusyId(null)
      if (!res.ok) {
        toast.error(res.error ?? 'Aktion fehlgeschlagen')
        return
      }
      toast.success('Review geschlossen — wird im naechsten Lauf berechnet')
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Embed-Billing"
        size="lg"
        description="Monika-Embed Variante B — Vermittlungsentgelt (70 € / durchgeführter Termin)"
      />

      {/* Review-Queue (pending) — oben, weil aktionsbedürftig */}
      <SectionCard>
        <h2 className="text-sm font-semibold text-claimondo-navy mb-1">
          Prüfung erforderlich ({pending.length})
        </h2>
        <p className="text-xs text-claimondo-ondo mb-3">
          Vom SV gemeldete Kunden-Gründe. Entscheide: stornieren (kein Entgelt) oder doch berechnen.
        </p>
        <DataTableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Kunde</Th>
                <Th>Gutachter</Th>
                <Th>Gemeldeter Grund</Th>
                <Th>Gemeldet am</Th>
                <Th>Abgerechnet?</Th>
                <Th>Aktion</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pending.map((r) => (
                <Tr key={r.anfrage_id}>
                  <Td>{r.kunde}</Td>
                  <Td>{r.sv_name}</Td>
                  <Td>{r.grund ? (GRUND_LABEL[r.grund] ?? r.grund) : '—'}</Td>
                  <Td>{fmtDatum(r.gemeldet_am)}</Td>
                  <Td>{r.bereits_abgerechnet ? 'Ja' : 'Nein'}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busyId === r.anfrage_id}
                        onClick={() => doStorno(r.anfrage_id)}
                      >
                        Stornieren
                      </Button>
                      <Button
                        variant="bare"
                        size="sm"
                        loading={busyId === r.anfrage_id}
                        onClick={() => doReviewClose(r.anfrage_id)}
                      >
                        Doch berechnen
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {pending.length === 0 && (
                <Tr>
                  <Td colSpan={6}>Keine offenen Prüfungen.</Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>
      </SectionCard>

      {/* Faellig-Vorschau */}
      <SectionCard>
        <h2 className="text-sm font-semibold text-claimondo-navy mb-1">
          Fällig (Vorschau Monatslauf) ({faellig.length})
        </h2>
        <p className="text-xs text-claimondo-ondo mb-3">
          Termin + 24h Karenz vorbei, verbindlich, SA unterschrieben. Wird zum Monatsende automatisch abgerechnet.
        </p>
        <DataTableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Kunde</Th>
                <Th>Schadentyp</Th>
                <Th>Gutachter</Th>
                <Th>Termin</Th>
                <Th>Betrag (netto)</Th>
                <Th>Aktion</Th>
              </Tr>
            </Thead>
            <Tbody>
              {faellig.map((r) => (
                <Tr key={r.anfrage_id}>
                  <Td>{r.kunde}</Td>
                  <Td>{r.schadentyp ?? '—'}</Td>
                  <Td>{r.sv_name}</Td>
                  <Td>{fmtDatum(r.termin_end_zeit)}</Td>
                  <Td>{fmtEuro(r.betrag_netto)}</Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busyId === r.anfrage_id}
                      onClick={() => doStorno(r.anfrage_id)}
                    >
                      Stornieren
                    </Button>
                  </Td>
                </Tr>
              ))}
              {faellig.length === 0 && (
                <Tr>
                  <Td colSpan={6}>Aktuell keine fälligen Positionen.</Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>
      </SectionCard>

      {/* Storniert (Historie) */}
      <SectionCard>
        <h2 className="text-sm font-semibold text-claimondo-navy mb-1">
          Storniert ({storniert.length})
        </h2>
        <DataTableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Kunde</Th>
                <Th>Grund</Th>
                <Th>Storniert am</Th>
              </Tr>
            </Thead>
            <Tbody>
              {storniert.map((r) => (
                <Tr key={r.anfrage_id}>
                  <Td>{r.kunde}</Td>
                  <Td>{r.grund ?? '—'}</Td>
                  <Td>{fmtDatum(r.storniert_am)}</Td>
                </Tr>
              ))}
              {storniert.length === 0 && (
                <Tr>
                  <Td colSpan={3}>Noch nichts storniert.</Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>
      </SectionCard>
    </div>
  )
}
