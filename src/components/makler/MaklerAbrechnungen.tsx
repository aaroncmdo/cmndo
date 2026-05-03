'use client'

// AAR-490 (M8): Abrechnungen-Client — 4 Summary-Cards, Monats-Navigator,
// Provisions-Tabelle mit Status-Badge + Hold-Countdown, CSV-Export.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useTransition } from 'react'
import {
  ReceiptIcon,
  CheckCircle2Icon,
  ClockIcon,
  XCircleIcon,
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  CalendarIcon,
  WalletIcon,
  TrendingUpIcon,
} from 'lucide-react'
import type {
  MaklerAbrechnungsData,
  MaklerProvisionRow,
  ProvisionStatus,
} from '@/lib/makler/queries'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const DATE_SHORT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const MONTH_LONG = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
})

function fmtEur(n: number): string {
  return EUR.format(n || 0)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return DATE_SHORT.format(new Date(iso))
}

function shiftMonth(monthIso: string, delta: number): string {
  const [y, m] = monthIso.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m - 1) + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function currentMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return MONTH_LONG.format(d)
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function statusVisual(row: MaklerProvisionRow): {
  label: string
  className: string
  icon: React.ReactNode
  tooltip?: string
} {
  const status: ProvisionStatus = row.status
  if (status === 'freigegeben') {
    return {
      label: 'Freigegeben',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      icon: <CheckCircle2Icon width={12} height={12} />,
    }
  }
  if (status === 'ausgezahlt') {
    return {
      label: 'Ausgezahlt',
      className: 'bg-[#f8f9fb] text-claimondo-ondo border border-claimondo-border',
      icon: <WalletIcon width={12} height={12} />,
    }
  }
  if (status === 'storniert') {
    return {
      label: 'Storniert',
      className: 'bg-red-50 text-red-700 border border-red-200',
      icon: <XCircleIcon width={12} height={12} />,
      tooltip: row.storno_grund ?? undefined,
    }
  }
  // pending
  const rest = daysUntil(row.hold_until)
  const label =
    rest === null
      ? 'Ausstehend'
      : rest === 0
        ? 'Freigabe in Kürze'
        : `Ausstehend (noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'})`
  return {
    label,
    className: 'bg-orange-50 text-orange-700 border border-orange-200',
    icon: <ClockIcon width={12} height={12} />,
  }
}

function exportCsv(rows: MaklerProvisionRow[], monthIso: string) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = 'Datum;Fallnummer;Kunde;Service;Betrag (EUR);Status;Grund'
  const body = rows
    .map((r) =>
      [
        r.trigger_at ? r.trigger_at.slice(0, 10) : '',
        r.fall_nummer ?? '',
        r.kunde_name ?? '',
        r.service_typ ?? '',
        Number(r.betrag_netto_eur ?? 0).toFixed(2),
        r.status,
        r.storno_grund ?? '',
      ]
        .map(escape)
        .join(';'),
    )
    .join('\n')
  const csv = '\uFEFF' + header + '\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `provisionen-${monthIso}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function MaklerAbrechnungen({ data }: { data: MaklerAbrechnungsData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const today = currentMonthIso()
  const currentMonth = data.currentMonth
  const canGoNext = currentMonth < today
  const monthLabel = formatMonthLabel(currentMonth)

  const rowsForMonth = useMemo(() => {
    // Für die Tabelle zeigen wir alle letzten 200 Einträge (Server-seitig
    // limitiert). Monats-Navigator ist primär für Summary-Cards relevant —
    // Tabelle rendert chronologisch absteigend.
    return data.provisionen
  }, [data.provisionen])

  function gotoMonth(delta: number) {
    const next = shiftMonth(currentMonth, delta)
    if (next > today) return
    startTransition(() => {
      router.push(`/makler/abrechnungen?month=${next}`)
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-claimondo-navy">
            Abrechnungen
          </h1>
          <p className="text-sm text-claimondo-ondo mt-0.5">
            Provisions-Historie, Monats-Übersicht und Auszahlungen
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportCsv(rowsForMonth, currentMonth)}
          disabled={rowsForMonth.length === 0}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-white border border-claimondo-border text-sm text-claimondo-navy hover:border-[#4573A2] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadIcon width={14} height={14} />
          CSV-Export
        </button>
      </header>

      {/* Summary-Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Ausstehend (Pending)"
          value={fmtEur(data.monthPending)}
          hint="Noch nicht freigegeben"
          icon={<ClockIcon width={18} height={18} />}
          tone="orange"
        />
        <SummaryCard
          label={`Freigegeben (${monthLabel})`}
          value={fmtEur(data.monthReleased)}
          hint="Kommt mit nächster Auszahlung"
          icon={<CheckCircle2Icon width={18} height={18} />}
          tone="green"
        />
        <SummaryCard
          label="Gesamt bisher"
          value={fmtEur(data.lifetimeTotal)}
          hint="Freigegeben + ausgezahlt"
          icon={<TrendingUpIcon width={18} height={18} />}
          tone="navy"
        />
        <SummaryCard
          label="Nächste Auszahlung"
          value={fmtDate(data.auszahlungNext)}
          hint={`${fmtEur(data.monthReleased)} per SEPA`}
          icon={<CalendarIcon width={18} height={18} />}
          tone="blue"
        />
      </section>

      {/* Monats-Navigator */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => gotoMonth(-1)}
          disabled={isPending}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-claimondo-border text-claimondo-navy hover:border-[#4573A2] disabled:opacity-50"
          aria-label="Vorheriger Monat"
        >
          <ChevronLeftIcon width={16} height={16} />
        </button>
        <div className="min-w-[160px] text-center text-sm font-semibold text-claimondo-navy">
          {monthLabel}
        </div>
        <button
          type="button"
          onClick={() => gotoMonth(1)}
          disabled={!canGoNext || isPending}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-claimondo-border text-claimondo-navy hover:border-[#4573A2] disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Nächster Monat"
        >
          <ChevronRightIcon width={16} height={16} />
        </button>
      </div>

      {/* Tabelle */}
      <section className="bg-white rounded-ios-md border border-claimondo-border overflow-hidden">
        <div className="px-5 py-4 border-b border-claimondo-border flex items-center gap-2">
          <ReceiptIcon width={16} height={16} className="text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">
            Provisions-Historie
          </h2>
          <span className="text-xs text-claimondo-shield ml-1">
            ({rowsForMonth.length})
          </span>
        </div>

        {rowsForMonth.length === 0 ? (
          <div className="p-10 text-center text-sm text-claimondo-ondo">
            <AlertCircleIcon
              width={24}
              height={24}
              className="mx-auto mb-2 text-claimondo-shield"
            />
            Noch keine Provisionen erfasst.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f9fb] text-xs uppercase tracking-wide text-claimondo-ondo">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Datum</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Fall</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Kunde</th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    Service
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Betrag
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rowsForMonth.map((row) => {
                  const vis = statusVisual(row)
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-claimondo-border hover:bg-[#f8f9fb]/60"
                    >
                      <td className="px-4 py-2.5 text-claimondo-navy whitespace-nowrap">
                        {fmtDate(row.trigger_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.fall_id ? (
                          <Link
                            href={`/makler/akten/${row.fall_id}`}
                            className="text-claimondo-ondo hover:text-claimondo-navy font-medium"
                          >
                            {row.fall_nummer ?? '–'}
                          </Link>
                        ) : (
                          <span className="text-claimondo-shield">
                            {row.fall_nummer ?? '–'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-claimondo-navy">
                        {row.kunde_name ?? '–'}
                      </td>
                      <td className="px-4 py-2.5 text-claimondo-navy capitalize">
                        {row.service_typ ?? '–'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-claimondo-navy whitespace-nowrap">
                        {fmtEur(Number(row.betrag_netto_eur))}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          title={vis.tooltip}
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${vis.className}`}
                        >
                          {vis.icon}
                          {vis.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  tone: 'orange' | 'green' | 'navy' | 'blue'
}) {
  const toneMap: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    orange: {
      bg: 'bg-orange-50',
      fg: 'text-orange-700',
      border: 'border-orange-200',
    },
    green: {
      bg: 'bg-emerald-50',
      fg: 'text-emerald-700',
      border: 'border-emerald-200',
    },
    navy: {
      bg: 'bg-claimondo-navy/5',
      fg: 'text-claimondo-navy',
      border: 'border-[#0D1B3E]/10',
    },
    blue: {
      bg: 'bg-[#f8f9fb]',
      fg: 'text-claimondo-ondo',
      border: 'border-claimondo-border',
    },
  }
  const c = toneMap[tone]
  return (
    <div className="bg-white rounded-ios-md border border-claimondo-border p-4">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${c.bg} ${c.fg} ${c.border} border`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium">
            {label}
          </p>
          <p className="text-lg md:text-xl font-bold text-claimondo-navy mt-0.5 truncate">
            {value}
          </p>
          <p className="text-[11px] text-claimondo-shield mt-0.5 truncate">{hint}</p>
        </div>
      </div>
    </div>
  )
}
