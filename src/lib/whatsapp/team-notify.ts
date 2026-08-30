// Geteilte Team-WhatsApp-Benachrichtigung (Baileys).
// Aaron-Direktive 2026-05-20: feste WA-Empfaenger fuers Team bei Lead-Events.
// 12.06.2026 aus notify-new-lead.ts extrahiert, damit Reservierungs-Notifies
// (AAR-956 Embed) und Lead-Notifies DIESELBE Empfaenger-Quelle teilen statt die
// Nummern zu duplizieren (eine Stelle zum Pflegen).

import { sendWhatsAppText } from './baileys-client'

const WA_TEAM_EMPFAENGER = ['+491633628571', '+4917620289514']

/** Nur Ziffern — die Nummern liegen hier mit '+', der Baileys-Echo liefert sie ohne. */
const nurZiffern = (s: string) => s.replace(/\D/g, '')
const TEAM_ZIFFERN = new Set(WA_TEAM_EMPFAENGER.map(nurZiffern))

/**
 * Ist `phone` eine interne Team-Nummer?
 *
 * Gebraucht vom Baileys-Echo-Pfad (`/api/baileys/inbound`): eine AUSGEHENDE Nachricht an eine
 * Team-Nummer ist eine Benachrichtigung UEBER einen Vorgang, keine Nachricht IM Vorgang. Ohne
 * diese Unterscheidung ordnet der Telefon-Match sie dem Lead des EMPFAENGERS zu (prod 30.08.,
 * 20:12: zwei Team-WAs ueber Lead 5c39b0ac landeten an den Leads 159eac57 und f34c09ce — den
 * Leads, die zufaellig die Empfaenger-Nummern tragen).
 *
 * Bewusst hier und nicht als zweite Liste in der Route: eine Stelle zum Pflegen.
 */
export function istTeamNummer(phone: string | null | undefined): boolean {
  if (!phone) return false
  return TEAM_ZIFFERN.has(nurZiffern(phone))
}

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
