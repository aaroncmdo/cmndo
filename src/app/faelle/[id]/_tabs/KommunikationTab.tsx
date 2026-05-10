'use client'

// AAR-541 (C4): Admin/KB-Sicht auf den MultiChannelChat.
// Rendert den Shared-Component mit rollenabhängigem Kanal-Whitelist,
// einer Teilnehmer-Liste und URL-Param-Deep-Link (?kanal=kb_sv_intern).

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useFall } from '../FallContext'
import MultiChannelChat from '@/components/chat/MultiChannelChat'
import type { ChatKanal } from '@/lib/communications/channels'
import { getKanaeleForRolle, resolveKanalAlias } from '@/lib/chat/kanal-routing'

export type FallTeilnehmer = {
  user_id: string
  rolle: 'kunde' | 'kundenbetreuer' | 'gutachter'
  vorname: string | null
  nachname: string | null
  avatar_url: string | null
}

const ROLLE_LABEL: Record<FallTeilnehmer['rolle'], string> = {
  kunde: 'Kunde',
  kundenbetreuer: 'Kundenbetreuer',
  gutachter: 'Gutachter',
}

export default function KommunikationTab({
  currentUserId,
  teilnehmer,
}: {
  currentUserId: string | null
  teilnehmer: FallTeilnehmer[]
}) {
  const { fall, userRolle } = useFall()
  const search = useSearchParams()

  const visibleKanaele = useMemo<ChatKanal[]>(
    () => getKanaeleForRolle(userRolle),
    [userRolle],
  )

  const defaultKanal = useMemo<ChatKanal>(() => {
    const aliased = resolveKanalAlias(search?.get('kanal'))
    if (aliased && visibleKanaele.includes(aliased)) return aliased
    return visibleKanaele[0] ?? 'whatsapp'
  }, [search, visibleKanaele])

  // AAR-541: Admin/KB = Super-User → interner Kanal explizit erlauben
  const showInternal = visibleKanaele.includes('chat_kb_sv')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-4">
      <div>
        <MultiChannelChat
          fallId={fall.id}
          currentUserId={currentUserId}
          showInternalKbSvChat={showInternal}
          defaultKanal={defaultKanal}
          visibleKanaele={visibleKanaele}
        />
      </div>

      <aside className="bg-white border border-claimondo-border rounded-xl p-4 h-fit">
        <h3 className="text-xs font-semibold text-claimondo-navy uppercase tracking-wider mb-3">
          Teilnehmer ({teilnehmer.length})
        </h3>
        {teilnehmer.length === 0 ? (
          <p className="text-xs text-claimondo-ondo italic">Noch keine Teilnehmer zugeordnet.</p>
        ) : (
          <ul className="space-y-2">
            {teilnehmer.map((t) => {
              const name = [t.vorname, t.nachname].filter(Boolean).join(' ') || '—'
              const initials = [t.vorname?.[0], t.nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'
              return (
                <li key={t.user_id} className="flex items-center gap-2.5">
                  {t.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.avatar_url}
                      alt={name}
                      className="w-8 h-8 rounded-full object-cover border border-claimondo-border"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-[#EBF1F8] text-claimondo-navy flex items-center justify-center text-xs font-semibold">
                      {initials}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-claimondo-navy truncate">{name}</p>
                    <p className="text-[10px] text-claimondo-ondo">{ROLLE_LABEL[t.rolle]}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="mt-4 pt-3 border-t border-claimondo-border">
          <p className="text-[10px] text-claimondo-ondo/70 leading-snug">
            Admin + KB sehen alle fünf Kanäle inklusive des internen KB↔SV-Chats.
            System-Nachrichten werden als Separator dargestellt.
          </p>
        </div>
      </aside>
    </div>
  )
}
