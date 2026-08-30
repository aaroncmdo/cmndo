'use client'

// MaklerAnlegenForm — reiner Formular-Content (ohne Modal/Drawer-Chrome).
// Kann von MaklerAdminClient (standalone /admin/makler Modal) UND vom
// Vertrieb-Cockpit-Drawer verwendet werden.
// Props: onClose schliesst den umgebenden Container; onCreated wird nach
// erfolgreichem Anlegen aufgerufen (optional).

import { useState } from 'react'
import { toast } from 'sonner'
import { KeyIcon } from 'lucide-react'
import { createMakler } from './actions'
import { GesellschaftSelect } from '@/components/makler/GesellschaftSelect'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { SelectField } from '@/components/shared/forms/SelectField'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { RECHTSFORM_OPTIONEN } from '@/lib/rechtsformen'

// Typ lokal definiert — NICHT aus 'use server'-Files importieren (AAR-664: Client-Bundle
// macht importierte Konstanten/Typen aus Server-Files zu undefined).
type GesellschaftOption = { id: string; name: string }

export default function MaklerAnlegenForm({
  versicherungen,
  maklerpools,
  onClose,
  onCreated,
}: {
  versicherungen: GesellschaftOption[]
  maklerpools: GesellschaftOption[]
  onClose: () => void
  onCreated?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null)
  const [versicherungId, setVersicherungId] = useState<string | null>(null)
  const [maklerpoolId, setMaklerpoolId] = useState<string | null>(null)
  // P3 Ortseingaben: Adresse controlled (GooglePlaceAutocomplete rendert kein name) → Submit via fd.set.
  const [adr, setAdr] = useState({ strasse: '', plz: '', ort: '' })

  function reset() {
    setVersicherungId(null)
    setMaklerpoolId(null)
    setCreatedCredentials(null)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    if (versicherungId) fd.set('versicherung_id', versicherungId)
    if (maklerpoolId) fd.set('maklerpool_id', maklerpoolId)
    fd.set('adresse_strasse', adr.strasse)
    fd.set('adresse_plz', adr.plz)
    fd.set('adresse_ort', adr.ort)
    try {
      const result = await createMakler(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCreatedCredentials({ email: result.email, password: result.password })
      toast.success(`Makler angelegt: ${result.email}`)
      onCreated?.()
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anlage fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  if (createdCredentials) {
    return (
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
        <Button variant="navy" fullWidth onClick={onClose}>
          Schließen
        </Button>
      </div>
    )
  }

  return (
    <>
      <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Makler anlegen</h2>
      <form onSubmit={handleCreate} className="space-y-3">
        <TextField label="Firma" name="firma" required placeholder="z.B. Müller Versicherungsmakler GmbH" />
        <SelectField
          label="Rechtsform *"
          name="rechtsform"
          required
          defaultValue=""
          options={RECHTSFORM_OPTIONEN.map((o) => ({ value: o, label: o || '— wählen —' }))}
        />
        <TextField label="E-Mail (Login)" name="email" type="email" required placeholder="makler@beispiel.de" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Ansprechpartner Vorname" name="ansprechpartner_vorname" required placeholder="Max" />
          <TextField label="Nachname" name="ansprechpartner_nachname" required placeholder="Müller" />
        </div>
        <TextField label="Telefon (optional)" name="telefon" type="tel" placeholder="+49 221 …" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="adr-makleranlegenform" className="text-xs font-semibold text-claimondo-shield">Straße (optional)</label>
          {/* P3 Ortseingaben: Autocomplete füllt Straße + PLZ + Ort (controlled state → Submit via fd.set). */}
          <GooglePlaceAutocomplete
            id="adr-makleranlegenform"
            className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
            defaultValue={adr.strasse}
            placeholder="Musterstraße 1"
            onSelect={(r) => setAdr((a) => ({ strasse: r.strasse || a.strasse, plz: r.plz || a.plz, ort: r.stadt || a.ort }))}
            onChange={(t) => setAdr((a) => ({ ...a, strasse: t }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="PLZ" value={adr.plz} onChange={(e) => setAdr((a) => ({ ...a, plz: e.target.value }))} placeholder="50667" />
          <TextField label="Ort" value={adr.ort} onChange={(e) => setAdr((a) => ({ ...a, ort: e.target.value }))} placeholder="Köln" />
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
        <label className="flex items-start gap-2 text-sm text-claimondo-shield">
          <input type="checkbox" name="kleinunternehmer" className="mt-0.5 h-4 w-4 rounded border-claimondo-border" />
          <span>Kleinunternehmer nach §19 UStG (Provisionsgutschrift ohne Umsatzsteuer)</span>
        </label>
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={onClose} type="button">Abbrechen</Button>
          <Button variant="navy" fullWidth type="submit" loading={loading} disabled={loading}>Anlegen</Button>
        </div>
      </form>
    </>
  )
}
