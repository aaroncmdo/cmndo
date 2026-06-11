'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, ShieldCheck, CalendarCheck, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { bereiteLiveBuchungVor, trackLiveBuchungLead } from '@/lib/actions/gutachter-finder-actions'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

// Live-Buchungs-Wizard für den Marketing-Finder (claimondo.de/gutachter-finden,
// "Termin"-Tab des KartenWizard-Toggle). 2 Schritte: Schaden → Kontakt +
// Besichtigungsort. AAR-956 2-Knopf-Funnel: der Wizard geocodet den Ort
// (bereiteLiveBuchungVor — Mapbox-Token server-only) und POSTet die Anfrage
// CLIENT-seitig an app.claimondo.de/api/anfrage-from-lp (source=kfz_gutachter_lp,
// Origin-Auth). Der kanonische Intake legt gfa → Lead → flow_link an:
//   • "Weiter zur Terminbuchung" (aktion='direkt') → Token zurück → window.location auf
//     /flow/[token] → Self-Onboarding-Slot-Picker beim karten-gewählten SV (Fixer).
//   • "Anfrage senden" (aktion='senden') → FlowLink-Versand (WA→SMS→Email) + Lead in
//     der Dispatch-Queue → Bestätigungs-Screen ("wir melden uns").
// KEIN /start mehr (retired). i18n ×6 via useTranslations('live_wizard'); der
// schadentyp-VALUE bleibt Deutsch (geht so an Dispatch/DB), nur das Label wird übersetzt.

const SCHADEN_OPTIONS = [
  { value: 'Auffahrunfall', key: 'auffahr' },
  { value: 'Parkschaden', key: 'park' },
  { value: 'Wildunfall', key: 'wild' },
  { value: 'Glasschaden', key: 'glas' },
  { value: 'Sonstiger Schaden', key: 'sonstige' },
] as const

// Ziel-App für den kanonischen Intake + /flow-Redirect (claimondo.de → app.claimondo.de,
// cross-origin; der Browser-Origin muss in MONIKA_CLUSTER_DOMAINS / clusterAllowlist() stehen).
const PORTAL_URL = 'https://app.claimondo.de'

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
  const [sent, setSent] = useState(false)
  const [pendingAktion, setPendingAktion] = useState<'direkt' | 'senden' | null>(null)
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

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    handle('direkt')
  }

  // 2-Knopf-Funnel: 'direkt' → sofort in den /flow-Slot-Picker; 'senden' → FlowLink
  // wird versendet + Dispatcher kontaktiert. Beide gehen über DENSELBEN kanonischen
  // Intake (anfrage-from-lp), nur das `aktion`-Feld unterscheidet.
  function handle(aktion: 'direkt' | 'senden') {
    setError(null)
    if (!schadentyp) { setStep(0); return }
    if (vorname.trim().length < 2 || nachname.trim().length < 2) { setError(t('err_name')); return }
    if (!/[\+0-9\s\-()]{8,}/.test(telefon)) { setError(t('err_telefon')); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError(t('err_email')); return }
    if (ort.trim().length < 3) { setError(t('err_ort')); return }
    if (!dsgvo) { setError(t('err_dsgvo')); return }

    setPendingAktion(aktion)
    startTransition(async () => {
      // 1. Besichtigungsort geocoden (Mapbox-Token ist server-only).
      const prep = await bereiteLiveBuchungVor({ ort: ort.trim() })
      if (!prep.ok) { setError(prep.error || t('err_submit')); return }

      // 2. Kanonischer Intake (cross-origin POST, Origin-Auth). Legt gfa → Lead →
      // flow_link an und entscheidet per `aktion`. besichtigungsort_lat/lng nur senden
      // wenn geocodet (Zod .optional() akzeptiert kein null).
      try {
        const res = await fetch(`${PORTAL_URL}/api/anfrage-from-lp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'kfz_gutachter_lp',
            aktion,
            name: `${vorname.trim()} ${nachname.trim()}`,
            telefon: telefon.trim(),
            email: email.trim(),
            schadentyp,
            besichtigungsort_adresse: prep.adresse,
            ...(prep.lat != null && prep.lng != null
              ? { besichtigungsort_lat: prep.lat, besichtigungsort_lng: prep.lng }
              : {}),
            ...(svId ? { zugeordneter_sv_id: svId } : {}),
            page_url: typeof window !== 'undefined' ? window.location.href : undefined,
            consent_ts: new Date().toISOString(),
          }),
        })
        const data = (await res.json().catch(() => null)) as { ok?: boolean; modus?: string; token?: string } | null
        if (!res.ok || !data?.ok) { setError(t('err_submit')); return }

        // 3. GA4-Conversion (server-seitig, consent-aware) — nur bei real angelegtem
        // Lead; non-blocking (eine GA-Panne darf den Funnel nicht stoppen).
        await trackLiveBuchungLead().catch(() => {})

        // 4. 'direkt' → Token-Redirect in den Slot-Picker; 'senden'/'callback' (Versand
        // fehlgeschlagen) → Bestätigung, Dispatcher meldet sich (kann FlowLink re-senden).
        if (data.modus === 'direkt' && data.token) {
          setRedirecting(true)
          window.location.href = `${PORTAL_URL}/flow/${data.token}`
          return
        }
        setSent(true)
      } catch {
        setError(t('err_submit'))
        return
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

  // ── Bestätigung nach "Anfrage senden" (FlowLink versendet) bzw. Callback-Fallback ──
  if (sent) {
    return (
      <div role="status" aria-live="polite" className="rounded-ios-md border border-claimondo-border bg-white p-6 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-claimondo-ondo" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-claimondo-navy">{t('gesendet_title')}</p>
        <p className="mt-1 text-xs text-claimondo-shield">{t('gesendet_sub')}</p>
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
        <form onSubmit={onFormSubmit} noValidate data-tracking="gutachter-finder-livebuchung-wizard">
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

          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setStep(0)} disabled={pending} className="inline-flex items-center gap-1 rounded-full border border-claimondo-border bg-white px-4 py-3 text-sm font-semibold text-claimondo-navy hover:border-claimondo-ondo disabled:opacity-70">
                <ChevronLeft className="h-4 w-4" aria-hidden /> {t('back')}
              </button>
              <button type="submit" disabled={pending} aria-busy={pending && pendingAktion === 'direkt'} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-base font-bold text-white shadow-claimondo-md transition hover:bg-claimondo-shield active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70">
                <CalendarCheck className="h-4 w-4" aria-hidden />
                {pending && pendingAktion === 'direkt' ? t('cta_pending') : t('cta')}
              </button>
            </div>
            <button type="button" onClick={() => handle('senden')} disabled={pending} aria-busy={pending && pendingAktion === 'senden'} className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-claimondo-border bg-white px-4 py-2.5 text-sm font-semibold text-claimondo-shield transition hover:border-claimondo-ondo hover:text-claimondo-navy disabled:cursor-not-allowed disabled:opacity-70">
              {pending && pendingAktion === 'senden' ? t('cta_pending') : t('cta_senden')}
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
