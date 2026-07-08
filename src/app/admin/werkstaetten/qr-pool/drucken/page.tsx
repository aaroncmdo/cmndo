// Druckansicht fuer den QR-Pool: rendert je Code einen QR (/start/werkstatt-qr/<token>)
// + den lesbaren Token darunter, im Schnitt-Grid. Admin druckt -> Sticker.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { DruckenButton } from './DruckenButton'
import { QrCodeDownloads, BulkDownloads } from '@/components/werkstatt/QrPoolDownload'

export const dynamic = 'force-dynamic'

export default async function QrPoolDruckenPage({
  searchParams,
}: {
  searchParams: Promise<{ charge?: string; status?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const { charge, status } = await searchParams
  const admin = createAdminClient()
  let query = admin
    .from('werkstatt_qr_pool')
    .select('id, token')
    .order('created_at', { ascending: true })
    .limit(300)
  if (charge !== undefined && charge !== '') {
    query = query.eq('charge', charge)
  } else {
    query = query.eq('status', status ?? 'frei')
  }
  const { data: codes } = await query

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  const items = await Promise.all(
    (codes ?? []).map(async (c) => ({
      token: c.token as string,
      svg: await generateQrCodeSvg(`${appUrl}/start/werkstatt-qr/${c.token}`, 180),
    })),
  )

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <BulkDownloads tokens={items.map((i) => i.token)} />
        <DruckenButton />
        <span className="text-body-sm text-claimondo-ondo">{items.length} Codes</span>
      </div>
      {items.length === 0 ? (
        <p className="text-body text-claimondo-ondo print:hidden">Keine passenden Codes gefunden.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.token}
              className="flex break-inside-avoid flex-col items-center gap-1 rounded-ios-lg border border-dashed border-claimondo-border p-3"
            >
              <div dangerouslySetInnerHTML={{ __html: it.svg }} />
              <span className="font-mono text-sm text-claimondo-navy">{it.token}</span>
              <div className="mt-1 print:hidden">
                <QrCodeDownloads token={it.token} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
