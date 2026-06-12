// Geteilte Team-WhatsApp-Benachrichtigung (Baileys).
// Aaron-Direktive 2026-05-20: feste WA-Empfaenger fuers Team bei Lead-Events.
// 12.06.2026 aus notify-new-lead.ts extrahiert, damit Reservierungs-Notifies
// (AAR-956 Embed) und Lead-Notifies DIESELBE Empfaenger-Quelle teilen statt die
// Nummern zu duplizieren (eine Stelle zum Pflegen).

import { sendWhatsAppText } from './baileys-client'

const WA_TEAM_EMPFAENGER = ['+491633628571', '+4917620289514']

/**
 * Schickt denselben Text an alle Team-WA-Nummern. Non-critical: jeder einzelne
 * Fail wird nur geloggt, die Funktion wirft NIE — der Caller (Lead-/Termin-Anlage)
 * bleibt erfolgreich (AGENTS.md §Server-Actions: Notify-Sub-Ops brechen nie den
 * Status-Update).
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
