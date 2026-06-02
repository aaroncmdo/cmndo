// Chat-Inbox P2: geteilte Message-Bubble fuer alle Chat-Shells.
// variant: 'tint'  -> Rolle-Label-Bubble (MultiChannelChat-Stil)
//          'avatar' -> Avatar + Name-Bubble (Makler/Kunde-Gruppenchat)
//          'plain'  -> schlichte 2-Ton-Bubble (Timeline/Fokus)

import { UserIcon } from 'lucide-react'
import type { ChatMessage } from '@/lib/chat/thread/reducer'

export type SenderLabel = { name: string; rolle?: string | null; avatarUrl?: string | null }

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({
  message,
  isOwn,
  variant,
  senderLabel,
}: {
  message: ChatMessage
  isOwn: boolean
  variant: 'tint' | 'avatar' | 'plain'
  senderLabel?: SenderLabel
}) {
  if (message.is_system) {
    return (
      <div className="text-center">
        <span className="inline-block text-[10px] text-claimondo-ondo bg-white border border-claimondo-border rounded-full px-3 py-1">
          {message.nachricht}
        </span>
      </div>
    )
  }

  const bubble = isOwn
    ? 'bg-claimondo-ondo text-white'
    : 'bg-white border border-claimondo-border text-claimondo-navy'
  const timeCls = isOwn ? 'text-white/60' : 'text-claimondo-ondo/70'
  const linkCls = isOwn ? 'text-white/80' : 'text-claimondo-ondo'

  const showAvatar = variant === 'avatar' && !isOwn
  const showRolleLabel = variant === 'tint' && !isOwn && !!message.sender_rolle

  return (
    <div className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {showAvatar && (
        <div className="w-7 h-7 rounded-full bg-claimondo-ondo/10 flex items-center justify-center shrink-0 overflow-hidden">
          {senderLabel?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={senderLabel.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
          )}
        </div>
      )}
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${bubble} ${message.pending ? 'opacity-60' : ''}`}>
        {showAvatar && senderLabel?.name && (
          <p className="text-[10px] font-semibold text-claimondo-ondo mb-0.5">{senderLabel.name}</p>
        )}
        {showRolleLabel && (
          <p className="text-[10px] font-semibold text-claimondo-ondo mb-0.5 uppercase">{message.sender_rolle}</p>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.nachricht}</p>
        {message.hat_anhang && message.anhang_url && (
          <a
            href={message.anhang_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs underline mt-1 block ${linkCls}`}
          >
            Anhang öffnen
          </a>
        )}
        <p className={`text-[10px] mt-1 ${timeCls}`}>{fmtTime(message.created_at)}</p>
      </div>
    </div>
  )
}
