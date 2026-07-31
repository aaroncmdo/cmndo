'use client'
// Kalt-Einladung einer Werkstatt: Email -> sendeNetzwerkEinladung. Bestehende Partner nutzen
// stattdessen „Vernetzen" im Verzeichnis (warme Freund-Anfrage, keine Kalt-Einladung).
// v1: nur Werkstatt (Redemption-Wiring liegt im Werkstatt-Self-Signup). Gutachter/Makler-Kalt-
// Einladung folgt (Makler = anlegePartnerKern analog; SV-Registrierung ist lead-basiert, separat).
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import { sendeNetzwerkEinladung } from '@/lib/netzwerk/einladen-actions'

export function EinladenForm() {
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!email.trim()) {
      toast.error('Bitte eine E-Mail-Adresse angeben.')
      return
    }
    startTransition(async () => {
      const res = await sendeNetzwerkEinladung(email.trim(), 'werkstatt')
      if (!res.ok) {
        toast.error(res.error ?? 'Einladung konnte nicht gesendet werden.')
      } else {
        toast.success('Einladung verschickt.')
        setEmail('')
      }
    })
  }

  return (
    <SectionCard title="Werkstatt einladen">
      <div className="space-y-3">
        <p className="text-body-sm text-claimondo-shield">
          Noch nicht bei Claimondo? Lade eine Werkstatt per E-Mail ein — bei Registrierung seid ihr
          automatisch vernetzt.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            label="E-Mail-Adresse"
            type="email"
            placeholder="werkstatt@beispiel.de"
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
