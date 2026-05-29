// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import type { ReactNode } from 'react'
import { email } from '../tokens'

/** Weiße, gerundete Content-Karte mit Shadow — der Body-Block einer Tier-1-Mail
 *  (sitzt auf dem dunklen Hero-Hintergrund). */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="cl-surface" style={{
      backgroundColor: email.color.white,
      borderRadius: email.radius.xl,
      boxShadow: '0 20px 50px rgba(10,16,40,0.38)',
      padding: `${email.space(6)} ${email.space(7)}`,
      margin: `${email.space(5)} 0`,
    }}>
      {children}
    </div>
  )
}
