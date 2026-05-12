'use client'

// AAR-486 (M4): Makler-Akten-Liste — Filter-Chips, Tabelle/Karten, Consent-
// aware Click-Through. Filter wird als URL-Param gespiegelt (?filter=...) —
// useRouter.push() statt Link-Wrapper, damit Filter-Persistenz über
// Back-Button funktioniert.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FolderOpenIcon, LockIcon } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import EmptyState from '@/components/shared/EmptyState'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { FALL_STATUS_COLORS, FALL_STATUS_LABELS, FALL_STATUS_LABELS_SHORT } from '@/lib/statusLabels'
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

// AAR-frontend-konsolidierung-p1: Empty-State-Texte je Filter — gerendert über
// die shared EmptyState-Komponente (kein eigenes Card-Markup mehr).
const EMPTY_COPY: Record<AktenFilter, { heading: string; body: string }> = {
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
        <Chip variant={currentFilter === 'aktiv' ? 'selected' : 'default'} count={counts.aktiv} onClick={() => setFilter('aktiv')}>Aktiv</Chip>
        <Chip variant={currentFilter === 'abgeschlossen' ? 'selected' : 'default'} count={counts.abgeschlossen} onClick={() => setFilter('abgeschlossen')}>Abgeschlossen</Chip>
        <Chip variant={currentFilter === 'storniert' ? 'selected' : 'default'} count={counts.storniert} onClick={() => setFilter('storniert')}>Storniert</Chip>
      </div>

      {akten.length === 0 ? (
        <EmptyState
          icon={FolderOpenIcon}
          title={EMPTY_COPY[currentFilter].heading}
          description={EMPTY_COPY[currentFilter].body}
        />
      ) : (
        <div className="bg-white rounded-ios-md border border-claimondo-border overflow-hidden">
          {/* Desktop-Tabelle */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Akte</Th>
                  <Th>Kunde</Th>
                  <Th>Phase</Th>
                  <Th>SV-Termin</Th>
                  <Th>Schadenhöhe</Th>
                  <Th>Letzte Aktivität</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {akten.map((a) => (
                  <AkteRow
                    key={a.id}
                    akte={a}
                    onMinimalClick={() => setDrawerAkte(a)}
                  />
                ))}
              </Tbody>
            </Table>
          </div>

          {/* Mobile-Karten */}
          <ul className="md:hidden divide-y divide-claimondo-border">
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
    <Tr
      className={clickable ? 'hover:bg-claimondo-bg cursor-pointer' : 'opacity-80'}
      onClick={clickable ? handleClick : undefined}
    >
      <Td className="font-mono text-xs">
        {akte.fall_nummer ?? akte.id.slice(0, 8)}
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <span>{kundeName(akte)}</span>
          {akte.consent_scope === 'minimal' ? <MinimalBadge /> : null}
        </div>
        <p className="text-xs text-claimondo-ondo mt-0.5">{fahrzeugLabel(akte)}</p>
      </Td>
      <Td>
        <PhasePill akte={akte} />
      </Td>
      <Td className="!text-claimondo-ondo">{formatDate(akte.sv_termin)}</Td>
      <Td>
        {formatAmount(akte.schadens_hoehe_netto)}
      </Td>
      <Td className="!text-claimondo-ondo">
        {relativeFromNow(akte.updated_at ?? akte.created_at)}
      </Td>
      <Td className="text-right">
        {clickable ? <span className="text-claimondo-ondo text-xs">Öffnen →</span> : null}
      </Td>
    </Tr>
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
        <Link href={`/makler/akten/${akte.id}`} className="block hover:bg-claimondo-bg">
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
// Pills/Badges
// ─────────────────────────────────────────────────────────────────────────────

// AAR-frontend-konsolidierung-p1: Phase-Pill nutzt jetzt die zentralen Maps aus
// lib/statusLabels.ts (FALL_STATUS_COLORS + FALL_STATUS_LABELS_SHORT) statt einer
// lokalen Farb-/Label-Map — gleiche Status-Codes, harmonisierte Tints.
function PhasePill({ akte }: { akte: MaklerAkteRow }) {
  const keys = [akte.status, akte.aktuelle_phase].filter(Boolean) as string[]
  const matchKey = keys.find((k) => FALL_STATUS_COLORS[k]) ?? keys[0] ?? ''
  const color = FALL_STATUS_COLORS[matchKey] ?? 'bg-claimondo-bg text-claimondo-navy'
  const label =
    FALL_STATUS_LABELS_SHORT[matchKey] ?? FALL_STATUS_LABELS[matchKey] ?? matchKey
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${color}`}
    >
      {label}
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

// ─────────────────────────────────────────────────────────────────────────────
// Mini-Drawer
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
          className="w-full py-2 rounded-lg bg-claimondo-navy text-white text-sm font-medium hover:bg-claimondo-shield"
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
