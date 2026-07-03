'use client'

// Makler-Vermittlung: Admin-Anlage-UI. Spiegelt WerkstaettenClient (primitives Button/Modal +
// DataTable + TextField + createdCredentials-Pattern), aber: plain Adress-Felder (kein Geo/Isochrone),
// dual-rate, und handleCreate MIT try/catch (WerkstaettenClient hat hier einen Silent-Swallow-Bug).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UsersIcon, PlusIcon, KeyIcon } from 'lucide-react'
import { createMakler } from './actions'
import { GesellschaftSelect } from '@/components/makler/GesellschaftSelect'

type GesellschaftOption = { id: string; name: string }
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { TextField } from '@/components/shared/forms/TextField'

type Makler = {
  id: string
  firma: string
  email: string | null
  telefon: string | null
  status: string | null
  provision_betrag_komplett_netto: number | null
  provision_betrag_nur_gutachter_netto: number | null
  aktiviert_am: string | null
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
}

const STATUS_LABELS: Record<string, string> = { aktiv: 'Aktiv', inaktiv: 'Inaktiv', gesperrt: 'Gesperrt' }
const STATUS_COLORS: Record<string, string> = {
  aktiv: 'bg-success-soft text-success-strong',
  inaktiv: 'bg-claimondo-bg text-claimondo-ondo',
  gesperrt: 'bg-danger-soft text-danger-strong',
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function MaklerAdminClient({
  maklers,
  versicherungen,
  maklerpools,
}: {
  maklers: Makler[]
  versicherungen: GesellschaftOption[]
  maklerpools: GesellschaftOption[]
}) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null)
  const [versicherungId, setVersicherungId] = useState<string | null>(null)
  const [maklerpoolId, setMaklerpoolId] = useState<string | null>(null)

  function openDialog() {
    setCreatedCredentials(null)
    setVersicherungId(null)
    setMaklerpoolId(null)
    setShowDialog(true)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    if (versicherungId) fd.set('versicherung_id', versicherungId)
    if (maklerpoolId) fd.set('maklerpool_id', maklerpoolId)
    try {
      const result = await createMakler(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCreatedCredentials({ email: result.email, password: result.password })
      toast.success(`Makler angelegt: ${result.email}`)
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
            title="Makler"
            description={`${maklers.length} Vermittler-Partner`}
            icon={UsersIcon}
            actions={
              <Button variant="navy" onClick={openDialog} iconLeft={<PlusIcon className="w-4 h-4" />}>
                Neuer Makler
              </Button>
            }
          />
        </div>

        <DataTableContainer variant="plain" className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden">
          <Table>
            <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
              <Tr className="border-b border-claimondo-border">
                <Th className="text-left text-claimondo-ondo!">Firma</Th>
                <Th className="text-left text-claimondo-ondo!">Ansprechpartner</Th>
                <Th className="text-left text-claimondo-ondo!">Status</Th>
                <Th className="text-left text-claimondo-ondo!">Provision (komplett / nur Gutachter)</Th>
                <Th className="text-left text-claimondo-ondo!">Aktiviert am</Th>
              </Tr>
            </Thead>
            <Tbody className="divide-y-0!">
              {maklers.map(m => (
                <Tr key={m.id} className="border-b border-claimondo-border/50">
                  <Td>
                    <div className="text-claimondo-navy font-medium">{m.firma}</div>
                    <div className="text-claimondo-ondo text-xs">{m.email ?? '—'}</div>
                  </Td>
                  <Td>
                    <div className="text-claimondo-navy text-sm">
                      {[m.ansprechpartner_vorname, m.ansprechpartner_nachname].filter(Boolean).join(' ') || '—'}
                    </div>
                    {m.telefon && <div className="text-claimondo-ondo text-xs">{m.telefon}</div>}
                  </Td>
                  <Td>
                    {m.status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    ) : (
                      <span className="text-claimondo-ondo/70 text-xs">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-claimondo-navy text-sm tabular-nums">
                      {m.provision_betrag_komplett_netto !== null ? `${m.provision_betrag_komplett_netto} €` : '—'}
                      {' / '}
                      {m.provision_betrag_nur_gutachter_netto !== null ? `${m.provision_betrag_nur_gutachter_netto} €` : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">{formatDatum(m.aktiviert_am)}</span>
                  </Td>
                </Tr>
              ))}
              {maklers.length === 0 && (
                <Tr>
                  <Td colSpan={5} className="py-12! text-center text-claimondo-ondo!">
                    Noch keine Makler angelegt.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>

        <Modal open={showDialog} onClose={() => setShowDialog(false)} maxWidth={520} ariaLabel="Neuer Makler">
          {createdCredentials ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyIcon className="w-5 h-5 text-success-strong" />
                <h2 className="text-claimondo-navy font-semibold text-lg">Makler angelegt</h2>
              </div>
              <p className="text-claimondo-ondo text-sm">
                Zugangsdaten einmalig anzeigen — bitte sofort an den Makler weitergeben.
              </p>
              <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-4 space-y-2">
                <div>
                  <p className="text-xs text-claimondo-ondo mb-0.5">E-Mail</p>
                  <p className="text-claimondo-navy font-medium text-sm select-all">{createdCredentials.email}</p>
                </div>
                <div>
                  <p className="text-xs text-claimondo-ondo mb-0.5">Passwort (einmalig)</p>
                  <p className="text-claimondo-navy font-mono font-medium text-sm select-all">{createdCredentials.password}</p>
                </div>
              </div>
              <p className="text-xs text-claimondo-ondo">
                Das Passwort wird beim ersten Login zur Änderung aufgefordert. Ein Promo-Code (MK-…) wurde automatisch angelegt.
              </p>
              <Button variant="navy" fullWidth onClick={() => { setCreatedCredentials(null); setShowDialog(false) }}>
                Schließen
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Neuer Makler</h2>
              <form onSubmit={handleCreate} className="space-y-3">
                <TextField label="Firma" name="firma" required placeholder="z.B. Müller Versicherungsmakler GmbH" />
                <TextField label="E-Mail (Login)" name="email" type="email" required placeholder="makler@beispiel.de" />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Ansprechpartner Vorname" name="ansprechpartner_vorname" required placeholder="Max" />
                  <TextField label="Nachname" name="ansprechpartner_nachname" required placeholder="Müller" />
                </div>
                <TextField label="Telefon (optional)" name="telefon" type="tel" placeholder="+49 221 …" />
                <TextField label="Straße (optional)" name="adresse_strasse" placeholder="Musterstraße 1" />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="PLZ" name="adresse_plz" placeholder="50667" />
                  <TextField label="Ort" name="adresse_ort" placeholder="Köln" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Provision komplett (€)" name="provision_betrag_komplett_netto" type="number" step="0.01" min="0" defaultValue={100} />
                  <TextField label="Provision nur Gutachter (€)" name="provision_betrag_nur_gutachter_netto" type="number" step="0.01" min="0" defaultValue={50} />
                </div>
                <div>
                  <p className="text-xs font-medium text-claimondo-ondo mb-1">Gesellschaft</p>
                  <GesellschaftSelect
                    versicherungen={versicherungen}
                    maklerpools={maklerpools}
                    versicherungId={versicherungId}
                    maklerpoolId={maklerpoolId}
                    onChange={({ versicherungId: v, maklerpoolId: p }) => {
                      setVersicherungId(v)
                      setMaklerpoolId(p)
                    }}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" fullWidth onClick={() => setShowDialog(false)}>Abbrechen</Button>
                  <Button variant="navy" fullWidth type="submit" loading={loading} disabled={loading}>Anlegen</Button>
                </div>
              </form>
            </>
          )}
        </Modal>
      </div>
    </div>
  )
}
