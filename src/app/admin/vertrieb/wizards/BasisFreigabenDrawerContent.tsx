'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import BasicFreigabeRowActions from '@/app/admin/sachverstaendige/basic-freigaben/BasicFreigabeRowActions'
import { getBasisFreigaben } from '../_actions/basis-freigaben-daten'

type SvRow = {
  id: string
  paket: string | null
  onboarding_quelle: string | null
  standort_plz: string | null
  standort_adresse: string | null
  created_at: string | null
  profiles: {
    vorname: string | null
    nachname: string | null
    email: string | null
    firma: string | null
  } | null
}

const ONBOARDING_QUELLE_LABEL: Record<string, string> = {
  self_service_neu: 'Self-Service (neu)',
  self_service_claim: 'Self-Service (Schaden)',
}

export default function BasisFreigabenDrawerContent() {
  const [svs, setSvs] = useState<SvRow[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const res = await getBasisFreigaben()
    if (res.ok) {
      setSvs(res.svs)
      setFehler(null)
    } else {
      setFehler(res.error)
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  if (fehler) {
    return <p className="p-6 text-body-sm text-danger">{fehler}</p>
  }

  if (!svs) {
    return (
      <p className="p-6 text-body-sm text-claimondo-ondo/60">
        Basis-Freigaben werden geladen…
      </p>
    )
  }

  if (svs.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-heading-md text-claimondo-navy mb-4">Basis-Freigaben</h2>
        <p className="text-body-sm text-claimondo-ondo/60">
          Keine ausstehenden Basis-Freigaben.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-heading-md text-claimondo-navy">Basis-Freigaben</h2>
      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Name / Firma</Th>
              <Th>Region</Th>
              <Th>Quelle</Th>
              <Th>Eingegangen am</Th>
              <Th>Aktionen</Th>
            </Tr>
          </Thead>
          <Tbody>
            {svs.map((sv) => {
              const p = sv.profiles
              const name = p
                ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim()
                : '—'
              const email = p?.email ?? null
              const firma = p?.firma ?? null
              const region = sv.standort_plz
                ? sv.standort_plz
                : sv.standort_adresse
                  ? sv.standort_adresse.split(',').slice(-1)[0]?.trim() ?? '—'
                  : '—'
              const quelleLabel = sv.onboarding_quelle
                ? (ONBOARDING_QUELLE_LABEL[sv.onboarding_quelle] ?? sv.onboarding_quelle)
                : '—'
              const eingegangen = sv.created_at
                ? new Date(sv.created_at).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: 'Europe/Berlin',
                  })
                : '—'
              const stunden = sv.created_at
                ? (Date.now() - new Date(sv.created_at).getTime()) / (1000 * 60 * 60)
                : 0
              const slaKritisch = stunden >= 48

              return (
                <Tr
                  key={sv.id}
                  className={slaKritisch ? 'bg-warning-soft/60' : undefined}
                >
                  <Td>
                    <div className="space-y-0.5">
                      <Link
                        href={`/admin/vertrieb/sachverstaendige/${sv.id}?tab=verifizierung`}
                        className="text-xs font-semibold text-claimondo-navy hover:underline"
                      >
                        {name || '—'}
                      </Link>
                      {firma && (
                        <p className="text-[11px] text-claimondo-ondo">{firma}</p>
                      )}
                      {email && (
                        <p className="text-[10px] text-claimondo-ondo/70">{email}</p>
                      )}
                    </div>
                  </Td>
                  <Td className="text-xs text-claimondo-ondo">{region}</Td>
                  <Td>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-claimondo-bg text-claimondo-ondo border border-claimondo-border">
                      {quelleLabel}
                    </span>
                  </Td>
                  <Td>
                    <div className="space-y-0.5">
                      <p className="text-xs text-claimondo-navy">{eingegangen}</p>
                      {slaKritisch && (
                        <p className="text-[10px] text-warning-strong font-semibold">
                          &gt; 48h — SLA kritisch
                        </p>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <BasicFreigabeRowActions svId={sv.id} onDone={laden} />
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
