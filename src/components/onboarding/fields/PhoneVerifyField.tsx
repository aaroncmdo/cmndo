'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import type { OnboardingFeld } from '../types'

export function PhoneVerifyField({ feld, value, onChange, disabled }: {
  feld: OnboardingFeld; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  const [telefon, setTelefon] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<'eingabe' | 'code' | 'fertig'>(value ? 'fertig' : 'eingabe')
  const [fehler, setFehler] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function senden() {
    setFehler(null)
    if (telefon.trim().length < 5) { setFehler('Bitte eine gültige Telefonnummer eingeben.'); return }
    startTransition(async () => {
      const { requestPhoneVerification } = await import('@/lib/auth/twofa/send-code')
      const res = await requestPhoneVerification(telefon.trim())
      if (!res.success) { setFehler(res.error ?? 'Code konnte nicht gesendet werden.'); return }
      setPhase('code')
    })
  }
  function bestaetigen() {
    setFehler(null)
    if (code.trim().length < 4) { setFehler('Bitte den 6-stelligen Code eingeben.'); return }
    startTransition(async () => {
      const { confirmPhoneVerification } = await import('@/lib/auth/twofa/verify-code')
      const res = await confirmPhoneVerification(telefon.trim(), code.trim())
      if (!res.success) { setFehler(res.error ?? 'Code ungültig.'); return }
      try {
        const { checkAndCacheAvailability } = await import('@/lib/whatsapp/availability')
        const { createClient } = await import('@/lib/supabase/client')
        const u = (await createClient().auth.getUser()).data.user
        if (u) void checkAndCacheAvailability('profile', u.id, telefon.trim())
      } catch { /* non-critical */ }
      setPhase('fertig')
      onChange(new Date().toISOString())
    })
  }

  if (phase === 'fertig') return <p className="text-sm font-semibold text-emerald-700">✓ Telefonnummer bestätigt.</p>
  return (
    <div className="flex flex-col gap-3">
      {phase === 'eingabe' && (<>
        <TextField label={feld.label} type="tel" placeholder={feld.placeholder ?? '+49 151 12345678'}
          value={telefon} onChange={(e) => setTelefon(e.target.value)} hint={feld.hint ?? undefined} disabled={disabled} />
        <Button variant="navy" onClick={senden} loading={pending}>Code senden</Button>
      </>)}
      {phase === 'code' && (<>
        <TextField label="Bestätigungscode" type="text" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button variant="navy" onClick={bestaetigen} loading={pending}>Bestätigen</Button>
      </>)}
      {fehler && <p className="text-sm text-red-700">{fehler}</p>}
    </div>
  )
}
