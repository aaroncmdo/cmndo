// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

import { EmailShell, MailHeader, Card, Paragraph, InfoRow, Button, Footer } from '../../components'
import { email } from '../../tokens'

export type PartnerOnboardingEinladungProps = {
  firma: string | null
  ansprechpartner: string | null
  zeitpunktText: string
  kanal: 'online' | 'vor_ort'
  videoLink: string | null
  treffpunktAdresse: string | null
}

export function PartnerOnboardingEinladung(props: PartnerOnboardingEinladungProps) {
  const { firma, ansprechpartner, zeitpunktText, kanal, videoLink, treffpunktAdresse } = props

  const anrede = `Guten Tag${ansprechpartner ? ' ' + ansprechpartner : ''},`
  const firmaText = firma ? ` für ${firma}` : ''

  return (
    <EmailShell preview="Ihr Onboarding-Termin bei Claimondo ist bestätigt.">
      <MailHeader />
      <Card>
        <Paragraph>{anrede}</Paragraph>

        <Paragraph>
          wir freuen uns auf Ihr Onboarding-Gespräch mit Claimondo{firmaText}. Nachfolgend finden
          Sie alle Details zu Ihrem Termin:
        </Paragraph>

        <div style={{ backgroundColor: email.color.surface, borderRadius: email.radius.md, padding: `${email.space(3)} ${email.space(4)}`, margin: `${email.space(3)} 0` }}>
          <InfoRow label="Zeitpunkt" value={zeitpunktText} />
          <InfoRow label="Dauer" value="30 Minuten" />
          <InfoRow label="Format" value={kanal === 'online' ? 'Video-Call' : 'Vor Ort'} />
          {kanal === 'vor_ort' && treffpunktAdresse && (
            <InfoRow label="Adresse" value={treffpunktAdresse} />
          )}
        </div>

        {kanal === 'online' && (
          videoLink ? (
            <>
              <Paragraph>
                Klicken Sie zum Zeitpunkt des Termins auf den folgenden Button, um dem Video-Call
                beizutreten:
              </Paragraph>
              <Button href={videoLink}>Video-Call beitreten</Button>
            </>
          ) : (
            <Paragraph>
              Den Video-Call-Link erhalten Sie separat per Kalendereinladung.
            </Paragraph>
          )
        )}

        {kanal === 'vor_ort' && !treffpunktAdresse && (
          <Paragraph>
            Den genauen Treffpunkt teilen wir Ihnen vorab mit.
          </Paragraph>
        )}

        <Paragraph>
          Die Kalendereinladung (.ics) finden Sie im Anhang dieser E-Mail — so können Sie den
          Termin direkt in Ihren Kalender importieren.
        </Paragraph>

        <Paragraph>
          Bei Fragen erreichen Sie uns jederzeit unter{' '}
          <a href="mailto:partner@claimondo.de" style={{ color: email.color.ondo }}>
            partner@claimondo.de
          </a>
          .
        </Paragraph>

        <Paragraph>
          Wir freuen uns auf das Gespräch!<br />
          Ihr Claimondo-Team
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
