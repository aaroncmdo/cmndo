// AAR-493 (M11): Wrapper für Makler-Benachrichtigungs-Emails. Nutzt den
// zentralen Resend-Client (src/lib/email/resend-client.ts). Wenn
// RESEND_API_KEY nicht gesetzt ist, wird die Funktion zum No-Op — so
// kann der Cron in lokalen Dev-Umgebungen ohne Secrets laufen.

import { resend, isResendAvailable } from './resend-client'
import {
  ProvisionReleasedEmail,
  subject as provisionReleasedSubject,
} from './google/templates/ProvisionReleased'

const FROM_ADDRESS = 'Claimondo <noreply@claimondo.de>'

export type ProvisionReleasePayload = {
  to: string
  vorname: string | null
  fallNummer: string | null
  kundeName: string | null
  betrag: number
  serviceTyp: 'komplett' | 'nur_gutachter'
}

export async function sendProvisionReleaseEmail(
  p: ProvisionReleasePayload,
): Promise<{ sent: boolean; error?: string }> {
  if (!isResendAvailable() || !resend) {
    return { sent: false, error: 'resend_unavailable' }
  }

  const templateProps = {
    vorname: p.vorname,
    fallNummer: p.fallNummer,
    kundeName: p.kundeName,
    betrag: p.betrag,
    serviceTyp: p.serviceTyp,
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: p.to,
    subject: provisionReleasedSubject(templateProps),
    react: ProvisionReleasedEmail(templateProps),
  })

  if (error) return { sent: false, error: error.message }
  return { sent: true }
}
