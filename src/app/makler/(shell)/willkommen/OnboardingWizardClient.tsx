'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/primitives'
import { ShareTools } from '@/components/makler/ShareTools'
import { markiereOnboardingAbgeschlossen } from './actions'

// Makler-Aktivierungs-Onboarding: 4-Schritt-Wizard beim Erst-Login. Formelles "Sie" (B2B),
// Kundennutzen-Framing (kein Provisions-Claim). Complete UND Skip setzen das Flag.
const SCHRITTE = ['Willkommen', 'Teilen', 'Kanäle', 'Loslegen']

export function OnboardingWizardClient({
  firma,
  vorname,
  code,
}: {
  firma: string
  vorname: string
  code: string | null
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  const url = code ? `${base}/m/${code}` : null
  const last = SCHRITTE.length - 1

  function finish() {
    startTransition(async () => {
      await markiereOnboardingAbgeschlossen()
      router.push('/makler')
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Fortschritt */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {SCHRITTE.map((label, i) => (
          <span
            key={label}
            aria-label={label}
            className={`h-2 rounded-ios-sm transition-all ${
              i === step
                ? 'w-8 bg-claimondo-navy'
                : i < step
                  ? 'w-2 bg-claimondo-ondo'
                  : 'w-2 bg-claimondo-border'
            }`}
          />
        ))}
      </div>

      <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 sm:p-8">
        {step === 0 ? (
          <StepWillkommen firma={firma} vorname={vorname} url={url} />
        ) : step === 1 ? (
          <StepTeilen code={code} firma={firma} />
        ) : step === 2 ? (
          <StepKanaele code={code} firma={firma} />
        ) : (
          <StepLoslegen />
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            iconLeft={<ArrowLeft className="h-4 w-4" />}
          >
            Zurück
          </Button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="text-sm text-claimondo-ondo underline hover:text-claimondo-navy"
          >
            Überspringen
          </button>
        )}
        {step < last ? (
          <Button onClick={() => setStep((s) => s + 1)} iconRight={<ArrowRight className="h-4 w-4" />}>
            Weiter
          </Button>
        ) : (
          <Button onClick={finish} loading={pending} iconRight={<Check className="h-4 w-4" />}>
            Fertig — ins Portal
          </Button>
        )}
      </div>
    </div>
  )
}

function StepWillkommen({
  firma,
  vorname,
  url,
}: {
  firma: string
  vorname: string
  url: string | null
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-claimondo-navy">Willkommen, {vorname}!</h1>
      <p className="mt-3 text-sm text-claimondo-shield">
        Schön, dass <strong>{firma}</strong> jetzt Claimondo-Partner ist. In den nächsten
        Schritten zeigen wir Ihnen, wie Sie Ihren Kunden nach einem Kfz-Schaden helfen — das
        dauert keine zwei Minuten.
      </p>
      {url ? (
        <div className="mt-6 rounded-ios-md bg-claimondo-bg p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-claimondo-ondo">
            Ihre persönliche Empfehlungs-Landeseite
          </p>
          <p className="mt-1 break-all text-sm font-semibold text-claimondo-navy">
            {url.replace(/^https?:\/\//, '')}
          </p>
          <p className="mt-2 text-xs text-claimondo-ondo">
            Jeder Kunde, der über diesen Link kommt, ist automatisch Ihnen zugeordnet.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function StepTeilen({ code, firma }: { code: string | null; firma: string }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-claimondo-navy">Der schnellste Start: 1:1 teilen</h2>
      <p className="mt-3 text-sm text-claimondo-shield">
        Haben Sie gerade einen Kunden mit einem Kfz-Schaden? Schicken Sie ihm Ihren Link direkt
        per WhatsApp — er findet darüber einen unabhängigen Gutachter und lässt den Schaden
        kostenlos regulieren.
      </p>
      <div className="mt-6">
        {code ? (
          <ShareTools code={code} firma={firma} variant="quick" />
        ) : (
          <p className="text-sm text-claimondo-ondo">
            Ihr Empfehlungs-Link wird gerade erstellt — Sie finden ihn gleich unter „Promo &amp; QR"
            im Portal.
          </p>
        )}
      </div>
    </div>
  )
}

function StepKanaele({ code, firma }: { code: string | null; firma: string }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-claimondo-navy">Dauerhaft präsent: passive Kanäle</h2>
      <p className="mt-3 text-sm text-claimondo-shield">
        So sind Sie immer sichtbar — ganz ohne Aufwand. Binden Sie Ihren Link in Ihre
        E-Mail-Signatur oder auf Ihrer Website ein.
      </p>
      <div className="mt-6">
        {code ? (
          <ShareTools code={code} firma={firma} variant="passive" />
        ) : (
          <p className="text-sm text-claimondo-ondo">Ihr Empfehlungs-Link wird gerade erstellt.</p>
        )}
      </div>
      <p className="mt-4 text-xs text-claimondo-ondo">
        Einen druckbaren QR-Code fürs Büro finden Sie jederzeit unter „Promo &amp; QR" in Ihrem
        Portal.
      </p>
    </div>
  )
}

function StepLoslegen() {
  const punkte = [
    'Ihre Kunden regulieren unverschuldete Schäden kostenlos (§249 BGB).',
    'Sie stärken die Kundenbindung mit einem echten Service — ohne Mehraufwand.',
    'Alles Weitere übernimmt Claimondo: Gutachter, Kanzlei, Kommunikation.',
  ]
  return (
    <div>
      <h2 className="text-xl font-bold text-claimondo-navy">Alles startklar!</h2>
      <p className="mt-3 text-sm text-claimondo-shield">
        Sobald ein Kunde über Ihren Link kommt, sehen Sie ihn in Ihrem Portal — von der ersten
        Anfrage bis zur Regulierung. Ihre Vermittlungen finden Sie jederzeit unter „Leads" und
        „Akten".
      </p>
      <ul className="mt-5 space-y-2">
        {punkte.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-claimondo-shield">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
