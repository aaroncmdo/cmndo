'use client'

// E4 Login-Embed — eingebettetes Login direkt auf claimondo.de (einheitliche Tuer,
// Spec 2026-05-31 §13.6). Statt nur auf app.claimondo.de/login zu verlinken
// (LoginCtaLink) loggt der User HIER ein: Supabase signInWithPassword setzt die
// Session ins geteilte .claimondo.de-Cookie (client.ts: domain in prod), danach
// Redirect via roleToPath ins Rollen-Portal auf app.claimondo.de. 2FA / Guards /
// force_password_change uebernimmt die Middleware von app.claimondo.de nach dem
// Redirect. Lokal (localhost) traegt das Cookie NICHT cross-subdomain -> Erfolgs-
// Strecke nur in Prod smokebar; Form-Render + Fehlerpfad laufen ueberall.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { roleToPath } from '@/lib/auth/role-redirect'

const APP_BASE = 'https://app.claimondo.de'

export function LoginEmbed({ triggerClassName }: { triggerClassName?: string }) {
  const t = useTranslations('home')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Klick-ausserhalb + Escape schliessen das Panel
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const supabase = createClient()
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signErr || !data.user) {
        setError(t('login.error_invalid'))
        setPending(false)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('rolle')
        .eq('id', data.user.id)
        .single()
      const portalPath = roleToPath((profile?.rolle as string | null | undefined) ?? null)
      // Session liegt im geteilten .claimondo.de-Cookie -> app.claimondo.de sieht sie.
      window.location.href = `${APP_BASE}${portalPath}`
    } catch {
      setError(t('login.error_generic'))
      setPending(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName}
      >
        {t('login.trigger')}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('login.heading')}
          className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-ios-lg border border-claimondo-border bg-white/95 p-5 shadow-[0_12px_40px_rgba(13,27,62,0.18)] backdrop-blur-xl"
        >
          <h2 className="text-base font-bold text-claimondo-navy">{t('login.heading')}</h2>
          <p className="mt-0.5 text-xs text-claimondo-shield/80">{t('login.sub')}</p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
            <div>
              <label htmlFor="login-embed-email" className="mb-1 block text-xs font-semibold text-claimondo-shield">
                {t('login.email_label')}
              </label>
              <input
                id="login-embed-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
                placeholder={t('login.email_placeholder')}
                className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2.5 text-sm transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:opacity-70"
              />
            </div>
            <div>
              <label htmlFor="login-embed-password" className="mb-1 block text-xs font-semibold text-claimondo-shield">
                {t('login.password_label')}
              </label>
              <input
                id="login-embed-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
                className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2.5 text-sm transition-all focus:border-claimondo-ondo focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/20 disabled:opacity-70"
              />
            </div>

            {error ? (
              <p role="alert" className="text-xs font-semibold text-red-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy px-5 py-2.5 text-sm font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t('login.submit_pending')}
                </>
              ) : (
                t('login.submit')
              )}
            </button>
          </form>

          <a
            href={`${APP_BASE}/login`}
            className="mt-3 block text-center text-xs font-medium text-claimondo-ondo transition-colors hover:text-claimondo-navy hover:underline"
          >
            {t('login.forgot')}
          </a>
        </div>
      ) : null}
    </div>
  )
}
