'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { deleteLead, deactivateLead } from './actions'

const GRUENDE = ['Kunde hat abgesagt', 'Kein Interesse', 'Duplikat', 'Spam', 'Sonstiges']

export default function LeadActionsMenu({ leadId, leadName }: { leadId: string; leadName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<'delete' | 'deactivate' | null>(null)
  const [grund, setGrund] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="4" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="10" cy="16" r="2"/></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44 z-30">
          <button onClick={() => { setOpen(false); setModal('deactivate'); setGrund(''); setError('') }}
            className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors">
            Lead deaktivieren
          </button>
          <button onClick={() => { setOpen(false); setModal('delete'); setError('') }}
            className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
            Lead löschen
          </button>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Lead löschen?</h3>
            <p className="text-sm text-gray-600 mb-1">Dieser Lead wird <strong>unwiderruflich gelöscht</strong>:</p>
            <p className="text-sm font-medium text-gray-900 mb-4">{leadName}</p>
            <p className="text-xs text-gray-400 mb-4">Alle zugehörigen Daten (Fälle, Dokumente, Chat, Termine) werden entfernt.</p>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">Abbrechen</button>
              <button disabled={processing} onClick={async () => {
                setProcessing(true); setError('')
                try { await deleteLead(leadId); router.push('/admin/dispatch') } catch (e) { setError(e instanceof Error ? e.message : 'Fehler') }
                setProcessing(false)
              }} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40">
                {processing ? 'Wird gelöscht...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {modal === 'deactivate' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Lead deaktivieren</h3>
            <select value={grund} onChange={e => setGrund(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-[#4573A2]">
              <option value="">— Grund wählen —</option>
              {GRUENDE.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">Abbrechen</button>
              <button disabled={processing || !grund} onClick={async () => {
                setProcessing(true); setError('')
                try { await deactivateLead(leadId, grund); setModal(null); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Fehler') }
                setProcessing(false)
              }} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40">
                {processing ? 'Wird deaktiviert...' : 'Deaktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
