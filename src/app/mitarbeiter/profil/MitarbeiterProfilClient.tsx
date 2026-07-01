'use client'

// AAR-369: Client-Komponente für die Mitarbeiter-Profilseite.
// Speichert anzeigename + profilbeschreibung via updateProfilText.
// Avatar wird separat via AvatarUpload-Komponente gehandhabt.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import AvatarUpload from '@/components/shared/AvatarUpload'
import { updateProfilText } from '@/lib/profile/avatar'

const ROLLEN_LABEL: Record<string, string> = {
  kundenbetreuer: 'Kundenbetreuer',
  dispatch: 'Dispatcher (Dispatch)',
  admin: 'Admin',
}

type Props = {
  email: string
  vorname: string
  nachname: string
  telefon: string | null
  rolle: string
  avatarUrl: string | null
  anzeigename: string
  profilbeschreibung: string
}

export default function MitarbeiterProfilClient({
  email, vorname, nachname, telefon, rolle, avatarUrl, anzeigename, profilbeschreibung,
}: Props) {
  const router = useRouter()
  const [form, setForm] = useState({ anzeigename, profilbeschreibung })
  const [isPending, startTransition] = useTransition()

  const fullName = [vorname, nachname].filter(Boolean).join(' ') || email
  const initials = `${(vorname[0] ?? '').toUpperCase()}${(nachname[0] ?? '').toUpperCase()}` || '??'

  function handleSave() {
    startTransition(async () => {
      const result = await updateProfilText(
        form.anzeigename || null,
        form.profilbeschreibung || null,
      )
      if (result.success) {
        toast.success('Profil gespeichert')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Fehler beim Speichern')
      }
    })
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Mein Profil</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">Profilbild + Anzeige-Infos für die Kunden-Ansicht.</p>
      </div>

      <div className="space-y-5 rounded-ios-md border border-claimondo-border bg-white p-6">
        {/* Avatar-Upload */}
        <div className="flex items-center gap-4 pb-4 border-b border-claimondo-border">
          <AvatarUpload currentUrl={avatarUrl} initials={initials} size="lg" />
          <div>
            <p className="text-heading-sm font-semibold text-claimondo-navy">{fullName}</p>
            <p className="text-body-sm text-claimondo-ondo">{ROLLEN_LABEL[rolle] ?? rolle}</p>
            <p className="mt-1 text-body-xs text-claimondo-ondo/70">{email}</p>
          </div>
        </div>

        {/* Stammdaten (read-only — Änderungen über Support) */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <span className="text-body-xs text-claimondo-ondo">Vorname</span>
            <p className="text-body-sm text-claimondo-navy">{vorname || '—'}</p>
          </div>
          <div>
            <span className="text-body-xs text-claimondo-ondo">Nachname</span>
            <p className="text-body-sm text-claimondo-navy">{nachname || '—'}</p>
          </div>
          <div>
            <span className="text-body-xs text-claimondo-ondo">Telefon</span>
            <p className="text-body-sm text-claimondo-navy">{telefon ?? '—'}</p>
          </div>
        </div>

        <div className="space-y-3 border-t border-claimondo-border pt-4">
          <p className="text-caption uppercase text-claimondo-ondo/70">Öffentliche Anzeige (Kunden-Ansicht)</p>

          <div>
            <label className="mb-1 block text-body-xs text-claimondo-ondo">Anzeigename</label>
            <input
              type="text"
              value={form.anzeigename}
              onChange={e => setForm({ ...form, anzeigename: e.target.value })}
              placeholder={`z.B. „${vorname} M." — Fallback: ${fullName}`}
              maxLength={80}
              className="w-full rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
            />
          </div>

          <div>
            <label className="mb-1 block text-body-xs text-claimondo-ondo">Profiltext</label>
            <textarea
              value={form.profilbeschreibung}
              onChange={e => setForm({ ...form, profilbeschreibung: e.target.value })}
              placeholder="z.B. Ihr persönlicher Kundenbetreuer"
              rows={2}
              maxLength={200}
              className="w-full resize-none rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
            />
            <p className="mt-1 text-caption text-claimondo-ondo/70">Max. 200 Zeichen. Sichtbar im Kunden-Portal in „Mein Betreuer".</p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-ios-xl bg-claimondo-navy px-4 py-2 text-body-sm font-medium text-white transition-colors hover:bg-claimondo-ondo disabled:opacity-50"
          >
            {isPending ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
