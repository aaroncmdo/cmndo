'use client'

// AAR-836: Reparatur-Tab in der Admin-Fallakte
// Zeigt alle Repairs eines Claims: Werkstatt, Status, KV vs. Ist-Kosten

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  WrenchIcon,
  BuildingIcon,
  CalendarIcon,
  TrendingUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayCircleIcon,
} from 'lucide-react'
import { RepairStatusBadge } from '@/components/shared/repairs/RepairStatusBadge'
import { updateRepairStatus } from '@/lib/repairs/actions'
import type { RepairMitWerkstatt } from '@/lib/repairs/queries'
import { formatDatum } from '@/lib/format'
import { formatEURausEuro } from '@/lib/format/currency'

type Props = {
  fallId: string
  claimId: string | null
  repairs: RepairMitWerkstatt[]
}

function KostenVergleich({
  kv,
  ist,
}: {
  kv: number | null
  ist: number | null
}) {
  if (kv == null && ist == null) return null
  const diff = kv != null && ist != null ? ist - kv : null
  const diffPositiv = diff != null && diff > 0

  return (
    <div className="flex gap-4 text-xs">
      {kv != null && (
        <span className="flex items-center gap-1 text-[#4573A2]">
          <TrendingUpIcon className="w-3 h-3" />
          KV: {formatEURausEuro(kv)}
        </span>
      )}
      {ist != null && (
        <span className={`flex items-center gap-1 font-medium ${diffPositiv ? 'text-red-600' : 'text-emerald-600'}`}>
          Ist: {formatEURausEuro(ist)}
          {diff != null && (
            <span className="opacity-70">
              ({diffPositiv ? '+' : ''}{formatEURausEuro(diff)})
            </span>
          )}
        </span>
      )}
    </div>
  )
}

function RepairZeile({ r }: { r: RepairMitWerkstatt }) {
  const [expanded, setExpanded]      = useState(false)
  const [isPending, startTransition] = useTransition()

  const werkstattName = r.werkstaetten?.name ?? '—'

  function handleStatus(neuerStatus: 'in_arbeit' | 'abgeschlossen' | 'storniert') {
    startTransition(async () => {
      const res = await updateRepairStatus(r.id, neuerStatus, {
        tatsaechlicherBeginn: neuerStatus === 'in_arbeit'     ? new Date().toISOString() : undefined,
        abgeschlossenAm:      neuerStatus === 'abgeschlossen' ? new Date().toISOString() : undefined,
      })
      if (res.ok) {
        toast.success(`Reparatur auf „${neuerStatus}" gesetzt`)
      } else {
        toast.error(res.error ?? 'Fehler')
      }
    })
  }

  return (
    <div className="border border-[#E2E8F3] rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#f8f9fb] transition-colors text-left"
      >
        {expanded
          ? <ChevronDownIcon  className="w-4 h-4 text-[#4573A2] shrink-0" />
          : <ChevronRightIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
        }
        <WrenchIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
        <span className="flex-1 font-medium text-[#0D1B3E] text-sm">
          {r.auftragsnummer ? `# ${r.auftragsnummer}` : `Reparatur ${r.id.slice(0, 8)}`}
        </span>
        <RepairStatusBadge status={r.status} />
      </button>

      <div className="px-4 pb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#4573A2]">
        <span className="flex items-center gap-1">
          <BuildingIcon className="w-3 h-3" />
          {werkstattName}
          {r.werkstaetten?.partner && (
            <span className="ml-1 text-[10px] bg-[#4573A2]/10 text-[#4573A2] px-1.5 py-0.5 rounded-full">Partner</span>
          )}
        </span>
        {r.geplanter_beginn && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            {formatDatum(r.geplanter_beginn)}
          </span>
        )}
        <KostenVergleich kv={r.kostenvoranschlag} ist={r.tatsaechliche_kosten} />
      </div>

      {expanded && (
        <div className="border-t border-[#E2E8F3] px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[#7BA3CC] mb-0.5">Beginn geplant</p>
              <p className="text-[#0D1B3E]">{r.geplanter_beginn       ? formatDatum(r.geplanter_beginn)       : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[#7BA3CC] mb-0.5">Beginn tatsächlich</p>
              <p className="text-[#0D1B3E]">{r.tatsaechlicher_beginn  ? formatDatum(r.tatsaechlicher_beginn)  : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[#7BA3CC] mb-0.5">Abgeschlossen am</p>
              <p className="text-[#0D1B3E]">{r.abgeschlossen_am       ? formatDatum(r.abgeschlossen_am)       : '—'}</p>
            </div>
            {r.notiz && (
              <div className="col-span-2">
                <p className="text-xs text-[#7BA3CC] mb-0.5">Notiz</p>
                <p className="text-[#0D1B3E]">{r.notiz}</p>
              </div>
            )}
            {r.werkstaetten && (
              <div className="col-span-2">
                <p className="text-xs text-[#7BA3CC] mb-0.5">Werkstatt</p>
                <p className="text-[#0D1B3E]">
                  {r.werkstaetten.name}
                  {r.werkstaetten.adresse_ort && `, ${r.werkstaetten.adresse_ort}`}
                  {r.werkstaetten.telefon && ` · ${r.werkstaetten.telefon}`}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1 flex-wrap">
            {r.status === 'geplant' && (
              <button
                type="button"
                onClick={() => handleStatus('in_arbeit')}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium hover:bg-[#1a2d5a] disabled:opacity-50 transition-colors"
              >
                <PlayCircleIcon className="w-3.5 h-3.5" />
                Reparatur starten
              </button>
            )}
            {r.status === 'in_arbeit' && (
              <button
                type="button"
                onClick={() => handleStatus('abgeschlossen')}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                <CheckCircleIcon className="w-3.5 h-3.5" />
                Als abgeschlossen markieren
              </button>
            )}
            {(r.status === 'geplant' || r.status === 'in_arbeit') && (
              <button
                type="button"
                onClick={() => handleStatus('storniert')}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <XCircleIcon className="w-3.5 h-3.5" />
                Stornieren
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReparaturTab({ fallId, claimId, repairs }: Props) {
  if (!claimId) {
    return (
      <div className="text-sm text-[#7BA3CC] py-8 text-center">
        Kein Claim für diesen Fall angelegt.
      </div>
    )
  }

  const aktiv      = repairs.filter((r) => r.status !== 'storniert' && r.status !== 'abgeschlossen')
  const abgeschlossen = repairs.filter((r) => r.status === 'abgeschlossen')
  const storniert  = repairs.filter((r) => r.status === 'storniert')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#0D1B3E]">Reparaturen</h3>
          <p className="text-xs text-[#7BA3CC] mt-0.5">
            {repairs.length === 0 ? 'Noch keine Reparatur angelegt' : `${repairs.length} Reparatur${repairs.length !== 1 ? 'en' : ''}`}
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Reparatur anlegen — kommt in nächstem Sprint"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium opacity-40 cursor-not-allowed"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Reparatur anlegen
        </button>
      </div>

      {repairs.length === 0 ? (
        <div className="border-2 border-dashed border-[#E2E8F3] rounded-xl py-10 text-center text-sm text-[#7BA3CC]">
          Noch keine Reparatur für diesen Claim
        </div>
      ) : (
        <>
          {aktiv.length > 0 && (
            <div className="space-y-3">
              {aktiv.map((r) => <RepairZeile key={r.id} r={r} />)}
            </div>
          )}
          {abgeschlossen.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#7BA3CC] uppercase tracking-wide">Abgeschlossen</p>
              <div className="space-y-3">
                {abgeschlossen.map((r) => <RepairZeile key={r.id} r={r} />)}
              </div>
            </div>
          )}
          {storniert.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#7BA3CC] uppercase tracking-wide">Storniert</p>
              <div className="space-y-3 opacity-60">
                {storniert.map((r) => <RepairZeile key={r.id} r={r} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
