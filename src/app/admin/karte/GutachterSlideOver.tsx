'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon, ChevronRightIcon, ChevronLeftIcon, CheckIcon, MapPinIcon } from 'lucide-react'
import { onboardGutachter } from '../sachverstaendige/actions'

const TYPEN = [
  { key: 'kfz-gutachter', label: 'KFZ-Gutachter', desc: 'Freier Sachverständiger', color: '#3b82f6' },
  { key: 'dat-gutachter', label: 'DAT-Gutachter', desc: 'DAT-zertifiziert', color: '#f97316' },
  { key: 'akademie', label: 'Akademie', desc: 'Akademie-Ausbildung', color: '#22c55e' },
  { key: 'gutachterbuero', label: 'Gutachterbüro', desc: 'Mehrere Standorte', color: '#a855f7' },
]

const PAKETE = [
  { key: 'starter-10', label: 'Starter', faelle: 10, km: 20, preis: 1500 },
  { key: 'standard-25', label: 'Pro', faelle: 25, km: 40, preis: 3750 },
  { key: 'premium-50', label: 'Premium', faelle: 50, km: 100, preis: 7500 },
]

const QUALIFIKATIONEN = [
  'Haftpflichtschaden', 'Kaskoschaden', 'Leasingrueckgabe', 'Flottenmanagement',
  'Oldtimer', 'LKW/Nutzfahrzeuge', 'Motorrad', 'Wohnmobil',
  'Totalschaden-Bewertung', 'Wiederbeschaffungswert', 'Beweissicherung', 'Gerichtsgutachten',
]

type Props = {
  open: boolean
  onClose: () => void
  onLocationChange?: (lat: number, lng: number, radiusKm: number, color: string) => void
}

export default function GutachterSlideOver({ open, onClose, onLocationChange }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ email: string; password: string } | null>(null)

  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [typ, setTyp] = useState('kfz-gutachter')
  const [adresse, setAdresse] = useState('')
  const [plz, setPlz] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [paket, setPaket] = useState('standard-25')
  const [quals, setQuals] = useState<string[]>([])

  const selectedPaket = PAKETE.find(p => p.key === paket)!
  const selectedTyp = TYPEN.find(t => t.key === typ)!

  function handlePaketChange(key: string) {
    setPaket(key)
    const p = PAKETE.find(pk => pk.key === key)!
    if (lat && lng && onLocationChange) {
      onLocationChange(lat, lng, p.km, selectedTyp.color)
    }
  }

  function handleAdresseBlur() {
    // Simple geocoding fallback - in production use Google Places
    if (adresse && !lat) {
      // Set approximate Köln coords as fallback
      setLat(50.9375)
      setLng(6.9603)
      if (onLocationChange) onLocationChange(50.9375, 6.9603, selectedPaket.km, selectedTyp.color)
    }
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const result = await onboardGutachter({
        vorname, nachname, email, telefon,
        gutachter_typ: typ,
        paket: paket as 'starter-10' | 'standard-25' | 'premium-50',
        qualifikationen: quals,
        standort_adresse: adresse,
        standort_plz: plz,
        standort_lat: lat,
        standort_lng: lng,
        standort_place_id: null,
      })
      setSuccess({ email, password: result.tempPassword })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setStep(0)
    setSuccess(null)
    setError(null)
    onClose()
  }

  if (!open) return null

  const canNext = step === 0 ? (vorname && nachname && email && telefon) :
                  step === 1 ? true :
                  step === 2 ? !!adresse :
                  step === 3 ? true :
                  step === 4 ? true : true

  const STEPS = ['Daten', 'Typ', 'Standort', 'Paket', 'Quali.', 'Fertig']

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={handleClose} />

      {/* Slide-Over Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-[400px] z-50 flex flex-col"
        style={{ background: '#0d1225', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-white font-semibold">Neuer Gutachter</h2>
          <button onClick={handleClose} className="p-1.5 text-zinc-400 hover:text-white"><XIcon className="w-5 h-5" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 px-5 py-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full ${i <= step ? 'bg-blue-500' : 'bg-zinc-800'}`} />
              <span className="text-[9px] mt-0.5 block" style={{ color: i === step ? '#93bbfc' : 'rgba(255,255,255,0.2)' }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {success ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckIcon className="w-7 h-7 text-green-400" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">Gutachter angelegt</h3>
              <p className="text-zinc-400 text-sm mb-1">{success.email}</p>
              <p className="text-zinc-500 text-xs mb-4">Einmalpasswort: <code className="text-blue-400">{success.password}</code></p>
              <button onClick={handleClose} className="px-6 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                Schließen
              </button>
            </div>
          ) : (
            <>
              {/* Step 0: Persönliche Daten */}
              {step === 0 && (
                <div className="space-y-3">
                  <p className="glass-label mb-3">Persönliche Daten</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-zinc-400 text-xs mb-1 block">Vorname *</label><input value={vorname} onChange={e => setVorname(e.target.value)} className="w-full glass-input px-3 py-2.5 text-sm text-white" /></div>
                    <div><label className="text-zinc-400 text-xs mb-1 block">Nachname *</label><input value={nachname} onChange={e => setNachname(e.target.value)} className="w-full glass-input px-3 py-2.5 text-sm text-white" /></div>
                  </div>
                  <div><label className="text-zinc-400 text-xs mb-1 block">E-Mail *</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full glass-input px-3 py-2.5 text-sm text-white" /></div>
                  <div><label className="text-zinc-400 text-xs mb-1 block">Telefon *</label><input value={telefon} onChange={e => setTelefon(e.target.value)} type="tel" className="w-full glass-input px-3 py-2.5 text-sm text-white" /></div>
                </div>
              )}

              {/* Step 1: Gutachter-Typ */}
              {step === 1 && (
                <div className="space-y-3">
                  <p className="glass-label mb-3">Gutachter-Typ</p>
                  {TYPEN.map(t => (
                    <button key={t.key} onClick={() => setTyp(t.key)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${typ === t.key ? 'border-blue-500/40' : 'border-zinc-800 hover:border-zinc-700'}`}
                      style={typ === t.key ? { background: 'rgba(59,130,246,0.08)' } : { background: 'rgba(255,255,255,0.03)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                        <span className="text-white font-medium text-sm">{t.label}</span>
                      </div>
                      <p className="text-zinc-500 text-xs mt-1 ml-6">{t.desc}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2: Standort */}
              {step === 2 && (
                <div className="space-y-3">
                  <p className="glass-label mb-3">Standort</p>
                  <div>
                    <label className="text-zinc-400 text-xs mb-1 block">Adresse *</label>
                    <input value={adresse} onChange={e => setAdresse(e.target.value)} onBlur={handleAdresseBlur}
                      placeholder="Strasse + Hausnummer, PLZ Ort"
                      className="w-full glass-input px-3 py-2.5 text-sm text-white" />
                    <p className="text-zinc-600 text-xs mt-1">Google Places Autocomplete aktiv wenn API Key gesetzt</p>
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs mb-1 block">PLZ</label>
                    <input value={plz} onChange={e => setPlz(e.target.value)} className="w-full glass-input px-3 py-2.5 text-sm text-white" />
                  </div>
                  {lat && lng && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <MapPinIcon className="w-3.5 h-3.5" />
                      <span>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Paket */}
              {step === 3 && (
                <div className="space-y-3">
                  <p className="glass-label mb-3">Paket wählen</p>
                  {PAKETE.map(p => (
                    <button key={p.key} onClick={() => handlePaketChange(p.key)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${paket === p.key ? 'border-blue-500/40' : 'border-zinc-800 hover:border-zinc-700'}`}
                      style={paket === p.key ? { background: 'rgba(59,130,246,0.08)' } : { background: 'rgba(255,255,255,0.03)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium text-sm">{p.label}</span>
                        <span className="text-blue-400 font-semibold text-sm">{p.preis.toLocaleString('de-DE')} €</span>
                      </div>
                      <p className="text-zinc-500 text-xs mt-1">{p.faelle} Fälle · {p.km} km Radius</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 4: Qualifikationen */}
              {step === 4 && (
                <div className="space-y-2">
                  <p className="glass-label mb-3">Qualifikationen</p>
                  <div className="grid grid-cols-2 gap-2">
                    {QUALIFIKATIONEN.map(q => (
                      <button key={q} onClick={() => setQuals(prev => prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q])}
                        className={`text-left px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                          quals.includes(q) ? 'border-blue-500/40 text-blue-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                        style={quals.includes(q) ? { background: 'rgba(59,130,246,0.08)' } : { background: 'rgba(255,255,255,0.03)' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5: Zusammenfassung */}
              {step === 5 && (
                <div className="space-y-3">
                  <p className="glass-label mb-3">Zusammenfassung</p>
                  <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Row label="Name" value={`${vorname} ${nachname}`} />
                    <Row label="E-Mail" value={email} />
                    <Row label="Telefon" value={telefon} />
                    <Row label="Typ" value={selectedTyp.label} />
                    <Row label="Standort" value={adresse || '—'} />
                    <Row label="Paket" value={`${selectedPaket.label} (${selectedPaket.faelle} Fälle, ${selectedPaket.km} km)`} />
                    <Row label="Anzahlung" value={`${selectedPaket.preis.toLocaleString('de-DE')} €`} />
                    <Row label="Qualifikationen" value={quals.length > 0 ? quals.join(', ') : '—'} />
                  </div>
                  {error && <p className="text-red-400 text-sm bg-red-950/50 border border-red-900 px-4 py-3 rounded-xl">{error}</p>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-5 py-4 flex gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors">
                <ChevronLeftIcon className="w-4 h-4" /> Zurück
              </button>
            )}
            <div className="flex-1" />
            {step < 5 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
                className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
                Weiter <ChevronRightIcon className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={saving}
                className="flex items-center gap-1 px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                {saving ? 'Erstelle...' : 'Gutachter anlegen'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 text-right max-w-[60%] truncate">{value}</span>
    </div>
  )
}
