'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Phone, ShieldCheck, RotateCcw } from 'lucide-react'
import { erstelleGutachterFinderAnfrage } from '@/lib/actions/gutachter-finder-actions'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

// Anfrage-Wizard für den Marketing-Finder ("Termin"-Tab des KartenWizardToggle).
// Ersetzt den bisherigen statischen "Zum Termin-Portal"-App-Link durch einen
// echten 2-Schritt-Wizard: Schaden → Kontakt + Wunschtermin → erstelleGutachter-
// FinderAnfrage (Dispatch-Task + Rückruf). Der per Karten-Klick gewählte SV
// kommt über das Event 'claimondo:select-sv' rein (zugeordneter_sv_id).
//
// INTERIM (Aaron 02.06.): Bewusst KEIN Live-Slot-Picker — der würde die
// SV-Verfügbarkeit öffentlich exponieren und überschneidet sich mit der aktiven
// Termin-Engine + AAR-940-Self-Service-Strecke. Dispatch bestätigt den Termin
// telefonisch. Vorwärts-kompatibel: der Slot-Picker ersetzt später den
// Wunschtermin-Schritt (Spec: docs/.../marketing-finder-live-buchung-spec.md).

const SCHADENTYP_OPTIONS = [
  { value: 'Auffahrunfall', desc: 'Jemand ist Ihnen aufgefahren' },
  { value: 'Parkschaden', desc: 'Schaden im Stand / beim Parken' },
  { value: 'Wildunfall', desc: 'Zusammenstoß mit einem Tier' },
  { value: 'Glasschaden', desc: 'Steinschlag, Scheibe beschädigt' },
  { value: 'Sonstiger Schaden', desc: 'Etwas anderes — wir klären es' },
] as const

const MIN_DT = (() => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
})()

export function GutachterFinderAnfrageWizard() {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [schadentyp, setSchadentyp] = useState<string | null>(null)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [wunschtermin, setWunschtermin] = useState('')
  const [dsgvo, setDsgvo] = useState(false)
  const [svId, setSvId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // SV-Vorauswahl aus dem Karten-Klick (Popup-CTA → claimondo:select-sv).
  useEffect(() => {
    function onSelect(e: Event) {
      const ce = e as CustomEvent<{ id?: string; tier?: string }>
      if (ce.detail?.id) {
        setSvId(ce.detail.id)
        setStep((s) => (s === 2 ? s : s)) // kein Reset, nur SV merken
      }
    }
    document.addEventListener('claimondo:select-sv', onSelect)
    return () => document.removeEventListener('claimondo:select-sv', onSelect)
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!schadentyp) { setStep(0); return }
    if (vorname.trim().length < 2 || nachname.trim().length < 2) { setError('Bitte Vor- und Nachnamen angeben.'); return }
    if (!/[\+0-9\s\-()]{8,}/.test(telefon)) { setError('Bitte eine gültige Telefonnummer angeben.'); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Bitte eine gültige E-Mail-Adresse angeben.'); return }
    if (!dsgvo) { setError('Bitte der Datenverarbeitung zustimmen.'); return }

    startTransition(async () => {
      const result = await erstelleGutachterFinderAnfrage({
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        telefon: telefon.trim(),
        schadentyp,
        wunschtermin: wunschtermin || undefined,
        zugeordneter_sv_id: svId ?? undefined,
        matching_typ: svId ? 'karte-klick' : 'manuell',
      })
      if (result.ok) {
        setStep(2)
      } else {
        setError(result.error || 'Übermittlung fehlgeschlagen — bitte rufen Sie uns an.')
      }
    })
  }

  function reset() {
    setStep(0); setSchadentyp(null); setVorname(''); setNachname(''); setTelefon('')
    setEmail(''); setWunschtermin(''); setDsgvo(false); setError(null)
  }

  // ── Erfolg ──
  if (step === 2) {
    return (
      <div role="status" aria-live="polite" className="rounded-ios-md border border-claimondo-border bg-white p-6 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" aria-hidden />
        <h3 className="mt-3 text-lg font-bold text-claimondo-navy">Anfrage gesendet</h3>
        <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
          Wir bestätigen Ihren Termin telefonisch — meist innerhalb weniger Minuten.
          Ihr Fall wird kostenfrei geprüft.
        </p>
        <a
          href={`tel:${PHONE_E164}`}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white transition hover:bg-claimondo-shield"
        >
          <Phone className="h-4 w-4" aria-hidden />
          {PHONE_DISPLAY}
        </a>
        <button type="button" onClick={reset} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[12px] text-claimondo-shield/70 hover:underline">
          <RotateCcw className="h-3 w-3" aria-hidden /> Neue Anfrage
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Fortschritt */}
      <div className="mb-4 flex items-center gap-2" aria-hidden>
        {[0, 1].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-claimondo-ondo' : 'bg-claimondo-border'}`} />
        ))}
      </div>

      {step === 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Schritt 1 von 2</p>
          <h3 className="mt-1.5 text-lg font-bold text-claimondo-navy">Was ist passiert?</h3>
          <div className="mt-4 space-y-2">
            {SCHADENTYP_OPTIONS.map((opt) => {
              const active = schadentyp === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setSchadentyp(opt.value); setStep(1) }}
                  className={`flex w-full items-center justify-between gap-3 rounded-ios-md border px-4 py-3 text-left transition ${active ? 'border-claimondo-ondo bg-claimondo-ondo/5' : 'border-claimondo-border bg-white hover:border-claimondo-ondo'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-claimondo-navy">{opt.value}</span>
                    <span className="block text-xs text-claimondo-shield">{opt.desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate data-tracking="gutachter-finder-anfrage-wizard">
          <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Schritt 2 von 2</p>
          <h3 className="mt-1.5 text-lg font-bold text-claimondo-navy">Ihre Daten &amp; Wunschtermin</h3>

          <div className="mt-3 flex items-center gap-2 rounded-ios-md border border-claimondo-ondo/25 bg-claimondo-bg p-3 text-[13px] text-claimondo-navy">
            <ShieldCheck className="h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
            {svId ? 'Ihr auf der Karte gewählter Sachverständiger ist vorgemerkt.' : 'Wir wählen den passenden Sachverständigen in Ihrer Nähe.'}
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vorname" value={vorname} onChange={setVorname} autoComplete="given-name" required disabled={pending} />
              <Field label="Nachname" value={nachname} onChange={setNachname} autoComplete="family-name" required disabled={pending} />
            </div>
            <Field label="Telefon" value={telefon} onChange={setTelefon} type="tel" inputMode="tel" autoComplete="tel" placeholder="+49 …" required disabled={pending} />
            <Field label="E-Mail" value={email} onChange={setEmail} type="email" autoComplete="email" placeholder="name@beispiel.de" required disabled={pending} />
            <div>
              <label htmlFor="gfaw-wunsch" className="mb-1.5 block text-xs font-semibold text-claimondo-shield">Wunschtermin (optional)</label>
              <input
                id="gfaw-wunsch"
                type="datetime-local"
                min={MIN_DT}
                value={wunschtermin}
                onChange={(e) => setWunschtermin(e.target.value)}
                disabled={pending}
                className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-3 text-base transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:opacity-70"
              />
            </div>
            <label className="flex items-start gap-2.5 pt-1">
              <input type="checkbox" checked={dsgvo} onChange={(e) => setDsgvo(e.target.checked)} disabled={pending} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-claimondo-ondo" />
              <span className="text-[12px] leading-relaxed text-claimondo-shield">
                Ich willige in die Verarbeitung meiner Daten zur Fall-Bearbeitung ein.{' '}
                <a href="/datenschutz" target="_blank" className="underline">Datenschutz</a>.
              </span>
            </label>
          </div>

          {error ? (
            <div role="alert" className="mt-3 rounded-ios-md border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">{error}</div>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={() => setStep(0)} disabled={pending} className="inline-flex items-center gap-1 rounded-full border border-claimondo-border bg-white px-4 py-3 text-sm font-semibold text-claimondo-navy hover:border-claimondo-ondo disabled:opacity-70">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Zurück
            </button>
            <button type="submit" disabled={pending} aria-busy={pending} className="flex-1 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70">
              {pending ? 'Wird gesendet …' : 'Termin anfragen'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', required, disabled, placeholder, autoComplete, inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  autoComplete?: string
  inputMode?: 'tel' | 'email' | 'text'
}) {
  const id = `gfaw-${label.toLowerCase().replace(/[^a-z]/g, '')}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-claimondo-shield">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-3 text-base transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:opacity-70"
      />
    </div>
  )
}
