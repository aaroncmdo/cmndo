'use client'

// AAR-289: Full-Screen-Drawer „Komplette Akte". Wird über den [📎 Akte]-Button
// im FallHeader geöffnet. Backdrop-Click + Escape-Key schließen. Tab-Bar
// keyboard-navigierbar. 3xl max-width, right-slide-in.
// AAR-405: Vierter Tab „Team" an erster Position (Default). Zeigt Kundenbetreuer,
// Kunde und — wenn Phase 5+ erreicht — die Kanzlei. Pro Person: Direkt-Chat-CTA
// (wechselt auf Chat-Tab mit Focus-Banner) und Anrufen (tel:-Link).

import { useEffect, useState } from 'react'
import {
  PaperclipIcon,
  XIcon,
  FileTextIcon,
  ClockIcon,
  MessageCircleIcon,
  DownloadIcon,
  UsersIcon,
  PhoneIcon,
  MailIcon,
} from 'lucide-react'
import PhoneButton from '@/components/shared/PhoneButton'
import { Drawer } from '@/components/primitives/Drawer'

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

// AAR-405: Team-Einträge. `rolle` steuert das Header-Label + den späteren
// Chat-Filter (Mapping auf multi_channel_chat-Teilnehmer).
export type TeamMitglied = {
  rolle: 'kundenbetreuer' | 'kunde' | 'kanzlei'
  name: string
  email: string | null
  telefon: string | null
}

type DrawerTab = 'team' | 'dateien' | 'timeline' | 'chat'

export function FallakteDrawer({
  fallNummer,
  team,
  dokumente,
  timeline,
  nachrichten,
}: {
  fallNummer: string
  team?: TeamMitglied[]
  dokumente: DocLite[]
  timeline: TimelineEventLite[]
  nachrichten: NachrichtLite[]
}) {
  const [open, setOpen] = useState(false)
  // AAR-405: Team-Tab ist Default, wenn Team-Einträge vorhanden sind — das ist
  // die häufigste Akte-Aktion laut Aaron („Ansprechpartner direkt kontaktieren").
  const hasTeam = Boolean(team && team.length > 0)
  const [tab, setTab] = useState<DrawerTab>(hasTeam ? 'team' : 'dateien')
  const [chatFocus, setChatFocus] = useState<TeamMitglied | null>(null)

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

  // AAR-405: Wenn Drawer geschlossen wird, Focus zurücksetzen, damit das nächste
  // Öffnen wieder frisch startet.
  useEffect(() => {
    if (!open) setChatFocus(null)
  }, [open])

  function handleDirektChat(m: TeamMitglied) {
    setChatFocus(m)
    setTab('chat')
  }

  const tabs: [DrawerTab, string, typeof FileTextIcon, number | null][] = [
    ['team', 'Team', UsersIcon, team?.length ?? 0],
    ['dateien', 'Dateien', FileTextIcon, dokumente.length],
    ['timeline', 'Timeline', ClockIcon, timeline.length],
    ['chat', 'Chat', MessageCircleIcon, nachrichten.length],
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-claimondo-border text-claimondo-navy hover:bg-[#f8f9fb] transition-colors text-sm font-medium"
        aria-label="Komplette Akte öffnen"
      >
        <PaperclipIcon className="w-4 h-4" />
        Akte
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} width={768} noPadding hideCloseButton ariaLabel="Komplette Akte">
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-claimondo-border shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-claimondo-navy">Komplette Akte</h2>
                <p className="text-xs text-claimondo-ondo">{fallNummer}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-[#f8f9fb] rounded-lg"
                aria-label="Schließen"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex border-b border-claimondo-border shrink-0" role="tablist">
              {tabs
                .filter(([key]) => key !== 'team' || hasTeam)
                .map(([key, label, Icon, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                      tab === key
                        ? 'text-[var(--brand-primary)] border-[var(--brand-secondary)]'
                        : 'text-claimondo-ondo border-transparent hover:text-claimondo-navy'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                    {count !== null && count > 0 && (
                      <span className="text-[11px] text-claimondo-ondo/70">({count})</span>
                    )}
                  </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6" role="tabpanel">
              {tab === 'team' && (
                <TeamListe team={team ?? []} onDirektChat={handleDirektChat} />
              )}
              {tab === 'dateien' && <DateienListe dokumente={dokumente} />}
              {tab === 'timeline' && <TimelineListe events={timeline} />}
              {tab === 'chat' && (
                <ChatListe nachrichten={nachrichten} focus={chatFocus} />
              )}
            </div>
        </div>
      </Drawer>
    </>
  )
}

const ROLLE_LABEL: Record<TeamMitglied['rolle'], string> = {
  kundenbetreuer: 'Kundenbetreuer',
  kanzlei: 'Kanzlei',
  kunde: 'Kunde',
}

function TeamListe({
  team,
  onDirektChat,
}: {
  team: TeamMitglied[]
  onDirektChat: (m: TeamMitglied) => void
}) {
  if (team.length === 0) {
    return (
      <p className="text-sm text-claimondo-ondo/70 text-center py-8">
        Noch kein Ansprechpartner hinterlegt.
      </p>
    )
  }
  // Reihenfolge: Kundenbetreuer → Kanzlei → Kunde (wichtigster Kontakt zuerst)
  const ordered = [...team].sort((a, b) => {
    const order: Record<TeamMitglied['rolle'], number> = {
      kundenbetreuer: 0,
      kanzlei: 1,
      kunde: 2,
    }
    return order[a.rolle] - order[b.rolle]
  })
  return (
    <ul className="space-y-4">
      {ordered.map((m, i) => (
        <li key={`${m.rolle}-${i}`} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
            {ROLLE_LABEL[m.rolle]}
          </p>
          <div className="rounded-xl border border-claimondo-border bg-white p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center text-sm font-semibold shrink-0">
                {initialen(m.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--brand-primary)] truncate">
                  {m.name || '—'}
                </p>
                {m.email && (
                  <a
                    href={`mailto:${m.email}`}
                    className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-claimondo-ondo hover:text-[var(--brand-primary)] truncate"
                  >
                    <MailIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{m.email}</span>
                  </a>
                )}
                {m.telefon && (
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-claimondo-ondo">
                    <PhoneIcon className="w-3.5 h-3.5" />
                    {m.telefon}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => onDirektChat(m)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-primary)] text-white text-xs font-medium hover:bg-[var(--brand-primary)]"
              >
                <MessageCircleIcon className="w-3.5 h-3.5" />
                Direkt chatten
              </button>
              {m.telefon && (
                <PhoneButton
                  nummer={m.telefon}
                  variant="inline"
                  label="Anrufen"
                  className="!px-3 !py-1.5 !rounded-lg !border !border-claimondo-border !bg-white !text-claimondo-navy !text-xs !font-medium hover:!bg-[#f8f9fb]"
                />
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function initialen(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function DateienListe({ dokumente }: { dokumente: DocLite[] }) {
  if (dokumente.length === 0) {
    return <p className="text-sm text-claimondo-ondo/70 text-center py-8">Noch keine Dateien.</p>
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
            className="flex items-center gap-3 p-3 rounded-lg border border-claimondo-border bg-white hover:bg-[#f8f9fb]"
          >
            <FileTextIcon className="w-5 h-5 text-claimondo-ondo/70 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-claimondo-navy truncate">{name}</p>
              <p className="text-[11px] text-claimondo-ondo">
                {typ}
                {datum ? ` · ${new Date(datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}` : ''}
              </p>
            </div>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--brand-secondary)] hover:text-[var(--brand-primary)] p-1.5"
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
    return <p className="text-sm text-claimondo-ondo/70 text-center py-8">Noch keine Events.</p>
  }
  return (
    <ol className="space-y-3">
      {events.map((e, i) => {
        const datum = e.created_at ?? e.erstellt_am
        return (
          <li
            key={e.id ?? i}
            className="border-l-2 border-claimondo-border pl-3 ml-1 relative"
          >
            <span
              className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[var(--brand-secondary)]"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-claimondo-navy">{e.titel ?? e.typ ?? '—'}</p>
            {e.beschreibung && (
              <p className="text-xs text-claimondo-ondo mt-0.5">{e.beschreibung}</p>
            )}
            {datum && (
              <p className="text-[10px] text-claimondo-ondo/70 mt-1">
                {new Date(datum).toLocaleString('de-DE')}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function ChatListe({
  nachrichten,
  focus,
}: {
  nachrichten: NachrichtLite[]
  focus: TeamMitglied | null
}) {
  return (
    <div className="space-y-3">
      {focus && (
        <div className="rounded-lg border border-[var(--brand-accent)] bg-[#f4f8fc] px-3 py-2 text-xs text-[var(--brand-primary)]">
          Fokus auf <strong>{focus.name}</strong> ({ROLLE_LABEL[focus.rolle]}).
          Zum Schreiben den Chat im Haupt-Layout nutzen — hier ist die Akten-
          Ansicht read-only.
        </div>
      )}
      {nachrichten.length === 0 ? (
        <p className="text-sm text-claimondo-ondo/70 text-center py-8">Noch keine Nachrichten.</p>
      ) : (
        <ul className="space-y-2">
          {nachrichten.map((n, i) => {
            const text = n.inhalt ?? n.text ?? ''
            const datum = n.created_at ?? n.erstellt_am
            return (
              <li
                key={n.id ?? i}
                className="p-3 rounded-lg bg-[#f8f9fb] border border-claimondo-border"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-claimondo-navy">
                    {n.absender_name ?? n.absender_rolle ?? 'System'}
                  </p>
                  {datum && (
                    <p className="text-[10px] text-claimondo-ondo/70">
                      {new Date(datum).toLocaleString('de-DE')}
                    </p>
                  )}
                </div>
                <p className="text-sm text-claimondo-navy">{text}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
