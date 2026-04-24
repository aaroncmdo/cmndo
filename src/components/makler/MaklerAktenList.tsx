'use client'

// AAR-486 (M4): Makler-Akten-Liste — Filter-Chips, Tabelle/Karten, Consent-
// aware Click-Through. Filter wird als URL-Param gespiegelt (?filter=...) —
// useRouter.push() statt Link-Wrapper, damit Filter-Persistenz über
// Back-Button funktioniert.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FolderOpenIcon, LockIcon } from 'lucide-react'
import type { MaklerAkteRow, AktenFilter } from '@/lib/makler/queries'

type Props = {
  akten: MaklerAkteRow[]
  counts: Record<AktenFilter, number>
  currentFilter: AktenFilter
}

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const RELATIVE = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' })

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  return DATE.format(new Date(iso))
}

function formatAmount(v: number | null): string {
  if (v === null) return '–'
  return EUR.format(v)
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return '–'
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 1000 / 60)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return RELATIVE.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return RELATIVE.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 30) return RELATIVE.format(-days, 'day')
  const months = Math.round(days / 30)
  return RELATIVE.format(-months, 'month')
}

function kundeName(a: MaklerAkteRow): string {
  const parts = [a.kunde_vorname, a.kunde_nachname].filter(Boolean)
  return parts.length ? parts.join(' ') : '(unbekannt)'
}

function fahrzeugLabel(a: MaklerAkteRow): string {
  const parts = [a.fahrzeug_hersteller, a.fahrzeug_modell].filter(Boolean)
  return parts.length ? parts.join(' ') : '–'
}

export function MaklerAktenList({ akten, counts, currentFilter }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [drawerAkte, setDrawerAkte] = useState<MaklerAkteRow | null>(null)

  function setFilter(next: AktenFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'aktiv') params.delete('filter')
    else params.set('filter', next)
    const qs = params.toString()
    router.push(qs ? `/makler/akten?${qs}` : '/makler/akten')
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={currentFilter === 'aktiv'}
          onClick={() => setFilter('aktiv')}
          label="Aktiv"
          count={counts.aktiv}
        />
        <FilterChip
          active={currentFilter === 'abgeschlossen'}
          onClick={() => setFilter('abgeschlossen')}
          label="Abgeschlossen"
          count={counts.abgeschlossen}
        />
        <FilterChip
          active={currentFilter === 'storniert'}
          onClick={() => setFilter('storniert')}
          label="Storniert"
          count={counts.storniert}
        />
      </div>

      {akten.length === 0 ? (
        <EmptyState filter={currentFilter} />
      ) : (
        <div className="bg-white rounded-ios-md border border-claimondo-border overflow-hidden">
          {/* Desktop-Tabelle */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f9fb] text-left text-xs text-claimondo-ondo uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Akte</th>
                  <th className="px-4 py-3 font-medium">Kunde</th>
                  <th className="px-4 py-3 font-medium">Phase</th>
                  <th className="px-4 py-3 font-medium">SV-Termin</th>
                  <th className="px-4 py-3 font-medium">Schadenhöhe</th>
                  <th className="px-4 py-3 font-medium">Letzte Aktivität</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4e7ef]">
                {akten.map((a) => (
                  <AkteRow
                    key={a.id}
                    akte={a}
                    onMinimalClick={() => setDrawerAkte(a)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile-Karten */}
          <ul className="md:hidden divide-y divide-[#e4e7ef]">
            {akten.map((a) => (
              <AkteCard
                key={a.id}
                akte={a}
                onMinimalClick={() => setDrawerAkte(a)}
              />
            ))}
          </ul>
        </div>
      )}

      {drawerAkte ? (
        <MiniDrawer akte={drawerAkte} onClose={() => setDrawerAkte(null)} />
      ) : null}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row / Card
// ─────────────────────────────────────────────────────────────────────────────

function AkteRow({
  akte,
  onMinimalClick,
}: {
  akte: MaklerAkteRow
  onMinimalClick: () => void
}) {
  const router = useRouter()
  const clickable =
    akte.consent_scope === 'vollzugriff' || akte.consent_scope === 'minimal'

  function handleClick() {
    if (akte.consent_scope === 'vollzugriff') {
      router.push(`/makler/akten/${akte.id}`)
    } else if (akte.consent_scope === 'minimal') {
      onMinimalClick()
    }
  }

  return (
    <tr
      className={clickable ? 'hover:bg-[#f8f9fb] cursor-pointer' : 'opacity-80'}
      onClick={clickable ? handleClick : undefined}
    >
      <td className="px-4 py-3 font-mono text-xs text-claimondo-navy">
        {akte.fall_nummer ?? akte.id.slice(0, 8)}
      </td>
      <td className="px-4 py-3 text-claimondo-navy">
        <div className="flex items-center gap-2">
          <span>{kundeName(akte)}</span>
          {akte.consent_scope === 'minimal' ? <MinimalBadge /> : null}
        </div>
        <p className="text-xs text-claimondo-ondo mt-0.5">{fahrzeugLabel(akte)}</p>
      </td>
      <td className="px-4 py-3">
        <PhasePill akte={akte} />
      </td>
      <td className="px-4 py-3 text-claimondo-ondo">{formatDate(akte.sv_termin)}</td>
      <td className="px-4 py-3 text-claimondo-navy">
        {formatAmount(akte.schadens_hoehe_netto)}
      </td>
      <td className="px-4 py-3 text-claimondo-ondo">
        {relativeFromNow(akte.updated_at ?? akte.created_at)}
      </td>
      <td className="px-4 py-3 text-right">
        {clickable ? <span className="text-claimondo-ondo text-xs">Öffnen →</span> : null}
      </td>
    </tr>
  )
}

function AkteCard({
  akte,
  onMinimalClick,
}: {
  akte: MaklerAkteRow
  onMinimalClick: () => void
}) {
  const inner = (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-claimondo-ondo">
            {akte.fall_nummer ?? akte.id.slice(0, 8)}
          </p>
          <p className="text-sm font-semibold text-claimondo-navy truncate flex items-center gap-2">
            {kundeName(akte)}
            {akte.consent_scope === 'minimal' ? <MinimalBadge /> : null}
          </p>
          <p className="text-xs text-claimondo-ondo truncate">{fahrzeugLabel(akte)}</p>
        </div>
        <PhasePill akte={akte} />
      </div>
      <div className="flex items-center gap-2 text-xs text-claimondo-ondo flex-wrap">
        <span>SV: {formatDate(akte.sv_termin)}</span>
        <span aria-hidden>·</span>
        <span>{formatAmount(akte.schadens_hoehe_netto)}</span>
        <span aria-hidden>·</span>
        <span>{relativeFromNow(akte.updated_at ?? akte.created_at)}</span>
      </div>
    </div>
  )

  if (akte.consent_scope === 'vollzugriff') {
    return (
      <li>
        <Link href={`/makler/akten/${akte.id}`} className="block hover:bg-[#f8f9fb]">
          {inner}
        </Link>
      </li>
    )
  }
  if (akte.consent_scope === 'minimal') {
    return (
      <li>
        <button
          type="button"
          onClick={onMinimalClick}
          className="w-full text-left hover:bg-[#f8f9fb]"
        >
          {inner}
        </button>
      </li>
    )
  }
  return <li className="opacity-80">{inner}</li>
}

// ─────────────────────────────────────────────────────────────────────────────
// Pills/Badges
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ersterfassung: { bg: 'bg-[#f8f9fb]', text: 'text-claimondo-navy', label: 'Ersterfassung' },
  onboarding: { bg: 'bg-[#f8f9fb]', text: 'text-claimondo-navy', label: 'Onboarding' },
  'sv-gesucht': { bg: 'bg-claimondo-ondo/10', text: 'text-claimondo-navy', label: 'SV-Suche' },
  'sv-zugewiesen': { bg: 'bg-claimondo-ondo/10', text: 'text-claimondo-navy', label: 'SV zugewiesen' },
  'sv-termin': { bg: 'bg-claimondo-ondo/10', text: 'text-claimondo-navy', label: 'SV-Termin' },
  besichtigung: { bg: 'bg-claimondo-ondo/10', text: 'text-claimondo-navy', label: 'Besichtigung' },
  'begutachtung-laeuft': {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    label: 'Begutachtung',
  },
  'gutachten-eingegangen': {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    label: 'Gutachten da',
  },
  filmcheck: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Filmcheck' },
  'qc-pruefung': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'QC-Prüfung' },
  'kanzlei-uebergeben': {
    bg: 'bg-violet-100',
    text: 'text-violet-700',
    label: 'Kanzlei',
  },
  anschlussschreiben: {
    bg: 'bg-violet-100',
    text: 'text-violet-700',
    label: 'Anschlussschreiben',
  },
  regulierung: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Regulierung' },
  'regulierung-laeuft': {
    bg: 'bg-violet-100',
    text: 'text-violet-700',
    label: 'Regulierung',
  },
  'nachbesichtigung-laeuft': {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    label: 'Nachbesichtigung',
  },
  'vs-abgelehnt': { bg: 'bg-red-100', text: 'text-red-700', label: 'VS abgelehnt' },
  'zahlung-eingegangen': {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    label: 'Zahlung da',
  },
  abgeschlossen: {
    bg: 'bg-emerald-600/10',
    text: 'text-emerald-700',
    label: 'Abgeschlossen',
  },
  storniert: { bg: 'bg-red-100', text: 'text-red-700', label: 'Storniert' },
}

function PhasePill({ akte }: { akte: MaklerAkteRow }) {
  const key = akte.aktuelle_phase ?? akte.status
  const entry =
    PHASE_COLORS[akte.status] ??
    PHASE_COLORS[key] ?? { bg: 'bg-[#f8f9fb]', text: 'text-claimondo-navy', label: key }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${entry.bg} ${entry.text}`}
    >
      {entry.label}
    </span>
  )
}

function MinimalBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700"
      title="Minimal-Consent — nur Basis-Infos sichtbar"
    >
      <LockIcon width={10} height={10} />
      Minimal
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
// Mini-Drawer + Empty
// ─────────────────────────────────────────────────────────────────────────────

function MiniDrawer({
  akte,
  onClose,
}: {
  akte: MaklerAkteRow
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="akte-drawer-title"
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-ios-md w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="font-mono text-[11px] text-claimondo-ondo mb-1">
            {akte.fall_nummer ?? akte.id.slice(0, 8)}
          </p>
          <h2 id="akte-drawer-title" className="text-lg font-semibold text-claimondo-navy">
            {kundeName(akte)}
          </h2>
          <p className="text-xs text-claimondo-ondo mt-1">
            Minimal-Consent — Sie sehen nur Basis-Status. Für Vollzugriff bitte
            den Kunden erneut um Freigabe fragen.
          </p>
        </div>
        <dl className="text-sm space-y-2">
          <Row dt="Phase" dd={<PhasePill akte={akte} />} />
          <Row dt="Fahrzeug" dd={fahrzeugLabel(akte)} />
          <Row dt="SV-Termin" dd={formatDate(akte.sv_termin)} />
          <Row
            dt="Letzte Aktivität"
            dd={relativeFromNow(akte.updated_at ?? akte.created_at)}
          />
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

function Row({ dt, dd }: { dt: string; dd: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <dt className="text-claimondo-ondo">{dt}</dt>
      <dd className="text-claimondo-navy text-right">{dd}</dd>
    </div>
  )
}

function EmptyState({ filter }: { filter: AktenFilter }) {
  const copy: Record<AktenFilter, { heading: string; body: string }> = {
    aktiv: {
      heading: 'Keine aktiven Akten',
      body: 'Sobald Ihre Kunden in die Bearbeitung gehen, erscheinen sie hier.',
    },
    abgeschlossen: {
      heading: 'Noch keine abgeschlossenen Akten',
      body: 'Abgeschlossene Fälle werden hier archiviert.',
    },
    storniert: {
      heading: 'Keine stornierten Akten',
      body: 'Glück gehabt — keine Ihrer Akten ist storniert.',
    },
  }
  const c = copy[filter]
  return (
    <div className="bg-white rounded-ios-md border border-claimondo-border p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-[#f8f9fb] flex items-center justify-center text-claimondo-ondo mb-4">
        <FolderOpenIcon width={22} height={22} />
      </div>
      <h2 className="text-base font-semibold text-claimondo-navy mb-2">{c.heading}</h2>
      <p className="text-sm text-claimondo-ondo max-w-sm mx-auto">{c.body}</p>
    </div>
  )
}
