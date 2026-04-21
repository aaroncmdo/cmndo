'use client'

import { useState } from 'react'
import { BellIcon, MessageCircleIcon } from 'lucide-react'
import MitteilungenClient from './_components/MitteilungenClient'
import NachrichtenSvClient from './_components/NachrichtenSvClient'

// AAR-370: Tab-Wrapper für /gutachter/posteingang. Delegiert an die
// existierenden Clients MitteilungenClient + NachrichtenSvClient, damit
// deren Logik (Mark-as-read, Reply, etc.) 1:1 erhalten bleibt.

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

type Thread = {
  fallId: string
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
  messages: Array<{
    id: string
    fall_id: string | null
    kanal: string
    sender_id: string | null
    sender_rolle: string | null
    nachricht: string | null
    hat_anhang: boolean
    created_at: string
    richtung: string | null
  }>
}

type TabKey = 'mitteilungen' | 'nachrichten'

export default function PosteingangTabs({
  initialTab,
  mitteilungen,
  threads,
  ungeleseneMitteilungen,
  ungeleseneChats,
}: {
  initialTab: TabKey
  mitteilungen: Mitteilung[]
  threads: Thread[]
  ungeleseneMitteilungen: number
  ungeleseneChats: number
}) {
  const [tab, setTab] = useState<TabKey>(initialTab)

  return (
    <div className="h-full flex flex-col">
      {/* Tab-Leiste */}
      <div className="flex-shrink-0 flex items-center gap-1 border-b border-gray-200 bg-white/60 px-2">
        <TabButton
          active={tab === 'mitteilungen'}
          onClick={() => setTab('mitteilungen')}
          icon={<BellIcon className="w-4 h-4" />}
          label="Mitteilungen"
          badge={ungeleseneMitteilungen}
        />
        <TabButton
          active={tab === 'nachrichten'}
          onClick={() => setTab('nachrichten')}
          icon={<MessageCircleIcon className="w-4 h-4" />}
          label="Nachrichten"
          badge={ungeleseneChats}
        />
      </div>

      {/* Inhalt */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'mitteilungen' ? (
          <MitteilungenClient mitteilungen={mitteilungen} />
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <NachrichtenSvClient threads={threads as any} />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge: number
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
          : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-red-500 text-white"
          aria-label={`${badge} ungelesen`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
