'use client'

// AAR-344 Pfad A: Self-Service-Komponente zum Ändern der 2FA-Telefonnummer.
// Zwei-Stufen-UI: Nummer eingeben → SMS-Code bestätigen. Funktioniert auf
// admin/gutachter/kunde Profil-Seiten.

import { useState, useTransition } from 'react'
import { ShieldCheckIcon, LoaderIcon, XIcon } from 'lucide-react'
import { initPhoneChange, confirmPhoneChange } from '@/lib/auth/twofa/change-phone'

export function TwoFaPhoneChange({
  aktuelleTwofaTelefon,
  fallbackTelefon,
}: {
  aktuelleTwofaTelefon: string | null
  fallbackTelefon: string | null
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'input' | 'code'>('input')
  const [neuePhone, setNeuePhone] = useState('')
  const [normalized, setNormalized] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const aktuell = aktuelleTwofaTelefon ?? fallbackTelefon
  const usingFallback = !aktuelleTwofaTelefon && !!fallbackTelefon

  function reset() {
    setStep('input')
    setNeuePhone('')
    setNormalized('')
    setCode('')
    setError(null)
    setSuccess(null)
  }

  function sendCode() {
    setError(null)
    startTransition(async () => {
      const r = await initPhoneChange(neuePhone)
      if (!r.success) {
        setError(r.error ?? 'SMS-Versand fehlgeschlagen')
        return
      }
      setNormalized(r.normalized ?? neuePhone)
      setStep('code')
    })
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const r = await confirmPhoneChange(normalized, code)
      if (!r.success) {
        setError(r.error ?? 'Code ungültig')
        return
      }
      setSuccess(`2FA-Nummer geändert auf ${mask(normalized)}`)
      // Modal nach kurzer Zeit schließen + Page refreshen via reload
      setTimeout(() => {
        setOpen(false)
        reset()
        window.location.reload()
      }, 1500)
    })
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheckIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-sm font-semibold text-gray-900">2FA-Telefonnummer</h3>
        </div>
        <p className="text-xs text-gray-600">
          Aktuelle Nummer: <span className="font-mono">{aktuell ? mask(aktuell) : '—'}</span>
          {usingFallback && (
            <span className="text-gray-400"> (Fallback auf Profil-Telefon)</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(true)
          }}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E]"
        >
          Nummer ändern
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h2 className="text-base font-semibold text-gray-900">2FA-Nummer ändern</h2>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1.5 rounded-md hover:bg-gray-100"
                aria-label="Schließen"
              >
                <XIcon className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {step === 'input' && (
                <>
                  <p className="text-xs text-gray-600">
                    Wir senden einen 6-stelligen Code per SMS an die neue Nummer.
                    Erst nach erfolgreicher Bestätigung wird die Nummer
                    übernommen — deine aktuelle Nummer bleibt bis dahin gültig.
                  </p>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                      Neue Telefonnummer
                    </label>
                    <input
                      type="tel"
                      value={neuePhone}
                      onChange={(e) => setNeuePhone(e.target.value)}
                      placeholder="+49 151 12345678 oder 0151 12345678"
                      className="w-full text-sm rounded-md border border-gray-200 px-2 py-2 outline-none focus:border-[#4573A2]"
                    />
                  </div>
                </>
              )}

              {step === 'code' && (
                <>
                  <p className="text-xs text-gray-600">
                    Wir haben einen Code an <span className="font-mono">{mask(normalized)}</span>{' '}
                    gesendet. Bitte eingeben um die Änderung zu bestätigen.
                  </p>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-gray-400 block mb-1">
                      6-stelliger Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full text-lg font-mono tracking-widest rounded-md border border-gray-200 px-2 py-2 outline-none focus:border-[#4573A2] text-center"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('input')
                      setCode('')
                      setError(null)
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    ← andere Nummer eingeben
                  </button>
                </>
              )}

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
                  {success}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Abbrechen
              </button>
              {step === 'input' ? (
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={pending || !neuePhone.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E] disabled:opacity-50"
                >
                  {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
                  Code senden
                </button>
              ) : (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || code.length !== 6}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E] disabled:opacity-50"
                >
                  {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
                  Bestätigen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function mask(phone: string): string {
  if (phone.length < 6) return phone
  return phone.slice(0, 4) + '•••••' + phone.slice(-3)
}
