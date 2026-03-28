'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfil } from './actions'

type Profile = { vorname: string | null; nachname: string | null; telefon: string | null; rolle: string }
type SV = { id: string; paket: string; gebiet_plz: string | null; ist_aktiv: boolean; max_faelle_monat: number; offene_faelle: number }

export default function ProfilClient({
  email,
  profile,
  sv,
  faelleCount,
}: {
  email: string
  profile: Profile
  sv: SV
  faelleCount: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const fd = new FormData(e.currentTarget)
      await updateProfil(fd)
      setEditing(false)
      setSuccess(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const initials = `${(profile.vorname?.[0] ?? '').toUpperCase()}${(profile.nachname?.[0] ?? '').toUpperCase()}`
  const fullName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || '—'

  return (
    <div className="px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-white">Mein Profil</h1>
          {!editing && (
            <button
              onClick={() => { setEditing(true); setSuccess(false) }}
              className="px-4 py-2 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Bearbeiten
            </button>
          )}
        </div>

        {success && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-3 mb-4">
            <p className="text-green-300 text-sm">Profil gespeichert.</p>
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
              <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-xl font-semibold">
                {initials}
              </div>
              <div>
                <p className="text-white font-medium text-lg">{fullName}</p>
                <p className="text-zinc-500 text-sm">Sachverständiger</p>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-0">
              <FieldRow label="E-Mail" value={email} />

              {editing ? (
                <>
                  <EditRow label="Vorname" name="vorname" defaultValue={profile.vorname ?? ''} />
                  <EditRow label="Nachname" name="nachname" defaultValue={profile.nachname ?? ''} />
                  <EditRow label="Telefon" name="telefon" defaultValue={profile.telefon ?? ''} type="tel" />
                  <EditRow label="Gebiet (PLZ)" name="gebiet_plz" defaultValue={sv.gebiet_plz ?? ''} placeholder="z.B. 10115,10117,10119" />
                  <div className="flex gap-2 py-2.5 border-b border-zinc-800/50">
                    <span className="text-zinc-500 text-sm w-36 shrink-0">Verfügbar</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="verfuegbar"
                        defaultChecked={sv.ist_aktiv}
                        className="w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-blue-600 focus:ring-blue-600 focus:ring-offset-0"
                      />
                      <span className="text-zinc-300 text-sm">Neue Aufträge annehmen</span>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <FieldRow label="Vorname" value={profile.vorname ?? '—'} />
                  <FieldRow label="Nachname" value={profile.nachname ?? '—'} />
                  <FieldRow label="Telefon" value={profile.telefon ?? '—'} />
                  <FieldRow label="Gebiet (PLZ)" value={sv.gebiet_plz ?? '—'} />
                  <FieldRow label="Verfügbar" value={sv.ist_aktiv ? 'Ja' : 'Nein'} />
                </>
              )}

              <FieldRow label="Paket" value={sv.paket || '—'} />
              <FieldRow label="Offene Fälle" value={`${sv.offene_faelle} / ${sv.max_faelle_monat}`} />
              <FieldRow label="Zugewiesene Fälle gesamt" value={String(faelleCount)} />
            </div>

            {/* Actions */}
            {editing && (
              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40"
                >
                  {saving ? 'Wird gespeichert...' : 'Speichern'}
                </button>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-2.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-500 text-sm w-36 shrink-0">{label}</span>
      <span className="text-zinc-200 text-sm">{value}</span>
    </div>
  )
}

function EditRow({ label, name, defaultValue, type = 'text', placeholder }: {
  label: string; name: string; defaultValue: string; type?: string; placeholder?: string
}) {
  return (
    <div className="flex gap-2 py-2 border-b border-zinc-800/50">
      <span className="text-zinc-500 text-sm w-36 shrink-0 pt-2">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
      />
    </div>
  )
}
