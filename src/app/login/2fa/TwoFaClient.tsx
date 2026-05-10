'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheckIcon, SmartphoneIcon, MailIcon, RefreshCwIcon } from 'lucide-react'
import { requestTwoFaCode } from '@/lib/auth/twofa/send-code'
import { verifyTwoFaCode } from '@/lib/auth/twofa/verify-code'
import PageHeader from '@/components/shared/PageHeader'
import { requestEmailOtp, verifyEmailOtp } from '@/lib/auth/twofa/send-email-code'
import { createRememberToken } from '@/lib/auth/twofa/remember-me'

// KFZ-184 + AAR-494: 2FA Code-Eingabe mit Remember-Me, Methoden-Wahl SMS/Email.

type Method = 'sms' | 'email'

type Props = {
  maskedPhone: string | null
  maskedEmail: string | null
  smsVerfuegbar: boolean
  emailVerfuegbar: boolean
  initialMethod: Method
  // AAR-718: Ziel-Pfad nach erfolgreicher 2FA (roleToPath der eigenen Rolle),
  // damit der User direkt im eigenen Portal landet statt auf der Landing-Page.
  targetPath: string
}

export default function TwoFaClient({
  maskedPhone,
  maskedEmail,
  smsVerfuegbar,
  emailVerfuegbar,
  initialMethod,
  targetPath,
}: Props) {
  const router = useRouter()
  const [method, setMethod] = useState<Method>(initialMethod)
  const [code, setCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [codeSent, setCodeSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const beideMethoden = smsVerfuegbar && emailVerfuegbar

  // Auto-send code on mount oder Methoden-Wechsel
  useEffect(() => {
    setCodeSent(false)
    setError(null)
    setCode('')
  }, [method])

  // AAR-2fa-fix: Auto-Send mit Single-Attempt-Guard. Vorher konnte der
  // useEffect bei React-Re-Renders unter bestimmten StrictMode-Bedingungen
  // mehrfach feuern — ein attempted-Ref verhindert das jetzt deterministisch.
  // Plus Method-Fallback: wenn SMS fehlschlägt + Email verfügbar → wechsle
  // automatisch zu Email statt den User in einer Endlos-Fehlermeldung
  // sitzen zu lassen.
  const attemptedRef = useRef<Set<Method>>(new Set())
  useEffect(() => {
    if (codeSent) return
    if (attemptedRef.current.has(method)) return
    attemptedRef.current.add(method)
    const request = method === 'sms' ? requestTwoFaCode : requestEmailOtp
    request()
      .then((r) => {
        if (r.success) {
          setCodeSent(true)
          setResendCooldown(60)
        } else {
          // Wenn SMS scheitert + Email verfügbar → automatischer Fallback
          if (method === 'sms' && emailVerfuegbar) {
            setError(null)
            setMethod('email')
          } else {
            setError(r.error ?? 'Code konnte nicht gesendet werden')
          }
        }
      })
      .catch((err) => {
        if (method === 'sms' && emailVerfuegbar) {
          setError(null)
          setMethod('email')
        } else {
          setError(err instanceof Error ? err.message : 'Code konnte nicht gesendet werden')
        }
      })
  }, [codeSent, method, emailVerfuegbar])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  function handleResend() {
    if (resendCooldown > 0) return
    setError(null)
    // Auch beim manuellen Resend den attempted-Marker zurücksetzen damit
    // ein expliziter Retry möglich ist (User-Input darf den Auto-Send-
    // Guard übersteuern).
    attemptedRef.current.delete(method)
    const request = method === 'sms' ? requestTwoFaCode : requestEmailOtp
    request().then(r => {
      if (r.success) setResendCooldown(60)
      else setError(r.error ?? 'Erneut senden fehlgeschlagen')
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Erneut senden fehlgeschlagen')
    })
  }

  function handleSubmit() {
    if (code.length !== 6) { setError('Bitte 6-stelligen Code eingeben'); return }
    setError(null)
    const verify = method === 'sms' ? verifyTwoFaCode : verifyEmailOtp
    startTransition(async () => {
      const result = await verify(code)
      if (result.success) {
        if (rememberMe) {
          await createRememberToken(
            '',
            typeof navigator !== 'undefined' ? navigator.userAgent : null,
            null,
          )
        }
        // AAR-718: direkt ins Rollen-Portal statt auf die Landing-Page
        router.push(targetPath)
        router.refresh()
      } else {
        setError(result.error ?? 'Ungültiger Code')
        setCode('')
        inputRef.current?.focus()
      }
    })
  }

  const versandZiel =
    method === 'sms' ? maskedPhone : maskedEmail
  const versandLabel =
    method === 'sms' ? 'SMS-Code' : 'E-Mail-Code'

  return (
    <div className="min-h-screen flex items-center justify-center bg-claimondo-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <PageHeader
            title="Zwei-Faktor-Authentifizierung"
            description={
              versandZiel
                ? (<>Wir haben einen {versandLabel} an <strong>{versandZiel}</strong> gesendet.</>)
                : `${versandLabel} wird gesendet...`
            }
            size="lg"
            align="center"
            leadingSlot={
              <div className="w-16 h-16 bg-claimondo-navy rounded-2xl flex items-center justify-center">
                <ShieldCheckIcon className="w-8 h-8 text-white" />
              </div>
            }
          />
        </div>

        {beideMethoden && (
          <div className="mb-4 flex rounded-xl bg-white border border-claimondo-border p-1">
            <button
              type="button"
              onClick={() => setMethod('sms')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                method === 'sms'
                  ? 'bg-[#0D1B3E] text-white'
                  : 'text-claimondo-ondo hover:text-[#0D1B3E]'
              }`}
            >
              <SmartphoneIcon className="w-3.5 h-3.5" />
              SMS
            </button>
            <button
              type="button"
              onClick={() => setMethod('email')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                method === 'email'
                  ? 'bg-[#0D1B3E] text-white'
                  : 'text-claimondo-ondo hover:text-[#0D1B3E]'
              }`}
            >
              <MailIcon className="w-3.5 h-3.5" />
              E-Mail
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-claimondo-border p-6">
          <div className="mb-4">
            <label className="text-xs text-claimondo-ondo mb-1.5 block">6-stelliger Code</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              className="w-full text-center text-2xl font-mono tracking-[0.5em] bg-[#f8f9fb] border border-claimondo-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#4573A2] focus:border-transparent"
              placeholder="000000"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              className="rounded border-claimondo-border text-[#4573A2] focus:ring-[#4573A2]"
            />
            <span className="text-sm text-claimondo-navy">Angemeldet bleiben (30 Tage)</span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-700 text-xs mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={pending || code.length !== 6}
            className="w-full py-3 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {pending ? 'Wird geprüft...' : 'Bestätigen'}
          </button>

          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="w-full mt-3 py-2 text-xs text-claimondo-ondo hover:text-[#4573A2] transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
          >
            <RefreshCwIcon className="w-3 h-3" />
            {resendCooldown > 0 ? `Code erneut senden (${resendCooldown}s)` : 'Code erneut senden'}
          </button>
        </div>

        <p className="text-[10px] text-claimondo-ondo/70 text-center mt-4">
          {method === 'sms' ? (
            <>
              <SmartphoneIcon className="w-3 h-3 inline mr-1" />
              Kein Code erhalten? Prüfe, ob die Telefonnummer in deinem Profil korrekt ist.
            </>
          ) : (
            <>
              <MailIcon className="w-3 h-3 inline mr-1" />
              Kein Code erhalten? Prüfe auch deinen Spam-Ordner.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
