'use client'

// AAR-162 / W2: Kommunikations-Tab — dünner Wrapper um MultiChannelChat.
// Der Chat-Component existiert bereits (AAR-129 Chat-Gruppe). Wir nutzen die
// Fall-ID aus dem Context als Primärschlüssel für die Chat-Gruppe.

import { useFall } from '../FallContext'

// Platzhalter: MultiChannelChat-Integration folgt sobald der entsprechende
// Component-Pfad verifiziert ist. Der W2-Scope ist die Shell/Tabs; das
// Verkabeln des Chats kommt mit W5 (Cross-Portal-Verkabelung).

export default function KommunikationTab() {
  const { fall } = useFall()
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">Kommunikation</h2>
      <p className="text-xs text-gray-500">
        Multi-Channel-Chat (WhatsApp / SMS / Email / Interner Chat / Portal) —
        Integration folgt in W5. Fall-ID: <code className="text-[10px]">{fall.id.slice(0, 8)}</code>
      </p>
    </div>
  )
}
