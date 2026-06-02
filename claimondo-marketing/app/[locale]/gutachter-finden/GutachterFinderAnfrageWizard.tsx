'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, ShieldCheck, CalendarCheck, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { starteLiveBuchung } from '@/lib/actions/gutachter-finder-actions'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

// Live-Buchungs-Wizard für den Marketing-Finder ("Termin"-Tab des KartenWizard-
// Toggle). 2 Schritte: Schaden → Kontakt + Besichtigungsort → `starteLiveBuchung`
// (legt eine self-service-eligible Anfrage mit dem karten-gewählten SV an, geocodet
// den Besichtigungsort → schadenort_lat/lng + mintet einen self_service_token) →
// **Inline-Redirect** auf `app.claimondo.de/anfrage/[token]`, wo der bestehende
// Self-Service-Flow (SelbstQuali → SA → TerminBuchung) den echten Slot beim
// gewählten SV buchen lässt (SV-Weiche `fixerSvId`, AAR-955). Der Besichtigungsort
// ist Pflicht: ohne Koordinaten erreicht TerminBuchung den Slot-Picker NICHT und
// fällt auf "wir rufen an" zurück (anfrage-actions.ts:277).
//
// i18n ×6 via useTranslations('live_wizard'). Der `schadentyp`-VALUE bleibt
// Deutsch (geht so an Dispatch/DB), nur das Label wird übersetzt.

const SCHADEN_OPTIONS = [
  { value: 'Auffahrunfall', key: 'auffahr' },
  { value: 'Parkschaden', key: 'park' },
  { value: 'Wildunfall', key: 'wild' },
  { value: 'Glasschaden', key: 'glas' },
  { value: 'Sonstiger Schaden', key: 'sonstige' },
] as const

export function GutachterFinderAnfrageWizard() {
  const t = useTranslations('live_wizard')
  const [step, setStep] = useState<0 | 1>(0)
  const [schadentyp, setSchadentyp] = useState<string | null>(null)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [ort, setOrt] = useState('')
  const [dsgvo, setDsgvo] = useState(false)
  const [svId, setSvId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [pending, startTransition] = useTransition()

  // SV-Vorauswahl aus dem Karten-Klick (Popup-CTA → claimondo:select-sv).
  useEffect(() => {
    function onSelect(e: Event) {
      const ce = e as CustomEvent<{ id?: string; tier?: string }>
      if (ce.detail?.id) setSvId(ce.detail.id)
    }
    document.addEventListener('claimondo:select-sv', onSelect)
    return () => document.removeEventListener('claimondo:select-sv', onSelect)
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!schadentyp) { setStep(0); return }
    if (vorname.trim().length < 2 || nachname.trim().length < 2) { setError(t('err_name')); return }
    if (!/[\+0-9\s\-()]{8,}/.test(telefon)) { setError(t('err_telefon')); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError(t('err_email')); return }
    if (ort.trim().length < 3) { setError(t('err_ort')); return }
    if (!dsgvo) { setError(t('err_dsgvo')); return }

    startTransition(async () => {
      const result = await starteLiveBuchung({
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        telefon: telefon.trim(),
        ort: ort.trim(),
        schadentyp,
        zugeordneter_sv_id: svId ?? undefined,
      })
      if (result.ok) {
        setRedirecting(true)
        window.location.href = result.url
      } else {
        setError(result.error || t('err_submit'))
      }
    })
  }

  // ── Weiterleitung in den Slot-Picker ──
  if (redirecting) {
    return (
      <div role="status" aria-live="polite" className="rounded-ios-md border border-claimondo-border bg-white p-6 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-claimondo-ondo" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-claimondo-navy">{t('redirect_title')}</p>
        <p className="mt-1 text-xs text-claimondo-shield">{t('redirect_sub')}</p>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">{t('step_of', { n: 1 })}</p>
          <h3 className="mt-1.5 text-lg font-bold text-claimondo-navy">{t('q_heading')}</h3>
          <div className="mt-4 space-y-2">
            {SCHADEN_OPTIONS.map((opt) => {
              const active = schadentyp === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setSchadentyp(opt.value); setStep(1) }}
                  className={`flex w-full items-center justify-between gap-3 rounded-ios-md border px-4 py-3 text-left transition ${active ? 'border-claimondo-ondo bg-claimondo-ondo/5' : 'border-claimondo-border bg-white hover:border-claimondo-ondo'}`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-claimondo-navy">{t(`schaden_${opt.key}`)}</span>
                    <span className="block text-xs text-claimondo-shield">{t(`schaden_${opt.key}_desc`)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate data-tracking="gutachter-finder-livebuchung-wizard">
          <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">{t('step_of', { n: 2 })}</p>
          <h3 className="mt-1.5 text-lg font-bold text-claimondo-navy">{t('daten_heading')}</h3>

          <div className="mt-3 flex items-center gap-2 rounded-ios-md border border-claimondo-ondo/25 bg-claimondo-bg p-3 text-[13px] text-claimondo-navy">
            <ShieldCheck className="h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
            {svId ? t('sv_vorgemerkt') : t('sv_global')}
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field fieldId="vorname" label={t('field_vorname')} value={vorname} onChange={setVorname} autoComplete="given-name" required disabled={pending} />
              <Field fieldId="nachname" label={t('field_nachname')} value={nachname} onChange={setNachname} autoComplete="family-name" required disabled={pending} />
            </div>
            <Field fieldId="telefon" label={t('field_telefon')} value={telefon} onChange={setTelefon} type="tel" inputMode="tel" autoComplete="tel" placeholder={t('ph_telefon')} required disabled={pending} />
            <Field fieldId="email" label={t('field_email')} value={email} onChange={setEmail} type="email" autoComplete="email" placeholder={t('ph_email')} required disabled={pending} />
            <Field fieldId="ort" label={t('field_ort')} value={ort} onChange={setOrt} autoComplete="postal-code" placeholder={t('ph_ort')} required disabled={pending} />
            <p className="-mt-1.5 text-[11px] leading-snug text-claimondo-shield">{t('ort_hint')}</p>
            <label className="flex items-start gap-2.5 pt-1">
              <input type="checkbox" checked={dsgvo} onChange={(e) => setDsgvo(e.target.checked)} disabled={pending} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-claimondo-ondo" />
              <span className="text-[12px] leading-relaxed text-claimondo-shield">
                {t('dsgvo_text')}{' '}
                <a href="/datenschutz" target="_blank" className="underline">{t('dsgvo_link')}</a>.
              </span>
            </label>
          </div>

          {error ? (
            <div role="alert" className="mt-3 rounded-ios-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-900">
              <p className="font-semibold">{error}</p>
              <p className="mt-1 text-red-800/80">
                {t('err_call_prefix')}{' '}
                <a href={`tel:${PHONE_E164}`} className="font-bold underline">{PHONE_DISPLAY}</a>
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={() => setStep(0)} disabled={pending} className="inline-flex items-center gap-1 rounded-full border border-claimondo-border bg-white px-4 py-3 text-sm font-semibold text-claimondo-navy hover:border-claimondo-ondo disabled:opacity-70">
              <ChevronLeft className="h-4 w-4" aria-hidden /> {t('back')}
            </button>
            <button type="submit" disabled={pending} aria-busy={pending} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70">
              <CalendarCheck className="h-4 w-4" aria-hidden />
              {pending ? t('cta_pending') : t('cta')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Field({
  fieldId, label, value, onChange, type = 'text', required, disabled, placeholder, autoComplete, inputMode,
}: {
  fieldId: string
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
  const id = `gfaw-${fieldId}`
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
