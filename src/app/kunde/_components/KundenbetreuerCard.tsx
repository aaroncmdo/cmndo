'use client'

// Kunde-Sidebar-Card: zeigt zugewiesenen Kundenbetreuer + Quick-Actions
// (Rueckruf, Videotermin). Chat-Button oeffnet ein zentriertes Glass-Modal
// mit reinem KB<->Kunde-Chat (Kanal 'chat_kb_kunde'). Videotermin-Button
// oeffnet das BeratungBuchen-Sheet mit Google-Meet-Slot-Picker.
//
// Card-/Modal-Chrome (Trigger, Backdrop, popFromCard, ESC/Scroll/z-index) liegt in
// ChatCardShell + useChatCardChrome - geteilt mit der GutachterCard.

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { PhoneIcon, VideoIcon } from 'lucide-react'
import BeratungBuchenSheet from '@/components/kunde/BeratungBuchenSheet'
import KundeKbChat from './KundeKbChat'
import ChatCardShell from './ChatCardShell'
import { useChatCardChrome } from './useChatCardChrome'

type Props = {
  vorname: string | null
  nachname: string | null
  telefon: string | null
  avatarUrl: string | null
  /** Akzent-Farbe (Brand-Primary mit Fallback) */
  accentBg: string
  /** Single-Fall-ID fuer Videotermin (Default-Fall im Chat-Picker) */
  fallId: string | null
  /** Kunde-User-ID (aktuell eingeloggter User) */
  currentUserId: string | null
  /** KB-User-ID - noetig fuer KundeKbChat (Realtime-Filter auf Sender-IDs) */
  kbUserId: string | null
  /** DB-Rolle des zugewiesenen Betreuers (kundenbetreuer | admin | ...) fuers Subline-Label */
  kbRolle?: string | null
  /** Eskalierter Admin (liest mit + chattet). User-ID + Name + Avatar */
  adminUserId?: string | null
  adminName?: string | null
  adminAvatarUrl?: string | null
  /** Alle Faelle des Kunden - fuer Fall-Bezug-Picker im Chat-Input */
  fallOptions: Array<{ id: string; claim_nummer: string | null }>
}

const ROLLE_LABEL_KEY: Record<string, string> = {
  kundenbetreuer: 'kbCard.rolleKundenbetreuer',
  admin: 'kbCard.rolleAdmin',
  dispatch: 'kbCard.rolleDispatch',
}

export default function KundenbetreuerCard({
  vorname,
  nachname,
  avatarUrl,
  accentBg,
  fallId,
  currentUserId,
  kbUserId,
  kbRolle,
  adminUserId,
  adminName,
  adminAvatarUrl,
  fallOptions,
}: Props) {
  const t = useTranslations('kunde.shell')
  const rolleLabel = kbRolle && ROLLE_LABEL_KEY[kbRolle]
    ? t(ROLLE_LABEL_KEY[kbRolle]!)
    : t('kbCard.rolleKundenbetreuer')
  const { chatOpen, setChatOpen, unread } = useChatCardChrome('kb', currentUserId, 'chat_kb_kunde')
  const [videoOpen, setVideoOpen] = useState(false)
  const [bookingKanal, setBookingKanal] = useState<'video' | 'telefon'>('video')

  const effectiveBookingFallId = fallId ?? fallOptions[0]?.id ?? null

  const name = [vorname, nachname].filter(Boolean).join(' ') || t('kbCard.fallbackName')
  const initials =
    [vorname?.[0], nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  const canChat = !!currentUserId && !!kbUserId

  // Modal-Header: Einzel-Avatar + Name + 2 Quick-Action-Kreise (Telefon=Rueckruf, Video=Videotermin).
  const modalHeader = (
    <>
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden"
        style={{ backgroundColor: accentBg }}
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt={name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
        ) : (
          initials
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-claimondo-navy truncate leading-tight">{name}</p>
        <p className="text-[10px] text-claimondo-ondo leading-tight mt-0.5">{t('kbCard.ihrBetreuer')}</p>
      </div>
      {effectiveBookingFallId && (
        <>
          <button
            type="button"
            onClick={() => {
              setBookingKanal('telefon')
              setVideoOpen(true)
            }}
            className="shrink-0 w-9 h-9 rounded-full bg-claimondo-navy/10 hover:bg-claimondo-navy/20 text-claimondo-navy inline-flex items-center justify-center transition-colors"
            aria-label={t('kbCard.rueckruftermin')}
            title={t('kbCard.rueckruftermin')}
          >
            <PhoneIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setBookingKanal('video')
              setVideoOpen(true)
            }}
            className="shrink-0 w-9 h-9 rounded-full bg-claimondo-navy/10 hover:bg-claimondo-navy/20 text-claimondo-navy inline-flex items-center justify-center transition-colors"
            aria-label={t('kbCard.videotermin')}
            title={t('kbCard.videotermin')}
          >
            <VideoIcon className="w-4 h-4" />
          </button>
        </>
      )}
    </>
  )

  return (
    <>
      <ChatCardShell
        open={chatOpen && canChat}
        onOpen={() => {
          if (canChat) setChatOpen(true)
        }}
        onClose={() => setChatOpen(false)}
        triggerDisabled={!canChat}
        eyebrow={t('kbCard.ihrBetreuer')}
        name={name}
        initials={initials}
        avatarUrl={avatarUrl}
        accentBg={accentBg}
        unread={unread}
        subline={rolleLabel}
        triggerAriaLabel={t('kbCard.chatOeffnenAria', { name })}
        unreadAriaLabel={t('kbCard.ungeleseneAria', { count: unread })}
        modalAriaLabel={t('kbCard.chatModalAria')}
        closeAriaLabel={t('kbCard.chatSchliessenAria')}
        modalHeader={modalHeader}
      >
        {currentUserId && kbUserId && (
          <ChatBlock
            currentUserId={currentUserId}
            kbUserId={kbUserId}
            adminUserId={adminUserId ?? null}
            fallOptions={fallOptions}
            fallId={fallId}
            kbName={name}
            kbAvatarUrl={avatarUrl}
            adminName={adminName ?? null}
            adminAvatarUrl={adminAvatarUrl ?? null}
          />
        )}
      </ChatCardShell>

      {effectiveBookingFallId && (
        <BeratungBuchenSheet
          fallId={effectiveBookingFallId}
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
          defaultKanal={bookingKanal}
        />
      )}
    </>
  )
}

// Stabilisiert die Props an KundeKbChat: additionalSenderIds + senderLabels
// via useMemo cachen, damit Parent-Re-Renders nicht die useEffect-Dependency-
// Identitaet aendern und die Realtime-Subscription unnoetig neu aufbauen.
function ChatBlock({
  currentUserId,
  kbUserId,
  adminUserId,
  fallOptions,
  fallId,
  kbName,
  kbAvatarUrl,
  adminName,
  adminAvatarUrl,
}: {
  currentUserId: string
  kbUserId: string
  adminUserId: string | null
  fallOptions: Array<{ id: string; claim_nummer: string | null }>
  fallId: string | null
  kbName: string
  kbAvatarUrl: string | null
  adminName: string | null
  adminAvatarUrl: string | null
}) {
  const t = useTranslations('kunde.shell')
  const additionalSenderIds = useMemo(
    () => (adminUserId ? [adminUserId] : []),
    [adminUserId],
  )
  const senderLabels = useMemo(
    () => ({
      [kbUserId]: { name: kbName, rolle: 'kb' as const, avatarUrl: kbAvatarUrl },
      ...(adminUserId && adminName
        ? { [adminUserId]: { name: adminName, rolle: 'kb' as const, avatarUrl: adminAvatarUrl ?? null } }
        : {}),
    }),
    [kbUserId, kbName, kbAvatarUrl, adminUserId, adminName, adminAvatarUrl],
  )
  return (
    <KundeKbChat
      currentUserId={currentUserId}
      partnerUserId={kbUserId}
      additionalSenderIds={additionalSenderIds}
      kanal="chat_kb_kunde"
      fallOptions={fallOptions}
      defaultFallId={fallId}
      placeholder={t('kbCard.chatPlaceholder')}
      senderLabels={senderLabels}
    />
  )
}
