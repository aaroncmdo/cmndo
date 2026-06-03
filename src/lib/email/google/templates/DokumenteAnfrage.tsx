// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { Section, Text, Link } from '@react-email/components'
import { email } from '../../tokens'
import { type EmailBrand } from './layout'

// AAR-352: Dokumente-Upload-Anfrage Email — Dispatch sendet Link an Kunden.

type Slot = { label: string }

type Props = {
  vorname: string
  slots: Slot[]
  uploadUrl: string
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Caller)
  brand?: EmailBrand
}

export function subject(p: Props) {
  return `${p.vorname}, wir benötigen noch Ihre Unterlagen`
}

export function DokumenteAnfrageEmail({ vorname, slots, uploadUrl, brand }: Props) {
  return (
    <EmailShell preview="Claimondo benötigt noch Unterlagen von Ihnen — Jetzt hochladen" dark>
      <Hero logoUrl={brand?.logoUrl ?? null} logoText={brand?.firmenname ?? undefined} headline={`Hallo ${vorname},`} />
      <Card>
        <Paragraph>
          für die Bearbeitung Ihres Schadenfalls benötigen wir noch folgende Unterlagen von Ihnen.
          Bitte laden Sie diese über den sicheren Link am Ende dieser E-Mail hoch — das dauert nur wenige Minuten.
        </Paragraph>

        {/* Angeforderte Dokumente */}
        <Section style={{ backgroundColor: email.color.surface, borderRadius: email.radius.md, padding: '16px 20px', margin: `${email.space(4)} 0`, border: `1px solid ${email.color.border}` }}>
          <Text style={{ color: email.color.navy, fontSize: 13, fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
            Angeforderte Dokumente
          </Text>
          {slots.map((slot, i) => (
            <Text key={i} style={{ color: email.color.textBody, fontSize: 14, margin: '6px 0', lineHeight: '20px' }}>
              <span style={{ color: email.color.ondo, fontWeight: 700, marginRight: 10 }}>✓</span>{slot.label}
            </Text>
          ))}
        </Section>

        <Paragraph>
          Klicken Sie auf den Button, um direkt zu Ihrer sicheren Upload-Seite zu gelangen:
        </Paragraph>

        <Button href={uploadUrl} bg={brand?.primary}>Unterlagen jetzt hochladen</Button>

        {/* Ablauf-Hinweis (amber = semantische Warnung) */}
        <Section style={{ backgroundColor: '#fffbeb', borderRadius: email.radius.sm, padding: '12px 16px', margin: `${email.space(2)} 0 ${email.space(4)}`, border: '1px solid #fde68a' }}>
          <Text style={{ color: '#92400e', fontSize: 12, margin: 0, lineHeight: '18px' }}>
            ⏰ <strong>Hinweis:</strong> Dieser Upload-Link ist <strong>7 Tage</strong> gültig.
            Nach Ablauf wenden Sie sich bitte an Ihre/n Claimondo-BetreuerIn.
          </Text>
        </Section>

        <Paragraph>
          Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
        </Paragraph>
        <Text style={{ fontSize: 11, color: email.color.textMuted, wordBreak: 'break-all' as const, margin: '0 0 16px' }}>
          <Link href={uploadUrl} style={{ color: email.color.ondo }}>{uploadUrl}</Link>
        </Text>

        <Paragraph>Bei Rückfragen stehen wir Ihnen jederzeit zur Verfügung.</Paragraph>
        <Text style={{ color: email.color.textBody, fontSize: 14, margin: '16px 0 0' }}>
          Mit freundlichen Grüßen,<br />
          <strong style={{ color: email.color.navy }}>Ihr Claimondo-Team</strong>
        </Text>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
