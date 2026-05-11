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

      <div className="bg-white rounded-2xl border border-claimondo-border p-6 space-y-5">
        {/* Avatar-Upload */}
        <div className="flex items-center gap-4 pb-4 border-b border-claimondo-border">
          <AvatarUpload currentUrl={avatarUrl} initials={initials} size="lg" />
          <div>
            <p className="text-claimondo-navy font-semibold text-lg">{fullName}</p>
            <p className="text-claimondo-ondo text-sm">{ROLLEN_LABEL[rolle] ?? rolle}</p>
            <p className="text-claimondo-ondo/70 text-xs mt-1">{email}</p>
          </div>
        </div>

        {/* Stammdaten (read-only — Änderungen über Support) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-claimondo-ondo text-xs">Vorname</span>
            <p className="text-claimondo-navy">{vorname || '—'}</p>
          </div>
          <div>
            <span className="text-claimondo-ondo text-xs">Nachname</span>
            <p className="text-claimondo-navy">{nachname || '—'}</p>
          </div>
          <div>
            <span className="text-claimondo-ondo text-xs">Telefon</span>
            <p className="text-claimondo-navy">{telefon ?? '—'}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-claimondo-border space-y-3">
          <p className="text-xs uppercase tracking-wide text-claimondo-ondo/70">Öffentliche Anzeige (Kunden-Ansicht)</p>

          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">Anzeigename</label>
            <input
              type="text"
              value={form.anzeigename}
              onChange={e => setForm({ ...form, anzeigename: e.target.value })}
              placeholder={`z.B. „${vorname} M." — Fallback: ${fullName}`}
              maxLength={80}
              className="w-full bg-claimondo-bg border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
            />
          </div>

          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">Profiltext</label>
            <textarea
              value={form.profilbeschreibung}
              onChange={e => setForm({ ...form, profilbeschreibung: e.target.value })}
              placeholder="z.B. Ihr persönlicher Kundenbetreuer"
              rows={2}
              maxLength={200}
              className="w-full bg-claimondo-bg border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo resize-none"
            />
            <p className="text-[10px] text-claimondo-ondo/70 mt-1">Max. 200 Zeichen. Sichtbar im Kunden-Portal in „Mein Betreuer".</p>
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
