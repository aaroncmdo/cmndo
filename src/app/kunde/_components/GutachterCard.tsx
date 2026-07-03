'use client'

// Kunde-Sidebar-Card fuer den zugewiesenen Sachverstaendigen.
// Chat oeffnet ein Gruppenchat-Modal - Kunde + SV chatten direkt, der KB
// liest mit (kanal='gruppenchat') und kann jederzeit eingreifen.
//
// Card-/Modal-Chrome (Trigger, Backdrop, popFromCard, ESC/Scroll/z-index) liegt in
// ChatCardShell + useChatCardChrome - geteilt mit der KundenbetreuerCard.

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import KundeKbChat from './KundeKbChat'
import ChatCardShell from './ChatCardShell'
import { useChatCardChrome } from './useChatCardChrome'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'

type Props = {
  vorname: string | null
  nachname: string | null
  telefon: string | null
  avatarUrl: string | null
  /** Google-Bewertung (Trust-Signal). Aus google_bewertungen_cache. */
  googleDurchschnitt?: number | null
  googleAnzahl?: number | null
  googleAktualisiertAm?: string | null
  /** Akzent-Farbe der Sidebar (Brand-Primary mit Fallback) */
  accentBg: string
  /** Single-Fall-ID - Default-Fall im Fall-Bezug-Picker */
  fallId: string | null
  /** Kunde-User-ID */
  currentUserId: string | null
  /** SV-User-ID (profile_id) - Empfaenger des gruppenchat-Inserts */
  svUserId: string | null
  /** KB-User-ID - als zusaetzlicher Sender im Realtime-Filter (KB liest mit) */
  kbUserId: string | null
  /** KB-Anzeigename - fuer Bubble-Label im Gruppenchat */
  kbName?: string | null
  /** KB-Avatar - fuer Mini-Avatar neben KB-Bubbles im Gruppenchat */
  kbAvatarUrl?: string | null
  /** Eskalierter Admin (zusaetzlicher Sender im Gruppenchat) */
  adminUserId?: string | null
  adminName?: string | null
  adminAvatarUrl?: string | null
  /** Alle Faelle des Kunden - fuer Fall-Bezug-Picker */
  fallOptions: Array<{ id: string; claim_nummer: string | null }>
}

export default function GutachterCard({
  vorname,
  nachname,
  avatarUrl,
  googleDurchschnitt,
  googleAnzahl,
  googleAktualisiertAm,
  accentBg,
  fallId,
  currentUserId,
  svUserId,
  kbUserId,
  kbName,
  kbAvatarUrl,
  adminUserId,
  adminName,
  adminAvatarUrl,
  fallOptions,
}: Props) {
  const t = useTranslations('kunde.shell')
  const { chatOpen, setChatOpen, unread } = useChatCardChrome('sv', currentUserId, 'gruppenchat')

  const name = [vorname, nachname].filter(Boolean).join(' ') || t('svCard.fallbackName')
  const initials =
    [vorname?.[0], nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  const canChat = !!currentUserId && !!svUserId

  // Modal-Header: gestapelte Avatare aller Teilnehmer + Gruppenchat-Titel.
  // Teilnehmer-Akzentfarben ueber var(--brand-*) (branden mit dem SV-Portal-Theme,
  // Fallback = Claimondo-Ton) statt hardcoded Hex.
  type Participant = { name: string; avatar: string | null; bg: string }
  const teilnehmer: Participant[] = [{ name, avatar: avatarUrl, bg: accentBg }]
  if (kbUserId && kbName) {
    teilnehmer.push({ name: kbName, avatar: kbAvatarUrl ?? null, bg: 'var(--brand-secondary, #4573A2)' })
  }
  if (adminUserId && adminName) {
    teilnehmer.push({ name: adminName, avatar: adminAvatarUrl ?? null, bg: 'var(--brand-warning, #F59E0B)' })
  }
  const namen = teilnehmer.map((p) => p.name.split(' ')[0]).join(', ')

  const modalHeader = (
    <>
      <div className="flex -space-x-2 shrink-0">
        {teilnehmer.slice(0, 4).map((p, idx) => {
          const ini =
            p.name
              .split(' ')
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase() || '?'
          return (
            <div
              key={idx}
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white border-2 border-white/85"
              style={{ backgroundColor: p.bg, zIndex: teilnehmer.length - idx }}
            >
              {p.avatar ? (
                <Image src={p.avatar} alt={p.name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
              ) : (
                ini
              )}
            </div>
          )
        })}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-claimondo-navy leading-tight">{t('svCard.gruppenchat')}</p>
        <p className="text-[10px] text-claimondo-ondo leading-tight mt-0.5 truncate">
          {t('svCard.gruppenchatMit', { namen })}
        </p>
      </div>
    </>
  )

  const sublineExtra =
    googleDurchschnitt != null && googleAnzahl != null ? (
      <div className="mt-1">
        <GoogleBewertungBadge
          durchschnitt={googleDurchschnitt}
          anzahl={googleAnzahl}
          zuletztAktualisiert={googleAktualisiertAm ?? null}
          size="sm"
        />
      </div>
    ) : undefined

  return (
    <ChatCardShell
      open={chatOpen && canChat}
      onOpen={() => {
        if (canChat) setChatOpen(true)
      }}
      onClose={() => setChatOpen(false)}
      triggerDisabled={!canChat}
      eyebrow={t('svCard.ihrGutachter')}
      name={name}
      initials={initials}
      avatarUrl={avatarUrl}
      accentBg={accentBg}
      unread={unread}
      subline={t('svCard.sachverstaendiger')}
      sublineExtra={sublineExtra}
      triggerAriaLabel={t('svCard.chatOeffnenAria', { name })}
      unreadAriaLabel={t('svCard.ungeleseneAria', { count: unread })}
      modalAriaLabel={t('svCard.gruppenchat')}
      closeAriaLabel={t('svCard.chatSchliessenAria')}
      modalHeader={modalHeader}
    >
      {currentUserId && svUserId && (
        <KundeKbChat
          currentUserId={currentUserId}
          partnerUserId={svUserId}
          additionalSenderIds={[
            ...(kbUserId ? [kbUserId] : []),
            ...(adminUserId ? [adminUserId] : []),
          ]}
          kanal="gruppenchat"
          fallOptions={fallOptions}
          defaultFallId={fallId}
          placeholder={t('svCard.chatPlaceholder')}
          senderLabels={{
            [svUserId]: { name, rolle: 'sv', avatarUrl },
            ...(kbUserId && kbName
              ? { [kbUserId]: { name: kbName, rolle: 'kb' as const, avatarUrl: kbAvatarUrl ?? null } }
              : {}),
            ...(adminUserId && adminName
              ? { [adminUserId]: { name: adminName, rolle: 'kb' as const, avatarUrl: adminAvatarUrl ?? null } }
              : {}),
          }}
        />
      )}
    </ChatCardShell>
  )
}
