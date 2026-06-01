// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Text, Link } from '@react-email/components'
import type { ReactNode } from 'react'
import { email } from '../tokens'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div style={{ backgroundColor: email.color.surface, borderLeft: `3px solid ${email.color.ondo}`, borderRadius: email.radius.sm, padding: `${email.space(3)} ${email.space(4)}`, margin: `${email.space(4)} 0` }}>
      <Text style={{ margin: 0, color: email.color.textBody, ...email.font.body }}>{children}</Text>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={{ margin: `${email.space(2)} 0 0`, fontSize: 12, color: email.color.textMuted, fontStyle: 'italic' as const, lineHeight: '18px' }}>{children}</Text>
}

export function Trustbar({ items }: { items: string[] }) {
  return (
    <Text style={{ margin: `${email.space(4)} 0 0`, textAlign: 'center' as const, color: email.color.textMuted, fontSize: 12 }}>
      {items.map((it, i) => (
        <span key={i}>{i > 0 && ' · '}<span style={{ color: email.color.success, fontWeight: 700 }}>&#10003;</span> {it}</span>
      ))}
    </Text>
  )
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <table width="100%" style={{ borderCollapse: 'collapse', margin: '4px 0' }}><tbody><tr>
      <td style={{ width: 90, color: email.color.textMuted, fontSize: 13 }}>{label}</td>
      <td style={{ fontSize: 13, color: email.color.navy }}>{value}</td>
    </tr></tbody></table>
  )
}

export function Footer({ onDark = false }: { onDark?: boolean }) {
  const c = onDark ? '#8aa0bd' : email.color.textMuted
  return (
    <div style={{ textAlign: 'center' as const, padding: `${email.space(5)} ${email.space(3)} ${email.space(1)}` }}>
      <Text style={{ margin: 0, fontSize: 11, lineHeight: '18px', color: c }}>
        Claimondo GmbH &middot; <Link href={`${APP_URL}/impressum`} style={{ color: c, textDecoration: 'underline' }}>Impressum</Link> &middot; <Link href={`${APP_URL}/datenschutz`} style={{ color: c, textDecoration: 'underline' }}>Datenschutz</Link>
      </Text>
      <Text style={{ margin: '6px 0 0', fontSize: 11, color: c }}>Vollständige Schadensregulierung — auf Augenhöhe</Text>
    </div>
  )
}
