'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  PackageIcon,
  FileSignatureIcon,
  CreditCardIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
} from 'lucide-react'
import { signSvVertrag, startStripeCheckout } from '@/lib/actions/sv-onboarding-actions'
import SignaturePadInput from '@/components/SignaturePadInput'
import type { Vorlage } from './OnboardingClient'

// KFZ-148 Lueckenfix: 3-Step Vertrags-Wizard fuer Solo-SVs.
// Pattern aus BueroOnboardingClient.tsx uebernommen.

const STEPS = [
  { key: 'paket', label: 'Paket-Übersicht', icon: PackageIcon },
  { key: 'vertrag', label: 'Vertrag unterzeichnen', icon: FileSignatureIcon },
  { key: 'checkout', label: 'Anzahlung leisten', icon: CreditCardIcon },
] as const

const PAKET_INFO: Record<string, { label: string; faelle: number; km: number; preis: number }> = {
  standard: { label: 'Standard', faelle: 10, km: 15, preis: 1500 },
  pro: { label: 'Pro', faelle: 25, km: 40, preis: 3750 },
  premium: { label: 'Premium', faelle: 50, km: 70, preis: 7500 },
}

type SvInfo = {
  id: string
  paket: string
  onboarding_anzahlung_betrag: number
  onboarding_status: string | null
  vertrag_unterschrieben: boolean
}

export default function SoloVertragWizard({
  sv,
  profile,
  nbVorlage,
  kvVorlage,
}: {
  sv: SvInfo
  profile: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null }
  nbVorlage: Vorlage | null
  kvVorlage: Vorlage | null
}) {
  // Initial-Step basierend auf Onboarding-Status:
  // - Vertrag noch nicht unterzeichnet → Step 0 (Paket-Uebersicht)
  // - Vertrag unterzeichnet, Anzahlung offen → Step 2 (Stripe direkt)
  // - sonst → Step 0
  let initialStep = 0
  if (sv.vertrag_unterschrieben) initialStep = 2
  const [step, setStep] = useState(initialStep)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Vertrag-Form
  const [unterschriftName, setUnterschriftName] = useState(
    [profile.vorname, profile.nachname].filter(Boolean).join(' '),
  )
  const [agbAccepted, setAgbAccepted] = useState(false)
  const [signaturePng, setSignaturePng] = useState<string | null>(null)
  const [scrolled80, setScrolled80] = useState(false)
  const [kvOpen, setKvOpen] = useState(false)
  const nbScrollRef = useRef<HTMLDivElement>(null)

  // 80% Scroll-Lock fuer Nutzungsbedingungen
  useEffect(() => {
    const el = nbScrollRef.current
    if (!el) return
    function handleScroll() {
      if (!el) return
      const total = el.scrollHeight - el.clientHeight
      if (total <= 0) { setScrolled80(true); return }
      const ratio = el.scrollTop / total
      if (ratio >= 0.8) setScrolled80(true)
    }
    el.addEventListener('scroll', handleScroll)
    handleScroll() // Initial check (kurze Vertraege)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [step]) // Re-attach wenn step wechselt

  const paketInfo = PAKET_INFO[sv.paket] ?? PAKET_INFO.standard
  const anzahlung = sv.onboarding_anzahlung_betrag || paketInfo.preis

  async function handleVertragSubmit() {
    setError(null)
    if (!agbAccepted) { setError('Bitte akzeptiere die AGB/NB/DS'); return }
    if (!unterschriftName.trim()) { setError('Bitte gib deinen Namen ein'); return }
    if (!signaturePng) { setError('Bitte unterschreibe im Feld unten'); return }
    if (!scrolled80) { setError('Bitte lies die Nutzungsbedingungen vollständig (80% gescrollt)'); return }

    setSaving(true)
    const result = await signSvVertrag({
      signaturePngDataUri: signaturePng,
      unterschriftName,
    })
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Vertrag fehlgeschlagen'); return }
    setStep(2)
  }

  async function handleCheckout() {
    // KFZ-156: Stripe Checkout laeuft jetzt embedded im Willkommen-Flow.
    // Legacy-Wizard leitet daher zur neuen Page weiter.
    window.location.href = '/gutachter/willkommen?step=stripe'
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fb] flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Onboarding abschließen</h1>
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

          {/* SCHRITT 0: Paket-Uebersicht */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Dein Paket</p>
                    <p className="text-2xl font-bold text-[#1E3A5F] mt-1">{paketInfo.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Anzahlung</p>
                    <p className="text-2xl font-bold text-[#1E3A5F] mt-1">
                      {anzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#1E3A5F]/10">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Fälle / Monat</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{paketInfo.faelle}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Radius</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{paketInfo.km} km</p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-500 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="mb-2">
                  <strong>So funktioniert die Anzahlung:</strong> Du leistest einmalig {anzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })} als Sicherheit gemäß §4 des Kooperationsvertrags. Diese Anzahlung wird mit den ersten Lead-Gebühren verrechnet — du zahlst sie also de facto NICHT zusätzlich, sondern nur früher.
                </p>
                <p>
                  Die genauen Lead-Preise pro Schadenshöhe findest du in der{' '}
                  <Link href="/gutachter/leadpreise" className="text-[#1E3A5F] underline hover:text-[#4573A2]">
                    Lead-Preis-Tabelle
                  </Link>.
                </p>
              </div>
            </div>
          )}

          {/* SCHRITT 1: Vertrag */}
          {step === 1 && (
            <div className="space-y-4">
              {!nbVorlage ? (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  Keine aktive Nutzungsbedingungen-Vorlage hinterlegt. Bitte Admin im Verträge-Editor anlegen.
                </div>
              ) : (
                <>
                  {/* Nutzungsbedingungen mit 80% Scroll-Lock */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-gray-500 uppercase tracking-wide">
                        {nbVorlage.titel} <span className="text-red-400">*</span>
                      </label>
                      <span className={`text-[10px] ${scrolled80 ? 'text-green-600' : 'text-gray-400'}`}>
                        {scrolled80 ? '✓ vollständig gelesen' : 'bitte vollständig scrollen'}
                      </span>
                    </div>
                    <div
                      ref={nbScrollRef}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-64 overflow-y-auto text-xs text-gray-600 leading-relaxed prose prose-sm max-w-none"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: nbVorlage.inhalt_html }}
                    />
                  </div>

                  {/* Kooperationsvertrag-Muster aufklappbar */}
                  {kvVorlage && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setKvOpen(!kvOpen)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900">{kvVorlage.titel}</span>
                        {kvOpen ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
                      </button>
                      {kvOpen && (
                        <div
                          className="px-4 pb-4 text-xs text-gray-600 leading-relaxed max-h-64 overflow-y-auto prose prose-sm max-w-none"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: kvVorlage.inhalt_html }}
                        />
                      )}
                    </div>
                  )}

                  {/* Name */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1.5 block">
                      Dein Name (juristisch verbindlich) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={unterschriftName}
                      onChange={e => setUnterschriftName(e.target.value)}
                      className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
                    />
                  </div>

                  {/* Signature Pad */}
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

                  {/* AGB-Checkbox */}
                  <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={agbAccepted}
                      onChange={e => setAgbAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300"
                    />
                    <span>
                      Ich akzeptiere die <strong>Nutzungsbedingungen</strong>, die <strong>AGB</strong> und die <strong>Datenschutzerklärung</strong>.
                      Mit meiner Unterschrift bestätige ich rechtsverbindlich die Annahme.
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* SCHRITT 2: Stripe Checkout */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2Icon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700">
                  <strong>Vertrag unterzeichnet.</strong> Letzter Schritt: Anzahlung leisten.
                  Du wirst zu Stripe weitergeleitet — bezahle dort sicher per Karte oder SEPA.
                </div>
              </div>

              <div className="bg-[#1E3A5F]/5 border border-[#1E3A5F]/10 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Zu zahlender Betrag</p>
                <p className="text-2xl font-bold text-[#1E3A5F] mt-1">
                  {anzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-gray-500 mt-2">
                  Wird mit den ersten Lead-Gebühren verrechnet. Sobald die Zahlung eingegangen ist, ist dein Portal-Zugang freigeschaltet.
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
            {step > 0 && step !== 2 && (
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
                if (step === 0) setStep(1)
                else if (step === 1) handleVertragSubmit()
                else handleCheckout()
              }}
              disabled={saving || (step === 1 && !nbVorlage)}
              className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40"
            >
              {saving
                ? 'Wird verarbeitet...'
                : step === 0
                ? 'Weiter zu Vertrag'
                : step === 1
                ? 'Vertrag unterzeichnen'
                : `Jetzt ${anzahlung.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })} zahlen`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
