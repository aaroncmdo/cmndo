// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { email } from '../tokens'

/** Rechnungs-/Abrechnungs-Positionen: Label links, Betrag rechts, + Gesamt-Zeile.
 *  Tabellen-basiert (Outlook-safe). Ersetzt die alten Section+Text-Flex-Listen. */
export function PositionsTable({
  positionen, gesamt, gesamtLabel = 'Gesamt',
}: { positionen: { bezeichnung: string; betrag: string }[]; gesamt: string; gesamtLabel?: string }) {
  return (
    <div style={{ backgroundColor: email.color.surface, borderRadius: email.radius.md, padding: '16px 20px', margin: `${email.space(4)} 0` }}>
      <table width="100%" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {positionen.map((p, i) => (
            <tr key={i}>
              <td style={{ color: email.color.textBody, fontSize: 13, padding: '6px 0', verticalAlign: 'top' as const }}>{p.bezeichnung}</td>
              <td style={{ color: email.color.textBody, fontSize: 13, fontWeight: 600, textAlign: 'right' as const, whiteSpace: 'nowrap' as const, padding: '6px 0', paddingLeft: 12 }}>{p.betrag}</td>
            </tr>
          ))}
          <tr>
            <td style={{ borderTop: `1px solid ${email.color.border}`, paddingTop: 8, color: email.color.navy, fontSize: 15, fontWeight: 700 }}>{gesamtLabel}</td>
            <td style={{ borderTop: `1px solid ${email.color.border}`, paddingTop: 8, color: email.color.navy, fontSize: 15, fontWeight: 700, textAlign: 'right' as const }}>{gesamt}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
