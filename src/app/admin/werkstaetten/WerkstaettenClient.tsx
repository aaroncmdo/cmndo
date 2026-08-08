'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { WrenchIcon, PlusIcon, QrCodeIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import WerkstattAnlegenForm from './WerkstattAnlegenForm'

type Werkstatt = {
  id: string
  name: string
  adresse_ort: string | null
  adresse_plz: string | null
  status: string | null
  provision_betrag_netto: number | null
  aktiviert_am: string | null
  email: string | null
  telefon: string | null
  faehigkeiten: string[] | null
  lat: number | null
  lng: number | null
}

const STATUS_LABELS: Record<string, string> = {
  aktiv: 'Aktiv',
  inaktiv: 'Inaktiv',
  gesperrt: 'Gesperrt',
}

const STATUS_COLORS: Record<string, string> = {
  aktiv: 'bg-success-soft text-success-strong',
  inaktiv: 'bg-claimondo-bg text-claimondo-ondo',
  gesperrt: 'bg-danger-soft text-danger-strong',
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Reine Navigations-Liste: die pro-Werkstatt-Steuerung (QR, Staffel, Faehigkeiten, Login-Mail,
// Abrechnung, Status, Stammdaten, Notizen, …) lebt in der kanonischen Detail-Akte
// /admin/vertrieb/werkstaetten/[id] (Content = WsAkteContent; /admin/werkstaetten/[id] ist ein
// 308-Redirect dorthin, F2). Hier bleibt nur: Ueberblick + Klick auf eine Zeile -> Verwaltung,
// plus "Neue Werkstatt" anlegen.
export default function WerkstaettenClient({ werkstaetten }: { werkstaetten: Werkstatt[] }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)

  function openDialog() {
    setShowDialog(true)
  }

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        <div className="mb-6">
          <PageHeader
            title="Werkstätten"
            description={`${werkstaetten.length} Partnerwerk${werkstaetten.length === 1 ? 'statt' : 'stätten'} · Klick auf eine Werkstatt öffnet die Verwaltung`}
            icon={WrenchIcon}
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => router.push('/admin/werkstaetten/qr-pool')}
                  iconLeft={<QrCodeIcon className="w-4 h-4" />}
                >
                  QR-Code-Pool
                </Button>
                <Button
                  variant="navy"
                  onClick={openDialog}
                  iconLeft={<PlusIcon className="w-4 h-4" />}
                >
                  Neue Werkstatt
                </Button>
              </div>
            }
          />
        </div>

        <DataTableContainer variant="plain" className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden">
          <Table>
            <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
              <Tr className="border-b border-claimondo-border">
                <Th className="text-left text-claimondo-ondo!">Name</Th>
                <Th className="text-left text-claimondo-ondo!">Ort</Th>
                <Th className="text-left text-claimondo-ondo!">Status</Th>
                <Th className="text-left text-claimondo-ondo!">Provision (netto)</Th>
                <Th className="text-left text-claimondo-ondo!">Aktiviert am</Th>
              </Tr>
            </Thead>
            <Tbody className="divide-y-0!">
              {werkstaetten.map(w => (
                <Tr
                  key={w.id}
                  className="border-b border-claimondo-border/50"
                >
                  <Td>
                    <Link
                      href={`/admin/vertrieb/werkstaetten/${w.id}`}
                      className="text-claimondo-navy font-medium hover:text-claimondo-ondo hover:underline"
                    >
                      {w.name}
                    </Link>
                    <div className="text-claimondo-ondo text-xs">{w.email ?? '—'}</div>
                    {/* D3: Profil-Luecken sichtbar machen — ohne Geo ist die Werkstatt im
                        Kunden-Finder unsichtbar (D1-Umkreis), ohne Gewerke rankt sie schlechter. */}
                    {(w.lat == null || w.lng == null || !w.faehigkeiten || w.faehigkeiten.length === 0) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(w.lat == null || w.lng == null) && (
                          <StatusBadge tone="warning" size="xs">
                            Ohne Standort — im Finder unsichtbar
                          </StatusBadge>
                        )}
                        {(!w.faehigkeiten || w.faehigkeiten.length === 0) && (
                          <StatusBadge tone="neutral" size="xs">
                            Ohne Gewerke
                          </StatusBadge>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div className="text-claimondo-navy text-sm">{w.adresse_ort ?? '—'}</div>
                    {w.adresse_plz && <div className="text-claimondo-ondo text-xs">{w.adresse_plz}</div>}
                  </Td>
                  <Td>
                    {w.status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[w.status] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>
                        {STATUS_LABELS[w.status] ?? w.status}
                      </span>
                    ) : (
                      <span className="text-claimondo-ondo/70 text-xs">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-claimondo-navy text-sm tabular-nums">
                      {w.provision_betrag_netto !== null ? `${w.provision_betrag_netto} €` : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">{formatDatum(w.aktiviert_am)}</span>
                  </Td>
                </Tr>
              ))}
              {werkstaetten.length === 0 && (
                <Tr>
                  <Td colSpan={5} className="py-12! text-center text-claimondo-ondo!">
                    Noch keine Werkstätten angelegt.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>

        <Modal open={showDialog} onClose={() => setShowDialog(false)} maxWidth={520} ariaLabel="Neue Werkstatt">
          <WerkstattAnlegenForm
            onClose={() => setShowDialog(false)}
            onCreated={() => { router.refresh() }}
          />
        </Modal>
      </div>
    </div>
  )
}
