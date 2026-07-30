'use client'

// Werkstatt-Portal „Aufträge": schlanke Liste mit 2 Segmenten (Reparatur-Aufträge /
// Meine Vermittlungen) + Typ-Badge (Selbstzahler/Haftpflicht/Kasko). Klick auf eine
// Zeile öffnet die Detailseite /werkstatt/auftraege/[claimId] — dort leben Termin-
// Aktionen, Gutachten und Kunden-Flow. Quelle: v_werkstatt_auftrag (RLS-gegatet).

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
// Lucide statt Heroicons, weil PageHeader/EmptyState `icon` als LucideIcon typen
// (gleiche Wahl wie makler/akten FolderIcon + admin/werkstaetten WrenchIcon).
import { WrenchIcon } from 'lucide-react'

import type { WerkstattAuftrag } from '@/lib/werkstatt/queries'
import {
  werkstattAuftragPhase,
  WERKSTATT_PHASE_ORDER,
  WERKSTATT_PHASE_META,
  operativeStatusLabel,
} from '@/lib/werkstatt/werkstatt-auftrag-phase'
import {
  werkstattAuftragSegment,
  abrechnungswegLabel,
  zeigtGutachten,
  quelleLabel,
  zaehleSegmente,
  kvaStatus,
} from '@/lib/werkstatt/werkstatt-auftrag-segment'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { getPartnerProvisionStatusLabel } from '@/lib/statusLabels'

import {
  Table,
  Thead,
  Tbody,
  Tr,
  ClickableTr,
  Th,
  Td,
  DataTableContainer,
} from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Chip, ChipRow } from '@/components/ui/Chip'

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function fahrzeugText(a: WerkstattAuftrag): string {
  const parts = [a.fahrzeug_hersteller, a.fahrzeug_modell].filter(Boolean)
  return parts.length ? parts.join(' ') : '–'
}

/** Kurzdatum (TT.MM.JJJJ, Berlin) oder „–" wenn kein ISO-String. */
function kurzDatum(iso: string | null): string {
  return iso ? formatBerlin(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'
}

type Props = {
  auftraege: WerkstattAuftrag[]
  werkstattName: string
}

type Segment = 'reparatur' | 'vermittlung'

// ─── Segment-spezifische Zeilen ──────────────────────────────────────────────
// Reparatur-Auftrag (ich repariere): Kunde + Fahrzeug + Reparatur-Status + Termin.
// Jede Zeile führt mit Kunde + Phasen-Badge, sodass ein früher Fall (noch kein
// Fahrzeug/Termin) als „Kunde + Ersterfassung" intentional liest — nicht kaputt.

function ReparaturZeile({ a, onClick }: { a: WerkstattAuftrag; onClick: () => void }) {
  const phase = werkstattAuftragPhase(a)
  const opLabel = operativeStatusLabel(a.operative_status)
  const typ = abrechnungswegLabel(a.abrechnungsweg)
  const kva = kvaStatus(a)
  // Haftpflicht (SV-Gutachten-Route): der abgemachte Besichtigungstermin + Gutachter.
  // Kasko/Selbstzahler (KVA-Route): der Reparaturtermin. (Aaron 09.07.)
  const istGutachtenWeg = zeigtGutachten(a.abrechnungsweg)
  const terminIso = istGutachtenWeg
    ? a.besichtigung_start
    : (a.reparatur_bestaetigter_termin ?? a.reparatur_wunschtermin)
  return (
    <ClickableTr onClick={onClick}>
      <Td>
        <div className="text-claimondo-navy font-medium">{a.claim_nummer ?? '–'}</div>
        {typ && <StatusBadge tone="neutral" size="xs">{typ}</StatusBadge>}
      </Td>
      <Td className="text-body-sm text-claimondo-navy font-medium">{a.kunde_name ?? '–'}</Td>
      <Td className="text-body-sm">
        <div className="text-claimondo-navy">{fahrzeugText(a)}</div>
        {a.kennzeichen && (
          <div className="text-claimondo-ondo text-xs font-mono">{a.kennzeichen}</div>
        )}
      </Td>
      <Td>
        <div className="flex flex-col items-start gap-1">
          <StatusBadge tone={phase.ton} size="xs">{phase.label}</StatusBadge>
          {kva === 'benoetigt' && <StatusBadge tone="warning" size="xs">KVA offen</StatusBadge>}
          {kva === 'erstellt' && (
            <StatusBadge tone="info" size="xs">
              KVA {EUR.format(a.kostenvoranschlag_brutto ?? a.kostenvoranschlag_netto ?? 0)}
            </StatusBadge>
          )}
          {kva === 'freigegeben' && <StatusBadge tone="success" size="xs">KVA ✓</StatusBadge>}
          {opLabel && <span className="text-claimondo-ondo text-xs">{opLabel}</span>}
        </div>
      </Td>
      <Td className="text-body-sm text-claimondo-navy tabular-nums">
        {kurzDatum(terminIso)}
        {istGutachtenWeg && a.gutachter_firmenname && (
          <div className="text-claimondo-ondo text-xs">{a.gutachter_firmenname}</div>
        )}
      </Td>
    </ClickableTr>
  )
}

// Meine Vermittlung (ich habe geworben): Kunde + Quelle + Vermittelt-am + Provision.
function VermittlungZeile({ a, onClick }: { a: WerkstattAuftrag; onClick: () => void }) {
  return (
    <ClickableTr onClick={onClick}>
      <Td>
        <div className="text-claimondo-navy font-medium">{a.claim_nummer ?? '–'}</div>
      </Td>
      <Td className="text-body-sm text-claimondo-navy font-medium">{a.kunde_name ?? '–'}</Td>
      <Td className="text-body-sm text-claimondo-navy">{quelleLabel(a.quelle) ?? '–'}</Td>
      <Td className="text-body-sm text-claimondo-navy tabular-nums">{kurzDatum(a.zugewiesen_am)}</Td>
      <Td className="text-body-sm text-claimondo-navy tabular-nums">
        {a.provision_betrag_netto != null ? (
          <div className="flex flex-col items-start gap-1">
            <span>{EUR.format(a.provision_betrag_netto)}</span>
            <StatusBadge tone="neutral" size="xs">{getPartnerProvisionStatusLabel(a.provision_status)}</StatusBadge>
          </div>
        ) : (
          '–'
        )}
      </Td>
    </ClickableTr>
  )
}

export function WerkstattAuftraege({ auftraege, werkstattName }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Aktives Segment + Status-Filter aus der URL (teilbar + refresh-stabil).
  const segment = (searchParams.get('segment') as Segment | null) ?? 'reparatur'
  const statusFilter = useMemo(
    () => new Set((searchParams.get('status') ?? '').split(',').filter(Boolean)),
    [searchParams],
  )

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function toggleInSet(key: string, current: Set<string>, value: string) {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    updateParam(key, Array.from(next).join(','))
  }

  const segCounts = useMemo(() => zaehleSegmente(auftraege), [auftraege])

  const gefiltert = useMemo(
    () =>
      auftraege.filter((a) => {
        if (werkstattAuftragSegment(a) !== segment) return false
        if (statusFilter.size > 0 && !statusFilter.has(werkstattAuftragPhase(a).key)) return false
        return true
      }),
    [auftraege, segment, statusFilter],
  )

  // Phasen-Counts NUR im aktiven Segment (für die Status-Chips).
  const phaseCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of auftraege) {
      if (werkstattAuftragSegment(a) !== segment) continue
      const key = werkstattAuftragPhase(a).key
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    return m
  }, [auftraege, segment])

  const hatStatusFilter = statusFilter.size > 0

  // Nur die „Status"-Gruppe (Label + Row) rendern, wenn es überhaupt Status-Chips
  // gibt — sonst hinge das Label ohne Chips (verwaistes Label) in der Luft.
  const hatStatusChips = WERKSTATT_PHASE_ORDER.some(
    (k) => (phaseCounts.get(k) ?? 0) > 0 || statusFilter.has(k),
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="Aufträge"
        description={`Ihre Aufträge für ${werkstattName} — Reparatur-Aufträge und Vermittlungen.`}
        icon={WrenchIcon}
      />

      {auftraege.length > 0 && (
        <div className="space-y-3">
          {/* Ansicht — Reparatur-Aufträge (ich repariere) vs Meine Vermittlungen (ich habe geworben) */}
          <div className="space-y-1">
            <span className="text-caption font-medium text-claimondo-ondo">Ansicht</span>
            <ChipRow>
              <Chip
                variant={segment === 'reparatur' ? 'selected' : 'default'}
                count={segCounts.reparatur}
                onClick={() => updateParam('segment', 'reparatur')}
              >
                Reparatur-Aufträge
              </Chip>
              <Chip
                variant={segment === 'vermittlung' ? 'selected' : 'default'}
                count={segCounts.vermittlung}
                onClick={() => updateParam('segment', 'vermittlung')}
              >
                Meine Vermittlungen
              </Chip>
            </ChipRow>
          </div>

          {/* Status-Filter innerhalb des Segments — kleinere Chips, klar als „Status" gelabelt */}
          {hatStatusChips && (
            <div className="space-y-1">
              <span className="text-caption font-medium text-claimondo-ondo">Status</span>
              <ChipRow>
                {WERKSTATT_PHASE_ORDER.map((key) => {
                  const count = phaseCounts.get(key) ?? 0
                  if (count === 0 && !statusFilter.has(key)) return null
                  return (
                    <Chip
                      key={key}
                      size="sm"
                      variant={statusFilter.has(key) ? 'selected' : 'default'}
                      count={count}
                      onClick={() => toggleInSet('status', statusFilter, key)}
                    >
                      {WERKSTATT_PHASE_META[key].label}
                    </Chip>
                  )
                })}
                {hatStatusFilter && (
                  <Chip size="sm" variant="ghost" onClick={() => updateParam('status', null)}>
                    Zurücksetzen
                  </Chip>
                )}
              </ChipRow>
            </div>
          )}
        </div>
      )}

      {gefiltert.length === 0 ? (
        <EmptyState
          icon={WrenchIcon}
          title={
            auftraege.length === 0
              ? 'Noch keine Aufträge'
              : segment === 'reparatur'
                ? 'Keine Reparatur-Aufträge'
                : 'Noch keine Vermittlungen'
          }
          description={
            auftraege.length === 0
              ? 'Sobald Ihnen ein Auftrag zugewiesen wird, erscheint er hier.'
              : segment === 'reparatur'
                ? 'Für die gewählten Filter gibt es keine Reparatur-Aufträge.'
                : 'In dieser Ansicht sind noch keine Vermittlungen.'
          }
        />
      ) : (
        <DataTableContainer>
          <Table>
            <Thead>
              {segment === 'reparatur' ? (
                <Tr>
                  <Th>Auftrag</Th>
                  <Th>Kunde</Th>
                  <Th>Fahrzeug</Th>
                  <Th>Status</Th>
                  <Th>Termin</Th>
                </Tr>
              ) : (
                <Tr>
                  <Th>Vermittlung</Th>
                  <Th>Kunde</Th>
                  <Th>Quelle</Th>
                  <Th>Vermittelt am</Th>
                  <Th>Provision</Th>
                </Tr>
              )}
            </Thead>
            <Tbody>
              {gefiltert.map((a) =>
                segment === 'reparatur' ? (
                  <ReparaturZeile key={a.claim_id} a={a} onClick={() => router.push(`/werkstatt/auftraege/${a.claim_id}`)} />
                ) : (
                  <VermittlungZeile key={a.claim_id} a={a} onClick={() => router.push(`/werkstatt/auftraege/${a.claim_id}`)} />
                ),
              )}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}
    </div>
  )
}
