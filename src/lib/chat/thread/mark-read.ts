// Chat-Inbox P2: reine Mark-Read-Spezifikation. Liefert die WHERE-Logik; die
// Ausfuehrung kapselt eine injizierte Strategie (Standard- vs. Admin-Client),
// siehe src/components/chat/thread/mark-read-exec.ts.

import type { ChatKanal } from '@/lib/communications/channels'
import type { ChatScope } from './scope'

export type MarkReadSpec =
  | { mode: 'fall'; fallIds: string[]; kanaele: ChatKanal[]; excludeSenderId: string }
  | { mode: 'kanal-empfaenger'; kanal: ChatKanal; empfaengerId: string }

export function buildMarkReadSpec(scope: ChatScope, userId: string): MarkReadSpec {
  if (scope.kind === 'fall') {
    return { mode: 'fall', fallIds: scope.fallIds, kanaele: scope.kanaele, excludeSenderId: userId }
  }
  // KundeKbChat: gelesen wird ueber empfaenger_id=me gekeyt (nicht fall).
  return { mode: 'kanal-empfaenger', kanal: scope.kanal, empfaengerId: userId }
}
