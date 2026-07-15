import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'
import { getFahrzeugSchaeden } from '@/lib/flotte/fahrzeug-schaeden'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
import { SectionCard } from '@/components/shared/SectionCard'
import { QrCodeDownloadButtons } from '@/components/shared/QrCodeDownloadButtons'
import EmptyState from '@/components/shared/EmptyState'
import { FahrzeugSchaedenSection } from '@/components/flotte/FahrzeugSchaedenSection'
import { FahrzeugMiniAktionen } from '@/components/flotte/FahrzeugMiniAktionen'
import { CarIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

type KartenRow = { karten_token: string; status: string }

export default async function FahrzeugDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)

  if (!firma) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
        <EmptyState title="Kein Flotten-Konto" description="Diesem Benutzer ist keine Firma zugeordnet." />
      </div>
    )
  }

  const flotte = await getKundeFlotte(db, firma.id)
  const fahrzeug = flotte.find((v) => v.vehicleId === id) ?? null

  if (!fahrzeug) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
        <EmptyState
          icon={CarIcon}
          title="Fahrzeug nicht gefunden"
          description="Dieses Fahrzeug gehört nicht zu Ihrer Flotte oder existiert nicht."
        />
      </div>
    )
  }

  const schaeden = await getFahrzeugSchaeden(db, firma.id, id)

  // Schadenkarte fuer dieses Fahrzeug abfragen (AnyDb — schadenkarten noch nicht in database.types).

  const { data: kartenData } = await db
    .from('schadenkarten')
    .select('karten_token,status')
    .eq('fahrzeug_id', id)
    .eq('status', 'gebunden')
    .maybeSingle()

  const karte = kartenData as KartenRow | null

  const qrSvg = karte
    ? await generateQrCodeSvg(buildSchadenkarteUrl(karte.karten_token), 160)
    : null

  const sanitizedKennzeichen = (fahrzeug.kennzeichen ?? 'fahrzeug').replace(/[^a-zA-Z0-9]/g, '-')

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">
          {fahrzeug.kennzeichen ?? 'Fahrzeug'}
        </h1>
        <p className="mt-1 text-sm text-claimondo-shield">Fahrzeug-Details</p>
        <FahrzeugMiniAktionen />
      </div>

      <SectionCard title="Stammdaten">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-claimondo-shield">Kennzeichen</dt>
            <dd className="font-medium text-claimondo-navy text-right">
              {fahrzeug.kennzeichen ?? '–'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-claimondo-shield">Hersteller</dt>
            <dd className="font-medium text-claimondo-navy text-right">
              {fahrzeug.hersteller ?? '–'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-claimondo-shield">Modell</dt>
            <dd className="font-medium text-claimondo-navy text-right">
              {fahrzeug.modell ?? '–'}
            </dd>
          </div>
          {fahrzeug.notiz && (
            <div className="flex justify-between gap-4">
              <dt className="text-claimondo-shield">Notiz</dt>
              <dd className="font-medium text-claimondo-navy text-right">{fahrzeug.notiz}</dd>
            </div>
          )}
        </dl>
      </SectionCard>

      <FahrzeugSchaedenSection schaeden={schaeden} vehicleId={id} />

      <SectionCard title="Schadenkarte">
        {karte && qrSvg ? (
          <div className="space-y-4">
            <p className="text-sm text-claimondo-navy">
              Karte gebunden:{' '}
              <span className="font-mono font-medium">{karte.karten_token}</span>
              {' '}
              <span className="text-claimondo-shield">({karte.status})</span>
            </p>
            <div className="inline-block rounded-ios-md border border-claimondo-border p-3 bg-white">
              <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
            </div>
            <p className="text-xs text-claimondo-shield">
              QR-Code der Schadenkarte — auf die Karte kleben oder als Ersatz ausdrucken.
            </p>
            <QrCodeDownloadButtons
              qrSvg={qrSvg}
              fileBaseName={`schadenkarte-${sanitizedKennzeichen}`}
            />
          </div>
        ) : (
          <p className="text-sm text-claimondo-shield">Keine Karte gebunden.</p>
        )}
      </SectionCard>
    </div>
  )
}
