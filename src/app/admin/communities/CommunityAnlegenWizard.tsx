'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UsersIcon, MapPinIcon, ShieldCheckIcon, CheckCircle2Icon, PlusIcon, TrashIcon } from 'lucide-react'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { anlegeCommunity } from '@/app/admin/sachverstaendige/anlegen/actions'
import {
  PAKET_KONFIG, ANREDE_OPTIONEN, TITEL_OPTIONEN,
  type AnlegePaket, type AnlegeCommunityFormData,
} from '@/app/admin/sachverstaendige/anlegen/constants'
import PolygonEditor, { type PolygonPath } from './PolygonEditor'

// KFZ-152 Phase 3: 3-Step Community-Anlegen Wizard.
// Step 1: Stammdaten + Gebiet (MVP: Adresse + Radius statt Polygon)
// Step 2: Mitglieder einladen
// Step 3: Submit

const STEPS = [
  { key: 'stammdaten', label: 'Community + Gebiet', icon: UsersIcon },
  { key: 'mitglieder', label: 'Mitglieder', icon: PlusIcon },
  { key: 'submit', label: 'Bestätigen', icon: CheckCircle2Icon },
] as const

type Member = {
  id: string
  anrede: string
  titel: string
  vorname: string
  nachname: string
  email: string
  telefon: string
  paket: AnlegePaket
}

function newMember(): Member {
  return {
    id: Math.random().toString(36).slice(2),
    anrede: '', titel: '', vorname: '', nachname: '', email: '', telefon: '',
    paket: 'standard',
  }
}

export default function CommunityAnlegenWizard({ onSuccess, onCancel }: {
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ name: string; member_count: number } | null>(null)

  const [name, setName] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [zentrumAnschrift, setZentrumAnschrift] = useState('')
  const [zentrumLat, setZentrumLat] = useState<number | null>(null)
  const [zentrumLng, setZentrumLng] = useState<number | null>(null)
  const [zentrumPlaceId, setZentrumPlaceId] = useState('')
  const [zentrumPlz, setZentrumPlz] = useState('')
  const [radiusKm, setRadiusKm] = useState(200)
  const [polygon, setPolygon] = useState<PolygonPath | null>(null)
  const [gebietMode, setGebietMode] = useState<'circle' | 'polygon'>('circle')
  const [maxFaelleMonat, setMaxFaelleMonat] = useState(100)
  const [exklusiv, setExklusiv] = useState(false)

  const [mitglieder, setMitglieder] = useState<Member[]>([newMember()])

  function addMember() { setMitglieder(prev => [...prev, newMember()]) }
  function removeMember(id: string) { setMitglieder(prev => prev.filter(m => m.id !== id)) }
  function updateMember<K extends keyof Member>(id: string, key: K, value: Member[K]) {
    setMitglieder(prev => prev.map(m => m.id === id ? { ...m, [key]: value } : m))
  }

  function canNext(): boolean {
    if (step === 0) {
      if (!name.trim() || zentrumLat === null || zentrumLng === null) return false
      if (gebietMode === 'circle') return radiusKm > 0
      // polygon mode: braucht mindestens 3 Eckpunkte
      return !!polygon && polygon.length >= 3
    }
    if (step === 1) return mitglieder.length > 0 && mitglieder.every(m => m.anrede && m.vorname.trim() && m.nachname.trim() && m.email.trim())
    return true
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const payload: AnlegeCommunityFormData = {
        name,
        beschreibung: beschreibung || undefined,
        zentrum_anschrift: zentrumAnschrift,
        zentrum_lat: zentrumLat,
        zentrum_lng: zentrumLng,
        zentrum_place_id: zentrumPlaceId || undefined,
        zentrum_plz: zentrumPlz,
        radius_km: radiusKm,
        polygon: gebietMode === 'polygon' ? polygon : null,
        max_faelle_monat: maxFaelleMonat,
        exklusiv,
        mitglieder: mitglieder.map(m => ({
          anrede: m.anrede || undefined,
          titel: m.titel || undefined,
          vorname: m.vorname,
          nachname: m.nachname,
          email: m.email,
          telefon: m.telefon || undefined,
          paket: m.paket,
        })),
      }
      const r = await anlegeCommunity(payload)
      if (!r.success) { setError(r.error ?? 'Anlegen fehlgeschlagen'); return }
      setSuccess({ name, member_count: r.member_sv_ids?.length ?? 0 })
      onSuccess?.()
      router.refresh()
    })
  }

  if (success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2Icon className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-emerald-900">Community {success.name} angelegt</h3>
            <p className="text-sm text-emerald-700 mt-1">
              {success.member_count} Mitglied(er) wurden eingeladen. Welcome-Mails versendet.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-center gap-1 mb-6">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <div key={s.key} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                i < step ? 'bg-emerald-500' : i === step ? 'bg-claimondo-ondo' : 'bg-claimondo-border'
              }`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-emerald-500' : 'bg-claimondo-border'}`} />
              )}
            </div>
          )
        })}
      </div>

      <h2 className="text-lg font-semibold text-claimondo-navy mb-5">{STEPS[step].label}</h2>

      {step === 0 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3">
            <Field label="Community-Name *" value={name} onChange={setName} placeholder="z.B. Bayern Süd" />
            <div>
              <label className="text-xs text-claimondo-ondo mb-1.5 block">Beschreibung (optional)</label>
              <textarea
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                rows={2}
                placeholder="Worum geht es in dieser Community?"
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo resize-y"
              />
            </div>
            <div>
              <label className="text-xs text-claimondo-ondo mb-1.5 block">
                <MapPinIcon className="w-3 h-3 inline mr-1" />
                Gebiet-Zentrum *
                {zentrumLat !== null && <span className="text-emerald-600 ml-2">✓ Geo gesetzt</span>}
              </label>
              <GooglePlaceAutocomplete
                defaultValue={zentrumAnschrift}
                placeholder="z.B. Hauptbahnhof München"
                onSelect={place => {
                  setZentrumAnschrift(place.adresse)
                  setZentrumPlz(place.plz)
                  setZentrumLat(place.lat)
                  setZentrumLng(place.lng)
                  setZentrumPlaceId(place.place_id)
                }}
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
              />
            </div>

            {/* KFZ-152 Phase 3 Follow-up: Circle-vs-Polygon Toggle */}
            <div>
              <div className="inline-flex bg-claimondo-bg rounded-xl p-0.5 text-xs font-medium mb-2">
                <button type="button" onClick={() => setGebietMode('circle')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    gebietMode === 'circle' ? 'bg-white text-claimondo-shield shadow' : 'text-claimondo-ondo hover:text-claimondo-navy'
                  }`}>
                  Kreis (Zentrum + Radius)
                </button>
                <button type="button" onClick={() => setGebietMode('polygon')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    gebietMode === 'polygon' ? 'bg-white text-claimondo-shield shadow' : 'text-claimondo-ondo hover:text-claimondo-navy'
                  }`}>
                  Polygon (frei zeichnen)
                </button>
              </div>
              {gebietMode === 'circle' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NumField label="Radius km" value={radiusKm} onChange={setRadiusKm} />
                  <NumField label="Max Fälle/Monat" value={maxFaelleMonat} onChange={setMaxFaelleMonat} />
                </div>
              ) : (
                <div className="space-y-3">
                  <PolygonEditor
                    centerLat={zentrumLat}
                    centerLng={zentrumLng}
                    initialPolygon={polygon}
                    onChange={setPolygon}
                  />
                  <NumField label="Max Fälle/Monat" value={maxFaelleMonat} onChange={setMaxFaelleMonat} />
                </div>
              )}
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer text-sm text-claimondo-navy bg-amber-50 border border-amber-200 rounded-xl p-3">
              <input
                type="checkbox"
                checked={exklusiv}
                onChange={e => setExklusiv(e.target.checked)}
                className="mt-0.5 rounded border-claimondo-border"
              />
              <span>
                <strong className="flex items-center gap-1.5"><ShieldCheckIcon className="w-4 h-4" /> Exklusivität aktivieren</strong>
                <br />
                <span className="text-xs text-claimondo-ondo">
                  In diesem Gebiet dürfen KEINE anderen SVs (Solo, Büro, andere Community) angelegt werden.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-claimondo-ondo">Mindestens 1 Mitglied. Jeder bekommt eigenen Login + eigene Anzahlung.</p>
            <button type="button" onClick={addMember}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-claimondo-ondo/5 hover:bg-claimondo-ondo/10 text-claimondo-ondo text-xs font-medium">
              <PlusIcon className="w-3.5 h-3.5" /> Mitglied
            </button>
          </div>
          {mitglieder.map((m, idx) => (
            <div key={m.id} className="border border-claimondo-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-claimondo-ondo">Mitglied {idx + 1}</span>
                {mitglieder.length > 1 && (
                  <button type="button" onClick={() => removeMember(m.id)} className="text-claimondo-ondo/50 hover:text-red-400 p-0.5">
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <SelectField label="Anrede *" value={m.anrede} onChange={v => updateMember(m.id, 'anrede', v)} options={ANREDE_OPTIONEN} placeholder="Bitte wählen..." />
                <SelectField label="Titel" value={m.titel} onChange={v => updateMember(m.id, 'titel', v)} options={TITEL_OPTIONEN} placeholder="kein Titel" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Vorname *" value={m.vorname} onChange={v => updateMember(m.id, 'vorname', v)} />
                <Field label="Nachname *" value={m.nachname} onChange={v => updateMember(m.id, 'nachname', v)} />
                <Field label="Email *" type="email" value={m.email} onChange={v => updateMember(m.id, 'email', v)} />
              </div>
              <Field label="Telefon" type="tel" value={m.telefon} onChange={v => updateMember(m.id, 'telefon', v)} />
              <div>
                <label className="text-xs text-claimondo-ondo mb-1.5 block">Paket</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['standard', 'pro', 'premium'] as const).map(p => (
                    <button key={p} type="button" onClick={() => updateMember(m.id, 'paket', p)}
                      className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                        m.paket === p ? 'border-claimondo-ondo bg-claimondo-ondo/5 text-claimondo-ondo font-semibold' : 'border-claimondo-border text-claimondo-ondo hover:border-claimondo-border'
                      }`}>
                      <div className="capitalize">{p}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{PAKET_KONFIG[p].kontingent} F · {PAKET_KONFIG[p].preis_anzahlung_eur}€</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-claimondo-bg border border-claimondo-border rounded-xl p-4 text-sm">
            <p className="text-xs text-claimondo-ondo uppercase mb-2">Community</p>
            <p className="text-claimondo-navy"><strong>{name}</strong></p>
            {beschreibung && <p className="text-xs text-claimondo-ondo mt-1">{beschreibung}</p>}
            <p className="text-xs text-claimondo-ondo mt-2">Zentrum: {zentrumAnschrift}</p>
            <p className="text-xs text-claimondo-ondo">
              {gebietMode === 'polygon' && polygon
                ? `Polygon: ${polygon.length} Eckpunkte`
                : `Radius: ${radiusKm} km`} · Max {maxFaelleMonat} Fälle/Monat
            </p>
            {exklusiv && (
              <p className="text-xs text-amber-700 mt-2"><ShieldCheckIcon className="w-3 h-3 inline mr-1" /> Exklusivität aktiviert</p>
            )}
            <div className="mt-3 pt-3 border-t border-claimondo-border">
              <p className="text-xs text-claimondo-ondo uppercase mb-2">{mitglieder.length} Mitglied(er)</p>
              {mitglieder.map((m, i) => (
                <div key={m.id} className="text-xs text-claimondo-navy mb-1">
                  <strong>{i + 1}.</strong> {m.vorname} {m.nachname} ({m.email}) — {m.paket}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      <div className="flex items-center gap-3 mt-6">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} disabled={pending}
            className="px-4 py-2.5 rounded-xl border border-claimondo-border text-claimondo-ondo text-sm hover:bg-claimondo-bg disabled:opacity-40">
            Zurück
          </button>
        ) : (
          onCancel && (
            <button type="button" onClick={onCancel} disabled={pending}
              className="px-4 py-2.5 rounded-xl border border-claimondo-border text-claimondo-ondo text-sm hover:bg-claimondo-bg disabled:opacity-40">
              Abbrechen
            </button>
          )
        )}
        <button type="button"
          onClick={() => { if (step < STEPS.length - 1) setStep(step + 1); else handleSubmit() }}
          disabled={pending || !canNext()}
          className="flex-1 py-2.5 rounded-xl bg-claimondo-ondo hover:bg-claimondo-shield text-white text-sm font-semibold transition-colors disabled:opacity-40">
          {pending ? 'Wird angelegt...' : step < STEPS.length - 1 ? 'Weiter' : 'Community anlegen + Welcome-Mails senden'}
        </button>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-claimondo-ondo mb-1.5 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo" />
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-claimondo-ondo mb-1.5 block">{label}</label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo" />
    </div>
  )
}

function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void
  options: ReadonlyArray<string>; placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-claimondo-ondo mb-1.5 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo">
        {!options.includes('') && <option value="" disabled>{placeholder ?? 'Bitte wählen...'}</option>}
        {options.map(opt => (
          <option key={opt} value={opt}>{opt === '' ? (placeholder ?? '—') : opt}</option>
        ))}
      </select>
    </div>
  )
}
