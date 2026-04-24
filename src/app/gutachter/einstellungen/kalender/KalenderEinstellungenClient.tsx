'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  PlusIcon,
  TrashIcon,
  RefreshCwIcon,
} from 'lucide-react'
import CalDavConnectModal from '@/components/CalDavConnectModal'
import { disconnectCaldav } from './caldav-actions'

type CalDavState = {
  id: string
  providerLabel: string
  username: string
  calendarDisplayName: string | null
  connectedAt: string
  lastSyncAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

// AAR-717: Client-Komponente für /gutachter/einstellungen/kalender.
// Zeigt pro Provider (Google + CalDAV) den aktuellen Verbindungs-Status
// plus Connect/Disconnect-Aktionen. Google läuft über den bestehenden
// OAuth-Redirect, CalDAV öffnet den Modal.

export default function KalenderEinstellungenClient({
  svId: _svId,
  googleConnected,
  googleEmail,
  caldav,
}: {
  svId: string
  googleConnected: boolean
  googleEmail: string | null
  caldav: CalDavState | null
}) {
  const router = useRouter()
  const [caldavModalOpen, setCaldavModalOpen] = useState(false)
  const [disconnecting, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDisconnectCaldav() {
    if (!confirm('CalDAV-Verbindung wirklich trennen? Der Dispatch kann dann keine Terminkonflikte mehr prüfen.')) {
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
    window.location.href =
      '/api/auth/google-calendar/connect?return=' +
      encodeURIComponent('/gutachter/einstellungen/kalender')
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--brand-secondary)]/10 text-[var(--brand-primary)] flex items-center justify-center">
          <CalendarIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-primary)]">Kalender</h1>
          <p className="text-sm text-claimondo-ondo">
            Verbinde einen Kalender, damit wir bei Terminvorschlägen deine private Nicht-Verfügbarkeit berücksichtigen können.
          </p>
        </div>
      </header>

      {/* Google */}
      <section className="bg-white border border-claimondo-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#0D1B3E]">Google Calendar</h2>
            <p className="text-xs text-claimondo-ondo">
              OAuth — Claimondo liest Verfügbarkeit direkt aus deinem Google-Konto.
            </p>
          </div>
          {googleConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
              <CheckCircle2Icon className="w-3 h-3" />
              verbunden
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f8f9fb] text-claimondo-ondo text-xs font-medium">
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
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4573A2] hover:text-[#0D1B3E]"
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

      {/* CalDAV */}
      <section className="bg-white border border-claimondo-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#0D1B3E]">Apple iCloud / CalDAV</h2>
            <p className="text-xs text-claimondo-ondo">
              App-spezifisches Passwort aus deiner Apple-ID — Claimondo liest Verfügbarkeit.
            </p>
          </div>
          {caldav ? (
            caldav.lastError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                <AlertCircleIcon className="w-3 h-3" />
                Fehler
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                <CheckCircle2Icon className="w-3 h-3" />
                verbunden
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f8f9fb] text-claimondo-ondo text-xs font-medium">
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
                Letzter Check: {new Date(caldav.lastSyncAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            )}
            {caldav.lastError && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700">
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
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4573A2] hover:text-[#0D1B3E]"
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
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
            >
              <TrashIcon className="w-3 h-3" />
              {disconnecting ? 'Trenne …' : 'Verbindung trennen'}
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </section>

      <p className="text-[11px] text-claimondo-ondo/70 text-center">
        Credentials werden verschlüsselt gespeichert (AES-256-GCM). Dispatch-Check läuft Read-only — wir schreiben keine Termine in deinen privaten Kalender.
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
