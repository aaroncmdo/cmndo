'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import PhoneVerificationModal from '@/components/auth/PhoneVerificationModal'
// AAR-344: 2FA-Nummer-Änderung (Self-Service, eingeloggter User)
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'
// AAR-939: TOTP (Authenticator-App) als optionaler 2. Faktor
import { TotpEnrollCard } from '@/components/auth/TotpEnrollCard'
import { ProfilSpezialisierung } from './_components/ProfilSpezialisierung'
import { ProfilCommunityPrivacy } from './_components/ProfilCommunityPrivacy'
import { ProfilVertrag } from './_components/ProfilVertrag'
import { ProfilDarstellung } from './_components/ProfilDarstellung'
import { ProfilStammdaten } from './_components/ProfilStammdaten'
import { SectionCard } from '@/components/shared/SectionCard'
// AAR-500 N5: Benachrichtigungs-Präferenzen (Quiet-Hours + Channel-Opt-Outs + Feintuning)
import {
  NotificationPreferencesForm,
  type NotificationPreferencesFormValue,
} from '@/components/notifications/NotificationPreferencesForm'
import type { Profile, SV } from './_components/fields'

// KFZ-154: Qualifikationen / Spezifikationen / Schadenarten kommen jetzt aus
// /admin/sachverstaendige/anlegen/constants.ts (single source of truth).
// Die alten SF-01..SF-06 Codes wurden ersetzt durch die 3 sauberen Listen.

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard (10 Fälle/Monat)', 'starter-10': 'Standard (10 Fälle/Monat)',
  pro: 'Pro (25 Fälle/Monat)', 'standard-25': 'Pro (25 Fälle/Monat)',
  premium: 'Premium (50 Fälle/Monat)', 'premium-50': 'Premium (50 Fälle/Monat)',
}
type PendingTermin = { id: string; fall_id: string; start_zeit: string; end_zeit: string; claim_nummer?: string }

export default function ProfilClient({
  email,
  profile,
  sv,
  faelleCount,
  pendingTermine,
  notificationPrefs,
  googleConnected,
}: {
  email: string
  profile: Profile
  sv: SV
  faelleCount: number
  pendingTermine: PendingTermin[]
  notificationPrefs: NotificationPreferencesFormValue
  // AAR-707: echter OAuth-Status aus profiles.google_refresh_token
  googleConnected: boolean
}) {
  const [mapsReady, setMapsReady] = useState(
    typeof window !== 'undefined' && typeof google !== 'undefined' && !!google.maps?.places,
  )

  return (
    <div className="h-full flex flex-col">
      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places&loading=async&v=weekly`}
          strategy="lazyOnload"
          onReady={() => setMapsReady(true)}
        />
      )}

      {/* BUG-91: Sticky Header — bleibt beim Scrollen oben sichtbar */}
      <div className="flex-shrink-0 sticky top-0 z-20 bg-white border-b border-claimondo-border px-6 py-3">
        <PageHeader
          title="Mein Profil"
          description="Stammdaten + Firma + Standort"
        />
      </div>

      {/* BUG-91: Scroll-Container, max-w-full Page-Content
          BUG-98 Folge-Cleanup: Form von max-w-3xl auf max-w-4xl angehoben
          damit Desktop/Tablet quer den Platz nutzen. 4xl (~896px) bleibt
          fuer das einspaltige Profil-Form gut lesbar. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-full">
        <ProfilStammdaten
          email={email}
          profile={profile}
          sv={sv}
          mapsReady={mapsReady}
        />

        <ProfilVertrag
          paketLabel={PAKET_LABELS[sv.paket] ?? sv.paket ?? '—'}
          offene={sv.offene_faelle}
          gesamt={sv.paket_faelle_gesamt}
          zugewiesen={faelleCount}
        />

        {/* AAR-720: Kalender-Verbindung komplett nach Einstellungen umgezogen.
            Google, Apple iCloud, CalDAV + Status + Disconnect liegen jetzt
            unter /gutachter/einstellungen/kalender. Hier auf dem Profil nur
            noch ein Status-Hinweis mit Deep-Link. */}
        <Link
          href="/gutachter/einstellungen/kalender"
          className="bg-white rounded-2xl p-4 border border-claimondo-border mt-5 flex items-center gap-3 hover:border-claimondo-ondo transition-colors group"
        >
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${googleConnected ? 'bg-success' : 'bg-claimondo-light-blue'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-claimondo-navy">
              Kalender: {googleConnected ? 'Google verbunden' : 'Nicht verbunden'}
            </p>
            <p className="text-xs text-claimondo-ondo mt-0.5">
              Verwalten unter Einstellungen → Kalender
            </p>
          </div>
          <span className="text-[11px] text-claimondo-ondo group-hover:text-claimondo-navy">Öffnen →</span>
        </Link>

        {/* KFZ-154: 3 Spezialisierungs-Listen */}
        <ProfilSpezialisierung
          svId={sv.id}
          qualifikationen={sv.qualifikationen_neu ?? []}
          spezifikationen={sv.spezifikationen ?? []}
          schadenarten={sv.schadenarten ?? []}
        />

        {/* KFZ-152 Phase 3 Follow-up: Privacy-Toggle (nur fuer Community-Mitglieder) */}
        {sv.rolle_in_organisation === 'community_member' && (
          <ProfilCommunityPrivacy svId={sv.id} initial={sv.community_anonym} />
        )}

        {/* KFZ-158 Phase 2: GPS-Tracking Privacy-Toggle */}
        <SectionCard className="p-6 mt-5">
          <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Live-Standort</h2>
          <p className="text-xs text-claimondo-ondo/70 mb-4">
            Wenn aktiv, wird dein Standort während Terminen live getrackt.
            Ermöglicht optimierte Routenführung und Admin-Übersicht.
          </p>
          <GpsTrackingToggle svId={sv.id} initial={(sv as Record<string, unknown>).live_tracking_enabled !== false} />
        </SectionCard>

        {/* AAR-344: 2FA-Nummer-Änderungs-Flow (eigenes Panel, nutzt shared Component) */}
        <div className="mt-5">
          <TwoFaPhoneChange
            aktuelleTwofaTelefon={profile.twofa_telefon ?? null}
            fallbackTelefon={profile.telefon}
          />
        </div>

        {/* AAR-939: TOTP (Authenticator-App) — optionaler 2. Faktor */}
        <div className="mt-5">
          <TotpEnrollCard />
        </div>
        {/* KFZ-184: Telefon-Verifizierung fuer 2FA */}
        <TwoFaPhoneSection />

        {/* Offene Terminanfragen */}
        {pendingTermine.length > 0 && (
          <SectionCard className="p-6 mt-5">
            <h2 className="text-sm font-medium text-claimondo-ondo mb-4">
              Offene Terminanfragen ({pendingTermine.length})
            </h2>
            <div className="space-y-3">
              {pendingTermine.map(termin => (
                <TerminAnfrage key={termin.id} termin={termin} svId={sv.id} />
              ))}
            </div>
          </SectionCard>
        )}
        {/* AAR-956 / KFZ-139: Darstellung-Section (Branding-Editor + Google-Business) */}
        <ProfilDarstellung _svId={sv.id} mapsReady={mapsReady} />
        {/* AAR-500 N5: Benachrichtigungs-Präferenzen */}
        <NotificationSection initial={notificationPrefs} />
      </div>
    </div>
  )
}

// AAR-500 N5: Settings-Section-Wrapper für Benachrichtigungen.
function NotificationSection({ initial }: { initial: NotificationPreferencesFormValue }) {
  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-5 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-4">Benachrichtigungen</h2>
      <NotificationPreferencesForm role="sachverstaendiger" initial={initial} />
    </div>
  )
}


function TerminAnfrage({ termin, svId }: { termin: PendingTermin; svId: string }) {
  const [responding, setResponding] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [gegenvorschlag, setGegenvorschlag] = useState('')
  const [ablehnungsgrund, setAblehnungsgrund] = useState('')
  const router = useRouter()

  async function handleAccept() {
    setResponding(true)
    const supabase = createClient()
    await supabase
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', termin.id)
    router.refresh()
  }

  async function handleReject() {
    if (!gegenvorschlag) return
    setResponding(true)
    const supabase = createClient()
    await supabase
      .from('gutachter_termine')
      .update({
        status: 'abgelehnt',
        ablehnungsgrund,
        gegenvorschlag_zeit: gegenvorschlag,
      })
      .eq('id', termin.id)
    router.refresh()
  }

  const start = new Date(termin.start_zeit)
  const end = new Date(termin.end_zeit)

  return (
    <div className="bg-claimondo-bg/50 rounded-ios-xl p-4 border border-claimondo-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-claimondo-navy text-sm font-medium">
          {start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
          {' '}
          {start.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}
          –
          {end.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}
        </p>
        <span className="text-amber-400 text-[10px] font-medium bg-amber-50 px-2 py-0.5 rounded-full">Anfrage</span>
      </div>

      {!showReject ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleAccept}
            disabled={responding}
            className="flex-1 py-2 rounded-ios-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-40"
          >
            Bestätigen
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={responding}
            className="flex-1 py-2 rounded-ios-lg text-xs font-semibold bg-red-900 hover:bg-red-800 text-red-200 transition-colors disabled:opacity-40"
          >
            Ablehnen
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={ablehnungsgrund}
            onChange={e => setAblehnungsgrund(e.target.value)}
            placeholder="Grund (optional)"
            className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
          <input
            type="datetime-local"
            value={gegenvorschlag}
            onChange={e => setGegenvorschlag(e.target.value)}
            required
            className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
          <p className="text-claimondo-ondo text-xs">Gegenvorschlag ist Pflicht</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowReject(false)}
              className="flex-1 py-2 rounded-ios-lg text-xs text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg transition-colors"
            >
              Zurück
            </button>
            <button
              onClick={handleReject}
              disabled={responding || !gegenvorschlag}
              className="flex-1 py-2 rounded-ios-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
            >
              Ablehnen + Gegenvorschlag
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// KFZ-158 Phase 2: GPS-Tracking Toggle
// KFZ-184: 2FA Telefon-Verifizierung Section
function TwoFaPhoneSection() {
  const [showModal, setShowModal] = useState(false)
  return (
    <SectionCard className="p-6 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Zwei-Faktor-Authentifizierung</h2>
      <p className="text-xs text-claimondo-ondo/70 mb-4">Verifizieren Sie Ihre Telefonnummer für den SMS-Login-Code.</p>
      <button onClick={() => setShowModal(true)}
        className="px-4 py-2 rounded-ios-xl bg-[var(--brand-secondary)] hover:bg-[var(--brand-primary)] text-white text-sm font-semibold transition-colors">
        Telefon verifizieren
      </button>
      {showModal && <PhoneVerificationModal onClose={() => setShowModal(false)} />}
    </SectionCard>
  )
}

function GpsTrackingToggle({ svId, initial }: { svId: string; initial: boolean }) {
  const [active, setActive] = useState(initial)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function toggle() {
    setSaving(true)
    const next = !active
    setActive(next)
    const supabase = createClient()
    await supabase.from('sachverstaendige').update({ live_tracking_enabled: next }).eq('id', svId)
    setSaving(false)
    router.refresh()
  }

  return (
    <div>
      <button type="button" onClick={toggle} disabled={saving}
        className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${active ? 'bg-[var(--brand-secondary)]' : 'bg-claimondo-border'}`}>
        <span className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${active ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
      <span className="ml-3 text-sm text-claimondo-navy">
        {active ? 'Live-Tracking aktiv' : 'Tracking deaktiviert'}
        {saving && <span className="text-claimondo-ondo/70 text-xs ml-2">speichert...</span>}
      </span>
    </div>
  )
}

// 2026-05-06 SV7 (Form-Audit): FieldRow, ControlledRow, SelectRow, ROW_*_CLS
// wurden nach ./_components/fields.tsx extrahiert (Task 1 Profil-Rebuild).
// inferInputMode/inferAutoComplete bleiben hier (toter Code, kein Consumer,
// separater Cleanup-Pass).

function inferInputMode(type: string): 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | undefined {
  if (type === 'tel') return 'tel'
  if (type === 'email') return 'email'
  if (type === 'number') return 'decimal'
  return undefined
}

function inferAutoComplete(type: string, label: string): string | undefined {
  if (type === 'tel') return 'tel'
  if (type === 'email') return 'email'
  const l = label.toLowerCase()
  if (l.startsWith('vorname')) return 'given-name'
  if (l.startsWith('nachname')) return 'family-name'
  if (l.startsWith('firmenname')) return 'organization'
  return undefined
}
