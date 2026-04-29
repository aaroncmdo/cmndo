'use client'

// AAR-110: Lead manuell anlegen Drawer
// AAR-695: service_typ raus (wird im Lead-Flow gesetzt, ist Endpoint-Sender
// für die Kanzlei). Google-Maps-Autocomplete für die Adresse rein.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, XIcon } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { createManualLead, type CreateManualLeadInput } from '../actions'
import { Drawer } from '@/components/primitives/Drawer'

const INITIAL: CreateManualLeadInput = {
  anrede: null,
  vorname: '',
  nachname: '',
  telefon: '',
  email: '',
  fahrzeug_farbe: '',
  kunde_adresse: '',
  kunde_strasse: '',
  kunde_plz: '',
  kunde_stadt: '',
  kunde_lat: null,
  kunde_lng: null,
  source_channel: 'manuell',
  notizen: '',
}

export default function NeuLeadDrawer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CreateManualLeadInput>(INITIAL)

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await createManualLead(data)
      if (!result.success || !result.leadId) {
        setError(result.error ?? 'Fehler')
        return
      }
      setData(INITIAL)
      setOpen(false)
      router.push(`/dispatch/leads/${result.leadId}`)
    })
  }

  function handlePlaceSelect(p: PlaceResult) {
    setData((d) => ({
      ...d,
      kunde_adresse: p.adresse,
      kunde_strasse: p.strasse || d.kunde_strasse,
      kunde_plz: p.plz || d.kunde_plz,
      kunde_stadt: p.stadt || d.kunde_stadt,
      kunde_lat: p.lat,
      kunde_lng: p.lng,
    }))
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-claimondo-shield hover:bg-claimondo-ondo text-white transition-colors"
      >
        <PlusIcon className="w-4 h-4" />
        Neuer Lead
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} width={448} noPadding hideCloseButton ariaLabel="Neuer Lead">
        <div className="sticky top-0 bg-white border-b border-claimondo-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-claimondo-navy">Neuer Lead</h2>
          <button onClick={() => setOpen(false)} className="text-claimondo-ondo/70 hover:text-claimondo-navy">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* CMM-32: Anrede-Dropdown für saubere WhatsApp/Email-Anrede */}
          <div>
            <label className="block text-xs text-claimondo-ondo mb-1.5">Anrede</label>
            <select
              value={data.anrede ?? ''}
              onChange={(e) =>
                setData({ ...data, anrede: (e.target.value || null) as 'herr' | 'frau' | 'divers' | null })
              }
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-xl text-sm bg-white focus:outline-none focus:border-claimondo-ondo"
            >
              <option value="">— bitte wählen —</option>
              <option value="herr">Herr</option>
              <option value="frau">Frau</option>
              <option value="divers">Divers</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Vorname" value={data.vorname} onChange={v => setData({ ...data, vorname: v })} />
            <InputField label="Nachname" value={data.nachname} onChange={v => setData({ ...data, nachname: v })} />
          </div>
          <InputField label="Telefon *" value={data.telefon} onChange={v => setData({ ...data, telefon: v })} type="tel" placeholder="+49..." />
          <InputField label="E-Mail" value={data.email} onChange={v => setData({ ...data, email: v })} type="email" />
          {/* CMM-32: Lackfarbe vom Dispatcher direkt erfasst — SV identifiziert
              das Fahrzeug vor Ort visuell, und die Farbe kommt mit Hersteller +
              Modell auf den Banner-Header der Fallakte. */}
          <InputField label="Lackfarbe" value={data.fahrzeug_farbe ?? ''} onChange={v => setData({ ...data, fahrzeug_farbe: v })} placeholder="z. B. Saphirschwarz Metallic" />

          {/* AAR-695: Google-Maps-Autocomplete für die Kunden-Adresse.
              Liefert direkt Adresse + PLZ + Lat/Lng — wird in Phase 1 ohnehin
              für Isochrone-Matching gebraucht. */}
          <div>
            <label className="block text-xs text-claimondo-ondo mb-1.5">Adresse</label>
            <GooglePlaceAutocomplete
              defaultValue={data.kunde_adresse}
              placeholder="Straße, PLZ, Stadt"
              onSelect={handlePlaceSelect}
              // CMM-23: onChange synchron — wenn User tippt aber direkt
              // auf "Lead anlegen" klickt (ohne Maps-Suggestion zu wählen
              // und ohne blur durchlaufen zu lassen), bleibt der Wert
              // permanent im Parent-State.
              onChange={(text) => setData((d) => ({ ...d, kunde_adresse: text }))}
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-claimondo-ondo"
            />
            {data.kunde_lat && data.kunde_lng && (
              <p className="text-[10px] text-claimondo-ondo/70 mt-1">
                ✓ Koordinaten {data.kunde_lat.toFixed(4)}, {data.kunde_lng.toFixed(4)}
                {data.kunde_plz && ` · PLZ ${data.kunde_plz}`}
              </p>
            )}
          </div>

          {/* AAR-216: Schadentyp-Dropdown wird in Phase 2 erfasst. */}
          {/* AAR-695: Service-Typ-Dropdown raus — wird im Lead-Flow festgelegt
              (service_typ ist u. a. Endpoint-Sender für die Kanzlei). */}

          <div>
            <label className="block text-xs text-claimondo-ondo mb-1.5">Quelle</label>
            <select
              value={data.source_channel}
              onChange={e => setData({ ...data, source_channel: e.target.value })}
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-claimondo-ondo"
            >
              <option value="manuell">Manuell angelegt</option>
              <option value="telefon">Telefon (kein Aircall)</option>
              <option value="email">E-Mail</option>
              <option value="empfehlung">Empfehlung</option>
              <option value="google-ads">Google Ads</option>
              <option value="website">Website</option>
              <option value="test">Test-Lead</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-claimondo-ondo mb-1.5">Notizen</label>
            <textarea
              value={data.notizen}
              onChange={e => setData({ ...data, notizen: e.target.value })}
              rows={3}
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-claimondo-ondo"
              placeholder="Optionale Notizen zum Lead..."
            />
          </div>

          {error && <p className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="flex-1 py-2.5 text-sm text-claimondo-ondo hover:bg-[#f8f9fb] rounded-xl">
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              disabled={pending || !data.telefon}
              className="flex-1 py-2.5 text-sm font-semibold bg-claimondo-shield hover:bg-claimondo-ondo text-white rounded-xl disabled:opacity-40"
            >
              {pending ? 'Erstelle...' : 'Lead anlegen'}
            </button>
          </div>
        </div>
      </Drawer>
    </>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs text-claimondo-ondo mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-claimondo-ondo"
      />
    </div>
  )
}
