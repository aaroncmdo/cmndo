'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2Icon, UsersIcon, CheckCircle2Icon, MailIcon, PlusIcon, TrashIcon,
} from 'lucide-react'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { anlegeBuero } from './actions'
import { PAKET_KONFIG, paketAnzahlung, type AnlegePaket, type AnlegeBueroFormData } from './constants'

// ARCH-1 Phase 2 (BLOCK C): 3-Step Buero-Anlegen Wizard fuer den Admin.

const STEPS = [
  { key: 'inhaber', label: 'Inhaber + Büro', icon: Building2Icon },
  { key: 'standorte', label: 'Sub-Standorte', icon: UsersIcon },
  { key: 'submit', label: 'Zusammenfassung', icon: CheckCircle2Icon },
] as const

type SubStandort = {
  id: string
  name: string
  anschrift: string
  anschrift_lat: number | null
  anschrift_lng: number | null
  anschrift_place_id: string
  anschrift_plz: string
  sub_email: string
  sub_vorname: string
  sub_nachname: string
  paket: AnlegePaket
}

function newSubStandort(): SubStandort {
  return {
    id: Math.random().toString(36).slice(2),
    name: '', anschrift: '',
    anschrift_lat: null, anschrift_lng: null, anschrift_place_id: '', anschrift_plz: '',
    sub_email: '', sub_vorname: '', sub_nachname: '',
    paket: 'standard',
  }
}

export default function BueroAnlegenWizard({ onSuccess }: {
  // ARCH-1 POLISH Befund 4: optional fuer Drawer-Verwendung.
  onSuccess?: (info: { name: string; email: string }) => void
} = {}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ organisation_id: string; sub_count: number } | null>(null)

  // Inhaber + Buero
  const [inhaberVorname, setInhaberVorname] = useState('')
  const [inhaberNachname, setInhaberNachname] = useState('')
  const [inhaberEmail, setInhaberEmail] = useState('')
  const [inhaberTelefon, setInhaberTelefon] = useState('')
  const [bueroName, setBueroName] = useState('')
  const [bueroRechtsform, setBueroRechtsform] = useState('')
  const [bueroAnschrift, setBueroAnschrift] = useState('')
  const [bueroSteuernummer, setBueroSteuernummer] = useState('')
  const [bueroUstId, setBueroUstId] = useState('')
  const [bueroHrb, setBueroHrb] = useState('')

  // Sub-Standorte
  const [standorte, setStandorte] = useState<SubStandort[]>([newSubStandort()])

  function addStandort() {
    setStandorte(prev => [...prev, newSubStandort()])
  }

  function removeStandort(id: string) {
    setStandorte(prev => prev.filter(s => s.id !== id))
  }

  function updateStandort<K extends keyof SubStandort>(id: string, key: K, value: SubStandort[K]) {
    setStandorte(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s))
  }

  function setStandortPlace(id: string, place: { adresse: string; plz: string; lat: number; lng: number; place_id: string }) {
    setStandorte(prev => prev.map(s => s.id === id ? {
      ...s,
      anschrift: place.adresse,
      anschrift_plz: place.plz,
      anschrift_lat: place.lat,
      anschrift_lng: place.lng,
      anschrift_place_id: place.place_id,
    } : s))
  }

  const gesamtAnzahlung = standorte.reduce((sum, s) => sum + paketAnzahlung(s.paket), 0)

  function canNext(): boolean {
    if (step === 0) return !!(inhaberVorname && inhaberNachname && inhaberEmail && bueroName && bueroSteuernummer)
    if (step === 1) {
      if (standorte.length === 0) return false
      return standorte.every(s =>
        s.name && s.sub_email && s.sub_vorname && s.sub_nachname &&
        s.anschrift_lat !== null && s.anschrift_lng !== null
      )
    }
    return true
  }

  async function handleSubmit() {
    setError(null)
    setSaving(true)

    const payload: AnlegeBueroFormData = {
      inhaber_vorname: inhaberVorname,
      inhaber_nachname: inhaberNachname,
      inhaber_email: inhaberEmail,
      inhaber_telefon: inhaberTelefon,
      buero_name: bueroName,
      buero_rechtsform: bueroRechtsform || undefined,
      buero_anschrift: bueroAnschrift,
      buero_steuernummer: bueroSteuernummer,
      buero_ust_id: bueroUstId || undefined,
      buero_hrb: bueroHrb || undefined,
      sub_standorte: standorte.map(s => ({
        name: s.name,
        anschrift: s.anschrift,
        anschrift_lat: s.anschrift_lat,
        anschrift_lng: s.anschrift_lng,
        anschrift_place_id: s.anschrift_place_id || undefined,
        anschrift_plz: s.anschrift_plz,
        sub_email: s.sub_email,
        sub_vorname: s.sub_vorname,
        sub_nachname: s.sub_nachname,
        paket: s.paket,
      })),
    }

    const r = await anlegeBuero(payload)
    setSaving(false)
    if (!r.success) { setError(r.error ?? 'Anlegen fehlgeschlagen'); return }
    setResult({ organisation_id: r.organisation_id!, sub_count: r.sub_sv_ids?.length ?? 0 })
    onSuccess?.({ name: bueroName, email: inhaberEmail })
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
            <h2 className="text-lg font-semibold text-gray-900">{bueroName} angelegt</h2>
            <p className="text-sm text-gray-500 mt-1">
              1 Inhaber-Account + {result.sub_count} Sub-Account(s) wurden angelegt.
              Welcome-Mails wurden an alle versendet (mit Initial-Passworten).
              Mail-Kopien an den Inhaber pro Sub.
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

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">{STEPS[step].label}</h2>

        {/* SCHRITT 0: Inhaber + Buero */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Inhaber-Person</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Vorname *" value={inhaberVorname} onChange={setInhaberVorname} />
                <Field label="Nachname *" value={inhaberNachname} onChange={setInhaberNachname} />
                <Field label="Email *" type="email" value={inhaberEmail} onChange={setInhaberEmail} className="sm:col-span-2" />
                <Field label="Telefon" type="tel" value={inhaberTelefon} onChange={setInhaberTelefon} />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Büro-Stammdaten</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Büro-Name *" value={bueroName} onChange={setBueroName} className="sm:col-span-2" />
                <Field label="Rechtsform" value={bueroRechtsform} onChange={setBueroRechtsform} placeholder="z.B. GmbH" />
                <Field label="Anschrift (Rechnungsadresse)" value={bueroAnschrift} onChange={setBueroAnschrift} />
                <Field label="Steuernummer *" value={bueroSteuernummer} onChange={setBueroSteuernummer} />
                <Field label="USt-IdNr (optional)" value={bueroUstId} onChange={setBueroUstId} />
                <Field label="HRB (optional)" value={bueroHrb} onChange={setBueroHrb} className="sm:col-span-2" />
              </div>
            </div>
          </div>
        )}

        {/* SCHRITT 1: Sub-Standorte */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Jeder Sub-Standort = ein eigener SV mit eigenem Login. Geo-Koordinaten sind Pflicht (via Google Places).
              </p>
              <button
                type="button"
                onClick={addStandort}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E3A5F]/5 hover:bg-[#1E3A5F]/10 text-[#1E3A5F] text-xs font-medium"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Standort
              </button>
            </div>

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
                <Field label="Standort-Name" value={std.name} onChange={v => updateStandort(std.id, 'name', v)} placeholder="z.B. Filiale Köln" />
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">
                    Anschrift {std.anschrift_lat !== null && <span className="text-green-600 ml-2">✓ Geo</span>}
                  </label>
                  <GooglePlaceAutocomplete
                    defaultValue={std.anschrift}
                    placeholder="Adresse via Auswahl..."
                    onSelect={place => setStandortPlace(std.id, place)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Field label="Sub-Email *" type="email" value={std.sub_email} onChange={v => updateStandort(std.id, 'sub_email', v)} />
                  <Field label="Sub-Vorname *" value={std.sub_vorname} onChange={v => updateStandort(std.id, 'sub_vorname', v)} />
                  <Field label="Sub-Nachname *" value={std.sub_nachname} onChange={v => updateStandort(std.id, 'sub_nachname', v)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">Paket</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['standard', 'pro', 'premium'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateStandort(std.id, 'paket', p)}
                        className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                          std.paket === p
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
              </div>
            ))}

            <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4">
              <p className="text-xs text-gray-500">Gesamt-Anzahlung (alle Standorte)</p>
              <p className="text-2xl font-bold text-[#1E3A5F] mt-1">
                {gesamtAnzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        )}

        {/* SCHRITT 2: Zusammenfassung */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
              <p className="text-xs text-gray-500 uppercase mb-2">Büro</p>
              <p className="text-gray-900"><strong>{bueroName}</strong>{bueroRechtsform && ` (${bueroRechtsform})`}</p>
              <p className="text-gray-500 text-xs mt-1">{bueroAnschrift}</p>
              <p className="text-gray-500 text-xs">Steuer-Nr: {bueroSteuernummer}</p>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase mb-1">Inhaber</p>
                <p className="text-gray-900"><strong>{inhaberVorname} {inhaberNachname}</strong></p>
                <p className="text-gray-500 text-xs">{inhaberEmail}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase mb-2">{standorte.length} Sub-Standort(e)</p>
                {standorte.map((s, i) => (
                  <div key={s.id} className="text-xs text-gray-700 mb-1">
                    <strong>{i + 1}. {s.name}</strong> — {s.sub_vorname} {s.sub_nachname} ({s.sub_email}) — {s.paket}
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 uppercase">Gesamt-Anzahlung</p>
                <p className="text-base font-bold text-[#1E3A5F] mt-1">
                  {gesamtAnzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
                </p>
              </div>
            </div>

            <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4 flex items-start gap-3">
              <MailIcon className="w-5 h-5 text-[#1E3A5F] flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-700">
                <strong>{1 + standorte.length} Welcome-Mails werden versendet:</strong>
                <ul className="mt-2 ml-4 list-disc space-y-1">
                  <li>1× an Inhaber {inhaberEmail} (mit Inhaber-Initial-Passwort)</li>
                  {standorte.map((s, i) => <li key={i}>1× an Sub {s.sub_email} (mit Sub-Initial-Passwort)</li>)}
                </ul>
                <p className="mt-2">
                  Plus {standorte.length} Mail-Kopien an Inhaber: "Du hast einen neuen Mitarbeiter angelegt bekommen".
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

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
          <button
            type="button"
            onClick={() => {
              if (step < STEPS.length - 1) setStep(step + 1)
              else handleSubmit()
            }}
            disabled={saving || !canNext()}
            className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {saving ? 'Wird angelegt...' : step < STEPS.length - 1 ? 'Weiter' : 'Büro anlegen + Welcome-Mails senden'}
          </button>
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
