'use client'

// AAR-773: Shared Inbox-Layout für ALLE Portale.
// Vorher hatten Gutachter-Posteingang, KB-Nachrichten und Admin-Inbox jeweils
// eigene fast-identische Sidebar-Implementierungen (ChatWithFallSidebar +
// ChatWithKundenSidebar + NachrichtenInboxClient).
// Jetzt: ein einziger Layout-Container, der eine Thread-Liste + Detail-
// Panel rendert. Konsumenten geben rolle-spezifische Threads + Detail-
// Renderer rein.

import { useState, type ReactNode } from 'react'
import { UserIcon, SearchIcon, MessageCircleIcon, ArrowLeftIcon } from 'lucide-react'
import { DropletBadge } from '@/components/primitives'

export type InboxThread = {
  /** Eindeutige ID für Selection — fallId, kundeId oder threadId */
  id: string
  /** Hauptzeile: meist Kundenname */
  title: string
  /** Sekundärzeile links (z.B. Fall-Nummer, # Fälle, letzte Nachricht-Vorschau) */
  subtitle: string
  /** Letzte Aktivität (ISO-Timestamp) */
  lastAt: string
  /** Ungelesene Anzahl — 0 versteckt das Badge */
  unreadCount: number
  /** Such-Index: alles was bei Eingabe matched */
  searchKey: string
}

type Props = {
  threads: InboxThread[]
  /** Initial-Selection (z.B. URL-Deep-Link). Default: erster Thread. */
  initialThreadId?: string | null
  /** Detail-Panel-Renderer. Bekommt die selektierte Thread-ID, gibt JSX zurück. */
  renderDetail: (threadId: string) => ReactNode
  /** Header der Sidebar (default: "Nachrichten") */
  title?: string
  /** Hint im Empty-State der Sidebar */
  emptyHint?: string
  /** Placeholder im Such-Input (default: "Suchen…") */
  searchPlaceholder?: string
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
  }
  const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 7) return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' })
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
}

export default function ChatInboxLayout({
  threads,
  initialThreadId,
  renderDetail,
  title = 'Nachrichten',
  emptyHint = 'Noch keine Chats',
  searchPlaceholder = 'Suchen…',
}: Props) {
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(
    initialThreadId && threads.some((t) => t.id === initialThreadId)
      ? initialThreadId
      : threads[0]?.id ?? null,
  )
  // 2026-05-06 SV6: Mobile-Master/Detail. Auf Mobile (< md) wird entweder
  // Liste ODER Detail angezeigt — nicht beides nebeneinander (war auf 390px
  // unbenutzbar: Sidebar 320px ließ nur 70px für den Chat). Tap auf Thread
  // → Detail-View; Back-Button → Liste. Auf Desktop bleibt's Side-by-Side.
  const [mobileView, setMobileView] = useState<'list' | 'detail'>(
    initialThreadId ? 'detail' : 'list',
  )

  const activeThread = activeId ? threads.find((t) => t.id === activeId) ?? null : null

  const filtered = threads.filter((t) => {
    if (!search) return true
    return t.searchKey.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="h-full flex min-h-0">
      {/* Sidebar — Mobile: full-width wenn Liste sichtbar, sonst hidden;
          Desktop: feste 320px Spalte. */}
      <aside
        className={`${
          mobileView === 'list' ? 'flex' : 'hidden'
        } md:flex w-full md:w-80 border-r border-claimondo-border flex-col bg-white shrink-0`}
      >
        <div className="px-4 py-3 border-b border-claimondo-border sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-claimondo-navy">{title}</h2>
          <div className="relative mt-2">
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-claimondo-ondo/70" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-claimondo-border rounded-lg focus:outline-none focus:border-claimondo-ondo"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MessageCircleIcon className="w-8 h-8 mx-auto text-claimondo-ondo/50 mb-2" />
              <p className="text-xs text-claimondo-ondo/70">
                {search ? 'Keine Treffer' : emptyHint}
              </p>
            </div>
          ) : (
            filtered.map((t) => {
              const active = activeId === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveId(t.id)
                    setMobileView('detail')
                  }}
                  className={`w-full text-left px-3 py-3 border-b border-claimondo-border hover:bg-[#f8f9fb] transition-colors ${
                    active ? 'bg-claimondo-ondo/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-claimondo-ondo/10 flex items-center justify-center shrink-0">
                      <UserIcon className="w-4 h-4 text-claimondo-ondo" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-claimondo-navy truncate">
                          {t.title}
                        </p>
                        <span className="text-[10px] text-claimondo-ondo/70 shrink-0">
                          {fmtTime(t.lastAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[11px] text-claimondo-ondo truncate">
                          {t.subtitle || '—'}
                        </p>
                        {t.unreadCount > 0 && (
                          <span className="shrink-0">
                            <DropletBadge count={t.unreadCount} tone="danger" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Detail-Panel — Mobile: full-width wenn Detail sichtbar, sonst hidden;
          Desktop: flex-1. Mobile zeigt Back-Button + Thread-Titel als Header. */}
      <main
        className={`${
          mobileView === 'detail' ? 'flex' : 'hidden'
        } md:flex flex-1 min-w-0 min-h-0 overflow-hidden bg-[#f8f9fb] flex-col`}
      >
        {activeId ? (
          <>
            {/* Mobile-Header mit Back-Button — Desktop versteckt */}
            <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-claimondo-border bg-white shrink-0">
              <button
                type="button"
                onClick={() => setMobileView('list')}
                aria-label="Zurück zur Liste"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[#f8f9fb] active:bg-claimondo-ondo/10 transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4 text-claimondo-navy" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-claimondo-navy truncate">
                  {activeThread?.title ?? '—'}
                </p>
                <p className="text-[11px] text-claimondo-ondo truncate">
                  {activeThread?.subtitle ?? ''}
                </p>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-y-auto">{renderDetail(activeId)}</div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-4">
            <div>
              <MessageCircleIcon className="w-12 h-12 mx-auto text-claimondo-ondo/40 mb-2" />
              <p className="text-sm text-claimondo-ondo">
                Wähle einen Chat aus der Liste
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
