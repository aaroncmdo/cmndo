'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2Icon,
  FileSignatureIcon,
  CreditCardIcon,
  PlusIcon,
  TrashIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import {
  createBueroOrganisation,
  signBueroVertrag,
  startBueroStripeCheckout,
} from './actions'
import {
  PAKET_KONTINGENT,
  ANZAHLUNG_PRO_FALL,
  type BueroPaket,
  type BueroStandortInput,
} from './constants'
import SignaturePadInput from '@/components/SignaturePadInput'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'

const STEPS = [
  { key: 'stammdaten', label: 'Stammdaten + Standorte', icon: Building2Icon },
  { key: 'vertrag', label: 'Vertrag unterzeichnen', icon: FileSignatureIcon },
  { key: 'checkout', label: 'Anzahlung leisten', icon: CreditCardIcon },
] as const

const PAKETE: { key: BueroPaket; label: string; faelle: number; preis: number }[] = [
  { key: 'standard', label: 'Standard', faelle: 10, preis: 1500 },
  { key: 'pro', label: 'Pro', faelle: 25, preis: 3750 },
  { key: 'premium', label: 'Premium', faelle: 50, preis: 7500 },
]

type Standort = BueroStandortInput & { id: string }

function newStandort(): Standort {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    anschrift: '',
    paket: 'standard',
    plz: '',
    lat: null,
    lng: null,
    place_id: '',
  }
}

export default function BueroOnboardingClient({
  userId: _userId,
  email,
  profile,
  existingOrg,
}: {
  userId: string
  email: string
  profile: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null }
  existingOrg: { id: string; name: string | null; onboarding_status: string | null } | null
}) {
  const router = useRouter()

  // Initialer Step basierend auf existing Org-Status
  let initialStep = 0
  if (existingOrg) {
    if (existingOrg.onboarding_status === 'pending') initialStep = 1
    else if (existingOrg.onboarding_status === 'vertrag_unterzeichnet') initialStep = 2
    else if (existingOrg.onboarding_status === 'aktiv') initialStep = 2 // bereits durch
  }

  const [step, setStep] = useState(initialStep)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [organisationId, setOrganisationId] = useState<string | null>(existingOrg?.id ?? null)

  // Stammdaten-Form
  const [bueroName, setBueroName] = useState(existingOrg?.name ?? '')
  const [rechtsform, setRechtsform] = useState('')
  const [anschrift, setAnschrift] = useState('')
  const [steuernummer, setSteuernummer] = useState('')
  const [ustId, setUstId] = useState('')
  const [standorte, setStandorte] = useState<Standort[]>([newStandort()])

  // Vertrag-Form
  const [unterschriftName, setUnterschriftName] = useState(
    [profile.vorname, profile.nachname].filter(Boolean).join(' '),
  )
  const [agbAccepted, setAgbAccepted] = useState(false)
  const [signaturePng, setSignaturePng] = useState<string | null>(null)

  const gesamtAnzahlung = standorte.reduce((sum, s) => sum + PAKET_KONTINGENT[s.paket] * ANZAHLUNG_PRO_FALL, 0)

  function addStandort() {
    setStandorte(prev => [...prev, newStandort()])
  }

  function removeStandort(id: string) {
    setStandorte(prev => prev.filter(s => s.id !== id))
  }

  function updateStandort(id: string, key: keyof BueroStandortInput, value: string) {
    setStandorte(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s))
  }

  function setStandortPlace(id: string, place: { adresse: string; plz: string; lat: number; lng: number; place_id: string }) {
    setStandorte(prev => prev.map(s => s.id === id ? {
      ...s,
      anschrift: place.adresse,
      plz: place.plz,
      lat: place.lat,
      lng: place.lng,
      place_id: place.place_id,
    } : s))
  }

  async function handleStammdatenSubmit() {
    setError(null)
    if (!bueroName.trim()) { setError('Bueroname fehlt'); return }
    if (standorte.length === 0) { setError('Mindestens ein Standort erforderlich'); return }
    if (standorte.some(s => !s.name.trim())) { setError('Jeder Standort braucht einen Namen'); return }
    // KFZ-152 BUG-B.2-A: alle Sub-Standorte muessen Geo-Koordinaten haben
    // (Voraussetzung fuer Lead-Dispatcher Phase 2 — sonst kein Isochron-Match moeglich)
    if (standorte.some(s => s.lat === null || s.lng === null)) {
      setError('Jeder Standort braucht eine Adresse via Auswahl-Dropdown (fuer Geo-Koordinaten)')
      return
    }

    setSaving(true)
    const result = await createBueroOrganisation({
      buero_name: bueroName,
      rechtsform,
      anschrift,
      steuernummer,
      ust_id: ustId,
      standorte: standorte.map(({ name, anschrift: a, paket, plz, lat, lng, place_id }) => ({
        name, anschrift: a, paket, plz, lat, lng, place_id,
      })),
    })
    setSaving(false)

    if ('error' in result) { setError(result.error); return }
    setOrganisationId(result.organisation_id)
    setStep(1)
  }

  async function handleVertragSubmit() {
    setError(null)
    if (!organisationId) { setError('Keine Organisation'); return }
    if (!agbAccepted) { setError('Bitte akzeptiere die AGB/NB/DS'); return }
    if (!unterschriftName.trim()) { setError('Bitte gib deinen Namen ein'); return }
    if (!signaturePng) { setError('Bitte unterschreibe im Feld unten'); return }

    setSaving(true)
    const result = await signBueroVertrag({
      organisation_id: organisationId,
      signaturePngDataUri: signaturePng,
      unterschriftName,
    })
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Vertrag fehlgeschlagen'); return }
    setStep(2)
  }

  async function handleCheckout() {
    setError(null)
    if (!organisationId) { setError('Keine Organisation'); return }

    setSaving(true)
    const result = await startBueroStripeCheckout(organisationId)
    setSaving(false)

    if ('error' in result) { setError(result.error); return }
    window.location.href = result.checkoutUrl
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Buero-Onboarding</h1>
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
                  <Icon className="w-4 h-4 text-white" />
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < step ? 'bg-green-600' : 'bg-gray-100'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Content Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{STEPS[step].label}</h2>

          {/* SCHRITT 0: Stammdaten + Standorte */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Buero-Name" value={bueroName} onChange={setBueroName} required />
                <Field label="Rechtsform (optional)" value={rechtsform} onChange={setRechtsform} placeholder="z.B. GmbH" />
                <Field label="Anschrift" value={anschrift} onChange={setAnschrift} className="sm:col-span-2" />
                <Field label="Steuernummer" value={steuernummer} onChange={setSteuernummer} />
                <Field label="USt-ID" value={ustId} onChange={setUstId} />
                <Field label="Email (Inhaber)" value={email} onChange={() => {}} disabled className="sm:col-span-2" />
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Standorte</h3>
                  <button
                    type="button"
                    onClick={addStandort}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E3A5F]/5 hover:bg-[#1E3A5F]/10 text-[#1E3A5F] text-xs font-medium"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    Standort
                  </button>
                </div>

                <div className="space-y-3">
                  {standorte.map((std, idx) => (
                    <div key={std.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">Standort {idx + 1}</span>
                        {standorte.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStandort(std.id)}
                            className="text-gray-300 hover:text-red-400 p-0.5"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <Field
                        label="Name"
                        value={std.name}
                        onChange={v => updateStandort(std.id, 'name', v)}
                        placeholder="z.B. Standort Köln"
                      />
                      <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">
                          Anschrift <span className="text-red-400">*</span>
                          {std.lat !== null && std.lng !== null && (
                            <span className="text-green-600 ml-2">✓ Geo gesetzt</span>
                          )}
                        </label>
                        <GooglePlaceAutocomplete
                          defaultValue={std.anschrift}
                          placeholder="Adresse via Auswahl waehlen..."
                          onSelect={place => setStandortPlace(std.id, place)}
                          className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                        />
                        {std.anschrift && (std.lat === null || std.lng === null) && (
                          <p className="text-[10px] text-amber-600 mt-1">
                            Bitte aus dem Dropdown auswaehlen damit die Geo-Koordinaten gesetzt werden
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Paket</label>
                        <div className="grid grid-cols-3 gap-2">
                          {PAKETE.map(p => (
                            <button
                              key={p.key}
                              type="button"
                              onClick={() => updateStandort(std.id, 'paket', p.key)}
                              className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                                std.paket === p.key
                                  ? 'border-[#1E3A5F] bg-[#1E3A5F]/5 text-[#1E3A5F] font-semibold'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              <div>{p.label}</div>
                              <div className="text-[10px] mt-0.5 opacity-70">{p.faelle} F. · {p.preis}€</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gesamt-Anzahlung Box */}
              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Gesamt-Anzahlung (einmalig)</p>
                    <p className="text-2xl font-bold text-[#1E3A5F] mt-1">
                      {gesamtAnzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
                    </p>
                  </div>
                  <p className="text-[10px] text-gray-500 max-w-[180px] text-right leading-tight">
                    Du zahlst die Summe einmalig für alle Standorte. Wird mit den ersten Lead-Gebühren verrechnet.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SCHRITT 1: Vertrag */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-64 overflow-y-auto text-xs text-gray-600 leading-relaxed">
                <h4 className="font-semibold text-gray-800 mb-2">Kooperationsvertrag-Muster (Auszug)</h4>
                <p>
                  Der Bueroinhaber unterzeichnet stellvertretend fuer alle aktuellen und zukuenftigen Standorte
                  des Bueros. Die Anzahlung gilt als Sicherheit gemaess §4 fuer alle Sub-Standorte und wird
                  mit den ersten Lead-Gebuehren verrechnet. Bei Nicht-Verbrauch nach 12 Monaten ist eine
                  Rueckzahlung gemaess §6 vorgesehen.
                </p>
                <p className="mt-2">
                  Mit der Unterzeichnung bestaetigt der Bueroinhaber, dass er befugt ist, das Buero rechtsverbindlich
                  zu vertreten und alle Sub-Standorte zur Nutzung der Claimondo-Plattform anzumelden.
                </p>
              </div>

              <Field
                label="Dein Name (juristisch verbindlich)"
                value={unterschriftName}
                onChange={setUnterschriftName}
                required
              />

              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">
                  Unterschrift <span className="text-red-400">*</span>
                </label>
                <SignaturePadInput
                  value={signaturePng}
                  onChange={setSignaturePng}
                  height="h-44"
                  placeholder="Hier mit Maus oder Finger unterschreiben"
                />
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={agbAccepted}
                  onChange={e => setAgbAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span>
                  Ich akzeptiere die <strong>AGB</strong>, <strong>Nutzungsbedingungen</strong> und
                  die <strong>Datenschutzerklaerung</strong> und unterzeichne stellvertretend fuer alle
                  aktuellen und zukuenftigen Standorte meines Bueros.
                </span>
              </label>
            </div>
          )}

          {/* SCHRITT 2: Stripe Checkout */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2Icon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700">
                  <strong>Vertrag unterzeichnet.</strong> Letzter Schritt: zentrale Anzahlung leisten.
                  Du wirst zu Stripe weitergeleitet.
                </div>
              </div>

              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4">
                <p className="text-xs text-gray-500">Zu zahlender Gesamt-Betrag</p>
                <p className="text-2xl font-bold text-[#1E3A5F] mt-1">
                  {gesamtAnzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-2">
                  Inkl. Speicherung der Zahlungsmethode fuer kuenftige Sammelabrechnungen (off-session).
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
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
                Zurueck
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (step === 0) handleStammdatenSubmit()
                else if (step === 1) handleVertragSubmit()
                else handleCheckout()
              }}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40"
            >
              {saving
                ? 'Wird verarbeitet...'
                : step === 0
                ? 'Weiter zu Vertrag'
                : step === 1
                ? 'Vertrag unterzeichnen'
                : `Jetzt ${gesamtAnzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })} zahlen`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
  required,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mb-1.5 block">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] disabled:opacity-50"
      />
    </div>
  )
}
