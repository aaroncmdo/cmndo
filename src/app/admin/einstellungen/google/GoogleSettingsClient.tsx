'use client'

// AAR-96: Google OAuth Settings UI
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, AlertCircleIcon } from 'lucide-react'

export default function GoogleSettingsClient({
  isConnected, googleEmail, connectedAt, success, error,
}: {
  isConnected: boolean
  googleEmail: string | null
  connectedAt: string | null
  success: boolean
  error: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  function handleDisconnect() {
    startTransition(async () => {
      await fetch('/api/auth/google/disconnect', { method: 'POST' })
      router.refresh()
      setConfirmDisconnect(false)
    })
  }

  return (
    <div className="py-6 max-w-2xl mx-auto px-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">Google Konto verbinden</h1>
        <p className="text-sm text-claimondo-ondo mt-1">
          Verbinde dein Google Konto, um Videotermine direkt aus der Fallakte zu buchen.
          Termine werden in deinem Google Kalender erstellt und Kunden bekommen automatisch
          eine Calendar-Einladung mit Meet-Link.
        </p>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircleIcon className="w-4 h-4" />
          Google Konto erfolgreich verbunden.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-sm text-red-700">
          <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Fehler beim Verbinden</p>
            <p className="text-xs mt-0.5">{error === 'no_refresh_token' ? 'Bitte in Google-Konto-Einstellungen (myaccount.google.com) die Claimondo-App entfernen und erneut verbinden.' : error}</p>
          </div>
        </div>
      )}

      {isConnected ? (
        <div className="bg-white border border-claimondo-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            <p className="font-medium text-claimondo-navy">Verbunden mit {googleEmail ?? 'Google'}</p>
          </div>
          {connectedAt && (
            <p className="text-xs text-claimondo-ondo">Seit {new Date(connectedAt).toLocaleDateString('de-DE')}</p>
          )}
          {!confirmDisconnect ? (
            <button
              onClick={() => setConfirmDisconnect(true)}
              className="px-4 py-2 text-sm font-medium bg-white border border-claimondo-border text-claimondo-navy rounded-lg hover:bg-[#f8f9fb]"
            >
              Verbindung trennen
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-700">Wirklich trennen? Du kannst dann keine Calendar-Termine mehr buchen.</p>
              <div className="flex gap-2">
                <button onClick={handleDisconnect} disabled={pending}
                  className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {pending ? 'Trenne...' : 'Ja, trennen'}
                </button>
                <button onClick={() => setConfirmDisconnect(false)} disabled={pending}
                  className="px-4 py-2 text-sm text-claimondo-ondo">
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <a
          href="/api/auth/google/connect"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#4573A2] text-white rounded-lg hover:bg-[#0D1B3E] font-medium"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Mit Google verbinden
        </a>
      )}

      <div className="bg-[#f8f9fb] border border-claimondo-border rounded-lg p-4 text-xs text-claimondo-navy space-y-1">
        <p className="font-semibold">Datenschutz:</p>
        <p>• Wir speichern nur den Refresh-Token (verschluesselt) — keine Email-Inhalte, kein Kalender-Lese-Zugriff.</p>
        <p>• Scopes: nur calendar.events (Termine erstellen) + userinfo.email (deine Google-Adresse).</p>
        <p>• Du kannst die Verbindung jederzeit trennen.</p>
      </div>
    </div>
  )
}
