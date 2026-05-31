// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import type { ReactNode } from 'react'
import { email } from '../tokens'

/** Bulletproof CTA: VML-roundrect für Outlook (Desktop/Word), <a> für alle anderen. */
export function Button({ href, children, bg = email.color.navy }: { href: string; children: ReactNode; bg?: string }) {
  const label = typeof children === 'string' ? children : ''
  return (
    <div style={{ margin: `${email.space(5)} 0`, textAlign: 'center' as const }}>
      <div dangerouslySetInnerHTML={{ __html:
        `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="24%" fillcolor="${bg}" stroke="f"><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->` }} />
      <a href={href} style={{
        display: 'inline-block', backgroundColor: bg, color: email.color.white,
        padding: `${email.space(4)} ${email.space(8)}`, borderRadius: email.radius.md,
        fontSize: 15, fontWeight: 700, textDecoration: 'none',
        // mso-hide blendet den <a> in Outlook aus (dort greift VML)
        // @ts-expect-error nicht-standard mso-Property für Outlook
        msoHide: 'all',
      }}>{children}</a>
    </div>
  )
}
