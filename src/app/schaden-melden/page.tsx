import { redirect } from 'next/navigation'
import { isValidPromoCodeFormat, writePromoCookie } from '@/lib/flow/promo-attribution'

// AAR-467 C1: Entry-Point /schaden-melden. Pickt ggf. Promo-Code aus ?p=
// auf (→ Cookie), und leitet dann auf schritt-1 weiter. Ungültige Codes
// werden einfach ignoriert (kein Crash, kein Cookie).

type Props = { searchParams: Promise<{ p?: string }> }

export default async function SchadenMeldenEntry({ searchParams }: Props) {
  const { p } = await searchParams
  if (p && isValidPromoCodeFormat(p)) {
    await writePromoCookie(p)
  }
  redirect('/schaden-melden/schritt-1')
}
