'use client'

import { useState } from 'react'
import { Button } from '@/components/primitives'
import { VersichererSelect } from '@/components/shared/VersichererSelect'

type Option = { id: string; name: string }

// Makler-Gesellschaft-Auswahl: erst der Typ (frei / versicherungsgebunden), dann die passende
// Gesellschaft. Nutzt den generischen VersichererSelect fuer beide Listen. Genutzt in
// Admin-Anlage + Self-Registrierung. Der Typ wird aus dem gesetzten FK abgeleitet.
export function GesellschaftSelect({
  versicherungen,
  maklerpools,
  versicherungId,
  maklerpoolId,
  onChange,
}: {
  versicherungen: Option[]
  maklerpools: Option[]
  versicherungId: string | null
  maklerpoolId: string | null
  onChange: (v: { versicherungId: string | null; maklerpoolId: string | null }) => void
}) {
  const [typ, setTyp] = useState<'frei' | 'versicherungsgebunden'>(
    versicherungId ? 'versicherungsgebunden' : 'frei',
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={typ === 'frei' ? 'navy' : 'ghost'}
          size="sm"
          onClick={() => {
            setTyp('frei')
            onChange({ versicherungId: null, maklerpoolId })
          }}
        >
          Freier Makler (Pool)
        </Button>
        <Button
          variant={typ === 'versicherungsgebunden' ? 'navy' : 'ghost'}
          size="sm"
          onClick={() => {
            setTyp('versicherungsgebunden')
            onChange({ versicherungId, maklerpoolId: null })
          }}
        >
          Versicherungsgebunden
        </Button>
      </div>
      {typ === 'versicherungsgebunden' ? (
        <VersichererSelect
          value={versicherungId}
          onChange={(id) => onChange({ versicherungId: id, maklerpoolId: null })}
          versicherer={versicherungen}
          placeholder="Versicherung wählen …"
          ariaLabel="Versicherung"
        />
      ) : (
        <VersichererSelect
          value={maklerpoolId}
          onChange={(id) => onChange({ versicherungId: null, maklerpoolId: id })}
          versicherer={maklerpools}
          placeholder="Maklerpool wählen …"
          ariaLabel="Maklerpool"
        />
      )}
    </div>
  )
}
