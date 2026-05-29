// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Img, Text } from '@react-email/components'
import { email } from '../tokens'

export function BeraterCard({ name, photoUrl, contact }: { name: string; photoUrl: string | null; contact: string }) {
  return (
    <div style={{ backgroundColor: email.color.cream, border: `1px solid ${email.color.creamBorder}`, borderRadius: email.radius.lg, padding: `${email.space(4)} ${email.space(4)}`, margin: `${email.space(5)} 0` }}>
      <table width="100%" style={{ borderCollapse: 'collapse' }}><tbody><tr>
        {photoUrl && (
          <td style={{ width: 54, verticalAlign: 'middle' as const }}>
            <Img src={photoUrl} alt={name} width={52} height={52} style={{ width: 52, height: 52, borderRadius: '50%', display: 'block' }} />
          </td>
        )}
        <td style={{ verticalAlign: 'middle' as const, paddingLeft: photoUrl ? email.space(4) : 0 }}>
          <Text style={{ margin: 0, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '1.2px', color: email.color.goldOnLight, fontWeight: 700 }}>Ihr persönlicher Ansprechpartner</Text>
          <Text style={{ margin: '2px 0', fontSize: 16, fontWeight: 800, color: email.color.navy }}>{name}</Text>
          <Text style={{ margin: 0, fontSize: 13, color: email.color.textBody }}>{contact}</Text>
        </td>
      </tr></tbody></table>
    </div>
  )
}
