'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon, FileTextIcon, UserIcon, HardHatIcon } from 'lucide-react'

type Result = { id: string; label: string; sub: string; status?: string }
type Results = { faelle: Result[]; leads: Result[]; sv: Result[] }

export default function Spotlight() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>({ faelle: [], leads: [], sv: [] })
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) { inputRef.current?.focus(); setQuery(''); setResults({ faelle: [], leads: [], sv: [] }) }
  }, [open])

  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) { setResults({ faelle: [], leads: [], sv: [] }); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        if (r.ok) { const data = await r.json(); setResults(data); setSelectedIdx(0) }
      } catch { /* */ }
      setLoading(false)
    }, 250)
  }, [])

  function allResults(): { type: string; item: Result }[] {
    return [
      ...results.faelle.map(r => ({ type: 'fall', item: r })),
      ...results.leads.map(r => ({ type: 'lead', item: r })),
      ...results.sv.map(r => ({ type: 'sv', item: r })),
    ]
  }

  function navigate(type: string, id: string) {
    setOpen(false)
    if (type === 'fall') router.push(`/admin/faelle/${id}`)
    else if (type === 'lead') router.push(`/admin/dispatch/lead/${id}`)
    else if (type === 'sv') router.push(`/admin/sachverstaendige/${id}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const all = allResults()
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, all.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && all[selectedIdx]) {
      e.preventDefault()
      navigate(all[selectedIdx].type, all[selectedIdx].item.id)
    }
  }

  const hasResults = results.faelle.length + results.leads.length + results.sv.length > 0

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <SearchIcon className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); search(e.target.value) }}
            onKeyDown={handleKeyDown}
            placeholder="Suche nach Name, Kennzeichen, Aktenzeichen..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        {loading && <div className="px-4 py-3 text-gray-400 text-xs">Suche...</div>}

        {!loading && hasResults && (
          <div className="max-h-80 overflow-y-auto">
            {results.faelle.length > 0 && (
              <div>
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fälle</p>
                {results.faelle.map((r, i) => {
                  const globalIdx = i
                  return (
                    <button key={r.id} onClick={() => navigate('fall', r.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[#4573A2]/5 transition-colors ${selectedIdx === globalIdx ? 'bg-[#4573A2]/5' : ''}`}>
                      <FileTextIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{r.label}</p>
                        {r.sub && <p className="text-[10px] text-gray-400 truncate">{r.sub}</p>}
                      </div>
                      {r.status && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{r.status}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {results.leads.length > 0 && (
              <div>
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Leads</p>
                {results.leads.map((r, i) => {
                  const globalIdx = results.faelle.length + i
                  return (
                    <button key={r.id} onClick={() => navigate('lead', r.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-green-50 transition-colors ${selectedIdx === globalIdx ? 'bg-green-50' : ''}`}>
                      <UserIcon className="w-4 h-4 text-green-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{r.label}</p>
                        {r.sub && <p className="text-[10px] text-gray-400 truncate">{r.sub}</p>}
                      </div>
                      {r.status && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{r.status}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {results.sv.length > 0 && (
              <div>
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sachverständige</p>
                {results.sv.map((r, i) => {
                  const globalIdx = results.faelle.length + results.leads.length + i
                  return (
                    <button key={r.id} onClick={() => navigate('sv', r.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-purple-50 transition-colors ${selectedIdx === globalIdx ? 'bg-purple-50' : ''}`}>
                      <HardHatIcon className="w-4 h-4 text-purple-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{r.label}</p>
                        {r.sub && <p className="text-[10px] text-gray-400 truncate">{r.sub}</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!loading && query.length >= 2 && !hasResults && (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">Keine Ergebnisse</div>
        )}

        {!loading && query.length < 2 && (
          <div className="px-4 py-4 text-center text-gray-400 text-xs">
            Mindestens 2 Zeichen eingeben · <kbd className="bg-gray-100 px-1 py-0.5 rounded font-mono">Cmd+K</kbd>
          </div>
        )}
      </div>
    </div>
  )
}
