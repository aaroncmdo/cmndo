'use client'

// AAR-93: SV-Portal Reklamations-Liste + Dialog
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, XIcon, ShieldCheckIcon, AlertCircleIcon } from 'lucide-react'
import { createReklamation } from './actions'
// AAR-664 (Folge): Konstante aus non-`'use server'`-Datei.
import { REKLAMATIONS_GRUENDE } from './constants'
import PageHeader from '@/components/shared/PageHeader'
import { Modal } from '@/components/primitives/Modal'

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
      setError('Alle Felder ausfüllen, Begründung mindestens 30 Zeichen.')
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
        <PageHeader
          title="Meine Reklamationen"
          description="Reklamationen zu Aufträgen — z.B. Kunde war nicht da, Schaden anders, Mehraufwand."
        />
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
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-[-.01em] px-5 py-3 min-h-11 rounded-full bg-[var(--brand-primary,#4573A2)] text-white shadow-[0_4px_12px_rgba(69,115,162,.30),0_1px_2px_rgba(69,115,162,.18)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_8px_22px_rgba(69,115,162,.36),0_2px_4px_rgba(69,115,162,.20)] disabled:bg-claimondo-border disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
        >
          <PlusIcon className="w-4 h-4" />
          Neue Reklamation
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-claimondo-border divide-y divide-claimondo-border shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)] overflow-hidden">
        {reklamationen.map(r => {
          const fall = Array.isArray(r.faelle) ? r.faelle[0] : r.faelle
          return (
            <div key={r.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-claimondo-navy">
                    {fall?.fall_nummer ?? r.fall_id.slice(0, 8)}
                    {fall?.kennzeichen && <span className="text-xs text-claimondo-ondo/70 ml-2">{fall.kennzeichen}</span>}
                  </p>
                  <p className="text-xs text-claimondo-ondo mt-0.5">
                    Grund: <span className="font-medium">{REKLAMATIONS_GRUENDE.find(g => g.value === r.grund)?.label ?? r.grund}</span>
                  </p>
                </div>
                <span className={`text-xs font-semibold tracking-[-.005em] px-2.5 py-1 rounded-full flex-shrink-0 ${
                  r.status === 'offen' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  r.status === 'in-bearbeitung' ? 'bg-claimondo-bg text-claimondo-ondo border border-claimondo-border' :
                  r.status === 'erledigt' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  'bg-red-50 text-red-700 border border-red-200'
                }`}>{r.status}</span>
              </div>
              <p className="text-sm text-claimondo-navy">{r.begruendung}</p>
              {r.admin_begruendung && (
                <div className="bg-claimondo-bg rounded p-2 text-xs">
                  <p className="font-semibold text-claimondo-navy mb-0.5">Antwort vom Kundenbetreuer:</p>
                  <p className="text-claimondo-ondo">{r.admin_begruendung}</p>
                </div>
              )}
              <p className="text-[10px] text-claimondo-ondo/70">
                Eingereicht: {new Date(r.eingereicht_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {r.bearbeitet_am && ` · Bearbeitet: ${new Date(r.bearbeitet_am).toLocaleDateString('de-DE')}`}
              </p>
            </div>
          )
        })}
        {reklamationen.length === 0 && (
          <div className="p-12 text-center">
            <AlertCircleIcon className="w-8 h-8 text-claimondo-ondo/50 mx-auto mb-2" />
            <p className="text-sm text-claimondo-ondo/70">Keine Reklamationen vorhanden.</p>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Modal open={showDialog} onClose={() => setShowDialog(false)} noPadding hideCloseButton maxWidth={512} ariaLabel="Neue Reklamation">
        <form onSubmit={handleSubmit} className="flex flex-col p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-claimondo-navy">Neue Reklamation</h2>
            <button type="button" onClick={() => setShowDialog(false)} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-claimondo-navy mb-1">Fall</label>
            <select value={form.fallId} onChange={e => setForm(f => ({ ...f, fallId: e.target.value }))}
              className="w-full bg-claimondo-navy/[0.06] border-[1.5px] border-transparent rounded-[14px] px-4 py-3 text-sm text-claimondo-navy tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-[0_0_0_4px_rgba(69,115,162,.12)]" required>
              <option value="">Bitte Fall wählen</option>
              {faelle.map(f => (
                <option key={f.id} value={f.id}>
                  {f.fall_nummer ?? f.id.slice(0, 8)}{f.kennzeichen ? ` — ${f.kennzeichen}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-claimondo-navy mb-1">Grund</label>
            <select value={form.grund} onChange={e => setForm(f => ({ ...f, grund: e.target.value }))}
              className="w-full bg-claimondo-navy/[0.06] border-[1.5px] border-transparent rounded-[14px] px-4 py-3 text-sm text-claimondo-navy tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-[0_0_0_4px_rgba(69,115,162,.12)]" required>
              <option value="">Bitte Grund wählen</option>
              {REKLAMATIONS_GRUENDE.map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-claimondo-navy mb-1">
              Begründung <span className="text-claimondo-ondo/70">(min. 30 Zeichen, {form.begruendung.length}/30)</span>
            </label>
            <textarea value={form.begruendung} onChange={e => setForm(f => ({ ...f, begruendung: e.target.value }))}
              rows={4} className="w-full bg-claimondo-navy/[0.06] border-[1.5px] border-transparent rounded-[14px] px-4 py-3 text-sm text-claimondo-navy tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-[0_0_0_4px_rgba(69,115,162,.12)] resize-none" required minLength={30} />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowDialog(false)}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy/[0.06] text-claimondo-navy text-sm font-semibold tracking-[-.01em] px-5 py-3 min-h-11 transition-all duration-200 hover:bg-claimondo-navy/[0.10] hover:-translate-y-[1px]">
              Abbrechen
            </button>
            <button type="submit" disabled={pending}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-primary,#4573A2)] text-white text-sm font-semibold tracking-[-.01em] px-5 py-3 min-h-11 shadow-[0_4px_12px_rgba(69,115,162,.30),0_1px_2px_rgba(69,115,162,.18)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_8px_22px_rgba(69,115,162,.36),0_2px_4px_rgba(69,115,162,.20)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0">
              {pending ? 'Sende...' : 'Reklamation einreichen'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
