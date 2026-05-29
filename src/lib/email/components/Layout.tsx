// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Html, Head, Body, Container, Text } from '@react-email/components'
import type { ReactNode, CSSProperties } from 'react'
import { email } from '../tokens'

export type EmailBrand = {
  primary: string; secondary: string; logoUrl: string | null; firmenname: string | null
} | null | undefined

export function EmailShell({
  children, preview, backgroundUrl, dark = false,
}: { children: ReactNode; preview?: string; backgroundUrl?: string | null; dark?: boolean }) {
  // dark = dunkler Hero ohne (noch) gebackenes Hintergrundbild (P1b liefert das Bild nach).
  // Backdrop liegt auf einer EIGENEN Full-Bleed-Tabelle (nicht auf <Body>): react-email
  // kopiert den Body-Style auf ein internes Wrapper-<td> ohne Klasse, das die Dark-Mode-
  // Regel dann nicht mehr erreichen wuerde. Inline-bg greift auch wenn <style> gestrippt
  // wird (Gmail); die @media/[data-ogsb]-Regel schlaegt das Inline per !important.
  const isDark = !!backgroundUrl || dark
  const bgClass = isDark ? 'cl-bg-dark' : 'cl-bg-light'
  const bgInline: CSSProperties = backgroundUrl
    ? { backgroundColor: email.color.navy, backgroundImage: `url('${backgroundUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: isDark ? email.color.navy : email.color.surface }
  return (
    <Html lang="de">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        {/* Dark-Mode "Marke schuetzen": destruktive Auto-Inversion verhindern, Brand-
            Farben pinnen. Apple Mail respektiert @media (prefers-color-scheme); Outlook
            nutzt [data-ogsc] (Text) / [data-ogsb] (Hintergrund). !important schlaegt die
            Inline-Styles. Class-Hooks: cl-bg-light/cl-bg-dark (Backdrop), cl-surface
            (weisse Boxen bleiben weiss), cl-cream, cl-wordmark, cl-footer.
            (Gmail-App strippt <style> -> Inline-Fallback haelt den Hellmodus.) */}
        <style>{`
          body { font-family: ${email.font.stack}; }
          a { color: inherit; }
          @media (prefers-color-scheme: dark) {
            .cl-bg-light { background-color: ${email.color.navy} !important; }
            .cl-surface { background-color: ${email.color.white} !important; }
            .cl-cream { background-color: ${email.color.cream} !important; border-color: ${email.color.creamBorder} !important; }
            .cl-wordmark { color: ${email.color.white} !important; }
            .cl-footer p, .cl-footer a { color: ${email.color.footerOnDark} !important; }
          }
          [data-ogsb] .cl-bg-light { background-color: ${email.color.navy} !important; }
          [data-ogsb] .cl-bg-dark { background-color: ${email.color.navy} !important; }
          [data-ogsb] .cl-surface { background-color: ${email.color.white} !important; }
          [data-ogsb] .cl-cream { background-color: ${email.color.cream} !important; }
          [data-ogsc] .cl-cream { border-color: ${email.color.creamBorder} !important; }
          [data-ogsc] .cl-wordmark { color: ${email.color.white} !important; }
          [data-ogsc] .cl-footer p, [data-ogsc] .cl-footer a { color: ${email.color.footerOnDark} !important; }
        `}</style>
      </Head>
      <Body style={{ margin: 0, padding: 0 }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} className={bgClass} style={{ borderCollapse: 'collapse', ...bgInline }}>
          <tbody><tr><td style={{ padding: 0 }}>
            {/* Preheader: versteckt + Spacer, damit kein Folgetext in die Inbox-Vorschau leakt */}
            <div style={{ display: 'none', overflow: 'hidden', lineHeight: '1px', maxHeight: 0, maxWidth: 0, opacity: 0 }}>
              {preview}{' ‌'.repeat(80)}
            </div>
            <Container style={{ maxWidth: email.maxWidth, margin: '0 auto', padding: `${email.space(7)} ${email.space(5)}` }}>
              {children}
            </Container>
          </td></tr></tbody>
        </table>
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
