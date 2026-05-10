'use client'

// AAR-781: Migriert auf Modal-Primitive.
import Link from 'next/link'
import { XIcon } from 'lucide-react'
import type { DrillDownItem } from '@/lib/analytics'
import { Modal } from '@/components/primitives'

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
            {summe != null && <p className="text-sm text-[#4573A2] font-bold">{eur(summe)}</p>}
          </div>
          <button onClick={onClose} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-center text-claimondo-ondo/70 text-sm py-8">Keine Einträge</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#f8f9fb]">
                <tr className="border-b border-claimondo-border">
                  <th className="text-left px-4 py-2 text-claimondo-ondo">Fall</th>
                  <th className="text-right px-4 py-2 text-claimondo-ondo">Betrag</th>
                  <th className="text-right px-4 py-2 text-claimondo-ondo">Datum</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-claimondo-border hover:bg-[#f8f9fb]">
                    <td className="px-4 py-2">
                      {item.link ? (
                        <Link href={item.link} className="text-claimondo-ondo hover:underline font-medium">{item.label}</Link>
                      ) : (
                        <span className="text-claimondo-navy">{item.label}</span>
                      )}
                      {item.sublabel && <span className="text-claimondo-ondo/70 ml-1">{item.sublabel}</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-claimondo-navy tabular-nums font-medium">
                      {item.betrag != null ? eur(item.betrag) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-claimondo-ondo">
                      {item.datum ? new Date(item.datum).toLocaleDateString('de-DE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {berechnetAus && (
          <div className="px-4 py-2 border-t border-claimondo-border bg-[#f8f9fb]">
            <p className="text-[10px] text-claimondo-ondo/70">Berechnet aus: {berechnetAus}</p>
            <p className="text-[10px] text-claimondo-ondo/70">{items.length} Einträge</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
