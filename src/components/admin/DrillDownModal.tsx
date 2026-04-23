'use client'

import Link from 'next/link'
import { XIcon } from 'lucide-react'
import type { DrillDownItem } from '@/lib/analytics'

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
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-light border border-claimondo-border rounded-ios-lg max-w-lg w-full max-h-[80vh] flex flex-col shadow-ios-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {summe != null && <p className="text-sm text-[#4573A2] font-bold">{eur(summe)}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Keine Einträge</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="text-left px-4 py-2 text-gray-500">Fall</th>
                  <th className="text-right px-4 py-2 text-gray-500">Betrag</th>
                  <th className="text-right px-4 py-2 text-gray-500">Datum</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {item.link ? (
                        <Link href={item.link} className="text-[#4573A2] hover:underline font-medium">{item.label}</Link>
                      ) : (
                        <span className="text-gray-700">{item.label}</span>
                      )}
                      {item.sublabel && <span className="text-gray-400 ml-1">{item.sublabel}</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-800 tabular-nums font-medium">
                      {item.betrag != null ? eur(item.betrag) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {item.datum ? new Date(item.datum).toLocaleDateString('de-DE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {berechnetAus && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <p className="text-[10px] text-gray-400">Berechnet aus: {berechnetAus}</p>
            <p className="text-[10px] text-gray-400">{items.length} Einträge</p>
          </div>
        )}
      </div>
    </div>
  )
}
