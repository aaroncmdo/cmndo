'use client'

// AAR-956 WP-B (Task 9): Provisions-Tabelle fuer Werkstatt-Portal.
// Gespiegelt nach MaklerAbrechnungen — DataTable-Set, Status-Badges mit
// semantischen Token-Klassen (bg-success-soft etc.), keine PII.

import Link from 'next/link'
import {
  CheckCircle2Icon,
  ClockIcon,
  UsersIcon,
  XCircleIcon,
  WalletIcon,
} from 'lucide-react'
import type { WerkstattProvisionRow, WerkstattProvisionStatus } from '@/lib/werkstatt/queries'
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  DataTableContainer,
} from '@/components/shared/DataTable'
import { Card } from '@/components/primitives'
import {
  PartnerGutschriftenListe,
  type EigeneGutschrift,
} from '@/components/shared/finance/PartnerGutschriftenListe'

type Props = {
  provisionen: WerkstattProvisionRow[]
  werkstattName: string
  boniSumme?: number
  gutschriften?: EigeneGutschrift[]
}

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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return DATE_SHORT.format(new Date(iso))
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

type StatusVisual = {
  label: string
  className: string
  icon: React.ReactNode
  tooltip?: string
}

function statusVisual(row: WerkstattProvisionRow): StatusVisual {
  const status: WerkstattProvisionStatus = row.status

  if (status === 'freigegeben') {
    return {
      label: 'freigegeben',
      className: 'bg-success-soft text-success-strong border border-success/20',
      icon: <CheckCircle2Icon width={12} height={12} />,
    }
  }
  if (status === 'ausgezahlt') {
    return {
      label: 'ausgezahlt',
      className: 'bg-success-soft text-success-strong border border-success/20',
      icon: <WalletIcon width={12} height={12} />,
    }
  }
  if (status === 'storniert') {
    return {
      label: 'storniert',
      className: 'bg-danger-soft text-danger-strong border border-danger/20',
      icon: <XCircleIcon width={12} height={12} />,
      tooltip: row.storno_grund ?? undefined,
    }
  }
  // P3 Netzwerk: intra-Freundesnetzwerk vermittelt -> keine Einzelprovision (Abo deckt).
  // Ohne eigenen Zweig fiele der Status in den pending-Fallback ("fällig in X T.") — irreführend.
  if (status === 'unterdrueckt') {
    return {
      label: 'Netzwerk-intern (nicht vergütet)',
      className: 'bg-claimondo-bg text-claimondo-ondo border border-claimondo-border',
      icon: <UsersIcon width={12} height={12} />,
      tooltip:
        'Innerhalb Ihres Partnernetzwerks vermittelt — durch das Netzwerkpartner-Abo abgedeckt, keine Einzelprovision.',
    }
  }
  // pending — Freigabe-/Clawback-Frist = Fall-Completion + 7 Tage (FG4-A). release_deadline null =
  // Fall noch nicht abgeschlossen → Freigabe erst nach Fallabschluss (frueher: hold_until = Erstellung+7d).
  const days = daysUntil(row.release_deadline)
  return {
    label:
      row.release_deadline === null
        ? 'nach Fallabschluss'
        : days !== null && days > 0
          ? `fällig in ${days} T.`
          : 'fällig',
    className: 'bg-warning-soft text-warning-strong border border-warning/20',
    icon: <ClockIcon width={12} height={12} />,
    tooltip:
      row.release_deadline
        ? `Clawback-Frist bis ${fmtDate(row.release_deadline)}`
        : 'Freigabe erst nach Fallabschluss + 7 Tage',
  }
}

export function WerkstattAbrechnungen({
  provisionen,
  werkstattName,
  boniSumme = 0,
  gutschriften = [],
}: Props) {
  const total = provisionen.reduce((s, r) => s + r.betrag_netto_eur, 0)
  const offene = provisionen
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + r.betrag_netto_eur, 0)
  const freigegeben = provisionen
    .filter((r) => r.status === 'freigegeben')
    .reduce((s, r) => s + r.betrag_netto_eur, 0)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">
          Provisionen
        </h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Ihre Vermittlungs-Provisionen für {werkstattName}.
        </p>
      </header>

      {/* Zusammenfassung */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card bordered radius="md">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Gesamt
          </p>
          <p className="mt-1 text-heading-sm font-bold text-claimondo-navy">
            {EUR.format(total)}
          </p>
        </Card>
        <Card bordered radius="md">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Ausstehend
          </p>
          <p className="mt-1 text-heading-sm font-bold text-warning-strong">
            {EUR.format(offene)}
          </p>
        </Card>
        <Card bordered radius="md">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Freigegeben
          </p>
          <p className="mt-1 text-heading-sm font-bold text-success-strong">
            {EUR.format(freigegeben)}
          </p>
        </Card>
        <Card bordered radius="md">
          <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
            Meilenstein-Boni
          </p>
          <p className="mt-1 text-heading-sm font-bold text-success-strong">
            {EUR.format(boniSumme)}
          </p>
        </Card>
      </div>

      {/* Tabelle */}
      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Fall-Nr.</Th>
              <Th>Betrag</Th>
              <Th>Status</Th>
              <Th>Auslöser</Th>
              <Th>Erstellt</Th>
              <Th>Freigabe ab</Th>
            </Tr>
          </Thead>
          <Tbody>
            {provisionen.length === 0 ? (
              <Tr>
                <Td colSpan={6} className="text-center text-claimondo-ondo py-8">
                  Noch keine Provisionen vorhanden.
                </Td>
              </Tr>
            ) : (
              provisionen.map((row) => {
                const vis = statusVisual(row)
                return (
                  <Tr key={row.id}>
                    <Td className="font-mono text-xs">
                      {/* W1.7: claim_nummer -> Deep-Link auf den Werkstatt-Auftrag (claim_id jetzt
                          im partner_provisionen-Select). Fallback: Plain-Text ohne claim_id. */}
                      {row.claim_id && row.claim_nummer ? (
                        <Link
                          href={`/werkstatt/auftraege/${row.claim_id}`}
                          className="text-claimondo-navy underline underline-offset-2 hover:text-claimondo-light-blue"
                        >
                          {row.claim_nummer}
                        </Link>
                      ) : (
                        row.claim_nummer ?? '–'
                      )}
                    </Td>
                    <Td className="font-semibold tabular-nums">
                      {EUR.format(row.betrag_netto_eur)}
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-body-xs font-semibold ${vis.className}`}
                        title={vis.tooltip}
                      >
                        {vis.icon}
                        {vis.label}
                      </span>
                    </Td>
                    <Td className="text-body-sm text-claimondo-ondo">
                      {row.trigger_event ?? '–'}
                    </Td>
                    <Td className="text-body-sm">
                      {fmtDate(row.erstellt_am)}
                    </Td>
                    <Td className="text-body-sm">
                      {fmtDate(row.release_deadline)}
                    </Td>
                  </Tr>
                )
              })
            )}
          </Tbody>
        </Table>
      </DataTableContainer>

      {/* Eigene Gutschriften — wird nur angezeigt wenn mind. eine vorhanden ist */}
      <PartnerGutschriftenListe gutschriften={gutschriften} />
    </div>
  )
}
