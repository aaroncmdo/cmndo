import { Section, Text, Link } from '@react-email/components'
import { EmailLayout, Heading, Paragraph, Button, NAVY, ONDO, type EmailBrand } from './layout'

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
    <EmailLayout preview={`Claimondo benötigt noch Unterlagen von Ihnen — Jetzt hochladen`} brand={brand}>
      <Heading brand={brand}>Hallo {vorname},</Heading>

      <Paragraph>
        für die Bearbeitung Ihres Schadenfalls benötigen wir noch folgende Unterlagen von Ihnen.
        Bitte laden Sie diese über den sicheren Link am Ende dieser E-Mail hoch — das dauert nur wenige Minuten.
      </Paragraph>

      {/* Dokument-Liste */}
      <Section style={{ backgroundColor: '#f8f9fb', borderRadius: 12, padding: '16px 20px', margin: '20px 0', border: '1px solid #e5e7eb' }}>
        <Text style={{ color: NAVY, fontSize: 13, fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
          Angeforderte Dokumente
        </Text>
        {slots.map((slot, i) => (
          <Text key={i} style={{ color: '#374151', fontSize: 14, margin: '6px 0', lineHeight: '20px', display: 'flex' }}>
            <span style={{ color: ONDO, fontWeight: 700, marginRight: 10 }}>✓</span>
            {slot.label}
          </Text>
        ))}
      </Section>

      <Paragraph>
        Klicken Sie auf den Button, um direkt zu Ihrer sicheren Upload-Seite zu gelangen:
      </Paragraph>

      <Button href={uploadUrl} brand={brand}>Unterlagen jetzt hochladen</Button>

      {/* Ablauf-Hinweis */}
      <Section style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: '12px 16px', margin: '8px 0 20px', border: '1px solid #fde68a' }}>
        <Text style={{ color: '#92400e', fontSize: 12, margin: 0, lineHeight: '18px' }}>
          ⏰ <strong>Hinweis:</strong> Dieser Upload-Link ist <strong>7 Tage</strong> gültig.
          Nach Ablauf wenden Sie sich bitte an Ihre/n Claimondo-BetreuerIn.
        </Text>
      </Section>

      <Paragraph>
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
      </Paragraph>
      <Text style={{ fontSize: 11, color: '#6b7280', wordBreak: 'break-all' as const, margin: '0 0 16px' }}>
        <Link href={uploadUrl} style={{ color: ONDO }}>{uploadUrl}</Link>
      </Text>

      <Paragraph>
        Bei Rückfragen stehen wir Ihnen jederzeit zur Verfügung.
      </Paragraph>
      <Text style={{ color: '#374151', fontSize: 14, margin: '16px 0 0' }}>
        Mit freundlichen Grüßen,<br />
        <strong style={{ color: NAVY }}>Ihr Claimondo-Team</strong>
      </Text>
    </EmailLayout>
  )
}
