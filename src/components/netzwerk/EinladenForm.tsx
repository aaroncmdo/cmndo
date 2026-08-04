'use client'
// Kalt-Einladung ins Netzwerk: Email + Ziel-Rolle -> sendeNetzwerkEinladung. Bestehende
// Partner nutzen stattdessen „Vernetzen" im Verzeichnis (warme Freund-Anfrage).
// Followup-a (04.08.): Redemption-Wiring liegt jetzt in ALLEN drei Registrier-Flows
// (werkstatt seit P1; sv/registrieren + makler/registrieren nachgezogen) -> die Form
// bietet alle drei Rollen an.
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import { SelectField } from '@/components/shared/forms/SelectField'
import { sendeNetzwerkEinladung } from '@/lib/netzwerk/einladen-actions'

const ROLLEN_OPTIONEN = [
  { value: 'werkstatt', label: 'Werkstatt' },
  { value: 'sachverstaendiger', label: 'Gutachter' },
  { value: 'makler', label: 'Makler' },
] as const

const PLACEHOLDER: Record<string, string> = {
  werkstatt: 'werkstatt@beispiel.de',
  sachverstaendiger: 'gutachter@beispiel.de',
  makler: 'makler@beispiel.de',
}

export function EinladenForm() {
  const [email, setEmail] = useState('')
  const [rolle, setRolle] = useState<string>('werkstatt')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!email.trim()) {
      toast.error('Bitte eine E-Mail-Adresse angeben.')
      return
    }
    startTransition(async () => {
      const res = await sendeNetzwerkEinladung(
        email.trim(),
        rolle as 'werkstatt' | 'sachverstaendiger' | 'makler',
      )
      if (!res.ok) {
        toast.error(res.error ?? 'Einladung konnte nicht gesendet werden.')
      } else {
        toast.success('Einladung verschickt.')
        setEmail('')
      }
    })
  }

  return (
    <SectionCard title="Partner einladen">
      <div className="space-y-3">
        <p className="text-body-sm text-claimondo-shield">
          Noch nicht bei Claimondo? Lade eine Werkstatt, einen Gutachter oder einen Makler per
          E-Mail ein — bei Registrierung seid ihr automatisch vernetzt.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField
            label="Rolle"
            value={rolle}
            onChange={(e) => setRolle(e.target.value)}
            options={ROLLEN_OPTIONEN.map((o) => ({ value: o.value, label: o.label }))}
            className="sm:w-44"
          />
          <TextField
            label="E-Mail-Adresse"
            type="email"
            placeholder={PLACEHOLDER[rolle] ?? 'partner@beispiel.de'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button variant="navy" onClick={submit} loading={pending}>
            Einladen
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}
