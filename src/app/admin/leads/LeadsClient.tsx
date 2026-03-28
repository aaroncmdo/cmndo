'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SearchIcon } from 'lucide-react'

// ─── Status config ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'neu', label: 'Neu' },
  { value: 'rueckruf', label: 'Rückruf' },
  { value: 'quali-offen', label: 'Quali offen' },
  { value: 'flow-gesendet', label: 'Flow gesendet' },
  { value: 'umgewandelt', label: 'Umgewandelt' },
  { value: 'umgewandelt-sv', label: 'Umgewandelt (SV)' },
  { value: 'disqualifiziert', label: 'Disqualifiziert' },
  { value: 'kalt', label: 'Kalt' },
] as const

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label])
)

const STATUS_COLOR: Record<string, string> = {
  neu: 'bg-blue-950 text-blue-300',
  rueckruf: 'bg-yellow-950 text-yellow-300',
  'quali-offen': 'bg-orange-950 text-orange-300',
  'flow-gesendet': 'bg-violet-950 text-violet-300',
  umgewandelt: 'bg-green-950 text-green-300',
  'umgewandelt-sv': 'bg-emerald-950 text-emerald-300',
  disqualifiziert: 'bg-red-950 text-red-300',
  kalt: 'bg-zinc-800 text-zinc-400',
}

const SOURCE_LABEL: Record<string, string> = {
  flow: 'Flow',
  telefon: 'Telefon',
  email: 'E-Mail',
  website: 'Website',
  empfehlung: 'Empfehlung',
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Lead = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  status: string
  source_channel: string | null
  source_domain: string | null
  kontaktversuche: number | null
  created_at: string | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeadsClient({ leads }: { leads: Lead[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('alle')

  const filtered = useMemo(() => {
    let result = leads

    if (statusFilter !== 'alle') {
      result = result.filter((l) => l.status === statusFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((l) => {
        const name = `${l.vorname ?? ''} ${l.nachname ?? ''}`.toLowerCase()
        const email = (l.email ?? '').toLowerCase()
        const telefon = (l.telefon ?? '').toLowerCase()
        return name.includes(q) || email.includes(q) || telefon.includes(q)
      })
    }

    return result
  }, [leads, search, statusFilter])

  async function handleStatusChange(leadId: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('leads').update({ status: newStatus }).eq('id', leadId)
    router.refresh()
  }

  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Leads</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{leads.length} Leads gesamt</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, E-Mail oder Telefon suchen ..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-zinc-600 transition-colors"
          >
            <option value="alle">Alle Status</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        {!filtered.length ? (
          <div className="bg-zinc-900 rounded-2xl p-12 text-center">
            <p className="text-zinc-500">
              {leads.length === 0 ? 'Noch keine Leads vorhanden.' : 'Keine Leads gefunden.'}
            </p>
          </div>
        ) : (
          <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Quelle</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Kontaktversuche</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium whitespace-nowrap">Erstellt am</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => {
                    const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => router.push(`/admin/leads/${lead.id}`)}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <span className="text-white">{name}</span>
                          {lead.email && (
                            <span className="text-zinc-500 text-xs block">{lead.email}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={lead.status}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleStatusChange(lead.id, e.target.value)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-600 ${STATUS_COLOR[lead.status] ?? 'bg-zinc-800 text-zinc-300'}`}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 text-xs whitespace-nowrap">
                          {SOURCE_LABEL[lead.source_channel ?? ''] ?? lead.source_channel ?? '—'}
                          {lead.source_domain && (
                            <span className="text-zinc-500 block">{lead.source_domain}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 text-center tabular-nums">
                          {lead.kontaktversuche ?? 0}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                          {lead.created_at
                            ? new Date(lead.created_at).toLocaleDateString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
