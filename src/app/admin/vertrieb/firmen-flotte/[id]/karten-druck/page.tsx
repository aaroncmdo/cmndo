// Druckansicht der Schaden-Karten einer Firma: rendert je ungebundene Karte einen QR
// (/schaden/<token>) + den lesbaren Token darunter, im Schnitt-Grid. Staff druckt -> auf
// vorgedruckte Karten kleben, spaeter ans Fahrzeug binden. Muster: werkstaetten/qr-pool/drucken.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
import { DruckenButton } from './DruckenButton'

export const dynamic = 'force-dynamic'

export default async function KartenDruckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ charge?: string }>
}) {
  const { id } = await params
  const { charge } = await searchParams

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin' && profile?.rolle !== 'dispatch') redirect('/admin')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: firma } = await admin.from('firmen').select('name').eq('id', id).maybeSingle()
  if (!firma) notFound()

  // Nur ungebundene Karten drucken (bestellt/frei) — gebundene sitzen schon auf einem Fahrzeug.
  let query = admin
    .from('schadenkarten')
    .select('karten_token, charge, status')
    .eq('firma_id', id)
    .in('status', ['bestellt', 'frei'])
    .order('erstellt_am', { ascending: true })
    .limit(300)
  if (charge !== undefined && charge !== '') query = query.eq('charge', charge)
  const { data: karten } = await query

  const items = await Promise.all(
    ((karten ?? []) as Array<{ karten_token: string; charge: string | null }>).map(async (k) => ({
      token: k.karten_token,
      charge: k.charge,
      svg: await generateQrCodeSvg(buildSchadenkarteUrl(k.karten_token), 180),
    })),
  )

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <DruckenButton />
        <span className="text-body-sm text-claimondo-ondo">
          {items.length} Karten{charge ? ` · Charge „${charge}"` : ''} · {firma.name as string}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-body text-claimondo-ondo print:hidden">
          Keine ungebundenen Karten. Erst im Firmen-Detail „Karten auf Vorrat erzeugen".
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.token}
              className="flex break-inside-avoid flex-col items-center gap-1 rounded-ios-lg border border-dashed border-claimondo-border p-3"
            >
              <div dangerouslySetInnerHTML={{ __html: it.svg }} />
              <span className="font-mono text-sm text-claimondo-navy">{it.token}</span>
              {it.charge ? <span className="text-caption text-claimondo-ondo/70">{it.charge}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
