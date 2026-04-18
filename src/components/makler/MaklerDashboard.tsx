// AAR-484 (M2): Makler-Dashboard-Komponente. Server-Component-kompatibel
// (keine Client-State-Abhängigkeit), rendert Greeting, Stat-Grid, Activity-
// Feed, Schnellaktionen und Tipp-des-Monats.

import Link from 'next/link'
import {
  QrCodeIcon,
  FolderOpenIcon,
  ReceiptIcon,
  UserPlusIcon,
  EuroIcon,
  TrendingUpIcon,
} from 'lucide-react'
import type { DashboardData } from '@/lib/makler/queries'

type Props = {
  makler: {
    id: string
    firma: string
    ansprechpartner_vorname: string
  }
  data: DashboardData
}

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const RELATIVE = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' })

function relativeFromNow(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const seconds = Math.round(diffMs / 1000)
  if (seconds < 60) return 'gerade eben'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return RELATIVE.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return RELATIVE.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 30) return RELATIVE.format(-days, 'day')
  const months = Math.round(days / 30)
  return RELATIVE.format(-months, 'month')
}

export function MaklerDashboard({ makler, data }: Props) {
  const { stats, activity } = data

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Greeting */}
      <header>
        <h1 className="text-2xl font-bold text-[#0D1B3E]">
          Hallo {makler.ansprechpartner_vorname} <span aria-hidden>👋</span>
        </h1>
        <p className="text-sm text-[#4573A2] mt-1">Ihre Makler-Übersicht</p>
      </header>

      {/* Stat-Grid */}
      <section
        aria-label="Kennzahlen"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard
          label="Offene Leads"
          value={String(stats.offeneLeads)}
          icon={<UserPlusIcon width={18} height={18} />}
        />
        <StatCard
          label="Aktive Akten"
          value={String(stats.aktiveAkten)}
          icon={<FolderOpenIcon width={18} height={18} />}
        />
        <StatCardProvisionen
          pending={stats.monatPending}
          freigegeben={stats.monatFreigegeben}
        />
        <StatCard
          label="Konversion"
          value={`${Math.round(stats.konversion * 100)}%`}
          icon={<TrendingUpIcon width={18} height={18} />}
          hint="Leads → Akten"
        />
      </section>

      {/* Activity + Schnellaktionen als 2-col auf Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section aria-label="Aktivität" className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-[#e4e7ef] p-6">
            <h2 className="text-base font-semibold text-[#0D1B3E] mb-4">
              Aktivität
            </h2>
            {activity.length === 0 ? (
              <p className="text-sm text-[#4573A2]">
                Noch keine Aktivität. Sobald Ihre ersten Leads oder Provisionen
                eintreffen, erscheinen sie hier.
              </p>
            ) : (
              <ul className="divide-y divide-[#e4e7ef]">
                {activity.map((a) => (
                  <li key={`${a.kind}-${a.id}`} className="py-3 flex items-start gap-3">
                    <ActivityBadge kind={a.kind} />
                    <div className="flex-1 min-w-0">
                      {a.kind === 'lead' ? (
                        <>
                          <p className="text-sm text-[#0D1B3E]">
                            {a.titel} <span className="text-[#4573A2]">— {a.status}</span>
                          </p>
                          <p className="text-xs text-[#4573A2] mt-0.5">
                            {relativeFromNow(a.timestamp)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-[#0D1B3E]">
                            Provision {EUR.format(a.betrag_netto_eur)}{' '}
                            <span className="text-[#4573A2]">— {a.status}</span>
                          </p>
                          <p className="text-xs text-[#4573A2] mt-0.5">
                            {relativeFromNow(a.timestamp)}
                          </p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-label="Schnellaktionen" className="space-y-4">
          <QuickAction
            href="/makler/promo"
            label="Promo-Code teilen"
            hint="QR-Code & Link zum Weitergeben"
            icon={<QrCodeIcon width={20} height={20} />}
          />
          <QuickAction
            href="/makler/akten"
            label="Aktive Akten"
            hint="Status Ihrer betreuten Fälle"
            icon={<FolderOpenIcon width={20} height={20} />}
          />
          <QuickAction
            href="/makler/abrechnungen"
            label="Abrechnungen"
            hint="Provisionen im Überblick"
            icon={<ReceiptIcon width={20} height={20} />}
          />
        </section>
      </div>

      {/* Tipp des Monats */}
      <section aria-label="Tipp des Monats">
        <div className="bg-[#0D1B3E] text-white rounded-2xl p-6 md:p-8">
          <p className="text-[11px] uppercase tracking-wider text-[#7BA3CC] mb-2">
            Tipp des Monats
          </p>
          <h3 className="text-lg font-semibold mb-2">
            QR-Code auf dem Beratungsgespräch zeigen
          </h3>
          <p className="text-sm text-[#7BA3CC] leading-relaxed">
            Erfahrungswerte zeigen: Makler die ihren persönlichen QR-Code
            direkt im Beratungsgespräch zeigen, erzeugen doppelt so viele
            Leads wie Makler die nur per E-Mail verteilen. Der QR führt
            direkt zum Schadenformular — Ihr Kontakt bleibt nachvollziehbar.
          </p>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string
  value: string
  icon: React.ReactNode
  hint?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#e4e7ef] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#4573A2]">{label}</span>
        <span className="text-[#4573A2]">{icon}</span>
      </div>
      <p className="text-2xl font-semibold text-[#0D1B3E]">{value}</p>
      {hint ? <p className="text-[11px] text-[#4573A2] mt-1">{hint}</p> : null}
    </div>
  )
}

function StatCardProvisionen({
  pending,
  freigegeben,
}: {
  pending: number
  freigegeben: number
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#e4e7ef] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#4573A2]">Provisionen diesen Monat</span>
        <span className="text-[#4573A2]">
          <EuroIcon width={18} height={18} />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-amber-600 mb-0.5">Ausstehend</p>
          <p className="text-lg font-semibold text-[#0D1B3E]">
            {EUR.format(pending)}
          </p>
        </div>
        <div>
          <p className="text-xs text-emerald-600 mb-0.5">Freigegeben</p>
          <p className="text-lg font-semibold text-[#0D1B3E]">
            {EUR.format(freigegeben)}
          </p>
        </div>
      </div>
    </div>
  )
}

function ActivityBadge({ kind }: { kind: 'lead' | 'provision' }) {
  const cfg =
    kind === 'lead'
      ? { label: 'Lead', bg: 'bg-[#4573A2]' }
      : { label: 'Provision', bg: 'bg-emerald-600' }
  return (
    <span
      className={`shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-white ${cfg.bg}`}
    >
      {cfg.label}
    </span>
  )
}

function QuickAction({
  href,
  label,
  hint,
  icon,
}: {
  href: string
  label: string
  hint: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-2xl border border-[#e4e7ef] p-4 hover:border-[#4573A2] transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-10 h-10 rounded-lg bg-[#f8f9fb] flex items-center justify-center text-[#0D1B3E]">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0D1B3E]">{label}</p>
          <p className="text-xs text-[#4573A2] mt-0.5">{hint}</p>
        </div>
      </div>
    </Link>
  )
}
