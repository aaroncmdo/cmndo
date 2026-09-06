'use client'

// SP2b: Geteiltes Kalender-Connect-Panel (Google + CalDAV). Rollen-agnostisch —
// SV (/gutachter/einstellungen/kalender) und Mitarbeiter (/mitarbeiter/profil) rendern es.
// Extrahiert aus KalenderEinstellungenClient (AAR-717). Der returnPath steuert den
// Google-OAuth-Redirect. Der Caller gibt Layout/Heading vor (Panel = reiner Inhalt).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2Icon,
  AlertCircleIcon,
  PlusIcon,
  TrashIcon,
  RefreshCwIcon,
} from 'lucide-react'
import CalDavConnectModal from '@/components/CalDavConnectModal'
import { disconnectCaldav } from '@/lib/kalender/connect/caldav-connect-actions'

export type CalDavState = {
  id: string
  providerLabel: string
  username: string
  calendarDisplayName: string | null
  connectedAt: string
  lastSyncAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

export default function KalenderConnectPanel({
  googleConnected,
  googleEmail,
  microsoftConnected,
  microsoftEmail,
  caldav,
  returnPath,
}: {
  googleConnected: boolean
  googleEmail: string | null
  microsoftConnected: boolean
  microsoftEmail: string | null
  caldav: CalDavState | null
  returnPath: string
}) {
  const router = useRouter()
  const [caldavModalOpen, setCaldavModalOpen] = useState(false)
  const [disconnecting, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDisconnectCaldav() {
    if (!confirm('CalDAV-Verbindung wirklich trennen? Claimondo kann dann Ihre private Nicht-Verfügbarkeit nicht mehr berücksichtigen.')) {
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await disconnectCaldav()
      if (!res.success) {
        setError(res.error ?? 'Trennen fehlgeschlagen')
        return
      }
      router.refresh()
    })
  }

  function handleConnectGoogle() {
    window.location.href = '/api/auth/google/connect?return=' + encodeURIComponent(returnPath)
  }

  function handleConnectMicrosoft() {
    window.location.href = '/api/auth/microsoft/connect?return=' + encodeURIComponent(returnPath)
  }

  return (
    <div className="space-y-5">
      {/* Google */}
      <section className="bg-white border border-claimondo-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-claimondo-navy">Google Calendar</h2>
            <p className="text-xs text-claimondo-ondo">
              OAuth — Claimondo liest Verfügbarkeit direkt aus Ihrem Google-Konto.
            </p>
          </div>
          {googleConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success-strong text-xs font-medium border border-success/30">
              <CheckCircle2Icon className="w-3 h-3" />
              verbunden
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-claimondo-bg text-claimondo-ondo text-xs font-medium">
              nicht verbunden
            </span>
          )}
        </div>
        {googleConnected && googleEmail && (
          <p className="text-xs text-claimondo-ondo">{googleEmail}</p>
        )}
        <button
          type="button"
          onClick={handleConnectGoogle}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy"
        >
          {googleConnected ? (
            <>
              <RefreshCwIcon className="w-3 h-3" />
              Anderes Google-Konto verbinden
            </>
          ) : (
            <>
              <PlusIcon className="w-3 h-3" />
              Google Calendar verbinden
            </>
          )}
        </button>
      </section>

      {/* Microsoft Outlook */}
      <section className="bg-white border border-claimondo-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-claimondo-navy">Microsoft Outlook</h2>
            <p className="text-xs text-claimondo-ondo">
              OAuth — Claimondo liest Verfügbarkeit aus Ihrem Outlook- / Microsoft-365-Konto.
            </p>
          </div>
          {microsoftConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success-strong text-xs font-medium border border-success/30">
              <CheckCircle2Icon className="w-3 h-3" />
              verbunden
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-claimondo-bg text-claimondo-ondo text-xs font-medium">
              nicht verbunden
            </span>
          )}
        </div>
        {microsoftConnected && microsoftEmail && (
          <p className="text-xs text-claimondo-ondo">{microsoftEmail}</p>
        )}
        <button
          type="button"
          onClick={handleConnectMicrosoft}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy"
        >
          {microsoftConnected ? (
            <>
              <RefreshCwIcon className="w-3 h-3" />
              Anderes Microsoft-Konto verbinden
            </>
          ) : (
            <>
              <PlusIcon className="w-3 h-3" />
              Microsoft Outlook verbinden
            </>
          )}
        </button>
      </section>

      {/* CalDAV */}
      <section className="bg-white border border-claimondo-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-claimondo-navy">Apple iCloud / CalDAV</h2>
            <p className="text-xs text-claimondo-ondo">
              App-spezifisches Passwort aus Ihrer Apple-ID — Claimondo liest Verfügbarkeit.
            </p>
          </div>
          {caldav ? (
            caldav.lastError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger-soft text-danger-strong text-xs font-medium border border-danger/30">
                <AlertCircleIcon className="w-3 h-3" />
                Fehler
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success-strong text-xs font-medium border border-success/30">
                <CheckCircle2Icon className="w-3 h-3" />
                verbunden
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-claimondo-bg text-claimondo-ondo text-xs font-medium">
              nicht verbunden
            </span>
          )}
        </div>

        {caldav && (
          <div className="text-xs text-claimondo-ondo space-y-1">
            <p>
              <span className="font-medium">{caldav.providerLabel}</span> · {caldav.username}
            </p>
            {caldav.calendarDisplayName && (
              <p>Kalender: {caldav.calendarDisplayName}</p>
            )}
            {caldav.lastSyncAt && (
              <p className="text-[11px] text-claimondo-ondo/70">
                Letzter Check: {new Date(caldav.lastSyncAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}
              </p>
            )}
            {caldav.lastError && (
              <div className="mt-2 bg-danger-soft border border-danger/30 rounded-ios-lg px-3 py-2 text-danger-strong">
                <p className="font-medium">Verbindungs-Fehler</p>
                <p className="text-[11px] mt-0.5">{caldav.lastError}</p>
                <p className="text-[11px] mt-1">Bitte neu verbinden — das behebt die meisten Probleme.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setCaldavModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy"
          >
            {caldav ? (
              <>
                <RefreshCwIcon className="w-3 h-3" />
                Neu verbinden
              </>
            ) : (
              <>
                <PlusIcon className="w-3 h-3" />
                CalDAV verbinden
              </>
            )}
          </button>
          {caldav && (
            <button
              type="button"
              onClick={handleDisconnectCaldav}
              disabled={disconnecting}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-danger hover:text-danger-strong disabled:opacity-40"
            >
              <TrashIcon className="w-3 h-3" />
              {disconnecting ? 'Trenne …' : 'Verbindung trennen'}
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-lg px-3 py-2">
            {error}
          </p>
        )}
      </section>

      <p className="text-[11px] text-claimondo-ondo/70 text-center">
        Credentials werden verschlüsselt gespeichert (AES-256-GCM). Claimondo berücksichtigt Ihre Kalender-Verfügbarkeit bei Terminvorschlägen.
      </p>

      <CalDavConnectModal
        open={caldavModalOpen}
        onClose={() => setCaldavModalOpen(false)}
        onSuccess={() => {
          setCaldavModalOpen(false)
          router.refresh()
        }}
      />
    </div>
  )
}
