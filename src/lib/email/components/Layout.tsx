// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Html, Head, Body, Container, Text } from '@react-email/components'
import type { ReactNode } from 'react'
import { email } from '../tokens'

export type EmailBrand = {
  primary: string; secondary: string; logoUrl: string | null; firmenname: string | null
} | null | undefined

export function EmailShell({
  children, preview, backgroundUrl,
}: { children: ReactNode; preview?: string; backgroundUrl?: string | null }) {
  const bgStyle = backgroundUrl
    ? { backgroundColor: email.color.navy, backgroundImage: `url('${backgroundUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: email.color.surface }
  return (
    <Html lang="de">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{`body{font-family:${email.font.stack};} a{color:inherit;}`}</style>
      </Head>
      <Body style={{ margin: 0, padding: 0, ...bgStyle }}>
        {/* Preheader: versteckt + Spacer, damit kein Folgetext in die Inbox-Vorschau leakt */}
        <div style={{ display: 'none', overflow: 'hidden', lineHeight: '1px', maxHeight: 0, maxWidth: 0, opacity: 0 }}>
          {preview}{' ‌'.repeat(80)}
        </div>
        <Container style={{ maxWidth: email.maxWidth, margin: '0 auto', padding: `${email.space(7)} ${email.space(5)}` }}>
          {children}
        </Container>
      </Body>
    </Html>
  )
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={{ color: email.color.navy, margin: `0 0 ${email.space(4)}`, ...email.font.h2 }}>{children}</Text>
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={{ color: email.color.textBody, margin: `0 0 ${email.space(3)}`, ...email.font.body }}>{children}</Text>
}
