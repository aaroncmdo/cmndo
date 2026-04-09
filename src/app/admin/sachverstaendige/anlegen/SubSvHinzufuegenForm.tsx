'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2Icon, MailIcon } from 'lucide-react'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { LoadingButton } from '@/components/ui/loading-button'
import { anlegeSubSv } from './actions'
import { PAKET_KONFIG, ANREDE_OPTIONEN, TITEL_OPTIONEN, QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN, type AnlegePaket } from './constants'

// ARCH-1 Phase 2 (BLOCK C): Sub-SV zu bestehender Buero-Org hinzufuegen.

export default function SubSvHinzufuegenForm({ organisationen, onSuccess }: {
  organisationen: Array<{ id: string; name: string }>
  // ARCH-1 POLISH Befund 4: optional fuer Drawer-Verwendung.
  onSuccess?: (info: { name: string; email: string }) => void
}) {
  const router = useRouter()
  const [orgId, setOrgId] = useState('')
  const [anrede, setAnrede] = useState('')
  const [titel, setTitel] = useState('')
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [anschrift, setAnschrift] = useState('')
  const [anschriftLat, setAnschriftLat] = useState<number | null>(null)
  const [anschriftLng, setAnschriftLng] = useState<number | null>(null)
  const [anschriftPlaceId, setAnschriftPlaceId] = useState('')
  const [anschriftPlz, setAnschriftPlz] = useState('')
  const [paket, setPaket] = useState<AnlegePaket>('standard')
  // KFZ-154: 3 Spezialisierungs-Listen
  const [qualifikationen, setQualifikationen] = useState<string[]>([])
  const [spezifikationen, setSpezifikationen] = useState<string[]>([])
  const [schadenarten, setSchadenarten] = useState<string[]>([])

  function toggleTag(setter: (fn: (prev: string[]) => string[]) => void, value: string) {
    setter(prev => prev.includes(value) ? prev.filter(x => x !== value) : [...prev, value])
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sv_id: string; org_name: string } | null>(null)

  if (organisationen.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <p className="text-gray-500 text-sm">
          Noch keine Büro-Organisationen vorhanden. Lege zuerst ein Büro an, dann kannst du Sub-SVs hinzufügen.
        </p>
      </div>
    )
  }

  async function handleSubmit() {
    setError(null)
    if (!orgId || !anrede || !email || !vorname || !nachname || anschriftLat === null) {
      setError('Bitte alle Pflichtfelder ausfüllen + Anschrift via Dropdown wählen')
      return
    }
    setSaving(true)
    const r = await anlegeSubSv({
      organisation_id: orgId,
      sub_anrede: anrede,
      sub_titel: titel || undefined,
      sub_email: email,
      sub_vorname: vorname,
      sub_nachname: nachname,
      sub_telefon: telefon || undefined,
      anschrift,
      anschrift_lat: anschriftLat,
      anschrift_lng: anschriftLng,
      anschrift_place_id: anschriftPlaceId || undefined,
      anschrift_plz: anschriftPlz,
      paket,
      qualifikationen,
      spezifikationen,
      schadenarten,
    })
    setSaving(false)
    if (!r.success) { setError(r.error ?? 'Anlegen fehlgeschlagen'); return }
    const orgName = organisationen.find(o => o.id === orgId)?.name ?? '?'
    setResult({ sv_id: r.sv_id!, org_name: orgName })
    onSuccess?.({ name: `${vorname} ${nachname}`.trim(), email })
  }

  if (result) {
    return (
      <div className="bg-white border border-green-200 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2Icon className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{vorname} {nachname} angelegt</h2>
            <p className="text-sm text-gray-500 mt-1">
              Hinzugefügt zu <strong>{result.org_name}</strong>. Welcome-Mail an {email} versendet, Mail-Kopie an Inhaber.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => router.push('/admin/sachverstaendige')}
                className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold"
              >
                Zur SV-Liste
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-5">Sub-SV zu bestehender Org hinzufügen</h2>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Organisation *</label>
          <select
            value={orgId}
            onChange={e => setOrgId(e.target.value)}
            className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          >
            <option value="">Auswählen...</option>
            {organisationen.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* ARCH-1 POLISH: Anrede + Titel als Dropdowns vor Vor-/Nachname */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Anrede *"
            value={anrede}
            onChange={setAnrede}
            options={ANREDE_OPTIONEN}
            placeholder="Bitte waehlen..."
          />
          <SelectField
            label="Titel"
            value={titel}
            onChange={setTitel}
            options={TITEL_OPTIONEN}
            placeholder="kein Titel"
          />
          <Field label="Vorname *" value={vorname} onChange={setVorname} />
          <Field label="Nachname *" value={nachname} onChange={setNachname} />
          <Field label="Email *" type="email" value={email} onChange={setEmail} className="sm:col-span-2" />
          <Field label="Telefon" type="tel" value={telefon} onChange={setTelefon} className="sm:col-span-2" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">
            Standort-Anschrift * {anschriftLat !== null && <span className="text-green-600 ml-2">✓ Geo</span>}
          </label>
          <GooglePlaceAutocomplete
            defaultValue={anschrift}
            placeholder="Adresse via Dropdown..."
            onSelect={place => {
              setAnschrift(place.adresse)
              setAnschriftPlz(place.plz)
              setAnschriftLat(place.lat)
              setAnschriftLng(place.lng)
              setAnschriftPlaceId(place.place_id)
            }}
            className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-2 block uppercase tracking-wide">Paket</label>
          <div className="grid grid-cols-3 gap-2">
            {(['standard', 'pro', 'premium'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPaket(p)}
                className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                  paket === p
                    ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 text-[#1E3A5F] font-semibold'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <div className="capitalize">{p}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{PAKET_KONFIG[p].kontingent} F · {PAKET_KONFIG[p].preis_anzahlung_eur}€</div>
              </button>
            ))}
          </div>
        </div>

        {/* KFZ-154: Spezialisierungen */}
        <div className="pt-3 border-t border-gray-200 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Spezialisierungen</p>
          <TagSection
            title="Qualifikationen"
            options={QUALIFIKATIONEN}
            selected={qualifikationen}
            onToggle={v => toggleTag(setQualifikationen, v)}
          />
          <TagSection
            title="Spezifikationen"
            options={SPEZIFIKATIONEN}
            selected={spezifikationen}
            onToggle={v => toggleTag(setSpezifikationen, v)}
          />
          <TagSection
            title="Schadenarten"
            options={SCHADENARTEN}
            selected={schadenarten}
            onToggle={v => toggleTag(setSchadenarten, v)}
          />
        </div>

        <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-3 flex items-start gap-3">
          <MailIcon className="w-4 h-4 text-[#1E3A5F] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-700">
            Welcome-Mail wird an <strong>{email || '...'}</strong> versendet (Initial-Passwort + Login).
            Plus Mail-Kopie an Inhaber der Organisation.
          </p>
        </div>

        {error && (
          <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <LoadingButton
          type="button"
          onClick={handleSubmit}
          isLoading={saving}
          loadingText="Wird angelegt..."
          className="w-full py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40"
        >
          Sub-SV anlegen + Welcome-Mail senden
        </LoadingButton>
      </div>
    </div>
  )
}

function TagSection({
  title, options, selected, onToggle,
}: {
  title: string
  options: ReadonlyArray<string>
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-700">{title}</span>
        <span className="text-[10px] text-gray-400">{selected.length} gewaehlt</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                active ? 'bg-[#1E3A5F] text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-800'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
    </div>
  )
}

function SelectField({
  label, value, onChange, options, placeholder, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<string>
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      >
        {!options.includes('') && (
          <option value="" disabled>{placeholder ?? 'Bitte waehlen...'}</option>
        )}
        {options.map(opt => (
          <option key={opt} value={opt}>{opt === '' ? (placeholder ?? '—') : opt}</option>
        ))}
      </select>
    </div>
  )
}
