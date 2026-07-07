'use client'

// Shared Gutschrift-Download-Liste fuer Makler- und Werkstatt-Portal.
// Typ EigeneGutschrift wird hier definiert und von eigene-gutschriften-actions.ts
// per `import type` bezogen (AAR-664: kein Typ-Export aus 'use server'-Files).

import { useState, useTransition } from 'react'
import { DownloadIcon, ReceiptIcon } from 'lucide-react'
import { getEigeneGutschriftUrl } from '@/lib/finance/eigene-gutschriften-actions'
import { Button } from '@/components/primitives'
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  DataTableContainer,
} from '@/components/shared/DataTable'

export type EigeneGutschrift = {
  id: string
  gutschrift_nr: string
  betrag_brutto: number
  erstellt_am: string
  status: string
  /** 'gutschrift' | 'storno' — Storno-Zeilen werden als "Storno-Gutschrift" gelabelt. */
  typ: string
  /** Bei Storno: Nummer der stornierten Original-Gutschrift (sonst null). */
  bezugNr: string | null
}

const EUR_FORMAT = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

// betrag_brutto ist in Euro gespeichert (erstellePartnerGutschrift: bruttoCent/100),
// wie im PartnerBillingPanel/PDF — NICHT nochmal durch 100 teilen.
function fmtBetrag(n: number): string {
  return EUR_FORMAT.format(n)
}

function fmtDatum(iso: string): string {
  return DATE_FORMAT.format(new Date(iso))
}

// Per-Zeile Download-Button mit eigenem useTransition — verhindert dass alle
// Zeilen gleichzeitig laden wenn eine geklickt wird (Muster aus MaikGutschriftButton).
function GutschriftDownloadButton({ gutschriftId }: { gutschriftId: string }) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  function handleClick() {
    setFehler(null)
    startTransition(async () => {
      const res = await getEigeneGutschriftUrl(gutschriftId)
      if (res.ok) {
        window.open(res.url, '_blank')
      } else {
        setFehler(res.error)
      }
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={handleClick}
        iconLeft={!pending ? <DownloadIcon width={13} height={13} /> : undefined}
        ariaLabel="Gutschrift als PDF herunterladen"
      >
        PDF ↓
      </Button>
      {fehler && (
        <span className="ml-1 rounded-ios-sm bg-danger-soft px-2 py-0.5 text-xs text-danger-strong">
          {fehler}
        </span>
      )}
    </>
  )
}

export function PartnerGutschriftenListe({
  gutschriften,
}: {
  gutschriften: EigeneGutschrift[]
}) {
  if (gutschriften.length === 0) return null

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <ReceiptIcon width={16} height={16} className="text-claimondo-ondo" />
        <h2 className="text-sm font-semibold text-claimondo-navy">
          Meine Gutschriften
        </h2>
        <span className="text-xs text-claimondo-shield">
          ({gutschriften.length})
        </span>
      </div>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Gutschrift-Nr.</Th>
              <Th>Datum</Th>
              <Th className="text-right">Betrag</Th>
              <Th>Status</Th>
              <Th>Download</Th>
            </Tr>
          </Thead>
          <Tbody>
            {gutschriften.map((g) => (
              <Tr key={g.id}>
                <Td className="font-mono text-xs">
                  {g.typ === 'storno' ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="font-sans font-semibold text-claimondo-navy">Storno-Gutschrift</span>
                      <span>{g.gutschrift_nr}</span>
                      {g.bezugNr && (
                        <span className="font-sans text-claimondo-shield">Storno zu {g.bezugNr}</span>
                      )}
                    </span>
                  ) : (
                    g.gutschrift_nr
                  )}
                </Td>
                <Td>{fmtDatum(g.erstellt_am)}</Td>
                <Td className="text-right font-semibold tabular-nums">
                  {fmtBetrag(g.betrag_brutto)}
                </Td>
                <Td>
                  <span className="inline-flex items-center rounded-full bg-claimondo-bg px-2.5 py-1 text-xs font-medium text-claimondo-ondo">
                    {g.status}
                  </span>
                </Td>
                <Td>
                  <GutschriftDownloadButton gutschriftId={g.id} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </DataTableContainer>
    </section>
  )
}
