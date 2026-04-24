'use client'

// AAR-703: Edit-Form für Telefon + zweit_email auf /kunde/profil.
// Login-Email bleibt read-only.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateKundeProfil } from './actions'

type Props = {
  initialTelefon: string | null
  initialZweitEmail: string | null
}

export default function KundeProfilForm({ initialTelefon, initialZweitEmail }: Props) {
  const [telefon, setTelefon] = useState(initialTelefon ?? '')
  const [zweitEmail, setZweitEmail] = useState(initialZweitEmail ?? '')
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await updateKundeProfil({
        telefon,
        zweit_email: zweitEmail,
      })
      if (r.success) {
        toast.success('Gespeichert')
      } else {
        toast.error(r.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[#0D1B3E]">Kontakt-Daten</h2>

      <div>
        <label className="block text-xs text-claimondo-ondo mb-1.5">Telefon</label>
        <input
          type="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          placeholder="+49..."
          className="w-full px-3 py-2.5 border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-[#4573A2]"
        />
      </div>

      <div>
        <label className="block text-xs text-claimondo-ondo mb-1.5">
          Zweite Email (optional)
        </label>
        <input
          type="email"
          value={zweitEmail}
          onChange={(e) => setZweitEmail(e.target.value)}
          placeholder="zweite-mail@beispiel.de"
          className="w-full px-3 py-2.5 border border-claimondo-border rounded-xl text-sm focus:outline-none focus:border-[#4573A2]"
        />
        <p className="text-[10px] text-claimondo-ondo/70 mt-1">
          Zusätzliche Kontakt-Adresse. Login bleibt deine Haupt-Email.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-2 rounded-xl bg-[#4573A2] hover:bg-[#0D1B3E] text-white text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Speichert ...' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
