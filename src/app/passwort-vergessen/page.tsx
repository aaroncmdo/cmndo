'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MailIcon, ArrowLeftIcon, CheckCircle2Icon } from 'lucide-react'
import { LoadingButton } from '@/components/ui/loading-button'
import { requestPasswordReset } from '@/lib/actions/auth/reset-password'

export default function PasswortVergessenPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await requestPasswordReset(email)
    } finally {
      // Auch bei (theoretischen) Fehlern setzen wir submitted=true,
      // weil die Server Action selbst keine Information leaken darf.
      setSubmitted(true)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-[#f2f3f7]">
      {/* Ambient-Gradient Spotlights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.2), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.12), transparent 70%)',
          ].join(', '),
        }}
      />
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-claimondo-navy">Claim</span>
            <span className="text-claimondo-ondo">ondo</span>
          </h1>
          <p className="mt-2 text-sm text-claimondo-ondo">Passwort zurücksetzen</p>
        </div>

        <div className="bg-white border border-claimondo-border rounded-3xl p-8 shadow-lg">
          {!submitted ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-claimondo-ondo/10 flex items-center justify-center">
                  <MailIcon className="w-5 h-5 text-claimondo-ondo" />
                </div>
                <div>
                  <p className="text-claimondo-navy font-medium text-sm">Reset-Link anfordern</p>
                  <p className="text-claimondo-ondo text-xs">Wir senden dir einen Link per E-Mail</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-claimondo-navy">
                    E-Mail
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@beispiel.de"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl border border-claimondo-border bg-claimondo-bg text-claimondo-navy placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
                  />
                </div>

                <LoadingButton
                  type="submit"
                  isLoading={loading}
                  loadingText="Wird gesendet..."
                  disabled={!email.trim()}
                  className="w-full py-3.5 rounded-full bg-claimondo-shield hover:bg-claimondo-ondo text-white disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm active:scale-[0.98] transition-all mt-1"
                >
                  Reset-Link senden
                </LoadingButton>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2Icon className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="text-claimondo-navy font-semibold text-base mb-2">E-Mail ist unterwegs</p>
              <p className="text-claimondo-ondo text-sm leading-relaxed">
                Falls ein Account mit dieser E-Mail existiert, wurde ein Link
                zum Zurücksetzen versendet.
              </p>
              <p className="text-claimondo-ondo/70 text-xs mt-3">
                Prüfe auch deinen Spam-Ordner.
              </p>
            </div>
          )}

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-1.5 text-xs text-claimondo-ondo hover:text-claimondo-shield transition-colors"
          >
            <ArrowLeftIcon className="w-3 h-3" />
            Zurück zum Login
          </Link>
        </div>

        <p className="text-center text-claimondo-ondo text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
      </div>
    </div>
  )
}
