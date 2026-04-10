'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheckIcon, SmartphoneIcon, RefreshCwIcon } from 'lucide-react'
import { requestTwoFaCode } from '@/lib/auth/twofa/send-code'
import { verifyTwoFaCode } from '@/lib/auth/twofa/verify-code'
import { createRememberToken } from '@/lib/auth/twofa/remember-me'

// KFZ-184: 2FA Code-Eingabe mit Remember-Me.

export default function TwoFaClient({ maskedPhone }: { maskedPhone: string | null }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [codeSent, setCodeSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-send code on mount
  useEffect(() => {
    if (!codeSent) {
      requestTwoFaCode().then(r => {
        if (r.success) { setCodeSent(true); setResendCooldown(60) }
        else setError(r.error ?? 'Code konnte nicht gesendet werden')
      })
    }
  }, [codeSent])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  function handleResend() {
    if (resendCooldown > 0) return
    setError(null)
    requestTwoFaCode().then(r => {
      if (r.success) setResendCooldown(60)
      else setError(r.error ?? 'Erneut senden fehlgeschlagen')
    })
  }

  function handleSubmit() {
    if (code.length !== 6) { setError('Bitte 6-stelligen Code eingeben'); return }
    setError(null)
    startTransition(async () => {
      const result = await verifyTwoFaCode(code)
      if (result.success) {
        if (rememberMe) {
          await createRememberToken(
            '', // userId wird serverseitig aus der Session gelesen
            typeof navigator !== 'undefined' ? navigator.userAgent : null,
            null, // IP wird serverseitig ermittelt
          )
        }
        router.push('/')
        router.refresh()
      } else {
        setError(result.error ?? 'Ungültiger Code')
        setCode('')
        inputRef.current?.focus()
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#0D1B3E] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheckIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#0D1B3E]">Zwei-Faktor-Authentifizierung</h1>
          <p className="text-sm text-gray-500 mt-2">
            {maskedPhone
              ? <>Wir haben einen SMS-Code an <strong>{maskedPhone}</strong> gesendet.</>
              : 'SMS-Code wird gesendet...'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1.5 block">6-stelliger Code</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              className="w-full text-center text-2xl font-mono tracking-[0.5em] bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#4573A2] focus:border-transparent"
              placeholder="000000"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              className="rounded border-gray-300 text-[#4573A2] focus:ring-[#4573A2]"
            />
            <span className="text-sm text-gray-700">Angemeldet bleiben (30 Tage)</span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-700 text-xs mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={pending || code.length !== 6}
            className="w-full py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {pending ? 'Wird geprüft...' : 'Bestätigen'}
          </button>

          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-[#4573A2] transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
          >
            <RefreshCwIcon className="w-3 h-3" />
            {resendCooldown > 0 ? `Code erneut senden (${resendCooldown}s)` : 'Code erneut senden'}
          </button>
        </div>

        <p className="text-[10px] text-gray-400 text-center mt-4">
          <SmartphoneIcon className="w-3 h-3 inline mr-1" />
          Kein Code erhalten? Prüfe ob die Telefonnummer in deinem Profil korrekt ist.
        </p>
      </div>
    </div>
  )
}
