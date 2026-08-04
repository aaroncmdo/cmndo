import type { Metadata } from 'next'
import { MaklerRegistrierenClient } from './MaklerRegistrierenClient'
import { getGesellschaftOptions } from '@/lib/makler/gesellschaft'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Makler-Partner werden | Claimondo',
  description:
    'Registrieren Sie sich kostenlos als Makler-Partner bei Claimondo. ' +
    'Sofort startklar mit Ihrer eigenen Empfehlungs-Landeseite für Ihre Kunden.',
}

export default async function MaklerRegistrierenPage({
  searchParams,
}: {
  searchParams: Promise<{ werber?: string; einladung?: string }>
}) {
  const { werber, einladung } = await searchParams
  const werberCode = (werber ?? '').trim() || null

  // Optionaler Trust-Hinweis: Firma des aktiven Werbers server-seitig auflösen (non-fatal).
  let werberFirma: string | null = null
  if (werberCode) {
    try {
      const admin = createAdminClient()
      const { data: pc } = await admin
        .from('promotion_codes')
        .select('makler_id')
        .eq('code', werberCode)
        .eq('aktiv', true)
        .maybeSingle()
      if (pc?.makler_id) {
        const { data: m } = await admin
          .from('makler')
          .select('firma, status, provision_aktiv')
          .eq('id', pc.makler_id)
          .maybeSingle()
        if (m && m.status === 'aktiv' && m.provision_aktiv) werberFirma = m.firma ?? null
      }
    } catch {
      /* non-fatal */
    }
  }

  const { versicherungen, maklerpools } = await getGesellschaftOptions()
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo">
            Makler-Partnerprogramm
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Makler-Partner werden
          </h1>
          <p className="mt-3 text-sm text-claimondo-shield">
            Kostenlos registrieren — sofort startklar mit Ihrer eigenen Empfehlungs-Landeseite.
          </p>
        </div>
        <MaklerRegistrierenClient
          einladung={einladung}
          versicherungen={versicherungen}
          maklerpools={maklerpools}
          werber={werberCode}
          werberFirma={werberFirma}
        />
      </div>
    </div>
  )
}
