// Token-Audit-Skip: Email-Template inline-HTML mit raw Hex-Farben (#0D1B3E etc.)
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//   Email-Clients unterstuetzen kein Tailwind/CSS-Custom-Properties.

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type AlertEmailItem = {
  title: string
  status: string
  detail: string
}

export function buildHealthAlertEmailHtml(items: AlertEmailItem[]): string {
  const statusColor = (status: string): string => {
    if (status === 'crit' || status === 'error') return '#B91C1C'
    if (status === 'warn') return '#92400E'
    return '#166534'
  }

  const statusLabel = (status: string): string => {
    if (status === 'crit') return 'KRITISCH'
    if (status === 'error') return 'FEHLER'
    if (status === 'warn') return 'WARNUNG'
    return 'OK'
  }

  const rows = items
    .map(item => {
      const color = statusColor(item.status)
      const label = statusLabel(item.status)
      const safeTitle = escapeHtml(item.title)
      const safeDetail = escapeHtml(item.detail)
      const safeLabel = escapeHtml(label)
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-family:sans-serif;font-size:14px;font-weight:600;color:#111827;">
            ${safeTitle}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-family:sans-serif;font-size:12px;font-weight:700;color:${color};white-space:nowrap;">
            ${safeLabel}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-family:sans-serif;font-size:13px;color:#374151;">
            ${safeDetail}
          </td>
        </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f9fb;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#0D1B3E;padding:24px 32px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">
                Claimondo Pipeline-Health
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:#7BA3CC;">
                Automatische Benachrichtigung — Statusverschlechterung erkannt
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f8f9fb;">
                    <th style="padding:10px 16px;text-align:left;font-family:sans-serif;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #E5E7EB;">
                      Check
                    </th>
                    <th style="padding:10px 16px;text-align:left;font-family:sans-serif;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #E5E7EB;">
                      Status
                    </th>
                    <th style="padding:10px 16px;text-align:left;font-family:sans-serif;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #E5E7EB;">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 24px;">
              <a href="https://app.claimondo.de/admin/health"
                 style="display:inline-block;background:#4573A2;color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">
                Dashboard öffnen →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fb;padding:16px 32px;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-family:sans-serif;font-size:12px;color:#9CA3AF;">
                Diese E-Mail wurde automatisch von Claimondo gesendet. Bitte nicht antworten.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
