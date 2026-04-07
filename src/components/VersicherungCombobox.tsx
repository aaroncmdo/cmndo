'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDownIcon } from 'lucide-react'

type Versicherung = { id: string; name: string }

export default function VersicherungCombobox({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [options, setOptions] = useState<Versicherung[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase
      .from('versicherungen')
      .select('id, name')
      .eq('ist_aktiv', true)
      .order('name')
      .then(({ data }) => setOptions(data ?? []))
  }, [supabase])

  useEffect(() => { setSearch(value) }, [value])

  // Close on outside click
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} className="relative">
      {label && <label className="text-xs text-gray-500 mb-0.5 block">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Versicherung eingeben..."
          className="w-full px-3 py-2.5 pr-8 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4573A2] transition-colors"
        />
        <ChevronDownIcon className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400 text-center">Keine Versicherung gefunden</p>
          ) : (
            filtered.map(o => (
              <button key={o.id} type="button"
                onClick={() => { onChange(o.name); setSearch(o.name); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#4573A2]/10 transition-colors">
                {o.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
