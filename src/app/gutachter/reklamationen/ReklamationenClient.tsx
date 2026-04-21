'use client'

// AAR-93: SV-Portal Reklamations-Liste + Dialog
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircleIcon, PlusIcon, XIcon } from 'lucide-react'
import { createReklamation } from './actions'
// AAR-664 (Folge): Konstante aus non-`'use server'`-Datei.
import { REKLAMATIONS_GRUENDE } from './constants'

type Reklamation = {
  id: string
  fall_id: string
  grund: string
  begruendung: string
  status: string
  eingereicht_am: string
  bearbeitet_am: string | null
  admin_begruendung: string | null
  faelle: { fall_nummer: string | null; kennzeichen: string | null } | { fall_nummer: string | null; kennzeichen: string | null }[] | null
}

type Fall = { id: string; fall_nummer: string | null; kennzeichen: string | null }

export default function ReklamationenClient({ reklamationen, faelle }: { reklamationen: Reklamation[]; faelle: Fall[] }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ fallId: '', grund: '', begruendung: '' })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.fallId || !form.grund || form.begruendung.trim().length < 30) {
      setError('Alle Felder ausfuellen, Begruendung mindestens 30 Zeichen.')
      return
    }
    startTransition(async () => {
      const result = await createReklamation({
        fallId: form.fallId,
        grund: form.grund,
        begruendung: form.begruendung,
      })
      if (!result.success) {
        setError(result.error ?? 'Fehler')
        return
      }
      setShowDialog(false)
      setForm({ fallId: '', grund: '', begruendung: '' })
      router.refresh()
    })
  }

  return (
    <div className="py-6 space-y-4 max-w-5xl mx-auto px-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Meine Reklamationen</h1>
          <p className="text-sm text-gray-500 mt-1">Reklamationen zu Auftraegen — z.B. Kunde war nicht da, Schaden anders, Mehraufwand.</p>
        </div>
        {/* AAR-259: Button deaktiviert wenn keine Fälle vorhanden — sonst
            öffnet der Dialog einen leeren Select und User denkt "Klick tut
            nichts". Mit Hover-Hint erklären. */}
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          disabled={faelle.length === 0}
          title={faelle.length === 0
            ? 'Keine Fälle vorhanden — Reklamationen können nur zu vorhandenen Fällen eingereicht werden.'
            : 'Neue Reklamation einreichen'}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)] disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <PlusIcon className="w-4 h-4" />
          Neue Reklamation
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {reklamationen.map(r => {
          const fall = Array.isArray(r.faelle) ? r.faelle[0] : r.faelle
          return (
            <div key={r.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {fall?.fall_nummer ?? r.fall_id.slice(0, 8)}
                    {fall?.kennzeichen && <span className="text-xs text-gray-400 ml-2">{fall.kennzeichen}</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Grund: <span className="font-medium">{REKLAMATIONS_GRUENDE.find(g => g.value === r.grund)?.label ?? r.grund}</span>
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  r.status === 'offen' ? 'bg-amber-100 text-amber-700' :
                  r.status === 'in-bearbeitung' ? 'bg-blue-100 text-blue-700' :
                  r.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-red-100 text-red-700'
                }`}>{r.status}</span>
              </div>
              <p className="text-sm text-gray-700">{r.begruendung}</p>
              {r.admin_begruendung && (
                <div className="bg-gray-50 rounded p-2 text-xs">
                  <p className="font-semibold text-gray-700 mb-0.5">Antwort vom Kundenbetreuer:</p>
                  <p className="text-gray-600">{r.admin_begruendung}</p>
                </div>
              )}
              <p className="text-[10px] text-gray-400">
                Eingereicht: {new Date(r.eingereicht_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {r.bearbeitet_am && ` · Bearbeitet: ${new Date(r.bearbeitet_am).toLocaleDateString('de-DE')}`}
              </p>
            </div>
          )
        })}
        {reklamationen.length === 0 && (
          <div className="p-12 text-center">
            <AlertCircleIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Keine Reklamationen vorhanden.</p>
          </div>
        )}
      </div>

      {/* Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Neue Reklamation</h2>
              <button type="button" onClick={() => setShowDialog(false)} className="text-gray-400 hover:text-gray-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fall</label>
              <select value={form.fallId} onChange={e => setForm(f => ({ ...f, fallId: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" required>
                <option value="">Bitte Fall waehlen</option>
                {faelle.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.fall_nummer ?? f.id.slice(0, 8)}{f.kennzeichen ? ` — ${f.kennzeichen}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Grund</label>
              <select value={form.grund} onChange={e => setForm(f => ({ ...f, grund: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" required>
                <option value="">Bitte Grund waehlen</option>
                {REKLAMATIONS_GRUENDE.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Begruendung <span className="text-gray-400">(min. 30 Zeichen, {form.begruendung.length}/30)</span>
              </label>
              <textarea value={form.begruendung} onChange={e => setForm(f => ({ ...f, begruendung: e.target.value }))}
                rows={4} className="w-full px-3 py-2 border rounded-lg text-sm" required minLength={30} />
            </div>

            {error && <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Abbrechen
              </button>
              <button type="submit" disabled={pending}
                className="px-4 py-2 text-sm font-medium bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-primary)] disabled:opacity-50">
                {pending ? 'Sende...' : 'Reklamation einreichen'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
