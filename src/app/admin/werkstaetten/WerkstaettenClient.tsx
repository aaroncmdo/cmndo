'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { WrenchIcon, PlusIcon, KeyIcon, QrCodeIcon, ArrowRightIcon } from 'lucide-react'
import { createWerkstatt } from './actions'
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { Chip } from '@/components/ui/Chip'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { TextField } from '@/components/shared/forms/TextField'

// Label-Map im Client (NICHT aus actions.ts importieren — Client-Bundle macht undefined daraus, AAR-664)
const FAEHIGKEITEN_OPTIONS: { value: string; label: string }[] = [
  { value: 'karosserie', label: 'Karosserie / Blech' },
  { value: 'lackierung', label: 'Lackierung / Kratzer' },
  { value: 'mechanik', label: 'Mechanik / Motor' },
  { value: 'glas', label: 'Glas' },
  { value: 'smart_repair', label: 'Smart-Repair' },
]

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
// Abrechnung, Status, Stammdaten, Notizen, …) lebt komplett in der Detailseite
// /admin/werkstaetten/[id]. Hier bleibt nur: Ueberblick + Klick auf eine Zeile -> Verwaltung,
// plus "Neue Werkstatt" anlegen.
export default function WerkstaettenClient({ werkstaetten }: { werkstaetten: Werkstatt[] }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; werkstattId: string } | null>(null)
  const [createFaehigkeiten, setCreateFaehigkeiten] = useState<string[]>([])

  // Adress-State fuer GooglePlaceAutocomplete → hidden form fields
  const [adresse, setAdresse] = useState<{
    strasse: string
    plz: string
    ort: string
    lat: number | null
    lng: number | null
    display: string
  }>({ strasse: '', plz: '', ort: '', lat: null, lng: null, display: '' })

  function handlePlaceSelect(result: PlaceResult) {
    setAdresse({
      strasse: result.strasse,
      plz: result.plz,
      ort: result.stadt,
      lat: result.lat,
      lng: result.lng,
      display: result.adresse,
    })
  }

  function openDialog() {
    setAdresse({ strasse: '', plz: '', ort: '', lat: null, lng: null, display: '' })
    setCreatedCredentials(null)
    setCreateFaehigkeiten([])
    setShowDialog(true)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    // Inject address fields from state (GooglePlaceAutocomplete doesn't render hidden inputs itself)
    fd.set('adresse_strasse', adresse.strasse)
    fd.set('adresse_plz', adresse.plz)
    fd.set('adresse_ort', adresse.ort)
    fd.set('lat', adresse.lat !== null ? String(adresse.lat) : '')
    fd.set('lng', adresse.lng !== null ? String(adresse.lng) : '')

    try {
      const result = await createWerkstatt(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCreatedCredentials({ email: result.email, password: result.password, werkstattId: result.werkstattId })
      toast.success(`Werkstatt angelegt: ${result.email}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  function toggleCreateFaehigkeit(value: string) {
    setCreateFaehigkeiten((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
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
                      href={`/admin/werkstaetten/${w.id}`}
                      className="text-claimondo-navy font-medium hover:text-claimondo-ondo hover:underline"
                    >
                      {w.name}
                    </Link>
                    <div className="text-claimondo-ondo text-xs">{w.email ?? '—'}</div>
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
          {createdCredentials ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyIcon className="w-5 h-5 text-success-strong" />
                <h2 className="text-claimondo-navy font-semibold text-lg">Werkstatt angelegt</h2>
              </div>
              <p className="text-claimondo-ondo text-sm">
                Zugangsdaten einmalig notieren. Login-Mail senden und QR-Code zuweisen erfolgt in der
                Werkstatt-Verwaltung.
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
                Das Passwort wird dem Nutzer beim ersten Login zur Änderung aufgefordert.
              </p>
              <Button
                variant="navy"
                fullWidth
                onClick={() => router.push(`/admin/werkstaetten/${createdCredentials.werkstattId}`)}
                iconLeft={<ArrowRightIcon className="w-4 h-4" />}
              >
                Zur Werkstatt-Verwaltung
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setCreatedCredentials(null)
                  setShowDialog(false)
                }}
              >
                Schließen
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Neue Werkstatt</h2>
              <form onSubmit={handleCreate} className="space-y-3">
                <TextField
                  label="Name der Werkstatt"
                  name="name"
                  required
                  placeholder="z.B. Auto-Service Müller GmbH"
                />
                <TextField
                  label="E-Mail (Login)"
                  name="email"
                  type="email"
                  required
                  placeholder="werkstatt@beispiel.de"
                />
                <TextField
                  label="Telefon (optional)"
                  name="telefon"
                  type="tel"
                  placeholder="+49 221 …"
                />
                <TextField
                  label="Ansprechpartner / Geschäftsführer (optional)"
                  name="ansprechpartner_name"
                  placeholder="z.B. Max Mustermann"
                />
                <div>
                  <label className="text-sm text-claimondo-ondo mb-1 block">Standort</label>
                  <GooglePlaceAutocomplete
                    placeholder="Adresse der Werkstatt eingeben…"
                    onSelect={handlePlaceSelect}
                    defaultValue={adresse.display}
                  />
                  {adresse.lat !== null && (
                    <p className="text-xs text-claimondo-ondo mt-1">
                      {adresse.strasse}, {adresse.plz} {adresse.ort} — Koordinaten gespeichert
                    </p>
                  )}
                </div>
                <TextField
                  label="Provision (netto, €)"
                  name="provision_betrag_netto"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={150}
                />
                <div>
                  <label className="text-sm text-claimondo-ondo mb-2 block">
                    Fähigkeiten (optional — leer = Vollservice)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FAEHIGKEITEN_OPTIONS.map((opt) => {
                      const active = createFaehigkeiten.includes(opt.value)
                      return (
                        <Chip
                          key={opt.value}
                          variant={active ? 'selected' : 'default'}
                          onClick={() => toggleCreateFaehigkeit(opt.value)}
                        >
                          {opt.label}
                        </Chip>
                      )
                    })}
                  </div>
                  {/* Hidden inputs so FormData.getAll('faehigkeiten') liefert die Auswahl */}
                  {createFaehigkeiten.map((v) => (
                    <input key={v} type="hidden" name="faehigkeiten" value={v} />
                  ))}
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="ghost" fullWidth onClick={() => setShowDialog(false)}>
                    Abbrechen
                  </Button>
                  <Button
                    variant="navy"
                    fullWidth
                    type="submit"
                    loading={loading}
                    disabled={loading || adresse.lat === null}
                  >
                    Anlegen
                  </Button>
                </div>
              </form>
            </>
          )}
        </Modal>
      </div>
    </div>
  )
}
