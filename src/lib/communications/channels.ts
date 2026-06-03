// AAR-102: Zentrale Kanal-Definitionen fuer Multi-Channel Inbox
import { MessageCircleIcon, UserIcon, UsersIcon, CarFrontIcon, BriefcaseIcon, type LucideIcon } from 'lucide-react'

export type ChatKanal = 'whatsapp' | 'chat_kb_kunde' | 'gruppenchat' | 'chat_kunde_sv' | 'chat_kb_sv' | 'chat_gruppe_mit_makler'

export interface ChatChannelDef {
  id: ChatKanal
  label: string
  icon: LucideIcon
  color: string
  visibleInInbox: boolean
}

export const CHAT_KANAELE: ChatChannelDef[] = [
  { id: 'whatsapp',      label: 'WhatsApp',                    icon: MessageCircleIcon, color: '#25D366', visibleInInbox: true },
  { id: 'chat_kb_kunde', label: 'Chat mit Kunde',              icon: UserIcon,          color: '#4573A2', visibleInInbox: true },
  { id: 'gruppenchat',   label: 'Gruppen-Chat',                icon: UsersIcon,         color: '#0D1B3E', visibleInInbox: true },
  { id: 'chat_kunde_sv', label: 'Kunde / Gutachter',           icon: CarFrontIcon,      color: '#7BA3CC', visibleInInbox: true },
  { id: 'chat_kb_sv',    label: 'KB / Gutachter (intern)',     icon: BriefcaseIcon,     color: '#1E3A5F', visibleInInbox: false },
  // 2026-06-01: an DB-CHECK angeglichen (nachrichten_kanal_check kennt 6 Kanaele).
  // visibleInInbox:false — Makler-Gruppe wird (noch) nicht in Standard-Inboxen gezeigt.
  { id: 'chat_gruppe_mit_makler', label: 'Makler-Gruppe',     icon: UsersIcon,         color: '#C9A84C', visibleInInbox: false },
]

export function getChannelDef(kanal: ChatKanal): ChatChannelDef {
  return CHAT_KANAELE.find(c => c.id === kanal) ?? CHAT_KANAELE[0]
}
