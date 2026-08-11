'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2Icon, InfoIcon } from 'lucide-react'
import { Button } from '@/components/primitives/Button'
import { SectionCard } from '@/components/shared/SectionCard'
import type { VersichererDetail } from '@/lib/versicherungen/queries'
import {
  updateVersicherung,
  setVersicherungAktiv,
  type VersicherungInput,
} from '../../actions'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'

// `get` liest den aktuellen Wert aus dem (camelCase-)Detail — damit der Lese-Modus
// immer die frischen Server-Daten zeigt, nicht den evtl. veralteten Form-State.
const FELDER: Array<{
  key: keyof VersicherungInput
  label: string
  type?: string
  get: (v: VersichererDetail) => string | null
}> = [
  { key: 'name', label: 'Name', get: (v) => v.name },
  { key: 'bafin_nummer', label: 'BaFin-Nummer', get: (v) => v.bafinNummer },
  { key: 'schaden_telefon', label: 'Schadentelefon', type: 'tel', get: (v) => v.schadenTelefon },
  { key: 'schaden_email', label: 'Schaden-E-Mail', type: 'email', get: (v) => v.schadenEmail },
  { key: 'hotline_telefon', label: 'Hotline', type: 'tel', get: (v) => v.hotlineTelefon },
  { key: 'webseite', label: 'Webseite', type: 'url', get: (v) => v.webseite },
  { key: 'adresse', label: 'Adresse', get: (v) => v.adresse },
  { key: 'plz', label: 'PLZ', get: (v) => v.plz },
  { key: 'stadt', label: 'Stadt', get: (v) => v.stadt },
]

function toInput(v: VersichererDetail): VersicherungInput {
  return {
    name: v.name,
    bafin_nummer: v.bafinNummer,
    schaden_telefon: v.schadenTelefon,
    schaden_email: v.schadenEmail,
    hotline_telefon: v.hotlineTelefon,
    webseite: v.webseite,
    adresse: v.adresse,
    plz: v.plz,
    stadt: v.stadt,
  }
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-ios-sm border border-claimondo-border bg-white text-body-sm ' +
  'text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30'

export default function StammdatenTab({ versicherer }: { versicherer: VersichererDetail }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<VersicherungInput>(() => toInput(versicherer))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateVersicherung(versicherer.id, form)
      if (!res.ok) {
        setError(res.error ?? 'Speichern fehlgeschlagen.')
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function toggleAktiv() {
    setError(null)
    startTransition(async () => {
      const res = await setVersicherungAktiv(versicherer.id, !versicherer.istAktiv)
      if (!res.ok) {
        setError(res.error ?? 'Statuswechsel fehlgeschlagen.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Stammdaten"
        icon={<Building2Icon className="w-4 h-4 text-claimondo-ondo" />}
        headerAction={
          editing ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setForm(toInput(versicherer)); setError(null) }}>
                Abbrechen
              </Button>
              <Button variant="navy" size="sm" loading={pending} onClick={save}>
                Speichern
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant={versicherer.istAktiv ? 'danger' : 'success'}
                size="sm"
                loading={pending}
                onClick={toggleAktiv}
              >
                {versicherer.istAktiv ? 'Deaktivieren' : 'Aktivieren'}
              </Button>
              <Button
                variant="navy"
                size="sm"
                onClick={() => {
                  // Form aus den FRISCHEN Server-Daten neu seeden — sonst haelt es
                  // nach einem router.refresh() noch den alten Stand.
                  setForm(toInput(versicherer))
                  setError(null)
                  setEditing(true)
                }}
              >
                Bearbeiten
              </Button>
            </div>
          )
        }
        bodyClassName="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        {FELDER.map((f) => (
          <div key={f.key} className="min-w-0">
            <label className="block text-caption text-claimondo-ondo/70 mb-1" htmlFor={`vs-${f.key}`}>
              {f.label}
              {f.key === 'name' && <span className="text-danger"> *</span>}
            </label>
            {editing ? (
              f.key === 'adresse' ? (
                /* P3 Ortseingaben: Autocomplete füllt Adresse + PLZ + Stadt (plz/stadt bleiben editierbar). */
                <GooglePlaceAutocomplete
                  className={INPUT_CLS}
                  defaultValue={form.adresse ?? ''}
                  placeholder="Straße + Hausnummer, Stadt eingeben…"
                  onSelect={(r) =>
                    setForm((s) => ({
                      ...s,
                      adresse: r.strasse || s.adresse,
                      plz: r.plz || s.plz,
                      stadt: r.stadt || s.stadt,
                    }))
                  }
                  onChange={(t) => setForm((s) => ({ ...s, adresse: t || null }))}
                />
              ) : (
                <input
                  id={`vs-${f.key}`}
                  type={f.type ?? 'text'}
                  className={INPUT_CLS}
                  value={form[f.key] ?? ''}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, [f.key]: e.target.value === '' ? null : e.target.value }))
                  }
                />
              )
            ) : (
              <p className="text-body-sm text-claimondo-navy break-words">
                {f.get(versicherer) || '—'}
              </p>
            )}
          </div>
        ))}

        {error && (
          <p className="sm:col-span-2 text-body-sm text-danger-strong bg-danger-soft rounded-ios-sm px-3 py-2">
            {error}
          </p>
        )}
      </SectionCard>

      {/* Felder, die die Liste nie zeigte */}
      <SectionCard
        title="System"
        icon={<InfoIcon className="w-4 h-4 text-claimondo-ondo" />}
        subtitle="Automatisch gepflegt — in der Liste nicht sichtbar."
        bodyClassName="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <div>
          <dt className="text-caption text-claimondo-ondo/70">Normalisierter Name</dt>
          <dd className="text-body-sm font-mono text-claimondo-navy break-words">
            {versicherer.normalizedName || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-claimondo-ondo/70">Angelegt</dt>
          <dd className="text-body-sm text-claimondo-navy">
            {versicherer.erstelltAm
              ? new Date(versicherer.erstelltAm).toLocaleDateString('de-DE')
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-claimondo-ondo/70">Zuletzt geändert</dt>
          <dd className="text-body-sm text-claimondo-navy">
            {versicherer.aktualisiertAm
              ? new Date(versicherer.aktualisiertAm).toLocaleDateString('de-DE')
              : '—'}
          </dd>
        </div>
      </SectionCard>
    </div>
  )
}
