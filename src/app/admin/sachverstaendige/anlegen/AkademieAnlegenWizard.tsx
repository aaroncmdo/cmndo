'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  GraduationCapIcon, UsersIcon, CheckCircle2Icon, MailIcon, PlusIcon, TrashIcon,
} from 'lucide-react'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { anlegeAkademie } from './actions'
import { TextField as SharedTextField, SelectField as SharedSelectField } from '@/components/shared/forms'
import {
  PAKET_KONFIG, paketAnzahlung, ANREDE_OPTIONEN, TITEL_OPTIONEN,
  QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN,
  type AnlegePaket, type AnlegeAkademieFormData,
} from './constants'

// KFZ-152 Phase 2: 3-Step Akademie-Anlegen Wizard fuer den Admin.
// Step 1: Akademie-Stammdaten (Name, Adresse, Verwalter, Konditionen, Spezialisierungen)
// Step 2: Sub-SVs (Mitglieder) - optional
// Step 3: Zusammenfassung + Submit -> anlegeAkademie() Server Action

const STEPS = [
  { key: 'stammdaten', label: 'Akademie + Verwalter', icon: GraduationCapIcon },
  { key: 'mitglieder', label: 'Mitglieder', icon: UsersIcon },
  { key: 'submit', label: 'Zusammenfassung', icon: CheckCircle2Icon },
] as const

type SubSv = {
  id: string
  anrede: string
  titel: string
  vorname: string
  nachname: string
  email: string
  telefon: string
  paket: AnlegePaket
}

function newSubSv(): SubSv {
  return {
    id: Math.random().toString(36).slice(2),
    anrede: '', titel: '', vorname: '', nachname: '', email: '', telefon: '',
    paket: 'standard',
  }
}

export default function AkademieAnlegenWizard({ onSuccess }: {
  onSuccess?: (info: { name: string; email: string }) => void
} = {}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ organisation_id: string; sub_count: number } | null>(null)

  // Akademie-Stammdaten
  const [akademieName, setAkademieName] = useState('')
  const [rechtsform, setRechtsform] = useState('')
  const [anschrift, setAnschrift] = useState('')
  const [anschriftLat, setAnschriftLat] = useState<number | null>(null)
  const [anschriftLng, setAnschriftLng] = useState<number | null>(null)
  const [anschriftPlaceId, setAnschriftPlaceId] = useState('')
  const [anschriftPlz, setAnschriftPlz] = useState('')
  const [steuernummer, setSteuernummer] = useState('')
  const [ustId, setUstId] = useState('')
  const [radiusKm, setRadiusKm] = useState(100)
  const [maxFaelleMonat, setMaxFaelleMonat] = useState(50)
  const [erstAnzahlungEur, setErstAnzahlungEur] = useState(2500)

  // Verwalter
  const [verwalterAnrede, setVerwalterAnrede] = useState('')
  const [verwalterTitel, setVerwalterTitel] = useState('')
  const [verwalterVorname, setVerwalterVorname] = useState('')
  const [verwalterNachname, setVerwalterNachname] = useState('')
  const [verwalterEmail, setVerwalterEmail] = useState('')
  const [verwalterTelefon, setVerwalterTelefon] = useState('')

  // Default-Spezialisierungen der Akademie (gelten als Default fuer Sub-SVs)
  const [qualifikationen, setQualifikationen] = useState<string[]>([])
  const [spezifikationen, setSpezifikationen] = useState<string[]>([])
  const [schadenarten, setSchadenarten] = useState<string[]>([])

  // Mitglieder
  const [subSvs, setSubSvs] = useState<SubSv[]>([])

  function toggleTag(setter: (fn: (prev: string[]) => string[]) => void, value: string) {
    setter(prev => prev.includes(value) ? prev.filter(x => x !== value) : [...prev, value])
  }

  function addSubSv() { setSubSvs(prev => [...prev, newSubSv()]) }
  function removeSubSv(id: string) { setSubSvs(prev => prev.filter(s => s.id !== id)) }
  function updateSubSv<K extends keyof SubSv>(id: string, key: K, value: SubSv[K]) {
    setSubSvs(prev => prev.map(s => s.id === id ? { ...s, [key]: value } : s))
  }

  const gesamtKontingentSubSvs = subSvs.reduce((sum, s) => sum + (PAKET_KONFIG[s.paket as Exclude<AnlegePaket, 'individuell'>]?.kontingent ?? 10), 0)

  function canNext(): boolean {
    if (step === 0) return !!(
      akademieName.trim() && steuernummer.trim() && anschriftLat !== null && anschriftLng !== null &&
      verwalterAnrede && verwalterVorname.trim() && verwalterNachname.trim() && verwalterEmail.trim() &&
      erstAnzahlungEur > 0
    )
    if (step === 1) {
      // Sub-SVs sind OPTIONAL, leer ist ok. Wenn welche da sind: alle Pflichtfelder
      return subSvs.every(s => s.anrede && s.vorname.trim() && s.nachname.trim() && s.email.trim())
    }
    return true
  }

  async function handleSubmit() {
    setError(null)
    setSaving(true)

    const payload: AnlegeAkademieFormData = {
      akademie_name: akademieName,
      rechtsform: rechtsform || undefined,
      anschrift,
      anschrift_lat: anschriftLat,
      anschrift_lng: anschriftLng,
      anschrift_place_id: anschriftPlaceId || undefined,
      anschrift_plz: anschriftPlz,
      steuernummer,
      ust_id: ustId || undefined,
      radius_km: radiusKm,
      max_faelle_monat: maxFaelleMonat,
      erst_anzahlung_eur: erstAnzahlungEur,
      verwalter_anrede: verwalterAnrede || undefined,
      verwalter_titel: verwalterTitel || undefined,
      verwalter_vorname: verwalterVorname,
      verwalter_nachname: verwalterNachname,
      verwalter_email: verwalterEmail,
      verwalter_telefon: verwalterTelefon,
      qualifikationen,
      spezifikationen,
      schadenarten,
      sub_svs: subSvs.map(s => ({
        anrede: s.anrede || undefined,
        titel: s.titel || undefined,
        vorname: s.vorname,
        nachname: s.nachname,
        email: s.email,
        telefon: s.telefon || undefined,
        paket: s.paket,
      })),
    }

    const r = await anlegeAkademie(payload)
    setSaving(false)
    if (!r.success) { setError(r.error ?? 'Anlegen fehlgeschlagen'); return }
    setResult({ organisation_id: r.organisation_id!, sub_count: r.sub_sv_ids?.length ?? 0 })
    // AAR-205: Toast für Page-Use
    toast.success(`Akademie ${akademieName} angelegt`, {
      description: `${r.sub_sv_ids?.length ?? 0} Mitglied(er) — Welcome-Mail an ${verwalterEmail}.`,
    })
    onSuccess?.({ name: akademieName, email: verwalterEmail })
  }

  if (result) {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2Icon className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-claimondo-navy">{akademieName} angelegt</h2>
            <p className="text-sm text-claimondo-ondo mt-1">
              1 Verwalter-Account + {result.sub_count} Sub-SV(s) wurden angelegt.
              Welcome-Mails versendet. Erst-Anzahlung: {erstAnzahlungEur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => router.push('/admin/sachverstaendige')}
                className="flex-1 py-2.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold">
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

      <div className="bg-white border border-claimondo-border rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-claimondo-navy mb-5">{STEPS[step].label}</h2>

        {/* SCHRITT 0: Akademie-Stammdaten + Verwalter */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-2">Akademie-Stammdaten</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Akademie-Name *" value={akademieName} onChange={setAkademieName} className="sm:col-span-2" />
                <Field label="Rechtsform" value={rechtsform} onChange={setRechtsform} placeholder="z.B. e.V., GmbH" />
                <Field label="Steuernummer *" value={steuernummer} onChange={setSteuernummer} />
                <div className="sm:col-span-2">
                  <label className="text-xs text-claimondo-ondo mb-1.5 block">
                    Anschrift *
                    {anschriftLat !== null && <span className="text-emerald-600 ml-2">✓ Geo gesetzt</span>}
                  </label>
                  <GooglePlaceAutocomplete
                    defaultValue={anschrift}
                    placeholder="Adresse der Akademie wählen..."
                    onSelect={place => {
                      setAnschrift(place.adresse)
                      setAnschriftPlz(place.plz)
                      setAnschriftLat(place.lat)
                      setAnschriftLng(place.lng)
                      setAnschriftPlaceId(place.place_id)
                    }}
                    className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2.5 text-sm text-claimondo-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
                  />
                </div>
                <Field label="USt-IdNr (optional)" value={ustId} onChange={setUstId} />
                <NumField label="Radius km" value={radiusKm} onChange={setRadiusKm} />
                <NumField label="Max Fälle/Monat" value={maxFaelleMonat} onChange={setMaxFaelleMonat} />
                <NumField label="Erst-Anzahlung €" value={erstAnzahlungEur} onChange={setErstAnzahlungEur} />
              </div>
            </div>

            <div className="pt-4 border-t border-claimondo-border">
              <p className="text-xs text-claimondo-ondo uppercase tracking-wide mb-2">Akademie-Verwalter</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectField label="Anrede *" value={verwalterAnrede} onChange={setVerwalterAnrede} options={ANREDE_OPTIONEN} placeholder="Bitte wählen..." />
                <SelectField label="Titel" value={verwalterTitel} onChange={setVerwalterTitel} options={TITEL_OPTIONEN} placeholder="kein Titel" />
                <Field label="Vorname *" value={verwalterVorname} onChange={setVerwalterVorname} />
                <Field label="Nachname *" value={verwalterNachname} onChange={setVerwalterNachname} />
                <Field label="Email *" type="email" value={verwalterEmail} onChange={setVerwalterEmail} className="sm:col-span-2" />
                <Field label="Telefon" type="tel" value={verwalterTelefon} onChange={setVerwalterTelefon} className="sm:col-span-2" />
              </div>
            </div>

            <div className="pt-4 border-t border-claimondo-border space-y-3">
              <p className="text-xs text-claimondo-ondo uppercase tracking-wide">Default-Spezialisierungen (gelten für die ganze Akademie)</p>
              <TagSection title="Qualifikationen" options={QUALIFIKATIONEN} selected={qualifikationen} onToggle={v => toggleTag(setQualifikationen, v)} />
              <TagSection title="Spezifikationen" options={SPEZIFIKATIONEN} selected={spezifikationen} onToggle={v => toggleTag(setSpezifikationen, v)} />
              {/* AAR-204: Schadenarten raus (irrelevant für SV-Zuweisung) */}
            </div>
          </div>
        )}

        {/* SCHRITT 1: Sub-SVs (optional) */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-claimondo-ondo">
                Mitglieder können auch nachträglich via Sub-SV-Tab hinzugefügt werden — Phase 1 erlaubt 0 Sub-SVs.
              </p>
              <button type="button" onClick={addSubSv}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-claimondo-ondo/5 hover:bg-claimondo-ondo/10 text-claimondo-ondo text-xs font-medium">
                <PlusIcon className="w-3.5 h-3.5" />
                Sub-SV
              </button>
            </div>
            {subSvs.length === 0 && (
              <div className="text-center py-8 text-xs text-claimondo-ondo/70">
                Keine Sub-SVs — die Akademie wird leer angelegt.
              </div>
            )}
            {subSvs.map((s, idx) => (
              <div key={s.id} className="border border-claimondo-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-claimondo-ondo">Mitglied {idx + 1}</span>
                  <button type="button" onClick={() => removeSubSv(s.id)} className="text-claimondo-ondo/50 hover:text-red-400 p-0.5">
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <SelectField label="Anrede *" value={s.anrede} onChange={v => updateSubSv(s.id, 'anrede', v)} options={ANREDE_OPTIONEN} placeholder="Bitte wählen..." />
                  <SelectField label="Titel" value={s.titel} onChange={v => updateSubSv(s.id, 'titel', v)} options={TITEL_OPTIONEN} placeholder="kein Titel" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Field label="Vorname *" value={s.vorname} onChange={v => updateSubSv(s.id, 'vorname', v)} />
                  <Field label="Nachname *" value={s.nachname} onChange={v => updateSubSv(s.id, 'nachname', v)} />
                  <Field label="Email *" type="email" value={s.email} onChange={v => updateSubSv(s.id, 'email', v)} />
                </div>
                <Field label="Telefon" type="tel" value={s.telefon} onChange={v => updateSubSv(s.id, 'telefon', v)} />
                <div>
                  <label className="text-xs text-claimondo-ondo mb-1.5 block">Paket</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['standard', 'pro', 'premium'] as const).map(p => (
                      <button key={p} type="button" onClick={() => updateSubSv(s.id, 'paket', p)}
                        className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                          s.paket === p ? 'border-claimondo-ondo bg-claimondo-ondo/5 text-claimondo-ondo font-semibold' : 'border-claimondo-border text-claimondo-ondo hover:border-claimondo-border'
                        }`}>
                        <div className="capitalize">{p}</div>
                        <div className="text-[10px] mt-0.5 opacity-70">{PAKET_KONFIG[p].kontingent} F · {PAKET_KONFIG[p].preis_anzahlung_eur}€</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {subSvs.length > 0 && (
              <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/10 rounded-xl p-4">
                <p className="text-xs text-claimondo-ondo">Sub-SVs Gesamt-Kontingent</p>
                <p className="text-2xl font-bold text-claimondo-ondo mt-1">{gesamtKontingentSubSvs} Fälle/Monat</p>
              </div>
            )}
          </div>
        )}

        {/* SCHRITT 2: Zusammenfassung */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-claimondo-bg border border-claimondo-border rounded-xl p-4 text-sm">
              <p className="text-xs text-claimondo-ondo uppercase mb-2">Akademie</p>
              <p className="text-claimondo-navy"><strong>{akademieName}</strong>{rechtsform && ` (${rechtsform})`}</p>
              <p className="text-claimondo-ondo text-xs mt-1">{anschrift}</p>
              <p className="text-claimondo-ondo text-xs">Steuer: {steuernummer}</p>
              <p className="text-claimondo-ondo text-xs">Radius: {radiusKm} km · {maxFaelleMonat} Fälle/Monat</p>
              <p className="text-claimondo-ondo text-xs">Erst-Anzahlung: {erstAnzahlungEur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
              <div className="mt-3 pt-3 border-t border-claimondo-border">
                <p className="text-xs text-claimondo-ondo uppercase mb-1">Verwalter</p>
                <p className="text-claimondo-navy"><strong>{[verwalterAnrede, verwalterTitel, verwalterVorname, verwalterNachname].filter(Boolean).join(' ')}</strong></p>
                <p className="text-claimondo-ondo text-xs">{verwalterEmail}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-claimondo-border">
                <p className="text-xs text-claimondo-ondo uppercase mb-2">{subSvs.length} Mitglied(er)</p>
                {subSvs.length === 0 ? (
                  <p className="text-xs text-claimondo-ondo/70">Werden nachträglich hinzugefügt</p>
                ) : (
                  subSvs.map((s, i) => (
                    <div key={s.id} className="text-xs text-claimondo-navy mb-1">
                      <strong>{i + 1}.</strong> {s.vorname} {s.nachname} ({s.email}) — {s.paket}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/10 rounded-xl p-4 flex items-start gap-3">
              <MailIcon className="w-5 h-5 text-claimondo-ondo flex-shrink-0 mt-0.5" />
              <div className="text-xs text-claimondo-navy">
                <strong>{1 + subSvs.length} Welcome-Mail(s) werden versendet:</strong>
                <ul className="mt-2 ml-4 list-disc space-y-1">
                  <li>1× an Verwalter {verwalterEmail}</li>
                  {subSvs.map((s, i) => <li key={i}>1× an Sub-SV {s.email}</li>)}
                </ul>
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
            <button type="button" onClick={() => setStep(step - 1)} disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-claimondo-border text-claimondo-ondo text-sm hover:bg-claimondo-bg disabled:opacity-40">
              Zurück
            </button>
          )}
          <button type="button"
            onClick={() => { if (step < STEPS.length - 1) setStep(step + 1); else handleSubmit() }}
            disabled={saving || !canNext()}
            className="flex-1 py-2.5 rounded-xl bg-claimondo-ondo hover:bg-claimondo-shield text-white text-sm font-semibold transition-colors disabled:opacity-40">
            {saving ? 'Wird angelegt...' : step < STEPS.length - 1 ? 'Weiter' : 'Akademie anlegen + Welcome-Mails senden'}
          </button>
        </div>
      </div>
    </div>
  )
}

// AAR-frontend-konsolidierung-p1: dünner Adapter — delegiert an shared/forms/TextField.
function Field({
  label, value, onChange, type = 'text', placeholder, className,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; className?: string
}) {
  return (
    <SharedTextField
      label={label}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
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

// AAR-frontend-konsolidierung-p1: dünner Adapter — string[]-Options → shared/forms/SelectField.
function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void
  options: ReadonlyArray<string>; placeholder?: string
}) {
  const opts = options.includes('')
    ? options.map((o) => ({ value: o, label: o === '' ? (placeholder ?? '—') : o }))
    : [
        { value: '', label: placeholder ?? 'Bitte wählen...', disabled: true },
        ...options.map((o) => ({ value: o, label: o })),
      ]
  return (
    <SharedSelectField label={label} value={value} onChange={(e) => onChange(e.target.value)} options={opts} />
  )
}

function TagSection({
  title, options, selected, onToggle,
}: {
  title: string; options: ReadonlyArray<string>; selected: string[]; onToggle: (v: string) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-claimondo-navy">{title}</span>
        <span className="text-[10px] text-claimondo-ondo/70">{selected.length} gewählt</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = selected.includes(opt)
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                active ? 'bg-claimondo-ondo text-white' : 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
              }`}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
