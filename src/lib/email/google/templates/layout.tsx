import { Html, Head, Body, Container, Section, Img, Text, Hr, Link } from '@react-email/components'
import type { ReactNode } from 'react'

const NAVY = '#0D1B3E'
const ONDO = '#4573A2'
const SHIELD = '#1E3A5F'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'

export function EmailLayout({ children, preview }: { children: ReactNode; preview?: string }) {
  return (
    <Html lang="de">
      <Head>
        <style>{`
          body { font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        `}</style>
      </Head>
      <Body style={{ backgroundColor: '#f4f5f7', margin: 0, padding: 0 }}>
        {preview && <Text style={{ display: 'none' }}>{preview}</Text>}
        <Container style={{ maxWidth: 580, margin: '0 auto', padding: '32px 16px' }}>
          {/* Header */}
          <Section style={{ backgroundColor: NAVY, borderRadius: '16px 16px 0 0', padding: '24px 32px' }}>
            <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
              Claimondo
            </Text>
          </Section>

          {/* Content */}
          <Section style={{ backgroundColor: '#ffffff', padding: '32px', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ backgroundColor: '#f9fafb', borderRadius: '0 0 16px 16px', padding: '20px 32px', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
            <Text style={{ color: '#9ca3af', fontSize: 11, margin: 0, textAlign: 'center' as const }}>
              Claimondo GmbH &middot; <Link href={`${APP_URL}/impressum`} style={{ color: '#9ca3af' }}>Impressum</Link> &middot; <Link href={`${APP_URL}/datenschutz`} style={{ color: '#9ca3af' }}>Datenschutz</Link>
            </Text>
            <Text style={{ color: '#9ca3af', fontSize: 11, margin: '4px 0 0', textAlign: 'center' as const }}>
              Diese E-Mail wurde automatisch versendet. Bei Fragen antworten Sie nicht auf diese E-Mail, sondern kontaktieren Sie uns ueber das Portal.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={{ color: NAVY, fontSize: 20, fontWeight: 700, margin: '0 0 16px', lineHeight: '28px' }}>{children}</Text>
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={{ color: '#374151', fontSize: 14, lineHeight: '22px', margin: '0 0 12px' }}>{children}</Text>
}

export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '24px 0' }}>
      <Link href={href} style={{
        display: 'inline-block', backgroundColor: ONDO, color: '#ffffff', padding: '14px 28px',
        borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none',
      }}>
        {children}
      </Link>
    </Section>
  )
}

export function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <Section style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '16px 20px', margin: '16px 0' }}>
      {rows.map(([label, value], i) => (
        <Text key={i} style={{ color: '#374151', fontSize: 13, margin: '4px 0', lineHeight: '20px' }}>
          <span style={{ color: '#6b7280' }}>{label}:</span> <strong>{value}</strong>
        </Text>
      ))}
    </Section>
  )
}

export function Divider() {
  return <Hr style={{ borderColor: '#e5e7eb', margin: '20px 0' }} />
}

export { NAVY, ONDO, SHIELD, APP_URL }
