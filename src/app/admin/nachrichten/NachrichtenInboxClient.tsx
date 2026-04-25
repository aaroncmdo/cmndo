'use client'

// AAR-102 / AAR-525 / AAR-773: Admin-Inbox auf shared ChatInboxLayout
// migriert. Vorher hatte diese Datei eine eigene Sidebar-Implementierung
// (~180 LOC) parallel zu ChatWithFallSidebar/KundenSidebar. Jetzt:
// dünner Adapter mit Admin-spezifischem Header (Fall-Nummer + Kennzeichen +
// "Fallakte öffnen"-Link).

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MessageCircleIcon, ArrowRightIcon } from 'lucide-react'
import MultiChannelChat from '@/components/chat/MultiChannelChat'
import ChatInboxLayout, { type InboxThread } from '@/components/chat/ChatInboxLayout'
import PageHeader from '@/components/shared/PageHeader'

type Thread = {
  fallId: string
  fallNummer: string | null
  kennzeichen: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  lastKanal: string
  unreadCount: number
}

export default function NachrichtenInboxClient({
  threads,
  currentUserId,
}: {
  threads: Thread[]
  currentUserId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlFallId = searchParams?.get('fall') ?? null

  // Unread-First-Sort, dann letzte Aktivität absteigend
  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      if ((a.unreadCount > 0) !== (b.unreadCount > 0)) {
        return a.unreadCount > 0 ? -1 : 1
      }
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    })
  }, [threads])

  const inboxThreads: InboxThread[] = sortedThreads.map((t) => ({
    id: t.fallId,
    title: t.kundeName,
    subtitle: `${t.fallNummer ? `#${t.fallNummer} · ` : ''}${t.lastMessage || '—'}`,
    lastAt: t.lastAt,
    unreadCount: t.unreadCount,
    searchKey: `${t.kundeName} ${t.kennzeichen ?? ''} ${t.fallNummer ?? ''} ${t.fallId} ${t.lastMessage}`,
  }))

  const byId = new Map(threads.map((t) => [t.fallId, t]))

  // URL-Sync — wenn Selection wechselt, ?fall= updaten ohne Page-Reload
  // Wir hooken in den Layout-State über initialThreadId + onSelect-Pattern
  // hier vereinfacht: Layout managed Selection intern. Deep-Link funktioniert
  // weiterhin via initialThreadId.
  useEffect(() => {
    // No-op — Layout managed intern. URL-Replace beim Klick wäre eine
    // Erweiterung am Layout (onSelect-Callback), für Phase 1 reicht
    // initialThreadId als Deep-Link-Anker.
  }, [router, pathname, searchParams])

  return (
    <div className="py-6 px-4 space-y-4 max-w-7xl mx-auto">
      <PageHeader
        title="Nachrichten"
        description="Alle Kommunikationskanäle mit Kunden + Gutachter pro Fall."
        icon={MessageCircleIcon}
      />

      <div className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden h-[600px]">
        <ChatInboxLayout
          threads={inboxThreads}
          initialThreadId={urlFallId}
          emptyHint="Keine Nachrichten"
          searchPlaceholder="Suche Kunde / Kennzeichen / Fall…"
          renderDetail={(id) => {
            const t = byId.get(id)
            if (!t) return null
            return (
              <>
                <div className="bg-white rounded-ios-md border border-claimondo-border px-4 py-3 mb-3 flex items-center justify-between">
                  <Link href={`/faelle/${t.fallId}`} className="min-w-0 group">
                    <h2 className="text-base font-semibold text-claimondo-navy group-hover:underline">
                      {t.kundeName}
                    </h2>
                    <p className="text-xs text-claimondo-ondo">
                      Fall: {t.fallNummer ?? t.fallId.slice(0, 8)}
                      {t.kennzeichen && ` · ${t.kennzeichen}`}
                    </p>
                  </Link>
                  <Link
                    href={`/faelle/${t.fallId}`}
                    className="text-xs text-claimondo-ondo hover:text-claimondo-navy inline-flex items-center gap-1"
                  >
                    Fallakte öffnen <ArrowRightIcon className="w-3 h-3" />
                  </Link>
                </div>
                <MultiChannelChat
                  fallId={t.fallId}
                  currentUserId={currentUserId}
                  showInternalKbSvChat={false}
                  defaultKanal="whatsapp"
                />
              </>
            )
          }}
        />
      </div>
    </div>
  )
}
