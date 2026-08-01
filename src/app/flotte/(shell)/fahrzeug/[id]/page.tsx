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
import { FahrzeugKarteBindClient } from '@/components/flotte/FahrzeugKarteBindClient'
import { FahrzeugStammdatenEditor } from '@/components/flotte/FahrzeugStammdatenEditor'
import { bindeKarteFuerFahrzeug, storniereFahrzeugSchaden, speichereFahrzeugStammdaten, meldeNeuenFlottenSchaden, setzeSchadenEntwurfFort, storniereSchadenEntwurf } from './actions'
import { starteScan, ladeFotoHoch, analysiereZustandsFotos, finalisiereScan } from './zustand-actions'
import { getStorageUrl } from '@/lib/storage/url'
import { PERSPEKTIVE_LABEL } from '@/lib/vehicles/zustand-perspektiven'
import { ZustandsScanWizard } from '@/components/flotte/ZustandsScanWizard'
import { ZustandAmpelBadge } from '@/components/shared/ZustandAmpelBadge'
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

  // ─── Zustandsdoku: letzter abgeschlossener Scan + Fotos + erkannte Vorschaeden ───
  const { data: letzterScan } = await db
    .from('vehicle_scans')
    .select('id, erstellt_am, kilometerstand')
    .eq('vehicle_id', id)
    .eq('status', 'abgeschlossen')
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  const scan = letzterScan as { id: string; erstellt_am: string; kilometerstand: number | null } | null

  const scanFotos: { url: string; label: string }[] = []
  let scanVorschaeden: Array<{ art: string | null; schwere: string | null; beschreibung: string | null }> = []
  if (scan?.id) {
    const { data: fotos } = await db
      .from('vehicle_scan_fotos')
      .select('storage_path, perspektive')
      .eq('scan_id', scan.id)
      .eq('ist_nahaufnahme', false)
      .limit(12)
    for (const f of (fotos ?? []) as Array<{ storage_path: string; perspektive: string }>) {
      const url = await getStorageUrl(db, 'fahrzeug-zustand', f.storage_path, { context: 'ui' })
      if (url) scanFotos.push({ url, label: PERSPEKTIVE_LABEL[f.perspektive] ?? f.perspektive })
    }
    const { data: vs } = await db
      .from('vehicle_vorschaeden')
      .select('art, schwere, beschreibung')
      .eq('scan_id', scan.id)
    scanVorschaeden = (vs ?? []) as typeof scanVorschaeden
  }

  const sanitizedKennzeichen = (fahrzeug.kennzeichen ?? 'fahrzeug').replace(/[^a-zA-Z0-9]/g, '-')

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">
          {fahrzeug.kennzeichen ?? 'Fahrzeug'}
        </h1>
        <p className="mt-1 text-sm text-claimondo-shield">Fahrzeug-Details</p>
        <FahrzeugMiniAktionen vehicleId={id} onMelden={meldeNeuenFlottenSchaden} />
      </div>

      <FahrzeugStammdatenEditor
        vehicleId={id}
        werte={{
          kennzeichen: fahrzeug.kennzeichen,
          hersteller: fahrzeug.hersteller,
          modell: fahrzeug.modell,
          fin: fahrzeug.fin,
          hsn: fahrzeug.hsn,
          tsn: fahrzeug.tsn,
          farbe: fahrzeug.farbe,
          kilometerstand: fahrzeug.kilometerstand,
          notiz: fahrzeug.notiz,
        }}
        onSpeichern={speichereFahrzeugStammdaten}
      />

      <FahrzeugSchaedenSection
        schaeden={schaeden}
        vehicleId={id}
        onStorno={storniereFahrzeugSchaden}
        onEntwurfFortsetzen={setzeSchadenEntwurfFort}
        onEntwurfStornieren={storniereSchadenEntwurf}
      />

      <SectionCard title="Netzwerkkarte">
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
              QR-Code der Netzwerkkarte — auf die Karte kleben oder als Ersatz ausdrucken.
            </p>
            <QrCodeDownloadButtons
              qrSvg={qrSvg}
              fileBaseName={`schadenkarte-${sanitizedKennzeichen}`}
            />
          </div>
        ) : (
          <FahrzeugKarteBindClient vehicleId={id} onBind={bindeKarteFuerFahrzeug} />
        )}
      </SectionCard>

      <SectionCard title="Zustandsdoku">
        <div className="space-y-3">
          {scan ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ZustandAmpelBadge letzterScanAm={scan.erstellt_am} />
                {scan.kilometerstand != null && (
                  <span className="text-caption text-claimondo-ondo/60">
                    {scan.kilometerstand.toLocaleString('de-DE')} km
                  </span>
                )}
              </div>
              {scanFotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {scanFotos.map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={f.url}
                      alt={f.label}
                      className="h-16 w-16 rounded-ios-sm border border-claimondo-border object-cover"
                    />
                  ))}
                </div>
              )}
              {scanVorschaeden.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-caption text-claimondo-ondo/60">Erkannte Vorschäden:</p>
                  {scanVorschaeden.map((v, i) => (
                    <p key={i} className="text-body-sm text-claimondo-navy">
                      • {v.art ?? 'Schaden'}
                      {v.schwere ? ` (${v.schwere})` : ''}
                      {v.beschreibung ? ` — ${v.beschreibung}` : ''}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-body-sm text-claimondo-ondo/60">Keine Vorschäden dokumentiert.</p>
              )}
            </>
          ) : (
            <div className="space-y-1">
              <ZustandAmpelBadge letzterScanAm={null} />
              <p className="text-body-sm text-claimondo-ondo">
                Noch nicht dokumentiert. Erfassen Sie den aktuellen Fahrzeug-Zustand mit einer geführten Fotostrecke.
              </p>
            </div>
          )}
          {/* „Neu dokumentieren" bewusst UNTER der bestehenden Doku (Aaron 24.07.): vehicle_scans
              traegt Historie (page laedt den letzten abgeschlossenen Scan) -> ein neuer Scan ersetzt
              die alte Doku nicht, sondern wird der neue „letzte". Trenner nur wenn schon dokumentiert. */}
          <div className={scan ? 'border-t border-claimondo-border/60 pt-3' : ''}>
            <ZustandsScanWizard
              vehicleId={id}
              bestehendeDoku={!!scan}
              onStart={starteScan}
              onFoto={ladeFotoHoch}
              onAnalyse={analysiereZustandsFotos}
              onFinalize={finalisiereScan}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
