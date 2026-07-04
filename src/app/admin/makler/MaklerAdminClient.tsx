'use client'

// Makler-Vermittlung: Admin-Anlage-UI. Spiegelt WerkstaettenClient (primitives Button/Modal +
// DataTable + TextField + createdCredentials-Pattern), aber: plain Adress-Felder (kein Geo/Isochrone),
// dual-rate, und handleCreate MIT try/catch (WerkstaettenClient hat hier einen Silent-Swallow-Bug).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UsersIcon, PlusIcon, KeyIcon, Layers3Icon, Trash2Icon } from 'lucide-react'
import { createMakler } from './actions'
import { getMaklerStaffel, setMaklerStaffel } from './staffel-actions'
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

  // Staffelung pro Makler (Meilenstein-Boni) — gespiegelt von WerkstaettenClient
  const [staffelFor, setStaffelFor] = useState<Makler | null>(null)
  const [staffelRows, setStaffelRows] = useState<{ schwelle: string; bonus: string }[]>([])
  const [staffelLoadingId, setStaffelLoadingId] = useState<string | null>(null)
  const [staffelSaving, setStaffelSaving] = useState(false)

  async function openStaffel(m: Makler) {
    setStaffelLoadingId(m.id)
    try {
      const res = await getMaklerStaffel(m.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setStaffelRows(res.stufen.map((s) => ({ schwelle: String(s.schwelle), bonus: String(s.bonus_betrag_netto) })))
      setStaffelFor(m)
    } finally {
      setStaffelLoadingId(null)
    }
  }
  function addStaffelRow() {
    setStaffelRows((rows) => [...rows, { schwelle: '', bonus: '' }])
  }
  function removeStaffelRow(i: number) {
    setStaffelRows((rows) => rows.filter((_, idx) => idx !== i))
  }
  function updateStaffelRow(i: number, field: 'schwelle' | 'bonus', val: string) {
    setStaffelRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)))
  }
  async function saveStaffel() {
    if (!staffelFor) return
    setStaffelSaving(true)
    try {
      const stufen = staffelRows
        .filter((r) => r.schwelle.trim() !== '')
        .map((r) => ({ schwelle: Number(r.schwelle), bonus_betrag_netto: Number(r.bonus || 0) }))
      const res = await setMaklerStaffel(staffelFor.id, stufen)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Staffelung gespeichert.')
      setStaffelFor(null)
      router.refresh()
    } finally {
      setStaffelSaving(false)
    }
  }

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
                <Th className="text-left text-claimondo-ondo!">Staffelung</Th>
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
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={staffelLoadingId === m.id}
                      onClick={() => openStaffel(m)}
                      iconLeft={<Layers3Icon className="w-4 h-4" />}
                    >
                      Staffel
                    </Button>
                  </Td>
                </Tr>
              ))}
              {maklers.length === 0 && (
                <Tr>
                  <Td colSpan={6} className="py-12! text-center text-claimondo-ondo!">
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

        <Modal open={staffelFor !== null} onClose={() => setStaffelFor(null)} maxWidth={520} ariaLabel="Staffelung bearbeiten">
          {staffelFor && (
            <div className="space-y-4">
              <div>
                <h2 className="text-claimondo-navy font-semibold text-lg">Staffelung — {staffelFor.firma}</h2>
                <p className="mt-0.5 text-claimondo-ondo text-sm">
                  Meilenstein-Boni: ab X freigegebenen Vermittlungen ein Einmal-Bonus.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 text-xs font-medium text-claimondo-ondo">
                  <span className="flex-1">ab … Vermittlungen</span>
                  <span className="flex-1">Bonus (netto, €)</span>
                  <span className="w-11 shrink-0" />
                </div>
                {staffelRows.length === 0 && (
                  <p className="px-1 text-sm text-claimondo-ondo/70">Noch keine Stufen — füge eine hinzu.</p>
                )}
                {staffelRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="number" min="1" step="1" inputMode="numeric" value={r.schwelle}
                      onChange={(e) => updateStaffelRow(i, 'schwelle', e.target.value)} placeholder="z.B. 10"
                      className="flex-1 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy"
                    />
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal" value={r.bonus}
                      onChange={(e) => updateStaffelRow(i, 'bonus', e.target.value)} placeholder="z.B. 500"
                      className="flex-1 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy"
                    />
                    <Button
                      variant="ghost" size="icon" ariaLabel="Stufe entfernen"
                      onClick={() => removeStaffelRow(i)} iconLeft={<Trash2Icon width={15} height={15} />}
                    />
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={addStaffelRow} iconLeft={<PlusIcon className="w-4 h-4" />}>
                Stufe hinzufügen
              </Button>
              <div className="flex gap-3 pt-2">
                <Button variant="ghost" fullWidth onClick={() => setStaffelFor(null)}>Abbrechen</Button>
                <Button variant="navy" fullWidth loading={staffelSaving} onClick={saveStaffel}>Speichern</Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  )
}
