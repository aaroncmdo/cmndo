'use client'
// src/app/admin/vertrieb/live-ops/VertriebLiveOpsListe.tsx
// Vertrieb-Cockpit: "Live-Ops als Liste" — die operativen aktiven SVs (getLiveOpsSvs) als
// Tabelle: Kapazitaet, Status (unterwegs/verfuegbar/gesperrt/Urlaub), offene Termine (join
// getOffeneTermine per svId) + ETA. Zeilen-Klick -> SV-Detailseite (wie der Karten-Popup;
// Drawer-ueber-Karte waere ein eigener @drawer-Slot = Follow-up). Bewusst KEINE Status-Farb-
// Map (Status-Registry-Ratchet) -> Klartext-Labels.
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Table, Thead, Tbody, Tr, ClickableTr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import type { SvLiveOps, TerminPin } from '@/lib/live-ops/types'

function svStatus(sv: SvLiveOps): string {
  if (sv.gesperrt) return 'Gesperrt'
  if (sv.urlaub) return 'Urlaub'
  if (sv.car.mode !== 'none') return 'Unterwegs'
  return 'Verfügbar'
}

export default function VertriebLiveOpsListe({
  svs,
  termine,
}: {
  svs: SvLiveOps[]
  termine: TerminPin[]
}) {
  const router = useRouter()

  // Offene Termine je SV: Count + naechster Start (einmal aus termine aggregiert).
  const terminBySv = useMemo(() => {
    const m = new Map<string, { count: number; next: string | null }>()
    for (const t of termine) {
      const cur = m.get(t.svId) ?? { count: 0, next: null }
      cur.count += 1
      if (!cur.next || t.startZeit < cur.next) cur.next = t.startZeit
      m.set(t.svId, cur)
    }
    return m
  }, [termine])

  // Sortierung: unterwegs zuerst, dann verfuegbar, dann gesperrt/Urlaub; je Gruppe nach Name.
  const rows = useMemo(() => {
    const rank = (sv: SvLiveOps) => (sv.car.mode !== 'none' ? 0 : sv.gesperrt || sv.urlaub ? 2 : 1)
    return [...svs].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [svs])

  if (svs.length === 0) {
    return (
      <p className="py-8 text-center text-body-sm text-claimondo-ondo/60">
        Keine aktiven Sachverständigen im Live-Ops-Scope.
      </p>
    )
  }

  return (
    <DataTableContainer>
      <Table>
        <Thead>
          <Tr>
            <Th>Sachverständiger</Th>
            <Th>Typ</Th>
            <Th>Paket</Th>
            <Th>Kapazität</Th>
            <Th>Status</Th>
            <Th>Offene Termine</Th>
            <Th>ETA</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((sv) => {
            const t = terminBySv.get(sv.id)
            const nextTime = t?.next
              ? new Date(t.next).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
              : null
            const unterwegs = sv.car.mode !== 'none'
            return (
              <ClickableTr key={sv.id} onClick={() => router.push(`/admin/vertrieb/sachverstaendige/${sv.id}`)}>
                <Td>
                  {sv.name}
                  {sv.verifiziert && (
                    <span className="ml-2 text-caption text-success-strong">✓ verifiziert</span>
                  )}
                </Td>
                <Td>{sv.typ}</Td>
                <Td>{sv.paket}</Td>
                <Td>{sv.gesamt > 0 ? `${sv.genutzt}/${sv.gesamt}` : '—'}</Td>
                <Td>{svStatus(sv)}</Td>
                <Td>{t ? `${t.count}${nextTime ? ` · ${nextTime}` : ''}` : '—'}</Td>
                <Td>{unterwegs && sv.car.etaMinuten != null ? `${sv.car.etaMinuten} min` : '—'}</Td>
              </ClickableTr>
            )
          })}
        </Tbody>
      </Table>
    </DataTableContainer>
  )
}
