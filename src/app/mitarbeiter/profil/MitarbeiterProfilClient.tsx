'use client'

// AAR-369: Client-Komponente fuer die Mitarbeiter-Profilseite. NEUKONZEPTION:
// eine ueberladene Karte -> zwei klare Sektionen (Identitaet read-only ·
// Oeffentliche Anzeige editierbar) + Live-Kunden-Vorschau der "Mein
// Betreuer"-Karte + Dirty-State-Button + Zeichenzaehler. Speichert
// anzeigename + profilbeschreibung via updateProfilText; Avatar via AvatarUpload.

import { useState, useTransition } from 'react'
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
  const dirty = form.anzeigename !== anzeigename || form.profilbeschreibung !== profilbeschreibung

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

  const previewName = form.anzeigename.trim() || fullName
  const previewText = form.profilbeschreibung.trim() || 'Ihr persönlicher Kundenbetreuer'

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Mein Profil" description="Ihre Identität und wie Sie im Kunden-Portal erscheinst." size="lg" />

      {/* Sektion 1 — Identitaet (read-only) */}
      <section className="rounded-ios-md border border-claimondo-border bg-white p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <AvatarUpload currentUrl={avatarUrl} initials={initials} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-heading-sm font-semibold text-claimondo-navy">{fullName}</p>
            <p className="text-body-sm text-claimondo-ondo">{ROLLEN_LABEL[rolle] ?? rolle}</p>
            <p className="mt-0.5 truncate text-body-xs text-claimondo-ondo/70">{email}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-claimondo-border pt-4 sm:grid-cols-3">
          <Feld label="Vorname" value={vorname || '—'} />
          <Feld label="Nachname" value={nachname || '—'} />
          <Feld label="Telefon" value={telefon ?? '—'} />
        </div>
        <p className="mt-3 text-caption text-claimondo-ondo/60">Stammdaten werden vom Team gepflegt — Änderungen über den Support.</p>
      </section>

      {/* Sektion 2 — Oeffentliche Anzeige (editierbar) + Live-Vorschau */}
      <section className="rounded-ios-md border border-claimondo-border bg-white p-5 sm:p-6">
        <h2 className="text-heading-sm font-semibold text-claimondo-navy">Öffentliche Anzeige</h2>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">Name und Text, die Ihre Kunden im Portal unter „Mein Betreuer" sehen.</p>

        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Formular */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-body-xs font-medium text-claimondo-ondo">Anzeigename</label>
              <input
                type="text"
                value={form.anzeigename}
                onChange={e => setForm({ ...form, anzeigename: e.target.value })}
                placeholder={`z.B. „${vorname} M."`}
                maxLength={80}
                className="w-full rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
              />
              <p className="mt-1 text-caption text-claimondo-ondo/60">Leer = voller Name ({fullName}).</p>
            </div>
            <div>
              <label className="mb-1 block text-body-xs font-medium text-claimondo-ondo">Profiltext</label>
              <textarea
                value={form.profilbeschreibung}
                onChange={e => setForm({ ...form, profilbeschreibung: e.target.value })}
                placeholder="z.B. Ihr persönlicher Kundenbetreuer"
                rows={3}
                maxLength={200}
                className="w-full resize-none rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
              />
              <p className="mt-1 text-caption text-claimondo-ondo/60">{form.profilbeschreibung.length}/200 Zeichen · sichtbar im Kunden-Portal.</p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !dirty}
              className="inline-flex items-center gap-2 rounded-ios-xl bg-claimondo-navy px-4 py-2 text-body-sm font-medium text-white transition-colors hover:bg-claimondo-ondo disabled:opacity-50"
            >
              {isPending ? 'Wird gespeichert…' : dirty ? 'Speichern' : 'Gespeichert'}
            </button>
          </div>

          {/* Live-Vorschau (Kunden-Ansicht) */}
          <div>
            <p className="mb-2 text-caption uppercase tracking-wide text-claimondo-ondo/70">Kunden-Vorschau</p>
            <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/60 p-4">
              <div className="flex items-center gap-3 rounded-ios-md border border-claimondo-border bg-white p-3">
                {avatarUrl ? (
                  <span
                    className="h-11 w-11 shrink-0 rounded-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${avatarUrl})` }}
                    aria-hidden
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-body-sm font-semibold text-white">{initials}</span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-claimondo-navy">{previewName}</p>
                  <p className="line-clamp-2 text-body-xs text-claimondo-ondo">{previewText}</p>
                </div>
              </div>
              <p className="mt-2 text-caption text-claimondo-ondo/60">So erscheinen Sie im Kunden-Portal.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function Feld({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-body-xs text-claimondo-ondo">{label}</span>
      <p className="truncate text-body-sm text-claimondo-navy">{value}</p>
    </div>
  )
}
