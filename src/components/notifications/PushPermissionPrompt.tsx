'use client'

// AAR-499 N4: Opt-In-Prompt für Web-Push. Zeigt eine kleine Card wenn
// - die API unterstützt wird (Notification + PushManager + SW)
// - der User noch nicht permit/deny entschieden hat
// - der Opt-In noch nicht persistiert ist
//
// iOS: Push funktioniert nur wenn die PWA zum Home-Screen hinzugefügt wurde
// (display-mode: standalone) — in dem Fall zeigen wir einen Hinweis-Zustand.

import { useCallback, useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { registerPushSubscription } from '@/lib/actions/push-subscribe'

type State = 'loading' | 'unsupported' | 'needs-standalone' | 'idle' | 'granted' | 'denied' | 'subscribing' | 'error'

function urlBase64ToApplicationServerKey(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return buffer
}

function isStandaloneiOS(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function PushPermissionPrompt() {
  const [state, setState] = useState<State>('loading')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('cmd_push_dismissed') === '1') {
      setDismissed(true)
      return
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (isIOS() && !isStandaloneiOS()) {
      setState('needs-standalone')
      return
    }
    const current = Notification.permission
    if (current === 'granted') setState('granted')
    else if (current === 'denied') setState('denied')
    else setState('idle')
  }, [])

  const handleEnable = useCallback(async () => {
    setState('subscribing')
    setErrorMsg('')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle')
        return
      }
      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublic) {
        setErrorMsg('Push ist noch nicht konfiguriert. Bitte später erneut versuchen.')
        setState('error')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToApplicationServerKey(vapidPublic),
        }))

      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setErrorMsg('Subscription unvollständig — bitte Seite neu laden.')
        setState('error')
        return
      }
      const result = await registerPushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      })
      if (!result.success) {
        setErrorMsg(result.error ?? 'Registrierung fehlgeschlagen.')
        setState('error')
        return
      }
      setState('granted')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unerwarteter Fehler.')
      setState('error')
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem('cmd_push_dismissed', '1')
    } catch {
      // storage quota etc. — dann halt nur für diese Session dismissed.
    }
  }, [])

  if (dismissed) return null
  if (state === 'loading' || state === 'unsupported' || state === 'granted') return null

  const headline =
    state === 'denied'
      ? 'Push-Nachrichten blockiert'
      : state === 'needs-standalone'
        ? 'App zum Home-Bildschirm hinzufügen'
        : 'Push-Nachrichten aktivieren?'

  const message =
    state === 'denied'
      ? 'Bitte in den Browser-Einstellungen erlauben, damit Sie Updates zu Ihrem Fall erhalten.'
      : state === 'needs-standalone'
        ? 'Auf iPhone/iPad müssen Sie Claimondo zuerst über das Teilen-Menü („Zum Home-Bildschirm") als App installieren, um Push-Nachrichten zu empfangen.'
        : 'Sie verpassen keine Updates mehr — wir melden nur wichtige Dinge wie Termin-Bestätigungen, Gutachter-Ankunft oder Regulierungs-Ergebnisse.'

  const primaryLabel =
    state === 'subscribing' ? 'Wird aktiviert…' : state === 'error' ? 'Erneut versuchen' : 'Aktivieren'

  const canAct = state === 'idle' || state === 'error' || state === 'subscribing'

  return (
    <div className="rounded-xl border border-[#0D1B3E]/15 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0D1B3E]/10 text-[#0D1B3E]">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#0D1B3E]">{headline}</h3>
          <p className="mt-1 text-sm text-neutral-600">{message}</p>
          {errorMsg && (
            <p className="mt-1 text-xs text-red-600">{errorMsg}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {canAct && (
              <button
                type="button"
                onClick={handleEnable}
                disabled={state === 'subscribing'}
                className="inline-flex items-center rounded-lg bg-[#0D1B3E] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0D1B3E]/90 disabled:opacity-50"
              >
                {primaryLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs text-neutral-500 hover:text-neutral-700"
            >
              Später
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Schließen"
          className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
