// claimondo-marketing/lib/email/google/sv-basic-claim-email.ts
// SV-Basic-Claim: Passwort-Setzen-Link fuer selbst-beanspruchende SVs.
// Eigentumsnachweis-Mail nach erfolgreichem beanspracheSvLead. Der SV erhaelt
// seinen Recovery-Link damit er sein Passwort setzen kann. Kein Branding hier
// (kein SV-Context im Claim-Moment). Non-critical caller (kein throw).

import { render } from '@react-email/render'
import { sendEmail } from './client'
import { SvBasicClaimLinkEmail, subject as svBasicClaimLinkSubject } from './templates/SvBasicClaimLink'

export async function sendSvBasicClaimLink({
  to,
  vorname,
  actionUrl,
}: {
  to: string
  vorname: string | null
  actionUrl: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const props = { vorname, actionUrl }
    const html = await render(SvBasicClaimLinkEmail(props))
    await sendEmail({
      to,
      subject: svBasicClaimLinkSubject(props),
      html,
      fallId: null,
      empfaengerTyp: 'sv',
      template: 'sv_basic_claim_link',
    })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Email-Versand fehlgeschlagen',
    }
  }
}
