'use server'

// Task 5: QR-Server-Action fuer /flow/[token]-Links.
// Gleicher Generator wie promo/page.tsx: generateQrCodeSvg aus @/lib/kanzlei/qr-code.

import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

export async function qrSvgFuerToken(
  token: string,
): Promise<{ ok: true; svg: string; url: string } | { ok: false; error: string }> {
  await requirePortalAccess(['werkstatt'])
  if (!token) return { ok: false, error: 'Kein Token' }
  const url = `${APP_URL}/flow/${token}`
  const svg = await generateQrCodeSvg(url, 300)
  return { ok: true, svg, url }
}
