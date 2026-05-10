'use client'

// AAR-485 (M3): Makler-Leads-Tabelle mit Filter-Chips und Consent-gesteuerter
// Click-Through-Logik. Design-Tokens: Claimondo Navy/Ondo-Blue/Shield.
//
// Click-Through-Matrix (per consent_label):
//   vollzugriff    → Link auf /makler/akten/{fall_id}
//   minimal        → Mini-Drawer mit Basis-Infos (kein Voll-Zugriff)
//   widerrufen     → kein Click (Consent wurde entzogen)
//   kein_account   → kein Click (Kunde hat noch keinen Fall angelegt)

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserPlusIcon } from 'lucide-react'
import type { MaklerLeadRow, ConsentLabel } from '@/lib/makler/queries'

type FilterKey = 'alle' | 'offen' | 'konvertiert' | 'disqualifiziert'

type Props = {
  leads: MaklerLeadRow[]
}

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  return DATE.format(new Date(iso))
}

function fahrzeugLabel(lead: MaklerLeadRow): string {
  const parts = [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean)
  return parts.length ? parts.join(' ') : '–'
}

function nameLabel(lead: MaklerLeadRow): string {
  const parts = [lead.vorname, lead.nachname].filter(Boolean)
  return parts.length ? parts.join(' ') : '(Name unbekannt)'
}

export function MaklerLeadsTable({ leads }: Props) {
  const [filter, setFilter] = useState<FilterKey>('alle')
  const [drawerLead, setDrawerLead] = useState<MaklerLeadRow | null>(null)

  const counts = useMemo(() => {
    const alle = leads.length
    const konvertiert = leads.filter((l) => l.fall_id !== null).length
    const disqualifiziert = leads.filter((l) => l.disqualifiziert).length
    const offen = alle - konvertiert - disqualifiziert
    return { alle, offen, konvertiert, disqualifiziert }
  }, [leads])

  const filtered = useMemo(() => {
    switch (filter) {
      case 'offen':
        return leads.filter((l) => !l.fall_id && !l.disqualifiziert)
      case 'konvertiert':
        return leads.filter((l) => l.fall_id !== null)
      case 'disqualifiziert':
        return leads.filter((l) => l.disqualifiziert)
      default:
        return leads
    }
  }, [leads, filter])

  if (leads.length === 0) {
    return <EmptyState />
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === 'alle'}
          onClick={() => setFilter('alle')}
          label="Alle"
          count={counts.alle}
        />
        <FilterChip
          active={filter === 'offen'}
          onClick={() => setFilter('offen')}
          label="Offen"
          count={counts.offen}
        />
        <FilterChip
          active={filter === 'konvertiert'}
          onClick={() => setFilter('konvertiert')}
          label="Konvertiert"
          count={counts.konvertiert}
        />
        <FilterChip
          active={filter === 'disqualifiziert'}
          onClick={() => setFilter('disqualifiziert')}
          label="Disqualifiziert"
          count={counts.disqualifiziert}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-claimondo-ondo py-8 text-center">
          Keine Leads in dieser Kategorie.
        </p>
      ) : (
        <div className="bg-white rounded-ios-md border border-claimondo-border overflow-hidden">
          {/* Desktop-Tabelle */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f9fb] text-left text-xs text-claimondo-ondo uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Fahrzeug</th>
                  <th className="px-4 py-3 font-medium">Unfalldatum</th>
                  <th className="px-4 py-3 font-medium">Eingang</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Consent</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-claimondo-border">
                {filtered.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    onMinimalClick={() => setDrawerLead(lead)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile-Karten */}
          <ul className="md:hidden divide-y divide-claimondo-border">
            {filtered.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onMinimalClick={() => setDrawerLead(lead)}
              />
            ))}
          </ul>
        </div>
      )}

      {drawerLead ? (
        <MiniDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} />
      ) : null}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row + Card
// ─────────────────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  onMinimalClick,
}: {
  lead: MaklerLeadRow
  onMinimalClick: () => void
}) {
  const router = useRouter()
  const clickable = lead.consent_label === 'vollzugriff' || lead.consent_label === 'minimal'

  const rowClass = clickable
    ? 'hover:bg-claimondo-bg cursor-pointer'
    : 'opacity-80'

  function handleClick() {
    if (lead.consent_label === 'vollzugriff' && lead.fall_id) {
      router.push(`/makler/akten/${lead.fall_id}`)
    } else if (lead.consent_label === 'minimal') {
      onMinimalClick()
    }
  }

  return (
    <tr className={rowClass} onClick={clickable ? handleClick : undefined}>
      <td className="px-4 py-3 text-claimondo-navy">{nameLabel(lead)}</td>
      <td className="px-4 py-3 text-claimondo-ondo">{fahrzeugLabel(lead)}</td>
      <td className="px-4 py-3 text-claimondo-ondo">{formatDate(lead.unfalldatum)}</td>
      <td className="px-4 py-3 text-claimondo-ondo">{formatDate(lead.created_at)}</td>
      <td className="px-4 py-3">
        <StatusPill status={lead.status} disqualifiziert={lead.disqualifiziert} />
      </td>
      <td className="px-4 py-3">
        <ConsentBadge label={lead.consent_label} />
      </td>
      <td className="px-4 py-3 text-right">
        {clickable ? <span className="text-claimondo-ondo text-xs">Öffnen →</span> : null}
      </td>
    </tr>
  )
}

function LeadCard({
  lead,
  onMinimalClick,
}: {
  lead: MaklerLeadRow
  onMinimalClick: () => void
}) {
  const inner = (
    <div className="p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-claimondo-navy truncate">
            {nameLabel(lead)}
          </p>
          <p className="text-xs text-claimondo-ondo truncate">{fahrzeugLabel(lead)}</p>
        </div>
        <ConsentBadge label={lead.consent_label} />
      </div>
      <div className="flex items-center gap-2 text-xs text-claimondo-ondo">
        <span>Unfall: {formatDate(lead.unfalldatum)}</span>
        <span aria-hidden>·</span>
        <span>Eingang: {formatDate(lead.created_at)}</span>
      </div>
      <div>
        <StatusPill status={lead.status} disqualifiziert={lead.disqualifiziert} />
      </div>
    </div>
  )

  if (lead.consent_label === 'vollzugriff' && lead.fall_id) {
    return (
      <li>
        <Link
          href={`/makler/akten/${lead.fall_id}`}
          className="block hover:bg-claimondo-bg"
        >
          {inner}
        </Link>
      </li>
    )
  }

  if (lead.consent_label === 'minimal') {
    return (
      <li>
        <button
          type="button"
          onClick={onMinimalClick}
          className="w-full text-left hover:bg-claimondo-bg"
        >
          {inner}
        </button>
      </li>
    )
  }

  return <li className="opacity-80">{inner}</li>
}

// ─────────────────────────────────────────────────────────────────────────────
// Badges, Pills
// ─────────────────────────────────────────────────────────────────────────────

function StatusPill({
  status,
  disqualifiziert,
}: {
  status: string
  disqualifiziert: boolean | null
}) {
  if (disqualifiziert) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#f8f9fb] text-claimondo-ondo">
        disqualifiziert
      </span>
    )
  }
  const cfg: Record<string, { bg: string; text: string }> = {
    neu: { bg: 'bg-claimondo-ondo/10', text: 'text-claimondo-navy' },
    qualifiziert: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    konvertiert: { bg: 'bg-emerald-600/10', text: 'text-emerald-700' },
  }
  const entry = cfg[status] ?? { bg: 'bg-[#f8f9fb]', text: 'text-claimondo-navy' }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${entry.bg} ${entry.text}`}
    >
      {status}
    </span>
  )
}

function ConsentBadge({ label }: { label: ConsentLabel }) {
  const cfg: Record<ConsentLabel, { bg: string; text: string; label: string }> = {
    vollzugriff: {
      bg: 'bg-emerald-600/10',
      text: 'text-emerald-700',
      label: 'Vollzugriff',
    },
    minimal: {
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      label: 'Minimal',
    },
    widerrufen: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      label: 'Widerrufen',
    },
    kein_account: {
      bg: 'bg-[#f8f9fb]',
      text: 'text-claimondo-ondo',
      label: 'Kein Account',
    },
  }
  const entry = cfg[label]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${entry.bg} ${entry.text}`}
    >
      {entry.label}
    </span>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-claimondo-navy text-white'
          : 'bg-white text-claimondo-ondo border border-claimondo-border hover:border-claimondo-ondo'
      }`}
    >
      {label}
      <span className={`ml-1.5 ${active ? 'text-claimondo-shield' : 'text-claimondo-navy'}`}>
        {count}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini-Drawer (minimal-Consent)
// ─────────────────────────────────────────────────────────────────────────────

function MiniDrawer({
  lead,
  onClose,
}: {
  lead: MaklerLeadRow
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mini-drawer-title"
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-ios-md w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="mini-drawer-title" className="text-lg font-semibold text-claimondo-navy">
            {nameLabel(lead)}
          </h2>
          <p className="text-xs text-claimondo-ondo mt-1">
            Minimal-Consent — Sie sehen nur Basis-Infos ohne Fall-Zugriff.
          </p>
        </div>
        <dl className="text-sm space-y-2">
          <Row dt="Fahrzeug" dd={fahrzeugLabel(lead)} />
          <Row dt="Unfalldatum" dd={formatDate(lead.unfalldatum)} />
          <Row dt="Eingang" dd={formatDate(lead.created_at)} />
          <Row dt="Status" dd={lead.status} />
          <Row dt="Service" dd={lead.fall_service_typ ?? '–'} />
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-lg bg-claimondo-navy text-white text-sm font-medium hover:bg-[#1E3A5F]"
        >
          Schließen
        </button>
      </div>
    </div>
  )
}

function Row({ dt, dd }: { dt: string; dd: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-claimondo-ondo">{dt}</dt>
      <dd className="text-claimondo-navy text-right">{dd}</dd>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty-State
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="bg-white rounded-ios-md border border-claimondo-border p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-[#f8f9fb] flex items-center justify-center text-claimondo-ondo mb-4">
        <UserPlusIcon width={22} height={22} />
      </div>
      <h2 className="text-base font-semibold text-claimondo-navy mb-2">
        Noch keine Leads
      </h2>
      <p className="text-sm text-claimondo-ondo mb-4 max-w-sm mx-auto">
        Sobald Kunden über Ihren Promo-Code einen Schaden melden, erscheinen sie
        hier. Teilen Sie Ihren QR-Code, um den ersten Lead zu erzeugen.
      </p>
      <Link
        href="/makler/promo"
        className="inline-block px-4 py-2 rounded-lg bg-claimondo-navy text-white text-sm font-medium hover:bg-[#1E3A5F]"
      >
        Promo-Code teilen
      </Link>
    </div>
  )
}
