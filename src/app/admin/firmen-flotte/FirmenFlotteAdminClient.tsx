'use client'

// Firmen-Flotten-Konten: Admin-Anlage-UI. Muster: MaklerAdminClient.
// Minimal: Firmenname + Ansprechpartner-Vorname + E-Mail + Telefon (optional).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BuildingIcon, PlusIcon } from 'lucide-react'
import { createFirmenFlotteKonto } from './actions'

import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { TextField } from '@/components/shared/forms/TextField'
import { statusSlotClass } from '@/lib/status'

export type FlottenKontoRow = {
  user_id: string
  firma_name: string | null
  firma_id: string
  email: string | null
  vorname: string | null
  telefon: string | null
  status: string | null
  created_at: string | null
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function FirmenFlotteAdminClient({ konten }: { konten: FlottenKontoRow[] }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)

  function openDialog() {
    setShowDialog(true)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    try {
      const result = await createFirmenFlotteKonto(fd)
      if (!result.ok) {
        toast.error(result.error ?? 'Anlage fehlgeschlagen')
        return
      }
      toast.success('Flottenmanager-Konto angelegt.')
      setShowDialog(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anlage fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        <div className="mb-6">
          <PageHeader
            title="Firmen-Flotten-Konten"
            description={`${konten.length} Flottenmanager`}
            icon={BuildingIcon}
            actions={
              <Button
                variant="navy"
                onClick={openDialog}
                iconLeft={<PlusIcon className="w-4 h-4" />}
              >
                Neues Flottenmanager-Konto
              </Button>
            }
          />
        </div>

        <DataTableContainer
          variant="plain"
          className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden"
        >
          <Table>
            <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
              <Tr className="border-b border-claimondo-border">
                <Th className="text-left text-claimondo-ondo!">Firma</Th>
                <Th className="text-left text-claimondo-ondo!">Ansprechpartner</Th>
                <Th className="text-left text-claimondo-ondo!">E-Mail</Th>
                <Th className="text-left text-claimondo-ondo!">Telefon</Th>
                <Th className="text-left text-claimondo-ondo!">Status</Th>
                <Th className="text-left text-claimondo-ondo!">Erstellt</Th>
              </Tr>
            </Thead>
            <Tbody className="divide-y-0!">
              {konten.map((k) => (
                <Tr
                  key={k.user_id}
                  className="border-b border-claimondo-border/50"
                >
                  <Td>
                    <div className="text-claimondo-navy font-medium">
                      {k.firma_name ?? '—'}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-claimondo-navy text-sm">{k.vorname ?? '—'}</div>
                  </Td>
                  <Td>
                    <div className="text-claimondo-ondo text-sm">{k.email ?? '—'}</div>
                  </Td>
                  <Td>
                    <div className="text-claimondo-ondo text-sm">{k.telefon ?? '—'}</div>
                  </Td>
                  <Td>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusSlotClass(
                        k.status === 'aktiv' ? 'success' : 'neutral',
                      )}`}
                    >
                      {k.status ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">
                      {formatDatum(k.created_at)}
                    </span>
                  </Td>
                </Tr>
              ))}
              {konten.length === 0 && (
                <Tr>
                  <Td colSpan={6} className="py-12! text-center text-claimondo-ondo!">
                    Noch keine Flottenmanager-Konten angelegt.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>

        <Modal
          open={showDialog}
          onClose={() => setShowDialog(false)}
          maxWidth={480}
          ariaLabel="Neues Flottenmanager-Konto"
        >
          <h2 className="text-claimondo-navy font-semibold text-lg mb-4">
            Neues Flottenmanager-Konto
          </h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <TextField
              label="Firmenname"
              name="firma_name"
              required
              placeholder="z.B. Muster GmbH & Co. KG"
            />
            <TextField
              label="Ansprechpartner Vorname"
              name="vorname"
              required
              placeholder="Max"
            />
            <TextField
              label="E-Mail (Login)"
              name="email"
              type="email"
              required
              placeholder="flottenmanager@beispiel.de"
            />
            <TextField
              label="Telefon (optional)"
              name="telefon"
              type="tel"
              placeholder="+49 221 …"
            />
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setShowDialog(false)}>
                Abbrechen
              </Button>
              <Button
                variant="navy"
                fullWidth
                type="submit"
                loading={loading}
                disabled={loading}
              >
                Anlegen
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  )
}
