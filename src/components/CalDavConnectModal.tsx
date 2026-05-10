'use client'

// AAR-717: Connect-Modal für CalDAV-Kalender (Apple iCloud, Custom).
//
// Zwei-Phasen-Flow:
//   Phase 1: User wählt Provider, trägt Username + App-Passwort ein,
//            klickt „Verbinden testen" → server-side CalDAV-Login.
//            Bei Erfolg bekommen wir eine Kalender-Liste.
//   Phase 2: User wählt seinen Hauptkalender, klickt „Speichern"
//            → server-side Upsert in sv_kalender_verbindungen.

import { useState, useTransition } from 'react'
import { XIcon, ExternalLinkIcon, CheckCircle2Icon, AlertCircleIcon, CalendarIcon } from 'lucide-react'
import { LoadingButton } from '@/components/ui/loading-button'
import { Modal } from '@/components/primitives/Modal'
import {
  testCaldavConnection,
  saveCaldavConnection,
} from '@/app/gutachter/einstellungen/kalender/caldav-actions'
import { CALDAV_PROVIDERS, type CalDavProviderId } from '@/lib/kalender/caldav/provider-presets'

type Calendar = { url: string; displayName: string; ctag?: string | null }

export default function CalDavConnectModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [providerId, setProviderId] = useState<CalDavProviderId>('icloud')
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [calendars, setCalendars] = useState<Calendar[] | null>(null)
  const [selectedCalUrl, setSelectedCalUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const provider = CALDAV_PROVIDERS.find((p) => p.id === providerId)!
  const needsServerUrl = provider.serverUrl === null

  function reset() {
    setCalendars(null)
    setSelectedCalUrl(null)
    setError(null)
  }

  function handleTest() {
    setError(null)
    startTransition(async () => {
      const res = await testCaldavConnection({
        providerId,
        serverUrl: needsServerUrl ? serverUrl : provider.serverUrl ?? '',
        username,
        password,
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      setCalendars(res.calendars)
      setSelectedCalUrl(res.calendars[0]?.url ?? null)
    })
  }

  function handleSave() {
    if (!selectedCalUrl || !calendars) return
    const cal = calendars.find((c) => c.url === selectedCalUrl)
    if (!cal) return
    setError(null)
    startTransition(async () => {
      const res = await saveCaldavConnection({
        providerId,
        serverUrl: needsServerUrl ? serverUrl : provider.serverUrl ?? '',
        username,
        password,
        calendarUrl: cal.url,
        calendarDisplayName: cal.displayName,
      })
      if (!res.success) {
        setError(res.error ?? 'Speichern fehlgeschlagen')
        return
      }
      onSuccess()
    })
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      noPadding
      hideCloseButton
      maxWidth={512}
      ariaLabel="Kalender verbinden"
    >
      <div className="max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border">
          <h2 className="text-base font-semibold text-[#0D1B3E] flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-[#4573A2]" />
            Kalender verbinden
          </h2>
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            className="text-claimondo-ondo/70 hover:text-claimondo-navy"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!calendars ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-claimondo-navy">Provider</label>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value as CalDavProviderId)}
                  className="w-full px-3 py-2 rounded-lg border border-claimondo-border bg-white text-sm focus:outline-none focus:border-[#4573A2]"
                >
                  {CALDAV_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {provider.appPasswordHint && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircleIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p>{provider.appPasswordHint.kurz}</p>
                    <a
                      href={provider.appPasswordHint.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-amber-900 underline font-medium mt-1 hover:text-amber-700"
                    >
                      Anleitung von Apple <ExternalLinkIcon className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {needsServerUrl && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-claimondo-navy">Server-URL</label>
                  <input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://dein-caldav-server.de/dav"
                    className="w-full px-3 py-2 rounded-lg border border-claimondo-border text-sm focus:outline-none focus:border-[#4573A2]"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-claimondo-navy">
                  {providerId === 'icloud' ? 'Apple-ID (E-Mail)' : 'Benutzername'}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full px-3 py-2 rounded-lg border border-claimondo-border text-sm focus:outline-none focus:border-[#4573A2]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-claimondo-navy">
                  {providerId === 'icloud' ? 'App-spezifisches Passwort' : 'Passwort'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={providerId === 'icloud' ? 'xxxx-xxxx-xxxx-xxxx' : ''}
                  className="w-full px-3 py-2 rounded-lg border border-claimondo-border text-sm focus:outline-none focus:border-[#4573A2]"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <LoadingButton
                isLoading={pending}
                loadingText="Teste Verbindung ..."
                onClick={handleTest}
                disabled={!username || !password || (needsServerUrl && !serverUrl)}
                className="w-full py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold disabled:opacity-40"
              >
                Verbindung testen
              </LoadingButton>
            </>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2Icon className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Verbindung erfolgreich</p>
                  <p className="text-emerald-700 mt-0.5">
                    Wähle den Hauptkalender, dessen Termine im Dispatch-Check berücksichtigt werden.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-claimondo-navy">Kalender auswählen</label>
                {calendars.map((cal) => (
                  <button
                    key={cal.url}
                    type="button"
                    onClick={() => setSelectedCalUrl(cal.url)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-colors ${
                      selectedCalUrl === cal.url
                        ? 'border-[#4573A2] bg-[#4573A2]/5'
                        : 'border-claimondo-border hover:border-[#4573A2]/50'
                    }`}
                  >
                    <p className="font-medium text-claimondo-navy">{cal.displayName}</p>
                    <p className="text-[10px] text-claimondo-ondo/70 truncate">{cal.url}</p>
                  </button>
                ))}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2.5 rounded-lg border border-claimondo-border text-claimondo-ondo text-sm hover:bg-[#f8f9fb]"
                >
                  Zurück
                </button>
                <LoadingButton
                  isLoading={pending}
                  loadingText="Speichert ..."
                  onClick={handleSave}
                  disabled={!selectedCalUrl}
                  className="flex-1 py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold disabled:opacity-40"
                >
                  Speichern
                </LoadingButton>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
