'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { completeOnboarding } from './actions'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import {
  UserIcon,
  MapPinIcon,
  PackageIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ShieldCheckIcon,
  Building2Icon,
  GraduationCapIcon,
  UsersIcon,
  MailOpenIcon,
} from 'lucide-react'

// KFZ-152: Organisationstyp-Auswahl (Schritt 0)
type OrgTyp = 'solo' | 'buero' | 'akademie' | 'community' | 'sub_invite' | null

const STEPS = [
  { key: 'person', label: 'Persönliche Daten', icon: UserIcon },
  { key: 'typ', label: 'Gutachter-Typ', icon: ShieldCheckIcon },
  { key: 'standort', label: 'Standort', icon: MapPinIcon },
  { key: 'paket', label: 'Paket wählen', icon: PackageIcon },
  { key: 'kalender', label: 'Kalender', icon: CalendarIcon },
  { key: 'zusammenfassung', label: 'Zusammenfassung', icon: CheckCircle2Icon },
] as const

const GUTACHTER_TYPEN = [
  { key: 'kfz-gutachter', label: 'KFZ-Gutachter', desc: 'Freier KFZ-Sachverständiger (Einzelperson)', color: 'border-[#4573A2]' },
  { key: 'dat-gutachter', label: 'DAT-Gutachter', desc: 'DAT-zertifizierter Gutachter (DAT-Kalkulationssystem)', color: 'border-orange-500' },
  { key: 'akademie', label: 'Akademie', desc: 'Akademie-ausgebildeter Gutachter (höhere Qualifikation)', color: 'border-green-500' },
  { key: 'gutachterbuero', label: 'Gutachterbüro', desc: 'Gutachterbüro mit mehreren Standorten', color: 'border-purple-500' },
] as const

const PAKETE = [
  { key: 'standard', label: 'Standard', faelle: 10, km: 15, preis: 1500, color: 'border-[#4573A2]' },
  { key: 'pro', label: 'Pro', faelle: 25, km: 40, preis: 3750, color: 'border-green-500' },
  { key: 'premium', label: 'Premium', faelle: 50, km: 70, preis: 7500, color: 'border-amber-500' },
] as const

const QUALIFIKATIONEN = [
  'KFZ-Schäden',
  'Motorrad',
  'LKW/Nutzfahrzeuge',
  'Oldtimer',
  'Elektrofahrzeuge',
  'Totalschaden-Bewertung',
  'Unfallrekonstruktion',
]

type FormData = {
  vorname: string
  nachname: string
  telefon: string
  gutachter_typ: string
  qualifikationen: string[]
  standort_adresse: string
  standort_plz: string
  standort_lat: number | null
  standort_lng: number | null
  standort_place_id: string
  paket: string
  kalender_typ: string
}

export default function OnboardingClient({
  userId,
  email,
  existingProfile,
  existingSvId,
}: {
  userId: string
  email: string
  existingProfile: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null }
  existingSvId: string | null
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // KFZ-152: Org-Typ wird in Schritt 0 gewaehlt. NULL = noch nicht entschieden.
  const [orgTyp, setOrgTyp] = useState<OrgTyp>(null)
  const [data, setData] = useState<FormData>({
    vorname: existingProfile.vorname ?? '',
    nachname: existingProfile.nachname ?? '',
    telefon: existingProfile.telefon ?? '',
    gutachter_typ: 'kfz-gutachter',
    qualifikationen: [],
    standort_adresse: '',
    standort_plz: '',
    standort_lat: null,
    standort_lng: null,
    standort_place_id: '',
    paket: 'standard',
    kalender_typ: 'keiner',
  })

  const currentStep = STEPS[step]
  const selectedPaket = PAKETE.find(p => p.key === data.paket) ?? PAKETE[0]

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
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

  const [mapsReady, setMapsReady] = useState(
    typeof window !== 'undefined' && typeof google !== 'undefined' && !!google.maps?.places,
  )

  const onPlaceSelect = useCallback((result: PlaceResult) => {
    setData(prev => ({
      ...prev,
      standort_adresse: result.adresse,
      standort_plz: result.plz,
      standort_lat: result.lat,
      standort_lng: result.lng,
      standort_place_id: result.place_id,
    }))
  }, [])

  async function handleComplete() {
    setSaving(true)
    setError(null)
    try {
      await completeOnboarding({
        ...data,
        userId,
        existingSvId,
      })
      router.push('/gutachter')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setSaving(false)
    }
  }

  const canNext = step === 0
    ? data.vorname && data.nachname
    : step === 1
    ? data.gutachter_typ
    : step === 2
    ? data.standort_plz
    : step === 3
    ? data.paket
    : true

  // KFZ-152 Schritt 0: Org-Typ Selector
  if (orgTyp === null) {
    return (
      <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Willkommen bei Claimondo</h1>
            <p className="text-gray-500 text-sm mt-1">Wie machst du Gutachten?</p>
          </div>

          <div className="space-y-3">
            <OrgTypCard
              icon={UserIcon}
              title="Solo-Sachverständiger"
              desc="Ich arbeite alleine, eigenes Paket, eigene Anzahlung, eigener Vertrag."
              onClick={() => setOrgTyp('solo')}
            />
            <OrgTypCard
              icon={Building2Icon}
              title="Inhaber eines Gutachterbüros"
              desc="Ich habe ein Büro mit mehreren Standorten/Mitarbeitern. Ich zahle zentral für alle Sub-Standorte."
              onClick={() => router.push('/gutachter/onboarding/buero')}
            />
            <OrgTypCard
              icon={GraduationCapIcon}
              title="Akademie"
              desc="Wir bilden Sachverständige aus und sammeln deren Anzahlungen intern ein."
              comingSoon
              onClick={() => setError('Akademie-Onboarding kommt in einer Folge-Version. Bitte melde dich beim Claimondo-Team.')}
            />
            <OrgTypCard
              icon={UsersIcon}
              title="Community / Einkaufsgemeinschaft"
              desc="Mehrere SVs in einem gemeinsamen Gebiet."
              comingSoon
              onClick={() => setError('Communities werden vom Claimondo-Admin angelegt. Du bekommst eine Einladung per Email.')}
            />
            <OrgTypCard
              icon={MailOpenIcon}
              title="Ich gehöre zu einem Büro / einer Akademie"
              desc="Ich habe einen Einladungs-Link bekommen."
              comingSoon
              onClick={() => setError('Bitte öffne den Einladungs-Link aus deiner Email — du brauchst keinen separaten Onboarding-Flow.')}
            />
          </div>

          {error && (
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-start justify-center px-4 py-10">
      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`}
          strategy="lazyOnload"
          onReady={() => setMapsReady(true)}
        />
      )}
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Gutachter-Onboarding</h1>
          <p className="text-gray-500 text-sm mt-1">Schritt {step + 1} von {STEPS.length}</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={s.key} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  i < step ? 'bg-green-600' : i === step ? 'bg-[#1E3A5F]' : 'bg-gray-100'
                }`}>
                  <Icon className="w-4 h-4 text-gray-900" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < step ? 'bg-green-600' : 'bg-gray-100'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{currentStep.label}</h2>

          {/* Step 1: Persönliche Daten */}
          {step === 0 && (
            <div className="space-y-4">
              <InputField label="Vorname" value={data.vorname} onChange={v => updateField('vorname', v)} />
              <InputField label="Nachname" value={data.nachname} onChange={v => updateField('nachname', v)} />
              <InputField label="E-Mail" value={email} onChange={() => {}} disabled />
              <InputField label="Telefon" value={data.telefon} onChange={v => updateField('telefon', v)} type="tel" />
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Qualifikationen</label>
                <div className="flex flex-wrap gap-2">
                  {QUALIFIKATIONEN.map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => toggleQualifikation(q)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        data.qualifikationen.includes(q)
                          ? 'bg-[#1E3A5F] text-white'
                          : 'bg-gray-100 text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Gutachter-Typ */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {GUTACHTER_TYPEN.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => updateField('gutachter_typ', t.key)}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    data.gutachter_typ === t.key
                      ? `${t.color} bg-gray-100`
                      : 'border-gray-300 hover:border-gray-300'
                  }`}
                >
                  <p className="text-gray-900 font-semibold">{t.label}</p>
                  <p className="text-gray-500 text-xs mt-1">{t.desc}</p>
                </button>
              ))}
            </div>
          )}

          {/* Step 3: Standort */}
          {step === 2 && (
            <div className="space-y-4">
              {mapsReady ? (
                <div>
                  <label className="text-sm text-gray-500 mb-1.5 block">Adresse (Büro/Wohnsitz)</label>
                  <GooglePlaceAutocomplete
                    defaultValue={data.standort_adresse}
                    placeholder="Musterstraße 1, 10115 Berlin"
                    onSelect={onPlaceSelect}
                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                  />
                </div>
              ) : (
                <InputField
                  label="Adresse (Büro/Wohnsitz)"
                  value={data.standort_adresse}
                  onChange={v => updateField('standort_adresse', v)}
                  placeholder="Musterstraße 1, 10115 Berlin"
                />
              )}
              <InputField
                label="PLZ"
                value={data.standort_plz}
                onChange={v => updateField('standort_plz', v)}
                placeholder="10115"
              />
              {data.standort_lat != null && (
                <p className="text-green-500 text-xs flex items-center gap-1">
                  <MapPinIcon className="w-3 h-3" />
                  Koordinaten erfasst ({data.standort_lat.toFixed(4)}, {data.standort_lng?.toFixed(4)})
                </p>
              )}
              <p className="text-gray-400 text-xs">
                Der Standort bestimmt Ihren Einsatzradius.{' '}
                {!mapsReady && 'Adress-Vorschläge werden geladen oder sind nicht verfügbar.'}
              </p>
            </div>
          )}

          {/* Step 4: Paket */}
          {step === 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PAKETE.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => updateField('paket', p.key)}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    data.paket === p.key
                      ? `${p.color} bg-gray-100`
                      : 'border-gray-300 hover:border-gray-300'
                  }`}
                >
                  <p className="text-gray-900 font-semibold text-lg mb-1">{p.label}</p>
                  <p className="text-gray-500 text-sm">{p.faelle} Fälle/Monat</p>
                  <p className="text-gray-500 text-sm">{p.km} km Radius</p>
                  <p className="text-gray-500 text-xs mt-2">150 € pro Fall</p>
                  <p className="text-gray-900 font-bold text-xl mt-3">
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(p.preis)}
                  </p>
                  <p className="text-gray-400 text-xs">Anzahlung</p>
                </button>
              ))}
            </div>
          )}

          {/* Step 5: Kalender */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-gray-700 text-sm mb-4">
                Verbinden Sie Ihren Kalender für die automatische Terminvergabe.
              </p>
              <div className="flex flex-col gap-3">
                {(['google', 'outlook', 'keiner'] as const).map(typ => (
                  <button
                    key={typ}
                    type="button"
                    onClick={() => updateField('kalender_typ', typ)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      data.kalender_typ === typ
                        ? 'border-[#4573A2] bg-gray-100'
                        : 'border-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-gray-900 font-medium">
                      {typ === 'google' ? 'Google Kalender' : typ === 'outlook' ? 'Outlook Kalender' : 'Später verbinden'}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {typ === 'keiner' ? 'Ohne Kalender-Sync keine automatische Terminvergabe' : 'OAuth2 Verbindung wird nach Abschluss eingerichtet'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Zusammenfassung */}
          {step === 5 && (
            <div className="space-y-4">
              <SummaryRow label="Name" value={`${data.vorname} ${data.nachname}`} />
              <SummaryRow label="E-Mail" value={email} />
              <SummaryRow label="Telefon" value={data.telefon || '—'} />
              <SummaryRow label="Typ" value={GUTACHTER_TYPEN.find(t => t.key === data.gutachter_typ)?.label ?? data.gutachter_typ} />
              <SummaryRow label="Qualifikationen" value={data.qualifikationen.join(', ') || '—'} />
              <SummaryRow label="Standort" value={data.standort_adresse || data.standort_plz || '—'} />
              <SummaryRow label="Paket" value={`${selectedPaket.label} (${selectedPaket.faelle} Fälle, ${selectedPaket.km}km)`} />
              <SummaryRow label="Anzahlung" value={new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(selectedPaket.preis)} />
              <SummaryRow label="Kalender" value={data.kalender_typ === 'google' ? 'Google' : data.kalender_typ === 'outlook' ? 'Outlook' : 'Noch nicht verbunden'} />

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8 pt-5 border-t border-gray-200">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex-1 py-3 rounded-xl text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              >
                Zurück
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[#1E3A5F] hover:bg-[#4573A2] text-white transition-colors disabled:opacity-40"
              >
                Weiter
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-40"
              >
                {saving ? 'Wird gespeichert...' : 'Onboarding abschließen'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="text-sm text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] disabled:opacity-50"
      />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-200/50 last:border-0">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-800 text-sm font-medium">{value}</span>
    </div>
  )
}

// KFZ-152: Org-Typ Karte fuer Schritt 0
function OrgTypCard({
  icon: Icon,
  title,
  desc,
  onClick,
  comingSoon,
}: {
  icon: typeof UserIcon
  title: string
  desc: string
  onClick: () => void
  comingSoon?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#4573A2] hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/5 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-[#1E3A5F]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-gray-900 font-semibold text-sm">{title}</h3>
            {comingSoon && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                Folge-Version
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-1 leading-relaxed">{desc}</p>
        </div>
      </div>
    </button>
  )
}
