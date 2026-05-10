'use client'

// AAR-242: Kalender-Connect-Step im Willkommen-Wizard.
// AAR-717: Apple Calendar (CalDAV) aktiviert — eigener Connect-Modal-Flow
// mit App-Passwort-Eingabe (OAuth gibt's bei Apple nicht).
// Microsoft ist weiter Platzhalter — AAR-715.
// Opt-Out setzt kalender_typ='keiner'.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoadingButton } from '@/components/ui/loading-button'
import CalDavConnectModal from '@/components/CalDavConnectModal'

type Provider = 'google' | 'microsoft' | 'apple' | 'keiner'

export default function KalenderConnectStep({
  svId,
  gcalConnected,
  caldavConnected = false,
  onDone,
}: {
  svId: string
  gcalConnected: boolean
  caldavConnected?: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Provider | null>(null)
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [caldavModalOpen, setCaldavModalOpen] = useState(false)

  function chooseGoogle() {
    // AAR-777: Konsolidierter Connect-Endpoint /api/auth/google/connect
    // (statt alter google-calendar/connect der profiles.google_* nicht
    // gesetzt hat → kein Free/Busy-Check). Nach Erfolg springt die Callback-
    // Route zurück ins Portal mit gesetzten Tokens.
    window.location.href = `/api/auth/google/connect?return=${encodeURIComponent('/gutachter/willkommen?kalender_connected=1')}`
  }

  function chooseOptOut() {
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error: updErr } = await supabase
        .from('sachverstaendige')
        .update({ kalender_typ: 'keiner', kalender_sync_aktiv: false })
        .eq('id', svId)
      if (updErr) { setError(updErr.message); return }
      onDone()
    })
  }

  // AAR-717: Wenn irgendein Kalender verbunden ist → weiter.
  if (gcalConnected || caldavConnected) {
    const providerLabel = gcalConnected ? 'Google Kalender' : 'Apple iCloud (CalDAV)'
    return (
      <div className="space-y-5">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2Icon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">{providerLabel} verbunden</p>
            <p className="text-xs text-emerald-700 mt-1">
              Termine werden automatisch synchronisiert. Du kannst die Verbindung jederzeit im Profil ändern.
            </p>
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-full py-2.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold"
        >
          Weiter
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="bg-claimondo-ondo/5 border border-claimondo-ondo/20 rounded-xl p-4 flex items-start gap-3">
        <CalendarIcon className="w-5 h-5 text-claimondo-ondo flex-shrink-0 mt-0.5" />
        <div className="text-sm text-claimondo-navy">
          <p className="font-semibold">Kalender verbinden</p>
          <p className="text-xs text-claimondo-shield mt-1">
            Verbinde deinen Kalender, damit wir dir nur Termine in freien Zeitslots vorschlagen.
            Ohne Kalender bekommst du Termine manuell per E-Mail/WhatsApp.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <ProviderCard
          label="Google Calendar"
          hint="OAuth — Claimondo liest Verfügbarkeit + trägt neue Termine ein"
          selected={selected === 'google'}
          onSelect={() => { setSelected('google'); chooseGoogle() }}
          enabled
        />
        <ProviderCard
          label="Microsoft 365 / Outlook"
          hint="Kommt bald — aktuell noch nicht verfügbar"
          selected={false}
          onSelect={() => {}}
          enabled={false}
        />
        <ProviderCard
          label="Apple Calendar (CalDAV)"
          hint="App-Passwort aus Apple-ID — Claimondo liest Verfügbarkeit"
          selected={selected === 'apple'}
          onSelect={() => {
            setSelected('apple')
            setCaldavModalOpen(true)
          }}
          enabled
        />
        <ProviderCard
          label="Ich nutze keines dieser Tools"
          hint="Termine erhältst du manuell per E-Mail oder WhatsApp"
          selected={selected === 'keiner'}
          onSelect={() => setSelected('keiner')}
          enabled
        />
      </div>

      {error && (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <LoadingButton
        isLoading={saving}
        loadingText="Wird gespeichert ..."
        onClick={() => { if (selected === 'keiner') chooseOptOut() }}
        disabled={selected !== 'keiner'}
        className="w-full py-2.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-40"
      >
        Weiter ohne Kalender
      </LoadingButton>

      <p className="text-[11px] text-claimondo-ondo/70 text-center flex items-center justify-center gap-1">
        <InfoIcon className="w-3 h-3" />
        Kalender-Einstellung kannst du jederzeit im Profil ändern
      </p>

      <CalDavConnectModal
        open={caldavModalOpen}
        onClose={() => {
          setCaldavModalOpen(false)
          if (selected === 'apple') setSelected(null)
        }}
        onSuccess={() => {
          setCaldavModalOpen(false)
          // Router-Refresh lädt die Server-Props neu (caldavConnected=true),
          // danach zeigt die Komponente den „verbunden"-State.
          router.refresh()
          onDone()
        }}
      />
    </div>
  )
}

function ProviderCard({
  label, hint, selected, onSelect, enabled,
}: {
  label: string
  hint: string
  selected: boolean
  onSelect: () => void
  enabled: boolean
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onSelect}
      className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${
        !enabled
          ? 'border-claimondo-border bg-claimondo-bg text-claimondo-ondo/70 cursor-not-allowed'
          : selected
          ? 'border-claimondo-ondo bg-claimondo-ondo/5'
          : 'border-claimondo-border hover:border-claimondo-ondo/50 bg-white'
      }`}
    >
      <p className={`text-sm font-semibold ${enabled ? 'text-claimondo-navy' : 'text-claimondo-ondo/70'}`}>{label}</p>
      <p className="text-xs text-claimondo-ondo mt-0.5">{hint}</p>
    </button>
  )
}
