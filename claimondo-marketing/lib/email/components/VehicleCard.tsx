// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Img, Text } from '@react-email/components'
import { email } from '../tokens'

/** Glas-gefasste Fahrzeug-Karte. imageUrl = generiertes/imagin-Render (P1b liefert die URL). */
export function VehicleCard({ imageUrl, label, value }: { imageUrl: string; label: string; value: string }) {
  return (
    <div style={{ maxWidth: 420, margin: `${email.space(3)} auto 0`, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: email.radius.xl + 4, padding: `${email.space(5)} ${email.space(5)} ${email.space(4)}` }}>
      <Img src={imageUrl} alt={value} width="100%" style={{ width: '100%', height: 'auto', display: 'block' }} />
      <table width="100%" style={{ borderCollapse: 'collapse', borderTop: '1px solid rgba(255,255,255,0.16)', marginTop: email.space(2), paddingTop: email.space(2) }}>
        <tbody><tr>
          <td style={{ color: email.color.white, fontSize: 13, fontWeight: 700 }}>{label}</td>
          <td style={{ color: '#dce7f4', fontSize: 13, textAlign: 'right' as const }}>{value}</td>
        </tr></tbody>
      </table>
    </div>
  )
}
