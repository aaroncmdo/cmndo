// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Text, Link } from '@react-email/components'
import { email } from '../tokens'

/** Liste von Dokument-Download-Links (Label + optionale Meta). Leere Liste → null. */
export function DocumentList({
  items, title,
}: { items: { label: string; url: string; meta?: string }[]; title?: string }) {
  if (!items.length) return null
  return (
    <div style={{ margin: `${email.space(4)} 0 0` }}>
      {title ? <Text style={{ margin: `0 0 ${email.space(2)}`, color: email.color.navy, ...email.font.label }}>{title}</Text> : null}
      <ul style={{ paddingLeft: 20, margin: 0, fontSize: 14, lineHeight: '1.7' }}>
        {items.map((d, i) => (
          <li key={i}>
            <Link href={d.url} style={{ color: email.color.ondo }}>{d.label}</Link>
            {d.meta ? <span style={{ color: email.color.textMuted, fontSize: 12 }}> — {d.meta}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
