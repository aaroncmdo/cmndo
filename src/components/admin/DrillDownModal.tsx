'use client'

// AAR-781: Migriert auf Modal-Primitive.
import Link from 'next/link'
import { XIcon } from 'lucide-react'
import type { DrillDownItem } from '@/lib/analytics'
import { Modal } from '@/components/primitives'
import { Table, Thead, Tr, Th, Td } from '@/components/shared/DataTable'

export default function DrillDownModal({
  title,
  summe,
  berechnetAus,
  items,
  onClose,
}: {
  title: string
  summe?: number
  berechnetAus?: string
  items: DrillDownItem[]
  onClose: () => void
}) {
  const eur = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)

  return (
    <Modal open onClose={onClose} maxWidth={512} noPadding hideCloseButton>
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 64px)' }}>
        <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-claimondo-navy">{title}</h3>
            {summe != null && <p className="text-sm text-claimondo-ondo font-bold">{eur(summe)}</p>}
          </div>
          <button onClick={onClose} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-center text-claimondo-ondo/70 text-sm py-8">Keine Einträge</p>
          ) : (
            <Table className="!text-xs">
              <Thead className="sticky top-0 !normal-case !tracking-normal">
                <Tr className="border-b border-claimondo-border">
                  <Th className="!py-2 !font-normal text-left">Fall</Th>
                  <Th className="!py-2 !font-normal text-right">Betrag</Th>
                  <Th className="!py-2 !font-normal text-right">Datum</Th>
                </Tr>
              </Thead>
              <tbody>
                {items.map(item => (
                  <Tr key={item.id} className="border-b border-claimondo-border hover:bg-claimondo-bg">
                    <Td className="!py-2">
                      {item.link ? (
                        <Link href={item.link} className="text-claimondo-ondo hover:underline font-medium">{item.label}</Link>
                      ) : (
                        <span className="text-claimondo-navy">{item.label}</span>
                      )}
                      {item.sublabel && <span className="text-claimondo-ondo/70 ml-1">{item.sublabel}</span>}
                    </Td>
                    <Td className="!py-2 text-right tabular-nums font-medium">
                      {item.betrag != null ? eur(item.betrag) : '—'}
                    </Td>
                    <Td className="!py-2 text-right !text-claimondo-ondo">
                      {item.datum ? new Date(item.datum).toLocaleDateString('de-DE') : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        {berechnetAus && (
          <div className="px-4 py-2 border-t border-claimondo-border bg-claimondo-bg">
            <p className="text-[10px] text-claimondo-ondo/70">Berechnet aus: {berechnetAus}</p>
            <p className="text-[10px] text-claimondo-ondo/70">{items.length} Einträge</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
