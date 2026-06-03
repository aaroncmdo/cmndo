'use client'

// AAR-703: Edit-Form für Telefon + zweit_email auf /kunde/profil.
// Login-Email bleibt read-only.

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateKundeProfil } from './actions'

type Props = {
  initialTelefon: string | null
  initialZweitEmail: string | null
}

export default function KundeProfilForm({ initialTelefon, initialZweitEmail }: Props) {
  const t = useTranslations('kunde.settings')
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
        toast.success(t('profilForm.toastSaved'))
      } else {
        toast.error(r.error ?? t('profilForm.toastSaveError'))
      }
    })
  }

  return (
    <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-semibold text-claimondo-navy">{t('profilForm.heading')}</h2>

      <div>
        <label className="block text-xs text-claimondo-ondo mb-1.5">{t('profilForm.telefonLabel')}</label>
        <input
          type="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          placeholder={t('profilForm.telefonPlaceholder')}
          className="w-full px-3 py-2.5 border border-claimondo-border rounded-ios-xl text-sm focus:outline-none focus:border-claimondo-ondo"
        />
      </div>

      <div>
        <label className="block text-xs text-claimondo-ondo mb-1.5">
          {t('profilForm.zweitEmailLabel')}
        </label>
        <input
          type="email"
          value={zweitEmail}
          onChange={(e) => setZweitEmail(e.target.value)}
          placeholder={t('profilForm.zweitEmailPlaceholder')}
          className="w-full px-3 py-2.5 border border-claimondo-border rounded-ios-xl text-sm focus:outline-none focus:border-claimondo-ondo"
        />
        <p className="text-[10px] text-claimondo-ondo/70 mt-1">
          {t('profilForm.zweitEmailHint')}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-2 rounded-ios-xl bg-claimondo-ondo hover:bg-claimondo-navy text-white text-sm font-medium disabled:opacity-50"
        >
          {pending ? t('profilForm.saving') : t('profilForm.save')}
        </button>
      </div>
    </div>
  )
}
