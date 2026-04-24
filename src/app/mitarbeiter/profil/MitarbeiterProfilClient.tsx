'use client'

// AAR-369: Client-Komponente für die Mitarbeiter-Profilseite.
// Speichert anzeigename + profilbeschreibung via updateProfilText.
// Avatar wird separat via AvatarUpload-Komponente gehandhabt.

import { useState, useTransition } from 'react'
import { UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import AvatarUpload from '@/components/shared/AvatarUpload'
import PageHeader from '@/components/shared/PageHeader'
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
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Mein Profil"
        description="Profilbild + Anzeige-Infos für Kunden-Ansicht"
        icon={UserIcon}
      />

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        {/* Avatar-Upload */}
        <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
          <AvatarUpload currentUrl={avatarUrl} initials={initials} size="lg" />
          <div>
            <p className="text-gray-900 font-semibold text-lg">{fullName}</p>
            <p className="text-gray-500 text-sm">{ROLLEN_LABEL[rolle] ?? rolle}</p>
            <p className="text-gray-400 text-xs mt-1">{email}</p>
          </div>
        </div>

        {/* Stammdaten (read-only — Änderungen über Support) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs">Vorname</span>
            <p className="text-gray-900">{vorname || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">Nachname</span>
            <p className="text-gray-900">{nachname || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">Telefon</span>
            <p className="text-gray-900">{telefon ?? '—'}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 space-y-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Öffentliche Anzeige (Kunden-Ansicht)</p>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Anzeigename</label>
            <input
              type="text"
              value={form.anzeigename}
              onChange={e => setForm({ ...form, anzeigename: e.target.value })}
              placeholder={`z.B. „${vorname} M." — Fallback: ${fullName}`}
              maxLength={80}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Profiltext</label>
            <textarea
              value={form.profilbeschreibung}
              onChange={e => setForm({ ...form, profilbeschreibung: e.target.value })}
              placeholder="z.B. Ihr persönlicher Kundenbetreuer"
              rows={2}
              maxLength={200}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4573A2] resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">Max. 200 Zeichen. Sichtbar im Kunden-Portal in „Mein Betreuer".</p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-claimondo-navy hover:bg-claimondo-ondo text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isPending ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
