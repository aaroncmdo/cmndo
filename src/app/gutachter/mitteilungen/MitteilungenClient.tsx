'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  BellIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  FileTextIcon,
  MessageSquareIcon,
  CalendarIcon,
  ShieldAlertIcon,
  ClockIcon,
  GavelIcon,
  WalletIcon,
  PackageIcon,
  UserPlusIcon,
} from 'lucide-react'

type Mitteilung = {
  id: string
  typ: string
  titel: string
  nachricht: string
  gelesen: boolean
  dringend: boolean
  link: string | null
  created_at: string
}

const TYP_ICON: Record<string, typeof BellIcon> = {
  neuer_auftrag: UserPlusIcon,
  termin_bestaetigt: CalendarIcon,
  termin_geaendert: CalendarIcon,
  kunde_dokument_hochgeladen: FileTextIcon,
  kunde_chat_nachricht: MessageSquareIcon,
  vorschaden_warnung: ShieldAlertIcon,
  gutachten_erinnerung: ClockIcon,
  qc_bestanden: CheckCircle2Icon,
  qc_nachbesserung: AlertTriangleIcon,
  kanzlei_as_gesendet: GavelIcon,
  kanzlei_regulierung: GavelIcon,
  kanzlei_zahlung: WalletIcon,
  paket_fast_voll: PackageIcon,
  guthaben_niedrig: WalletIcon,
}

const TYP_COLOR: Record<string, string> = {
  neuer_auftrag: 'text-[#7BA3CC] bg-[#4573A2]/5',
  termin_bestaetigt: 'text-green-400 bg-green-50',
  termin_geaendert: 'text-amber-400 bg-amber-50',
  kunde_dokument_hochgeladen: 'text-sky-400 bg-sky-950',
  kunde_chat_nachricht: 'text-violet-400 bg-violet-50',
  vorschaden_warnung: 'text-red-400 bg-red-50',
  gutachten_erinnerung: 'text-amber-400 bg-amber-50',
  qc_bestanden: 'text-green-400 bg-green-50',
  qc_nachbesserung: 'text-red-400 bg-red-50',
  kanzlei_as_gesendet: 'text-purple-400 bg-purple-50',
  kanzlei_regulierung: 'text-purple-400 bg-purple-50',
  kanzlei_zahlung: 'text-emerald-400 bg-emerald-50',
  paket_fast_voll: 'text-amber-400 bg-amber-50',
  guthaben_niedrig: 'text-red-400 bg-red-50',
}

type Filter = 'alle' | 'ungelesen' | 'dringend'

export default function MitteilungenClient({ mitteilungen: initial }: { mitteilungen: Mitteilung[] }) {
  const [items, setItems] = useState(initial)
  const [filter, setFilter] = useState<Filter>('alle')
  const [, startTransition] = useTransition()

  const ungeleseneCount = items.filter(m => !m.gelesen).length

  const filtered = items.filter(m => {
    if (filter === 'ungelesen') return !m.gelesen
    if (filter === 'dringend') return m.dringend
    return true
  })

  async function markAsRead(id: string) {
    const supabase = createClient()
    await supabase.from('gutachter_mitteilungen').update({ gelesen: true }).eq('id', id)
    startTransition(() => {
      setItems(prev => prev.map(m => m.id === id ? { ...m, gelesen: true } : m))
    })
  }

  async function markAllAsRead() {
    const supabase = createClient()
    const unreadIds = items.filter(m => !m.gelesen).map(m => m.id)
    if (unreadIds.length === 0) return
    await supabase.from('gutachter_mitteilungen').update({ gelesen: true }).in('id', unreadIds)
    startTransition(() => {
      setItems(prev => prev.map(m => ({ ...m, gelesen: true })))
    })
  }

  function formatTime(d: string) {
    const date = new Date(d)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `vor ${mins} Min.`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `vor ${hours} Std.`
    const days = Math.floor(hours / 24)
    if (days < 7) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="px-4 py-6 sm:py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Mitteilungen</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {ungeleseneCount > 0 ? `${ungeleseneCount} ungelesen` : 'Alles gelesen'}
            </p>
          </div>
          {ungeleseneCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Alle als gelesen markieren
            </button>
          )}
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {([['alle', 'Alle'], ['ungelesen', 'Ungelesen'], ['dringend', 'Dringend']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-zinc-700 text-gray-900'
                  : 'bg-white text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <BellIcon className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Keine Mitteilungen.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => {
              const Icon = TYP_ICON[m.typ] ?? BellIcon
              const colorCls = TYP_COLOR[m.typ] ?? 'text-gray-500 bg-gray-100'
              const [iconColor, iconBg] = colorCls.split(' ')

              const card = (
                <div
                  className={`flex items-start gap-4 bg-white border rounded-2xl p-4 transition-colors ${
                    !m.gelesen
                      ? 'border-gray-300 hover:border-gray-300'
                      : 'border-gray-200/50 opacity-70 hover:opacity-100'
                  }`}
                  onClick={() => !m.gelesen && markAsRead(m.id)}
                >
                  <div className={`shrink-0 p-2 rounded-xl ${iconBg}`}>
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${!m.gelesen ? 'text-gray-900' : 'text-gray-500'}`}>
                        {m.titel}
                        {m.dringend && (
                          <span className="ml-2 text-xs text-red-400 font-semibold">DRINGEND</span>
                        )}
                      </p>
                      <span className="shrink-0 text-xs text-gray-400">{formatTime(m.created_at)}</span>
                    </div>
                    <p className="text-gray-500 text-xs mt-1 line-clamp-2">{m.nachricht}</p>
                  </div>
                  {!m.gelesen && (
                    <div className="shrink-0 mt-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#4573A2]" />
                    </div>
                  )}
                </div>
              )

              if (m.link) {
                return <Link key={m.id} href={m.link}>{card}</Link>
              }
              return <div key={m.id}>{card}</div>
            })}
          </div>
        )}
      </div>
    </div>
  )
}
