// Token-Audit-Skip: react-email-Template braucht inline-hex (Email-Clients unterstützen keine CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Html, Head, Body, Container, Section, Text, Hr, Link } from '@react-email/components'
import * as React from 'react'

export function ColdMailShell({ bodyHtml, abmeldeUrl }: { bodyHtml: string; abmeldeUrl: string }) {
  return (
    <Html lang="de">
      <Head />
      <Body style={{ backgroundColor: '#f8f9fb', margin: 0, fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' }}>
          <Section style={{ padding: '24px 32px 8px', color: '#0D1B3E' }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: '#0D1B3E', margin: 0 }}>
              Claimondo Partnernetzwerk
            </Text>
          </Section>
          <Section style={{ padding: '8px 32px 24px', color: '#0D1B3E', fontSize: '15px', lineHeight: 1.6 }}>
            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </Section>
          <Hr style={{ borderColor: '#e5e8ef', margin: 0 }} />
          <Section style={{ padding: '16px 32px 24px' }}>
            <Text style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>
              Claimondo GmbH · Deutschlands Plattform für Kfz-Schadensregulierung
            </Text>
            <Text style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
              Sie möchten keine weiteren Nachrichten erhalten?{' '}
              <Link href={abmeldeUrl} style={{ color: '#4573A2' }}>Abmelden</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
