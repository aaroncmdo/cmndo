'use client'

// Web-Push-Opt-in fuer den aktuellen Browser/das aktuelle Geraet. Schliesst die
// Luecke aus dem Silent-Feature-Audit (03.07.): VAPID-Keys, Server-Send und die
// push_subscriptions-Tabelle existierten, aber NIEMAND rief pushManager.subscribe()
// -> 0 Subscriptions -> Push lieferte nichts. Diese Komponente macht Push nutzbar.

import { useEffect, useState } from 'react'
import { BellRingIcon, BellOffIcon, CheckCircle2Icon, AlertTriangleIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { checkPushSupport } from '@/lib/notifications/push-encoding'
import {
  subscribeToPush,
  unsubscribeFromPush,
  isCurrentlySubscribed,
} from '@/lib/notifications/push-client'

type State = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

export function PushToggle() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const support = checkPushSupport()
    if (!support.supported) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    // Status ermitteln — mit Timeout-Guard, falls serviceWorker.ready haengt.
    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) setState('unsubscribed')
    }, 3000)
    isCurrentlySubscribed()
      .then((sub) => {
        settled = true
        clearTimeout(timeout)
        setState(sub ? 'subscribed' : 'unsubscribed')
      })
      .catch(() => {
        settled = true
        clearTimeout(timeout)
        setState('unsubscribed')
      })
    return () => clearTimeout(timeout)
  }, [])

  async function handleSubscribe() {
    setBusy(true)
    setError(null)
    try {
      const res = await subscribeToPush()
      if (res.ok) setState('subscribed')
      else if (res.reason === 'permission-denied') setState('denied')
      else setError(res.error ?? 'Aktivieren fehlgeschlagen.')
    } catch {
      setError('Aktivieren fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnsubscribe() {
    setBusy(true)
    setError(null)
    try {
      const res = await unsubscribeFromPush()
      if (res.ok) setState('unsubscribed')
      else setError(res.error ?? 'Deaktivieren fehlgeschlagen.')
    } catch {
      setError('Deaktivieren fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-ios-xl border border-claimondo-border bg-claimondo-bg p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <BellRingIcon width={14} height={14} className="text-claimondo-ondo" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Browser-Push auf diesem Gerät</h3>
      </div>
      <p className="text-xs text-claimondo-ondo mb-3">
        Damit der Kanal „Browser-Push" ankommt, müssen Sie ihn einmalig pro Gerät und Browser
        erlauben. Danach erhalten Sie Benachrichtigungen auch bei geschlossenem Tab.
      </p>

      {state === 'loading' ? <p className="text-xs text-claimondo-ondo">Status wird geprüft …</p> : null}

      {state === 'unsupported' ? (
        <p className="text-xs text-claimondo-ondo inline-flex items-center gap-1.5">
          <AlertTriangleIcon width={12} height={12} />
          Dieser Browser unterstützt keine Push-Benachrichtigungen.
        </p>
      ) : null}

      {state === 'denied' ? (
        <p className="text-xs text-warning-strong inline-flex items-start gap-1.5">
          <AlertTriangleIcon width={12} height={12} className="mt-0.5 shrink-0" />
          <span>
            Benachrichtigungen sind für diese Seite blockiert. Bitte im Browser (Schloss-Symbol
            neben der Adresse) erlauben und die Seite neu laden.
          </span>
        </p>
      ) : null}

      {state === 'unsubscribed' ? (
        <Button
          variant="navy"
          size="sm"
          onClick={handleSubscribe}
          loading={busy}
          iconLeft={<BellRingIcon width={14} height={14} />}
        >
          Push in diesem Browser aktivieren
        </Button>
      ) : null}

      {state === 'subscribed' ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs text-success-strong bg-success-soft border border-success/30 rounded-ios-lg px-2.5 py-1">
            <CheckCircle2Icon width={12} height={12} />
            Push aktiv auf diesem Gerät
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnsubscribe}
            loading={busy}
            iconLeft={<BellOffIcon width={14} height={14} />}
          >
            Deaktivieren
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-danger-strong inline-flex items-center gap-1.5">
          <AlertTriangleIcon width={12} height={12} />
          {error}
        </p>
      ) : null}
    </section>
  )
}
