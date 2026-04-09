'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserIcon, PackageIcon, ShieldCheckIcon, CheckCircle2Icon,
  MailIcon,
} from 'lucide-react'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { LoadingButton } from '@/components/ui/loading-button'
import { anlegeSv } from './actions'
import { PAKET_KONFIG, paketAnzahlung, paketKontingent, QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN, ANREDE_OPTIONEN, TITEL_OPTIONEN, type AnlegePaket, type GutachterTyp, type AnlegeSvFormData } from './constants'

// ARCH-1 Phase 2 (BLOCK C): 4-Step Solo-Anlegen Wizard fuer den Admin.

const STEPS = [
  { key: 'person', label: 'Person + Firma', icon: UserIcon },
  { key: 'paket', label: 'Typ + Paket', icon: PackageIcon },
  { key: 'qualifikation', label: 'Qualifikationen', icon: ShieldCheckIcon },
  { key: 'submit', label: 'Zusammenfassung', icon: CheckCircle2Icon },
] as const

type FormState = {
  vorname: string
  nachname: string
  email: string
  telefon: string
  anrede: string
  titel: string
  firmenname: string
  rechtsform: string
  anschrift: string
  anschrift_lat: number | null
  anschrift_lng: number | null
  anschrift_place_id: string
  anschrift_plz: string
  steuernummer: string
  ust_id: string
  hrb: string
  gutachter_typ: GutachterTyp
  paket: AnlegePaket
  paket_override_kontingent: string
  paket_override_radius_km: string
  paket_override_anzahlung_eur: string
  qualifikationen: string[]
  spezifikationen: string[]
  schadenarten: string[]
}

const initialState: FormState = {
  vorname: '', nachname: '', email: '', telefon: '', anrede: '', titel: '',
  firmenname: '', rechtsform: '', anschrift: '',
  anschrift_lat: null, anschrift_lng: null, anschrift_place_id: '', anschrift_plz: '',
  steuernummer: '', ust_id: '', hrb: '',
  gutachter_typ: 'kfz-gutachter',
  paket: 'standard',
  paket_override_kontingent: '',
  paket_override_radius_km: '',
  paket_override_anzahlung_eur: '',
  qualifikationen: [],
  spezifikationen: [],
  schadenarten: [],
}

export default function SoloAnlegenWizard({ onSuccess }: {
  // ARCH-1 POLISH Befund 4: optional fuer Drawer-Verwendung.
  onSuccess?: (info: { name: string; email: string }) => void
} = {}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<FormState>(initialState)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sv_id: string; initial_password: string } | null>(null)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  function toggleQualifikation(q: string) {
    setData(prev => ({
      ...prev,
      qualifikationen: prev.qualifikationen.includes(q)
        ? prev.qualifikationen.filter(x => x !== q)
        : [...prev.qualifikationen, q],
    }))
  }

  // KFZ-154: 2 weitere Toggle-Helper fuer Spezifikationen + Schadenarten
  function toggleArrayField(key: 'spezifikationen' | 'schadenarten', value: string) {
    setData(prev => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter(x => x !== value)
        : [...prev[key], value],
    }))
  }

  // Live-berechnete Anzahlung
  const overrideAnzahlung = data.paket_override_anzahlung_eur
    ? parseFloat(data.paket_override_anzahlung_eur)
    : undefined
  const overrideKontingent = data.paket_override_kontingent
    ? parseInt(data.paket_override_kontingent, 10)
    : undefined
  const liveAnzahlung = paketAnzahlung(data.paket, overrideAnzahlung)
  const liveKontingent = paketKontingent(data.paket, overrideKontingent)

  function canNext(): boolean {
    if (step === 0) return !!(data.anrede && data.vorname && data.nachname && data.email && data.steuernummer && data.anschrift && data.anschrift_lat !== null)
    if (step === 1) {
      if (data.paket === 'individuell') return !!(data.paket_override_kontingent && data.paket_override_radius_km && data.paket_override_anzahlung_eur)
      return true
    }
    if (step === 2) return true
    return true
  }

  async function handleSubmit() {
    setError(null)
    setSaving(true)

    const payload: AnlegeSvFormData = {
      vorname: data.vorname,
      nachname: data.nachname,
      email: data.email,
      telefon: data.telefon,
      anrede: data.anrede || undefined,
      titel: data.titel || undefined,
      firmenname: data.firmenname || undefined,
      rechtsform: data.rechtsform || undefined,
      anschrift: data.anschrift,
      anschrift_lat: data.anschrift_lat,
      anschrift_lng: data.anschrift_lng,
      anschrift_place_id: data.anschrift_place_id || undefined,
      anschrift_plz: data.anschrift_plz,
      steuernummer: data.steuernummer,
      ust_id: data.ust_id || undefined,
      hrb: data.hrb || undefined,
      gutachter_typ: data.gutachter_typ,
      paket: data.paket,
      paket_override_kontingent: overrideKontingent,
      paket_override_radius_km: data.paket_override_radius_km ? parseInt(data.paket_override_radius_km, 10) : undefined,
      paket_override_anzahlung_eur: overrideAnzahlung,
      qualifikationen: data.qualifikationen,
      spezifikationen: data.spezifikationen,
      schadenarten: data.schadenarten,
    }

    const r = await anlegeSv(payload)
    setSaving(false)
    if (!r.success) { setError(r.error ?? 'Anlegen fehlgeschlagen'); return }
    setResult({ sv_id: r.sv_id!, initial_password: r.initial_password! })
    onSuccess?.({ name: `${data.vorname} ${data.nachname}`.trim(), email: data.email })
  }

  // Erfolgs-Page
  if (result) {
    return (
      <div className="bg-white border border-green-200 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2Icon className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{data.vorname} {data.nachname} angelegt</h2>
            <p className="text-sm text-gray-500 mt-1">
              Welcome-Mail wurde an <strong>{data.email}</strong> versendet (mit Initial-Passwort).
            </p>
            <div className="mt-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              <strong>Initial-Passwort (zur Sicherheit auch hier):</strong>
              <code className="block mt-1 font-mono text-sm bg-white px-2 py-1 rounded border border-amber-300">
                {result.initial_password}
              </code>
              Der SV wird beim ersten Login zur Änderung gezwungen.
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setResult(null); setData(initialState); setStep(0) }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50"
              >
                Weiteren SV anlegen
              </button>
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
    <div>
      {/* Stepper */}
      <div className="flex items-center justify-center gap-1 mb-6">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <div key={s.key} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                i < step ? 'bg-green-600' : i === step ? 'bg-[#1E3A5F]' : 'bg-gray-100'
              }`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-green-600' : 'bg-gray-100'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">{STEPS[step].label}</h2>

        {/* SCHRITT 0: Person + Firma */}
        {step === 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* ARCH-1 POLISH: Anrede + Titel als Dropdowns, klassische Reihenfolge:
                  Anrede → Titel → Vorname → Nachname → Email → Telefon */}
              <SelectField
                label="Anrede *"
                value={data.anrede}
                onChange={v => update('anrede', v)}
                options={ANREDE_OPTIONEN}
                placeholder="Bitte waehlen..."
              />
              <SelectField
                label="Titel"
                value={data.titel}
                onChange={v => update('titel', v)}
                options={TITEL_OPTIONEN}
                placeholder="kein Titel"
              />
              <Field label="Vorname *" value={data.vorname} onChange={v => update('vorname', v)} />
              <Field label="Nachname *" value={data.nachname} onChange={v => update('nachname', v)} />
              <Field label="Email *" type="email" value={data.email} onChange={v => update('email', v)} className="sm:col-span-2" />
              <Field label="Telefon" type="tel" value={data.telefon} onChange={v => update('telefon', v)} className="sm:col-span-2" />
            </div>
            <div className="pt-4 mt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Firma</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Firmenname" value={data.firmenname} onChange={v => update('firmenname', v)} />
                <Field label="Rechtsform" value={data.rechtsform} onChange={v => update('rechtsform', v)} placeholder="z.B. GmbH" />
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500 mb-1.5 block">
                    Anschrift * {data.anschrift_lat !== null && <span className="text-green-600 ml-2">✓ Geo gesetzt</span>}
                  </label>
                  <GooglePlaceAutocomplete
                    defaultValue={data.anschrift}
                    placeholder="Adresse via Auswahl wählen..."
                    onSelect={place => setData(prev => ({
                      ...prev,
                      anschrift: place.adresse,
                      anschrift_plz: place.plz,
                      anschrift_lat: place.lat,
                      anschrift_lng: place.lng,
                      anschrift_place_id: place.place_id,
                    }))}
                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                  />
                </div>
                <Field label="Steuernummer *" value={data.steuernummer} onChange={v => update('steuernummer', v)} />
                <Field label="USt-IdNr (optional)" value={data.ust_id} onChange={v => update('ust_id', v)} />
                <Field label="HRB (optional)" value={data.hrb} onChange={v => update('hrb', v)} className="sm:col-span-2" />
              </div>
            </div>
          </div>
        )}

        {/* SCHRITT 1: Typ + Paket */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="text-xs text-gray-500 mb-2 block uppercase tracking-wide">Gutachter-Typ</label>
              <div className="grid grid-cols-2 gap-3">
                {(['kfz-gutachter', 'dat-gutachter'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update('gutachter_typ', t)}
                    className={`px-4 py-3 rounded-xl border text-sm transition-colors ${
                      data.gutachter_typ === t
                        ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 text-[#1E3A5F] font-semibold'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {t === 'kfz-gutachter' ? 'KFZ-Gutachter' : 'DAT-Gutachter'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-2 block uppercase tracking-wide">Paket</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['standard', 'pro', 'premium', 'individuell'] as const).map(p => {
                  const cfg = p === 'individuell' ? null : PAKET_KONFIG[p]
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => update('paket', p)}
                      className={`px-3 py-3 rounded-xl border text-xs transition-colors ${
                        data.paket === p
                          ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 text-[#1E3A5F] font-semibold'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <div className="capitalize">{p}</div>
                      {cfg && (
                        <div className="text-[10px] mt-1 opacity-70">{cfg.kontingent} F · {cfg.preis_anzahlung_eur}€</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Override-Felder bei Individuell ODER falls Aaron Sonder-Konditionen will */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-3">
                {data.paket === 'individuell'
                  ? 'Individuell: Werte sind Pflicht'
                  : 'Optional: Werte überschreiben für Sonder-Konditionen'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field
                  label="Kontingent (Fälle/Monat)"
                  type="number"
                  value={data.paket_override_kontingent}
                  onChange={v => update('paket_override_kontingent', v)}
                  placeholder={data.paket !== 'individuell' ? String(PAKET_KONFIG[data.paket].kontingent) : ''}
                />
                <Field
                  label="Radius (km)"
                  type="number"
                  value={data.paket_override_radius_km}
                  onChange={v => update('paket_override_radius_km', v)}
                  placeholder={data.paket !== 'individuell' ? String(PAKET_KONFIG[data.paket].radius_km) : ''}
                />
                <Field
                  label="Anzahlung (EUR)"
                  type="number"
                  value={data.paket_override_anzahlung_eur}
                  onChange={v => update('paket_override_anzahlung_eur', v)}
                  placeholder={data.paket !== 'individuell' ? String(PAKET_KONFIG[data.paket].preis_anzahlung_eur) : ''}
                />
              </div>
            </div>

            {/* Live-Vorschau */}
            <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Vorschau</p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Kontingent</p>
                  <p className="text-sm font-semibold text-gray-900">{liveKontingent} Fälle/Monat</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Anzahlung</p>
                  <p className="text-sm font-semibold text-[#1E3A5F]">{liveAnzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SCHRITT 2: Qualifikationen / Spezifikationen / Schadenarten (KFZ-154) */}
        {step === 2 && (
          <div className="space-y-5">
            <TagSection
              title="Qualifikationen"
              hint="Was kann der SV fachlich anbieten?"
              options={QUALIFIKATIONEN}
              selected={data.qualifikationen}
              onToggle={toggleQualifikation}
            />
            <TagSection
              title="Spezifikationen"
              hint="Auf welche Fahrzeug-Arten ist er spezialisiert?"
              options={SPEZIFIKATIONEN}
              selected={data.spezifikationen}
              onToggle={v => toggleArrayField('spezifikationen', v)}
            />
            <TagSection
              title="Schadenarten"
              hint="Welche Schadenarten bearbeitet er?"
              options={SCHADENARTEN}
              selected={data.schadenarten}
              onToggle={v => toggleArrayField('schadenarten', v)}
            />
          </div>
        )}

        {/* SCHRITT 3: Zusammenfassung */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Person</p>
              <p className="text-gray-900"><strong>{data.vorname} {data.nachname}</strong></p>
              <p className="text-gray-500">{data.email}{data.telefon && ` · ${data.telefon}`}</p>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Firma</p>
                <p className="text-gray-900">{data.firmenname || '—'}{data.rechtsform && ` (${data.rechtsform})`}</p>
                <p className="text-gray-500 text-xs mt-1">{data.anschrift}</p>
                <p className="text-gray-500 text-xs">Steuer-Nr: {data.steuernummer}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Konditionen</p>
                <p className="text-gray-900">
                  {data.paket === 'individuell' ? 'Individuell' : data.paket.charAt(0).toUpperCase() + data.paket.slice(1)} ·
                  {' '}{liveKontingent} Fälle/Monat · {liveAnzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })} Anzahlung
                </p>
                <p className="text-gray-500 text-xs mt-1">Typ: {data.gutachter_typ === 'kfz-gutachter' ? 'KFZ-Gutachter' : 'DAT-Gutachter'}</p>
                {data.qualifikationen.length > 0 && (
                  <p className="text-gray-500 text-xs mt-1">Qualifikationen: {data.qualifikationen.join(', ')}</p>
                )}
                {data.spezifikationen.length > 0 && (
                  <p className="text-gray-500 text-xs mt-1">Spezifikationen: {data.spezifikationen.join(', ')}</p>
                )}
                {data.schadenarten.length > 0 && (
                  <p className="text-gray-500 text-xs mt-1">Schadenarten: {data.schadenarten.join(', ')}</p>
                )}
              </div>
            </div>

            <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4 flex items-start gap-3">
              <MailIcon className="w-5 h-5 text-[#1E3A5F] flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-700">
                <strong>Welcome-Mail wird versendet an:</strong> {data.email}<br/>
                Inhalt: Initial-Passwort + Login-Link + Konditionen-Übersicht. SV wird beim ersten Login zur Passwort-Änderung gezwungen.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
            {String(error)}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3 mt-6">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              Zurück
            </button>
          )}
          <LoadingButton
            type="button"
            onClick={() => {
              if (step < STEPS.length - 1) setStep(step + 1)
              else handleSubmit()
            }}
            disabled={!canNext()}
            isLoading={saving}
            loadingText="Wird angelegt..."
            className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {step < STEPS.length - 1 ? 'Weiter' : 'Anlegen + Welcome-Mail senden'}
          </LoadingButton>
        </div>
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

function TagSection({
  title, hint, options, selected, onToggle,
}: {
  title: string
  hint: string
  options: ReadonlyArray<string>
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-[10px] text-gray-400">{selected.length} gewaehlt</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-[#1E3A5F] text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-800'
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
        {/* Leer-Option mit Placeholder-Label nur zeigen falls noch nichts gewaehlt
            ist, ausser '' selbst ist eine valide Option (z.B. bei TITEL_OPTIONEN
            wo '' = 'kein Titel'). */}
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
