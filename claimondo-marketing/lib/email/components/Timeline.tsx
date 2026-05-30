// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { email } from '../tokens'

/** Horizontale Fortschritts-Timeline; currentIndex = aktiver Schritt (ondo), erledigte = success, offene = muted. */
export function Timeline({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return (
    <table width="100%" style={{ borderCollapse: 'collapse', margin: `${email.space(4)} 0` }}>
      <tbody><tr>
        {steps.map((s, i) => {
          const color = i < currentIndex ? email.color.success : i === currentIndex ? email.color.ondo : '#c7cdd6'
          return (
            <td key={i} style={{ textAlign: 'center' as const, verticalAlign: 'top' as const }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color, margin: '0 auto 6px' }} />
              <div style={{ fontSize: 11, fontWeight: i === currentIndex ? 700 : 400, color: i === currentIndex ? email.color.navy : email.color.textMuted }}>{s}</div>
            </td>
          )
        })}
      </tr></tbody>
    </table>
  )
}
