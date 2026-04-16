'use client'

// AAR-289: Full-Screen-Drawer „Komplette Akte" — drei Tabs (Dateien / Timeline /
// Chat). Wird über den [📎 Akte]-Button im FallHeader geöffnet. Backdrop-Click
// + Escape-Key schließen. Tab-Bar keyboard-navigierbar. 3xl max-width, right-
// slide-in.

import { useEffect, useState } from 'react'
import { PaperclipIcon, XIcon, FileTextIcon, ClockIcon, MessageCircleIcon, DownloadIcon } from 'lucide-react'

type DocLite = {
  id?: string
  typ?: string | null
  dokument_typ?: string | null
  kategorie?: string | null
  datei_url?: string | null
  storage_path?: string | null
  datei_name?: string | null
  original_filename?: string | null
  hochgeladen_am?: string | null
  created_at?: string | null
}

type TimelineEventLite = {
  id?: string
  typ?: string | null
  titel?: string | null
  beschreibung?: string | null
  created_at?: string | null
  erstellt_am?: string | null
}

type NachrichtLite = {
  id?: string
  inhalt?: string | null
  text?: string | null
  absender_name?: string | null
  absender_rolle?: string | null
  created_at?: string | null
  erstellt_am?: string | null
}

export function FallakteDrawer({
  fallNummer,
  dokumente,
  timeline,
  nachrichten,
}: {
  fallNummer: string
  dokumente: DocLite[]
  timeline: TimelineEventLite[]
  nachrichten: NachrichtLite[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'dateien' | 'timeline' | 'chat'>('dateien')

  // Escape-Key schließt
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
        aria-label="Komplette Akte öffnen"
      >
        <PaperclipIcon className="w-4 h-4" />
        Akte
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Komplette Akte"
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-3xl bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Komplette Akte</h2>
                <p className="text-xs text-gray-500">{fallNummer}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Schließen"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-gray-200 shrink-0" role="tablist">
              {(
                [
                  ['dateien', `Dateien (${dokumente.length})`, FileTextIcon],
                  ['timeline', `Timeline (${timeline.length})`, ClockIcon],
                  ['chat', `Chat (${nachrichten.length})`, MessageCircleIcon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                    tab === key
                      ? 'text-[#0D1B3E] border-[#4573A2]'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6" role="tabpanel">
              {tab === 'dateien' && <DateienListe dokumente={dokumente} />}
              {tab === 'timeline' && <TimelineListe events={timeline} />}
              {tab === 'chat' && <ChatListe nachrichten={nachrichten} />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DateienListe({ dokumente }: { dokumente: DocLite[] }) {
  if (dokumente.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Noch keine Dateien.</p>
  }
  return (
    <ul className="space-y-2">
      {dokumente.map((d, i) => {
        const name = d.original_filename ?? d.datei_name ?? d.dokument_typ ?? d.typ ?? 'Datei'
        const typ = d.dokument_typ ?? d.typ ?? d.kategorie ?? ''
        const url = d.datei_url ?? null
        const datum = d.hochgeladen_am ?? d.created_at
        return (
          <li
            key={d.id ?? i}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            <FileTextIcon className="w-5 h-5 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
              <p className="text-[11px] text-gray-500">
                {typ}
                {datum ? ` · ${new Date(datum).toLocaleDateString('de-DE')}` : ''}
              </p>
            </div>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4573A2] hover:text-[#0D1B3E] p-1.5"
                aria-label={`${name} herunterladen`}
              >
                <DownloadIcon className="w-4 h-4" />
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function TimelineListe({ events }: { events: TimelineEventLite[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Noch keine Events.</p>
  }
  return (
    <ol className="space-y-3">
      {events.map((e, i) => {
        const datum = e.created_at ?? e.erstellt_am
        return (
          <li
            key={e.id ?? i}
            className="border-l-2 border-gray-200 pl-3 ml-1 relative"
          >
            <span
              className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#4573A2]"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-gray-900">{e.titel ?? e.typ ?? '—'}</p>
            {e.beschreibung && (
              <p className="text-xs text-gray-600 mt-0.5">{e.beschreibung}</p>
            )}
            {datum && (
              <p className="text-[10px] text-gray-400 mt-1">
                {new Date(datum).toLocaleString('de-DE')}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function ChatListe({ nachrichten }: { nachrichten: NachrichtLite[] }) {
  if (nachrichten.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Noch keine Nachrichten.</p>
  }
  return (
    <ul className="space-y-2">
      {nachrichten.map((n, i) => {
        const text = n.inhalt ?? n.text ?? ''
        const datum = n.created_at ?? n.erstellt_am
        return (
          <li
            key={n.id ?? i}
            className="p-3 rounded-lg bg-gray-50 border border-gray-200"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-700">
                {n.absender_name ?? n.absender_rolle ?? 'System'}
              </p>
              {datum && (
                <p className="text-[10px] text-gray-400">
                  {new Date(datum).toLocaleString('de-DE')}
                </p>
              )}
            </div>
            <p className="text-sm text-gray-900">{text}</p>
          </li>
        )
      })}
    </ul>
  )
}
