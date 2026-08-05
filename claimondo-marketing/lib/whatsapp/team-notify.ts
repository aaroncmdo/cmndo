// SPIEGEL von src/lib/whatsapp/team-notify.ts (Haupt-App) — die Marketing-App ist
// ein eigener Build ohne Zugriff auf src/. Aenderungen (v.a. die Empfaenger-Nummern)
// IMMER in beiden Files nachziehen.
// Hinweis: lib/leads/notify-new-lead.ts traegt die Nummern historisch noch inline —
// Konsolidierung auf diesen Helper erst nach Merge von #4950 (fasst die Datei an).
//
// Geteilte Team-WhatsApp-Benachrichtigung (Baileys).
// Aaron-Direktive 2026-05-20: feste WA-Empfaenger fuers Team bei Lead-Events.

import { sendWhatsAppText } from './baileys-client'

const WA_TEAM_EMPFAENGER = ['+491633628571', '+4917620289514']

/**
 * Schickt denselben Text an alle Team-WA-Nummern. Non-critical: jeder einzelne
 * Fail wird nur geloggt, die Funktion wirft NIE — der Caller (Registrierung/
 * Lead-Anlage) bleibt erfolgreich (AGENTS.md §Server-Actions: Notify-Sub-Ops
 * brechen nie den Status-Update).
 */
export async function notifyTeamWhatsApp(text: string): Promise<void> {
  await Promise.all(
    WA_TEAM_EMPFAENGER.map(async (phone) => {
      const r = await sendWhatsAppText(phone, text)
      if (!r.ok) {
        console.error(`[team-notify] Baileys-WA an ${phone} fehlgeschlagen:`, r.code, r.error)
      }
    }),
  )
}
