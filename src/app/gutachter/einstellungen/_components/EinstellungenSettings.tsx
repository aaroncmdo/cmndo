'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
// AAR-344: 2FA-Nummer-Änderung (Self-Service, eingeloggter User)
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'
// AAR-939: TOTP (Authenticator-App) als optionaler 2. Faktor
import { TotpEnrollCard } from '@/components/auth/TotpEnrollCard'
import PhoneVerificationModal from '@/components/auth/PhoneVerificationModal'
// AAR-500 N5: Benachrichtigungs-Präferenzen (Quiet-Hours + Channel-Opt-Outs + Feintuning)
import {
  NotificationPreferencesForm,
  type NotificationPreferencesFormValue,
} from '@/components/notifications/NotificationPreferencesForm'

export function EinstellungenSettings({
  svId,
  notificationPrefs,
  twofaTelefon,
  telefonFallback,
  gpsInitial,
}: {
  svId: string
  notificationPrefs: NotificationPreferencesFormValue
  twofaTelefon: string | null
  telefonFallback: string | null
  gpsInitial: boolean
}) {
  return (
    <>
      {/* KFZ-158 Phase 2: GPS-Tracking Privacy-Toggle */}
      <SectionCard className="p-6 mt-5">
        <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Live-Standort</h2>
        <p className="text-xs text-claimondo-ondo/70 mb-4">
          Wenn aktiv, wird dein Standort während Terminen live getrackt.
          Ermöglicht optimierte Routenführung und Admin-Übersicht.
        </p>
        <GpsTrackingToggle svId={svId} initial={gpsInitial} />
      </SectionCard>

      {/* AAR-344: 2FA-Nummer-Änderungs-Flow (eigenes Panel, nutzt shared Component) */}
      <div className="mt-5">
        <TwoFaPhoneChange
          aktuelleTwofaTelefon={twofaTelefon}
          fallbackTelefon={telefonFallback}
        />
      </div>

      {/* AAR-939: TOTP (Authenticator-App) — optionaler 2. Faktor */}
      <div className="mt-5">
        <TotpEnrollCard />
      </div>

      {/* KFZ-184: Telefon-Verifizierung für 2FA */}
      <TwoFaPhoneSection />

      {/* AAR-500 N5: Benachrichtigungs-Präferenzen */}
      <NotificationSection initial={notificationPrefs} />
    </>
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

// KFZ-184: 2FA Telefon-Verifizierung Section
function TwoFaPhoneSection() {
  const [showModal, setShowModal] = useState(false)
  return (
    <SectionCard className="p-6 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Zwei-Faktor-Authentifizierung</h2>
      <p className="text-xs text-claimondo-ondo/70 mb-4">Verifizieren Sie Ihre Telefonnummer für den SMS-Login-Code.</p>
      <Button variant="ondo" size="sm" onClick={() => setShowModal(true)}>
        Telefon verifizieren
      </Button>
      {showModal && <PhoneVerificationModal onClose={() => setShowModal(false)} />}
    </SectionCard>
  )
}

// KFZ-158 Phase 2: GPS-Tracking Toggle
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
