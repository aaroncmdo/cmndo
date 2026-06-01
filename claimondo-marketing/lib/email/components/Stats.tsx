// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import type { ReactNode } from 'react'
import { email } from '../tokens'

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span style={{ backgroundColor: '#eaf1f8', color: '#2c5d8f', fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: email.radius.pill }}>
      &#9679;&nbsp;{children}
    </span>
  )
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <td style={{ width: '50%', padding: 5, verticalAlign: 'top' as const }}>
      <div style={{ backgroundColor: email.color.surface, border: `1px solid ${email.color.border}`, borderRadius: email.radius.md, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: '#9aa3b2', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: email.color.navy, marginTop: 3 }}>{value}</div>
      </div>
    </td>
  )
}

/** 2-spaltiges Kachel-Raster (tabellen-basiert, Outlook-safe). Nur Items mit value werden gerendert. */
export function StatGrid({ items }: { items: { label: string; value: string | null | undefined }[] }) {
  const rows: { label: string; value: string }[][] = []
  const shown = items.filter((i): i is { label: string; value: string } => Boolean(i.value))
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2))
  return (
    <table width="100%" style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((pair, r) => (
          <tr key={r}>
            <StatTile label={pair[0].label} value={pair[0].value} />
            {pair[1] ? <StatTile label={pair[1].label} value={pair[1].value} /> : <td style={{ width: '50%' }} />}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
