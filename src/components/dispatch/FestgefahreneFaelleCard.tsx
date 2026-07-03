// Dispatch-Cockpit-Karte: festgefahrene Faelle (Aaron 03.07., Option B).
//
// Zeigt Claims mit verletzter SLA, die operativ haengen (kein Gutachter
// zugewiesen bzw. Termin unbestaetigt) — dedupliziert pro Claim, aeltester
// Breach zuerst. Jede Zeile verlinkt in die Dispatch-Lead-Maske
// (/dispatch/leads/[leadId]), wo das Team den naechsten Schritt ausloest.
// Datenquelle: ladeFestgefahreneFaelle(). Reine Server-Render-Komponente.

import Link from 'next/link'
import { AlertTriangleIcon, UserPlusIcon, ClockIcon } from 'lucide-react'
import type { FestgefahrenerFall } from '@/lib/sla/festgefahrene-faelle'

function seitLabel(tage: number): string {
  if (tage <= 0) return 'seit heute'
  return `seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`
}

export default function FestgefahreneFaelleCard({ items }: { items: FestgefahrenerFall[] }) {
  return (
    <div className="bg-white rounded-ios-lg shadow-claimondo-md border border-claimondo-navy/[0.06]">
      <div className="px-5 py-4 border-b border-claimondo-navy/[0.06] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-danger" />
          Festgefahrene Fälle
          <span className="ml-1 bg-danger-soft text-danger-strong text-[10px] font-bold px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </h2>
        <span className="text-xs text-claimondo-ondo/70">SLA verletzt</span>
      </div>
      <ul className="divide-y divide-claimondo-navy/[0.06] max-h-[360px] overflow-y-auto">
        {items.map((f) => {
          const kritisch = f.kind === 'kein_gutachter'
          const ActionIcon = kritisch ? UserPlusIcon : ClockIcon
          const row = (
            <div className="flex items-center gap-3 px-5 py-3 hover:bg-claimondo-navy/[0.03] transition-colors">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${kritisch ? 'bg-danger' : 'bg-warning'}`}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-claimondo-navy truncate">
                  {f.claimNummer}
                  <span className="font-normal text-claimondo-ondo"> · {f.kundeName}</span>
                </p>
                <p
                  className={`text-xs font-medium flex items-center gap-1 ${
                    kritisch ? 'text-danger-strong' : 'text-warning-strong'
                  }`}
                >
                  <ActionIcon className="w-3 h-3 shrink-0" />
                  {f.aktionLabel}
                </p>
              </div>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                  kritisch ? 'bg-danger-soft text-danger-strong' : 'bg-warning-soft text-warning-strong'
                }`}
              >
                {seitLabel(f.stuckSeitTagen)}
              </span>
            </div>
          )
          return (
            <li key={f.claimId}>
              {f.leadId ? (
                <Link href={`/dispatch/leads/${f.leadId}`} className="block">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
