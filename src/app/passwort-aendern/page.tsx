'use client'

import { useState, useEffect, useRef } from 'react'
import { KeyIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoadingButton } from '@/components/ui/loading-button'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { setzeNeuesPasswort } from './actions'

export default function PasswortAendernPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Recovery-Tokens einer nur in-memory gehaltenen Client-Session. Ein Recovery-/Welcome-
  // Magic-Link (admin.generateLink type=recovery) etabliert die Session als IMPLICIT-Hash
  // (#access_token) OHNE Cookie; der @supabase/ssr-Client (PKCE-Modus) verarbeitet den Hash
  // NICHT automatisch. Ohne das folgende landet ein solcher Link hier in einer Sackgasse
  // ("Nicht angemeldet"), das Passwort wird nie gesetzt (prod-Incident 21.07. Werkstatt-
  // Onboarding). Wir parsen den Hash daher manuell und reichen die Tokens an die Server-Action
  // durch. Der normale Einmalpasswort-Login (Cookie) hat KEINEN Hash -> No-op. Gleiches Muster
  // wie /passwort-zuruecksetzen.
  const recoveryTokensRef = useRef<{ access_token: string; refresh_token: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function bootstrapSession() {
      const supabase = createClient()
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const params = new URLSearchParams(window.location.hash.slice(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
          // Token aus der URL entfernen — nicht im Verlauf/Referrer hinterlassen.
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }
      // Tokens der aktuellen Session festhalten (Belt-and-Suspenders): die Server-Action nutzt
      // sie als Fallback, falls das per setSession geschriebene Cookie noch nicht server-lesbar
      // ist. Fehlt eine Session (regulaerer Cookie-Login-Race), bleibt der Ref null und die
      // Action liest deterministisch das Cookie serverseitig.
      const { data: sessionData } = await supabase.auth.getSession()
      if (cancelled) return
      if (sessionData?.session) {
        recoveryTokensRef.current = {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        }
      }
    }
    bootstrapSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Client-Vorpruefung nur als UX-Hint; autoritativ ist die Server-Policy
    // pruefePasswortStaerke (>= 12 + HIBP-Breach). Zahl bewusst hart kodiert:
    // password-policy.ts zieht node:crypto rein und ist nicht client-importierbar.
    if (password.length < 12) {
      setError('Passwort muss mindestens 12 Zeichen lang sein')
      return
    }
    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    setLoading(true)
    // Server-Action: updateUser + force_password_change serverseitig. Der
    // frueher genutzte Browser-Client warf hier "Auth session missing"
    // (Cookie-Propagation-Race nach dem Login-Redirect).
    const result = await setzeNeuesPasswort(password, recoveryTokensRef.current ?? undefined)
    if (result.ok) {
      // Hard-Navigation vermeidet die RSC-Soft-Nav-Race mit den frisch
      // rotierten Auth-Cookies (CMM-14). Spinner bleibt bis zum Seitenwechsel.
      window.location.href = result.redirectTo
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-claimondo-bg px-5 relative overflow-hidden">
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
          <span className="text-3xl font-bold tracking-tight"><span className="text-claimondo-navy">Claim</span><span className="text-claimondo-ondo">ondo</span></span>
          <p className="mt-1 text-sm text-claimondo-ondo">Bitte ändern Sie Ihr Passwort</p>
        </div>

        <div className="bg-white rounded-ios-lg p-8 shadow-sheet">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-ios-md bg-warning-soft flex items-center justify-center">
              <KeyIcon className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-claimondo-navy font-medium text-sm">Neues Passwort setzen</p>
              <p className="text-claimondo-ondo text-xs">Ihr Einmalpasswort muss geändert werden</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-claimondo-navy">
                Neues Passwort
              </label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 12 Zeichen"
                required
                minLength={12}
                autoComplete="new-password"
                className="w-full px-4 py-3.5 rounded-ios-md border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-claimondo-navy placeholder:text-claimondo-ondo/60 text-base tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-claimondo-navy">
                Passwort bestätigen
              </label>
              <PasswordInput
                id="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Passwort wiederholen"
                required
                minLength={12}
                autoComplete="new-password"
                className="w-full px-4 py-3.5 rounded-ios-md border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-claimondo-navy placeholder:text-claimondo-ondo/60 text-base tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo"
              />
            </div>

            {error && (
              <p className="text-sm text-danger-strong rounded-ios-md bg-danger-soft border border-danger/30 px-4 py-3 text-center">
                {error}
              </p>
            )}

            <LoadingButton
              type="submit"
              isLoading={loading}
              loadingText="Wird gespeichert..."
              className="w-full py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white disabled:opacity-40 font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] hover:shadow-cta-ondo-hover active:translate-y-0 active:scale-[0.98] transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)] mt-1"
            >
              Passwort ändern
            </LoadingButton>
          </form>
        </div>
      </div>
    </div>
  )
}
