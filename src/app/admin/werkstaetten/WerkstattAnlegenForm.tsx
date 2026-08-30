'use client'

// WerkstattAnlegenForm — reiner Formular-Content (ohne Modal/Drawer-Chrome).
// Kann von WerkstaettenClient (standalone /admin/werkstaetten Modal) UND vom
// Vertrieb-Cockpit-Drawer verwendet werden.
// Props: onClose schliesst den umgebenden Container; onCreated wird nach
// erfolgreichem Anlegen aufgerufen (optional).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyIcon, ArrowRightIcon } from 'lucide-react'
import { createWerkstatt } from './actions'
import { Button } from '@/components/primitives'
import { Chip } from '@/components/ui/Chip'
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

export default function WerkstattAnlegenForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated?: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string
    password: string
    werkstattId: string
  } | null>(null)
  const [faehigkeiten, setFaehigkeiten] = useState<string[]>([])

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

  function reset() {
    setAdresse({ strasse: '', plz: '', ort: '', lat: null, lng: null, display: '' })
    setCreatedCredentials(null)
    setFaehigkeiten([])
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
      onCreated?.()
      reset()
    } finally {
      setLoading(false)
    }
  }

  function toggleFaehigkeit(value: string) {
    setFaehigkeiten((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  if (createdCredentials) {
    return (
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
          onClick={() => router.push(`/admin/vertrieb/werkstaetten/${createdCredentials.werkstattId}`)}
          iconLeft={<ArrowRightIcon className="w-4 h-4" />}
        >
          Zur Werkstatt-Verwaltung
        </Button>
        <Button
          variant="ghost"
          fullWidth
          onClick={() => {
            setCreatedCredentials(null)
            onClose()
          }}
        >
          Schließen
        </Button>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Werkstatt anlegen</h2>
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
          <label htmlFor="adr-werkstattanlegenform" className="text-sm text-claimondo-ondo mb-1 block">Standort</label>
          <GooglePlaceAutocomplete
            id="adr-werkstattanlegenform"
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
              const active = faehigkeiten.includes(opt.value)
              return (
                <Chip
                  key={opt.value}
                  variant={active ? 'selected' : 'default'}
                  onClick={() => toggleFaehigkeit(opt.value)}
                >
                  {opt.label}
                </Chip>
              )
            })}
          </div>
          {/* Hidden inputs so FormData.getAll('faehigkeiten') liefert die Auswahl */}
          {faehigkeiten.map((v) => (
            <input key={v} type="hidden" name="faehigkeiten" value={v} />
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={onClose} type="button">
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
  )
}
