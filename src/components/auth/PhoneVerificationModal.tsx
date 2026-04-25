'use client'

// KFZ-184 Phase B: Phone Verification Modal (Onboarding + Profil).
// AAR-781: Migriert auf Modal-Primitive.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SmartphoneIcon, XIcon, CheckCircleIcon } from 'lucide-react'
import { requestPhoneVerification } from '@/lib/auth/twofa/send-code'
import { confirmPhoneVerification } from '@/lib/auth/twofa/verify-code'
import { Modal } from '@/components/primitives'

export default function PhoneVerificationModal({
  onClose,
  onVerified,
}: {
  onClose: () => void
  onVerified?: () => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [telefon, setTelefon] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleSendCode() {
    if (!telefon.trim()) { setError('Telefonnummer eingeben'); return }
    setError(null)
    startTransition(async () => {
      const r = await requestPhoneVerification(telefon)
      if (r.success) setStep('code')
      else setError(r.error ?? 'Fehler beim Senden')
    })
  }

  function handleVerify() {
    if (code.length !== 6) { setError('6-stelligen Code eingeben'); return }
    setError(null)
    startTransition(async () => {
      const r = await confirmPhoneVerification(telefon, code)
      if (r.success) {
        setDone(true)
        onVerified?.()
        router.refresh()
        setTimeout(onClose, 1500)
      } else {
        setError(r.error ?? 'Ungültiger Code')
      }
    })
  }

  return (
    <Modal open onClose={onClose} maxWidth={400} noPadding hideCloseButton ariaLabel="Telefon verifizieren">
      <div>
        <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
            <SmartphoneIcon className="w-4 h-4 text-[#4573A2]" /> Telefon verifizieren
          </h3>
          <button onClick={onClose} className="text-claimondo-ondo/70 hover:text-claimondo-ondo p-1">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {done ? (
            <div className="text-center py-4">
              <CheckCircleIcon className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-emerald-700 font-medium">Telefon verifiziert!</p>
            </div>
          ) : step === 'phone' ? (
            <div className="space-y-3">
              <p className="text-xs text-claimondo-ondo">Ihre Telefonnummer wird für die Zwei-Faktor-Authentifizierung verwendet.</p>
              <input
                type="tel" value={telefon} onChange={e => setTelefon(e.target.value)}
                placeholder="+49 163 1234567"
                className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={handleSendCode} disabled={pending}
                className="w-full py-2.5 rounded-xl bg-[#1E3A5F] text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Wird gesendet...' : 'Code senden'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-claimondo-ondo">SMS-Code an {telefon} gesendet.</p>
              <input
                type="text" inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" autoFocus
                className="w-full text-center text-xl font-mono tracking-[0.4em] bg-[#f8f9fb] border border-claimondo-border rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={handleVerify} disabled={pending || code.length !== 6}
                className="w-full py-2.5 rounded-xl bg-[#1E3A5F] text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Wird geprüft...' : 'Verifizieren'}
              </button>
              <button onClick={() => { setStep('phone'); setCode(''); setError(null) }}
                className="w-full text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo">
                Andere Nummer verwenden
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
