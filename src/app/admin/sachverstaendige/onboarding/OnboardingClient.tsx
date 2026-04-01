'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { onboardGutachter, type OnboardingData } from '../actions'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import {
  UserIcon,
  HardHatIcon,
  ListChecksIcon,
  MapPinIcon,
  PackageIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  ArrowLeftIcon,
  LoaderIcon,
} from 'lucide-react'

const STEPS = [
  { label: 'Persoenliche Daten', icon: UserIcon },
  { label: 'Gutachter-Typ', icon: HardHatIcon },
  { label: 'Qualifikationen', icon: ListChecksIcon },
  { label: 'Standort', icon: MapPinIcon },
  { label: 'Paket', icon: PackageIcon },
  { label: 'Zusammenfassung', icon: CheckCircle2Icon },
]

const TYPEN = [
  { value: 'kfz-gutachter', label: 'KFZ-Gutachter', desc: 'Freier KFZ-Sachverstaendiger (Einzelperson)', color: 'border-[#4573A2] bg-[#4573A2]/10' },
  { value: 'dat-gutachter', label: 'DAT-Gutachter', desc: 'DAT-zertifizierter Gutachter (DAT-Kalkulationssystem)', color: 'border-orange-500 bg-orange-50/30' },
  { value: 'akademie', label: 'Akademie', desc: 'Akademie-ausgebildeter Gutachter (hoehere Qualifikation)', color: 'border-green-500 bg-green-50/30' },
  { value: 'gutachterbuero', label: 'Gutachterbuero', desc: 'Gutachterbuero mit mehreren Standorten', color: 'border-purple-500 bg-purple-50/30' },
]

const QUALIFIKATIONEN = [
  'Haftpflichtschaden', 'Kaskoschaden', 'Leasingrueckgabe', 'Flottenmanagement',
  'Oldtimer', 'LKW/Nutzfahrzeuge', 'Motorrad', 'Wohnmobil',
  'Totalschaden-Bewertung', 'Wiederbeschaffungswert', 'Beweissicherung', 'Gerichtsgutachten',
]

const PAKETE = [
  { value: 'standard', label: 'Standard', faelle: 10, km: 15, preis: 1500 },
  { value: 'pro', label: 'Pro', faelle: 25, km: 40, preis: 3750 },
  { value: 'premium', label: 'Premium', faelle: 50, km: 70, preis: 7500 },
]

export default function OnboardingClient() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ svId?: string; tempPassword: string; email: string } | null>(null)

  const [form, setForm] = useState<OnboardingData>({
    vorname: '', nachname: '', email: '', telefon: '',
    gutachter_typ: 'kfz-gutachter',
    qualifikationen: [],
    standort_adresse: '', standort_plz: '',
    standort_lat: null, standort_lng: null, standort_place_id: null,
    paket: 'standard',
  })

  function update(patch: Partial<OnboardingData>) {
    setForm(prev => ({ ...prev, ...patch }))
  }

  function toggleQual(q: string) {
    setForm(prev => ({
      ...prev,
      qualifikationen: prev.qualifikationen.includes(q)
        ? prev.qualifikationen.filter(x => x !== q)
        : [...prev.qualifikationen, q],
    }))
  }

  function handlePlaceSelect(place: PlaceResult) {
    update({
      standort_adresse: place.adresse ?? '',
      standort_plz: place.plz ?? '',
      standort_lat: place.lat ?? null,
      standort_lng: place.lng ?? null,
      standort_place_id: place.place_id ?? null,
    })
  }

  function canNext(): boolean {
    if (step === 0) return !!(form.vorname && form.nachname && form.email)
    if (step === 1) return !!form.gutachter_typ
    if (step === 2) return form.qualifikationen.length > 0
    if (step === 3) return !!form.standort_adresse
    if (step === 4) return !!form.paket
    return true
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await onboardGutachter(form)
        setResult(res)
        setStep(6) // success screen
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler beim Onboarding')
      }
    })
  }

  const selectedPaket = PAKETE.find(p => p.value === form.paket) ?? PAKETE[0]

  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Neuer Gutachter – Onboarding</h1>

        {/* Progress */}
        {step < 6 && (
          <div className="flex items-center gap-1 mb-8">
            {STEPS.map((s, i) => (
              <div key={i} className="flex-1 flex items-center gap-1">
                <div className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#4573A2]' : 'bg-gray-100'}`} />
              </div>
            ))}
          </div>
        )}

        {/* Step 0: Persoenliche Daten */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg text-gray-900 font-medium">Persoenliche Daten</h2>
            <div className="grid grid-cols-2 gap-4">
              <input className="bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm" placeholder="Vorname" value={form.vorname} onChange={e => update({ vorname: e.target.value })} />
              <input className="bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm" placeholder="Nachname" value={form.nachname} onChange={e => update({ nachname: e.target.value })} />
            </div>
            <input className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm" placeholder="E-Mail" type="email" value={form.email} onChange={e => update({ email: e.target.value })} />
            <input className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm" placeholder="Telefon" type="tel" value={form.telefon} onChange={e => update({ telefon: e.target.value })} />
          </div>
        )}

        {/* Step 1: Typ */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg text-gray-900 font-medium">Gutachter-Typ</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TYPEN.map(t => (
                <button
                  key={t.value}
                  onClick={() => update({ gutachter_typ: t.value })}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${
                    form.gutachter_typ === t.value ? t.color : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-gray-900 text-sm font-medium">{t.label}</p>
                  <p className="text-gray-500 text-xs mt-1">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Qualifikationen */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg text-gray-900 font-medium">Qualifikationen</h2>
            <p className="text-gray-500 text-sm">Waehlen Sie alle zutreffenden Qualifikationen.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {QUALIFIKATIONEN.map(q => (
                <button
                  key={q}
                  onClick={() => toggleQual(q)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    form.qualifikationen.includes(q)
                      ? 'bg-[#1E3A5F] text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Standort */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg text-gray-900 font-medium">Standort</h2>
            <GooglePlaceAutocomplete onSelect={handlePlaceSelect} />
            {form.standort_adresse && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-gray-900 text-sm">{form.standort_adresse}</p>
                {form.standort_plz && <p className="text-gray-500 text-xs mt-1">PLZ: {form.standort_plz}</p>}
                {form.standort_lat && <p className="text-gray-400 text-xs">Koordinaten: {form.standort_lat.toFixed(4)}, {form.standort_lng?.toFixed(4)}</p>}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Paket */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg text-gray-900 font-medium">Paket waehlen</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PAKETE.map(p => (
                <button
                  key={p.value}
                  onClick={() => update({ paket: p.value })}
                  className={`text-left p-5 rounded-xl border-2 transition-colors ${
                    form.paket === p.value ? 'border-[#4573A2] bg-[#4573A2]/10' : 'border-gray-200 bg-white'
                  }`}
                >
                  <p className="text-gray-900 font-semibold">{p.label}</p>
                  <p className="text-gray-500 text-sm mt-2">{p.faelle} Faelle</p>
                  <p className="text-gray-500 text-sm">{p.km} km Umkreis</p>
                  <p className="text-[#7BA3CC] text-lg font-bold mt-3">{p.preis.toLocaleString('de-DE')} EUR</p>
                </button>
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-gray-500 text-sm">Anzahlung faellig: <span className="text-gray-900 font-semibold">{selectedPaket.preis.toLocaleString('de-DE')} EUR</span></p>
            </div>
          </div>
        )}

        {/* Step 5: Zusammenfassung */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg text-gray-900 font-medium">Zusammenfassung</h2>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-200">
              <div className="p-4"><span className="text-gray-500 text-xs">Name</span><p className="text-gray-900 text-sm">{form.vorname} {form.nachname}</p></div>
              <div className="p-4"><span className="text-gray-500 text-xs">E-Mail</span><p className="text-gray-900 text-sm">{form.email}</p></div>
              <div className="p-4"><span className="text-gray-500 text-xs">Telefon</span><p className="text-gray-900 text-sm">{form.telefon || '—'}</p></div>
              <div className="p-4"><span className="text-gray-500 text-xs">Typ</span><p className="text-gray-900 text-sm">{TYPEN.find(t => t.value === form.gutachter_typ)?.label}</p></div>
              <div className="p-4"><span className="text-gray-500 text-xs">Qualifikationen</span><div className="flex flex-wrap gap-1 mt-1">{form.qualifikationen.map(q => <span key={q} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">{q}</span>)}</div></div>
              <div className="p-4"><span className="text-gray-500 text-xs">Standort</span><p className="text-gray-900 text-sm">{form.standort_adresse || '—'}</p></div>
              <div className="p-4"><span className="text-gray-500 text-xs">Paket</span><p className="text-gray-900 text-sm">{selectedPaket.label} – {selectedPaket.faelle} Faelle, {selectedPaket.km}km, {selectedPaket.preis.toLocaleString('de-DE')} EUR</p></div>
            </div>
          </div>
        )}

        {/* Success */}
        {step === 6 && result && (
          <div className="text-center py-12">
            <CheckCircle2Icon className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl text-gray-900 font-semibold mb-2">Gutachter erfolgreich angelegt!</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-left max-w-md mx-auto mt-6">
              <p className="text-gray-500 text-sm mb-2">Zugangsdaten (Einmalpasswort):</p>
              <p className="text-gray-900 text-sm"><b>E-Mail:</b> {result.email}</p>
              <p className="text-gray-900 text-sm"><b>Passwort:</b> <code className="bg-gray-100 px-2 py-0.5 rounded">{result.tempPassword}</code></p>
            </div>
            <button
              onClick={() => router.push('/admin/sachverstaendige')}
              className="mt-6 bg-[#1E3A5F] hover:bg-[#4573A2] text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Zur Uebersicht
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-800 rounded-xl p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Navigation */}
        {step < 6 && (
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeftIcon className="w-4 h-4" /> Zurueck
            </button>

            {step < 5 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-2 bg-[#4573A2] hover:bg-[#4573A2] disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Weiter <ArrowRightIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                {isPending && <LoaderIcon className="w-4 h-4 animate-spin" />}
                Gutachter anlegen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
