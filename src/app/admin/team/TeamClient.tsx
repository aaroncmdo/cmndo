'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlusIcon, UsersIcon, ShieldCheckIcon } from 'lucide-react'
import { createMitarbeiter } from './actions'

const ROLLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  sachverstaendiger: 'Sachverstaendiger',
  kundenbetreuer: 'Kundenbetreuer',
  leadbearbeiter: 'Leadbearbeiter',
  kanzlei: 'Kanzlei',
}

const ROLLE_COLORS: Record<string, string> = {
  admin: 'bg-red-950 text-red-300',
  sachverstaendiger: 'bg-blue-950 text-blue-300',
  kundenbetreuer: 'bg-green-950 text-green-300',
  leadbearbeiter: 'bg-amber-950 text-amber-300',
  kanzlei: 'bg-violet-950 text-violet-300',
}

type Mitarbeiter = {
  id: string
  email: string | null
  vorname: string | null
  nachname: string | null
  rolle: string
  force_password_change: boolean | null
  created_at: string
}

export default function TeamClient({ mitarbeiter }: { mitarbeiter: Mitarbeiter[] }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const formData = new FormData(e.currentTarget)
      const result = await createMitarbeiter(formData)
      setSuccess(`${result.email} wurde eingeladen. Einmalpasswort: ${result.password}`)
      setShowDialog(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-zinc-400" />
              Team-Verwaltung
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">{mitarbeiter.length} Mitarbeiter</p>
          </div>
          <button
            onClick={() => { setShowDialog(true); setError(null); setSuccess(null) }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <UserPlusIcon className="w-4 h-4" />
            Neuer Mitarbeiter
          </button>
        </div>

        {success && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-4 mb-4">
            <p className="text-green-300 text-sm">{success}</p>
          </div>
        )}

        {/* Team table */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">E-Mail</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Rolle</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 text-zinc-200">
                      {[m.vorname, m.nachname].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{m.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLLE_COLORS[m.rolle] ?? 'bg-zinc-800 text-zinc-300'}`}>
                        {ROLLE_LABELS[m.rolle] ?? m.rolle}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.force_password_change ? (
                        <span className="text-amber-400 text-xs">Einladung ausstehend</span>
                      ) : (
                        <span className="text-green-400 text-xs flex items-center gap-1">
                          <ShieldCheckIcon className="w-3 h-3" /> Aktiv
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {new Date(m.created_at).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                ))}
                {mitarbeiter.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                      Keine Mitarbeiter gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* New employee dialog */}
        {showDialog && (
          <>
            <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowDialog(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
                <h2 className="text-white font-semibold text-lg mb-4">Neuer Mitarbeiter</h2>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Vorname</label>
                      <input
                        name="vorname"
                        required
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-1.5 block">Nachname</label>
                      <input
                        name="nachname"
                        required
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">E-Mail</label>
                    <input
                      name="email"
                      type="email"
                      required
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Rolle</label>
                    <select
                      name="rolle"
                      required
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="kundenbetreuer">Kundenbetreuer</option>
                      <option value="leadbearbeiter">Leadbearbeiter</option>
                      <option value="admin">Admin</option>
                      <option value="sachverstaendiger">Sachverstaendiger</option>
                      <option value="kanzlei">Kanzlei</option>
                    </select>
                  </div>

                  {error && (
                    <p className="text-sm text-red-400 rounded-xl bg-red-950/50 border border-red-900 px-4 py-3">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDialog(false)}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      {loading ? 'Wird erstellt...' : 'Erstellen + Einladen'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
