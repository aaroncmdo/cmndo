import { createAdminClient } from '@/lib/supabase/admin'
import { createHmac } from 'crypto'
import { notFound } from 'next/navigation'
import KundeTrackingClient from './KundeTrackingClient'
import KundenLightBrandingProvider from '@/components/branding/KundenLightBrandingProvider'
import ClaimondoKundenHeader from '@/components/kunde/ClaimondoKundenHeader'
import type { BrandTheme } from '@/lib/branding/theme'
import { hydrateTheme } from '@/lib/branding/theme'
import { terminBeiKundeZuhause } from '@/lib/kunde/termin-heuristik'

// KFZ-179: Kunden-Tracking-Page — oeffentlich via Token, kein Auth noetig.
// SV-Position wird live via Realtime angezeigt.
// AAR-423: Light-Branding — Primary-Akzent aus SV-Theme wenn verifiziert,
// Claimondo-Logo + Attribution bleiben immer dominant.

export const dynamic = 'force-dynamic'

export default async function KundeTerminPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const db = createAdminClient()

  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, start_zeit, status, losgefahren_am, ankunft_zeit, kunden_tracking_token, notification_5min_gesendet_am, vorgeschlagenes_datum, gegenvorschlag_von, kunde_tracking_aktiviert, kunde_angekommen_am')
    .eq('kunden_tracking_token', token)
    .single()

  if (!termin) notFound()

  // Privacy: Token nur gueltig 1h vor bis 4h nach Termin
  const now = Date.now()
  const terminZeit = new Date(termin.start_zeit).getTime()
  const hoursUntil = (terminZeit - now) / (1000 * 60 * 60)
  const hoursAfter = (now - terminZeit) / (1000 * 60 * 60)

  if (hoursUntil > 2 || hoursAfter > 4) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb] px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-[#0D1B3E] mb-4">Link nicht mehr gültig</h1>
          <p className="text-gray-600">Dieser Tracking-Link ist nur rund um den Termin gültig.</p>
        </div>
      </div>
    )
  }

  // Nach Ankunft > 30 min: Termin abgeschlossen
  if (termin.ankunft_zeit) {
    const ankunftTime = new Date(termin.ankunft_zeit).getTime()
    if (now - ankunftTime > 30 * 60 * 1000) {
      const { data: svProf } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
      let svName = 'Gutachter'
      if (svProf?.profile_id) {
        const { data: p } = await db.from('profiles').select('vorname').eq('id', svProf.profile_id).single()
        if (p) svName = p.vorname ?? 'Gutachter'
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb] px-6">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✓</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0D1B3E] mb-2">Termin abgeschlossen</h1>
            <p className="text-gray-600">{svName} war bei Ihnen. Das Gutachten wird jetzt erstellt.</p>
          </div>
        </div>
      )
    }
  }

  // Fall-Daten laden
  const { data: fall } = await db
    .from('faelle')
    .select('schadens_adresse, schadens_plz, schadens_ort, kennzeichen, besichtigungsort_adresse, lead_id')
    .eq('id', termin.fall_id)
    .single()

  // AAR-384: Halter-Adresse laden für Heuristik "Termin beim Kunden zuhause".
  // Wenn ja → kein Tracking anbieten (Kunde ist eh da). Wenn nein → Card
  // einblenden sobald SV losgefahren ist.
  // AAR-598: vorher wurde `halter_ort` selectiert — existiert nicht in `leads`
  // (canonical ist `halter_stadt`). Query scheiterte stumm, `lead` war null,
  // trackingSinnvoll defaultete auf true. Fix + Error-Logging damit ein Regress
  // diesmal sichtbar wird.
  const leadRes = fall?.lead_id
    ? await db
        .from('leads')
        .select('halter_strasse, halter_plz, halter_stadt')
        .eq('id', fall.lead_id)
        .single()
    : null
  if (leadRes?.error) {
    console.error('[AAR-598] kunde/termin halter-Adresse load failed:', leadRes.error)
  }
  const lead = leadRes?.data ?? null
  const trackingSinnvoll = !terminBeiKundeZuhause(lead, fall)

  // AAR-423: SV-Branding + Profil laden für Light-Branding und Attribution.
  const { data: svRow } = await db
    .from('sachverstaendige')
    .select('profile_id, brand_theme, brand_primary, brand_secondary, use_custom_branding, verifiziert_am')
    .eq('id', termin.sv_id)
    .single()

  let svVorname = 'Gutachter'
  let svNachname = ''
  let svAvatarUrl: string | null = null
  let svAnzeigename = ''
  if (svRow?.profile_id) {
    const { data: p } = await db
      .from('profiles')
      .select('vorname, nachname, avatar_url, anzeigename')
      .eq('id', svRow.profile_id)
      .single()
    if (p) {
      svVorname = p.vorname ?? 'Gutachter'
      svNachname = p.nachname ?? ''
      svAvatarUrl = (p.avatar_url as string | null) ?? null
      const fallbackName = [p.vorname, p.nachname].filter(Boolean).join(' ')
      svAnzeigename = (p.anzeigename as string | null) ?? fallbackName ?? svVorname
    }
  }

  // Light-Branding nur wenn SV verifiziert + Custom-Branding aktiv.
  const svVerifiziert = !!svRow?.verifiziert_am
  const brandEnabled = svVerifiziert && !!svRow?.use_custom_branding

  const lightTheme: Pick<BrandTheme, 'primary' | 'primaryHover' | 'primaryActive' | 'primarySoft'> | null =
    brandEnabled
      ? (() => {
          const hydrated = hydrateTheme(
            svRow?.brand_theme as Parameters<typeof hydrateTheme>[0],
            svRow?.brand_primary ?? null,
            svRow?.brand_secondary ?? null,
          )
          return {
            primary: hydrated.primary,
            primaryHover: hydrated.primaryHover,
            primaryActive: hydrated.primaryActive,
            primarySoft: hydrated.primarySoft,
          }
        })()
      : null

  // PLZ-basierte Fallback-Koordinaten
  const PLZ_FALLBACK: Record<string, { lat: number; lng: number }> = {
    '50667': { lat: 50.9375, lng: 6.9603 },
    '50823': { lat: 50.9614, lng: 6.9407 },
    '50677': { lat: 50.9209, lng: 6.9531 },
    '51063': { lat: 50.9709, lng: 7.0029 },
    '50733': { lat: 50.9847, lng: 6.9447 },
    '50670': { lat: 50.9489, lng: 6.9526 },
  }
  const plzGeo = fall?.schadens_plz ? PLZ_FALLBACK[fall.schadens_plz as string] : null

  // BUG-105: Channel-Name hashen damit svId nicht direkt exponiert wird
  const realtimeSecret = process.env.SUPABASE_REALTIME_SECRET || 'dev-fallback-secret-change-me'
  const channelHash = createHmac('sha256', realtimeSecret)
    .update(String(termin.sv_id) + token)
    .digest('hex')
    .slice(0, 16)

  return (
    <KundenLightBrandingProvider enabled={brandEnabled} theme={lightTheme}>
      <div className="min-h-screen flex flex-col bg-[#f8f9fb]">
        <ClaimondoKundenHeader
          svAnzeigename={svAnzeigename || `${svVorname} ${svNachname}`.trim()}
          svAvatarUrl={svAvatarUrl}
        />
        <div className="flex-1 min-h-0 flex flex-col">
          <KundeTrackingClient
            svId={termin.sv_id}
            channelHash={channelHash}
            svVorname={svVorname}
            svNachname={svNachname}
            svAvatarUrl={svAvatarUrl}
            svAnzeigename={svAnzeigename || `${svVorname} ${svNachname}`.trim()}
            terminLat={plzGeo?.lat ?? 50.9375}
            terminLng={plzGeo?.lng ?? 6.9603}
            adresse={[fall?.schadens_adresse, fall?.schadens_plz, fall?.schadens_ort].filter(Boolean).join(', ') || '—'}
            angekommen={!!termin.ankunft_zeit}
            losgefahren={!!termin.losgefahren_am}
            token={token}
            terminId={termin.id as string}
            fallId={termin.fall_id as string}
            terminStatus={(termin.status as string) ?? 'bestaetigt'}
            gegenvorschlagVon={(termin.gegenvorschlag_von as string | null) ?? null}
            vorgeschlagenesDatum={(termin.vorgeschlagenes_datum as string | null) ?? null}
            notification5minSent={!!termin.notification_5min_gesendet_am}
            kundenTrackingAngeboten={trackingSinnvoll}
            kundeTrackingAktiviert={!!termin.kunde_tracking_aktiviert}
            kundeBereitsAngekommen={!!termin.kunde_angekommen_am}
          />
        </div>
      </div>
    </KundenLightBrandingProvider>
  )
}
