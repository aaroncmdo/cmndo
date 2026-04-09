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
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-[#f8f9fb]">
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-[#0D1B3E]">Claim</span>
            <span className="text-[#4573A2]">ondo</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">Passwort zurücksetzen</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-lg">
          {!submitted ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#4573A2]/10 flex items-center justify-center">
                  <MailIcon className="w-5 h-5 text-[#4573A2]" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium text-sm">Reset-Link anfordern</p>
                  <p className="text-gray-500 text-xs">Wir senden dir einen Link per E-Mail</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-gray-700">
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
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-900 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
                  />
                </div>

                <LoadingButton
                  type="submit"
                  isLoading={loading}
                  loadingText="Wird gesendet..."
                  disabled={!email.trim()}
                  className="w-full py-3.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm active:scale-[0.98] transition-all mt-1"
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
              <p className="text-gray-900 font-semibold text-base mb-2">E-Mail ist unterwegs</p>
              <p className="text-gray-600 text-sm leading-relaxed">
                Falls ein Account mit dieser E-Mail existiert, wurde ein Link
                zum Zurücksetzen versendet.
              </p>
              <p className="text-gray-400 text-xs mt-3">
                Prüfe auch deinen Spam-Ordner.
              </p>
            </div>
          )}

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-[#1E3A5F] transition-colors"
          >
            <ArrowLeftIcon className="w-3 h-3" />
            Zurück zum Login
          </Link>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
      </div>
    </div>
  )
}
