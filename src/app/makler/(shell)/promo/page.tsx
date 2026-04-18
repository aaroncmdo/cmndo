// AAR-491 (M9): Promo & QR-Code-Seite für Makler. Zeigt Promo-Code +
// Landing-Link + QR + Share-Buttons + Tracking-Stats + Landing-Preview.

import QRCode from 'qrcode'
import { redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerPrimaryPromoCode,
  getPromoStats,
} from '@/lib/makler/queries'
import { MaklerPromo } from '@/components/makler/MaklerPromo'
import { MaklerPromoEmpty } from '@/components/makler/MaklerPromoEmpty'

export const dynamic = 'force-dynamic'

function landingBase(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return env.replace(/\/$/, '')
  return 'https://claimondo.de'
}

async function buildQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    width: 300,
    margin: 2,
    color: { dark: '#0D1B3E', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  })
}

export default async function PromoPage() {
  const makler = await getCurrentMakler()
  if (!makler) redirect('/login')

  const code = await getMaklerPrimaryPromoCode(makler.id)
  if (!code) {
    return <MaklerPromoEmpty firma={makler.firma} />
  }

  const stats = await getPromoStats(code.id)
  const landingUrl = `${landingBase()}/?p=${encodeURIComponent(code.code)}`
  const qrSvg = await buildQrSvg(landingUrl)

  return (
    <MaklerPromo
      code={code.code}
      landingUrl={landingUrl}
      qrSvg={qrSvg}
      stats={stats}
      firma={makler.firma}
    />
  )
}
