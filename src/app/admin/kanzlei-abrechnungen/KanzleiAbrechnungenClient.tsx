'use client'

// Task-11: Kanzlei-Abrechnungen mit per-Kanzlei Billing-Drawer.
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ReceiptIcon } from 'lucide-react'
import { Button, CloseButton } from '@/components/primitives'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { PartnerBillingPanel } from '@/components/shared/finance/PartnerBillingPanel'
import { ladePartnerBilling } from '@/lib/finance/partner-billing-actions'
import type { PartnerBillingRow, PartnerBillingAggregat } from '@/lib/finance/partner-billing'

export type AbrechnungRow = {
  id: string
  rechnungsnummer: string
  abrechnungsmonat: number
  abrechnungsjahr: number
  kanzlei_id: string | null
  kanzlei_name: string
  anzahl_vollmachten: number
  endbetrag_brutto: number
  status: string
  faelligkeitsdatum: string | null
  bezahlt_am: string | null
  versendet_am: string | null
}

type DrawerData = {
  rows: PartnerBillingRow[]
  aggregat: PartnerBillingAggregat
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    offen: { label: 'Offen', cls: 'bg-warning-soft text-warning-strong' },
    versendet: { label: 'Versendet', cls: 'bg-claimondo-bg text-claimondo-navy' },
    bezahlt: { label: 'Bezahlt', cls: 'bg-success-soft text-success-strong' },
    ueberfaellig: { label: 'Überfällig', cls: 'bg-danger-soft text-danger-strong' },
    storniert: { label: 'Storniert', cls: 'bg-claimondo-bg text-claimondo-ondo' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-claimondo-bg text-claimondo-ondo' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

export default function KanzleiAbrechnungenClient({ rows }: { rows: AbrechnungRow[] }) {
  const [openKanzleiId, setOpenKanzleiId] = useState<string | null>(null)
  const [openKanzleiName, setOpenKanzleiName] = useState<string>('')
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null)
  const [drawerPending, startDrawerTransition] = useTransition()

  function openBillingDrawer(row: AbrechnungRow) {
    if (!row.kanzlei_id) {
      toast.error('Keine Kanzlei-ID für diese Abrechnung')
      return
    }
    setDrawerData(null)
    setOpenKanzleiId(row.kanzlei_id)
    setOpenKanzleiName(row.kanzlei_name)
    startDrawerTransition(async () => {
      const r = await ladePartnerBilling('kanzlei', row.kanzlei_id!)
      if (r.ok) {
        setDrawerData({ rows: r.rows, aggregat: r.aggregat })
      } else {
        toast.error(r.error)
        setOpenKanzleiId(null)
      }
    })
  }

  function closeDrawer() {
    setOpenKanzleiId(null)
    setDrawerData(null)
  }

  return (
    <>
      <DataTableContainer variant="plain" className="bg-white rounded-ios-xl shadow-sm overflow-hidden border">
        <Table>
          <Thead className="text-sm normal-case !tracking-normal border-b">
            <Tr>
              <Th className="text-left font-semibold text-claimondo-ondo">Rechnungsnummer</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Monat</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Kanzlei</Th>
              <Th className="text-right font-semibold text-claimondo-ondo">Vollmachten</Th>
              <Th className="text-right font-semibold text-claimondo-ondo">Betrag (brutto)</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Status</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Fälligkeit</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Bezahlt am</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Details</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <Td colSpan={9} className="py-8 text-center !text-claimondo-ondo/70">
                  Keine Abrechnungen vorhanden
                </Td>
              </Tr>
            )}
            {rows.map((row) => {
              const monatName = new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(
                new Date(row.abrechnungsjahr, row.abrechnungsmonat - 1, 1),
              )
              return (
                <Tr key={row.id} className="hover:bg-claimondo-bg transition-colors">
                  <Td className="font-mono text-xs">{row.rechnungsnummer}</Td>
                  <Td>{monatName} {row.abrechnungsjahr}</Td>
                  <Td className="font-medium">{row.kanzlei_name}</Td>
                  <Td className="text-right">{row.anzahl_vollmachten}</Td>
                  <Td className="text-right font-semibold">
                    {row.endbetrag_brutto.toFixed(2).replace('.', ',')} €
                  </Td>
                  <Td><StatusBadge status={row.status} /></Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {row.faelligkeitsdatum
                      ? new Date(row.faelligkeitsdatum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
                      : '—'}
                  </Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {row.bezahlt_am
                      ? new Date(row.bezahlt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
                      : '—'}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={drawerPending && openKanzleiId === row.kanzlei_id}
                      onClick={() => openBillingDrawer(row)}
                      iconLeft={<ReceiptIcon className="w-4 h-4" />}
                    >
                      Abrechnung
                    </Button>
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      </DataTableContainer>

      {/* Billing-Drawer */}
      {openKanzleiId && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-claimondo-navy/40"
          onClick={closeDrawer}
        >
          <div
            className="relative w-full max-w-3xl bg-white h-full overflow-y-auto p-6 rounded-l-ios-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <CloseButton onPress={closeDrawer} />
            <h2 className="text-claimondo-navy font-semibold text-lg mb-6 pr-12">
              {openKanzleiName} — Abrechnung
            </h2>
            {drawerPending && !drawerData && (
              <p className="text-claimondo-ondo text-sm">Wird geladen…</p>
            )}
            {drawerData && (
              <PartnerBillingPanel
                rows={drawerData.rows}
                aggregat={drawerData.aggregat}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
